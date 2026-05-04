import { useCallback, useEffect, useRef, useState } from 'react';

import type { VoiceActionRegistry } from '../actions/registry';
import { getVoiceInstructions, getVoiceToolDefinitions } from '../agent';
import { fetchRealtimeClientSecret } from './realtimeClientSecret';
import { WebRTCTransport, type RealtimeEvent } from './webrtcTransport';

export type VoiceSessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'confirming'
  | 'error';

interface UseWzrdRealtimeSessionOptions {
  registry: VoiceActionRegistry;
}

interface RealtimeFunctionCall {
  call_id: string;
  name: string;
  arguments: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Errors we can silently ignore (e.g. committing an empty audio buffer on short press). */
function isBenignError(event: RealtimeEvent): boolean {
  const err = event.error as Record<string, unknown> | undefined;
  if (err && typeof err === 'object') {
    if (err.code === 'input_audio_buffer_commit_empty') return true;
  }
  return false;
}

/**
 * Extract a user-friendly message from an error event.
 */
function normalizeVoiceError(event: RealtimeEvent): string {
  const err = event.error as Record<string, unknown> | undefined;
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string') return err.message;
    if (typeof err.type === 'string') return err.type;
  }
  if (typeof event.message === 'string') return event.message;
  return 'Voice session error.';
}

function isErrorEvent(event: RealtimeEvent): boolean {
  return event.type === 'error' || event.type.endsWith('_error') || event.type.endsWith('.error');
}

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getFunctionCallsFromResponseDone(event: RealtimeEvent): RealtimeFunctionCall[] {
  const response = event.response as { output?: unknown[] } | undefined;
  if (!response || !Array.isArray(response.output)) return [];

  return response.output.flatMap((item): RealtimeFunctionCall[] => {
    if (!item || typeof item !== 'object') return [];
    const output = item as Record<string, unknown>;
    if (output.type !== 'function_call') return [];

    const callId = getString(output.call_id);
    const name = getString(output.name);
    const args = getString(output.arguments);
    if (!callId || !name) return [];

    return [{ call_id: callId, name, arguments: args ?? '{}' }];
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWzrdRealtimeSession({ registry }: UseWzrdRealtimeSessionOptions) {
  const transportRef = useRef<WebRTCTransport | null>(null);
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedToolCallsRef = useRef<Set<string>>(new Set());

  // Stable ref to registry so data channel handler always has the latest
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const isSessionActive = useCallback(() => transportRef.current !== null, []);

  const disconnect = useCallback(() => {
    try {
      transportRef.current?.close();
    } catch { /* ignore */ }
    transportRef.current = null;
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const connect = useCallback(async () => {
    if (transportRef.current) return transportRef.current;
    setStatus('connecting');
    setErrorMessage(null);

    try {
      const apiKey = await fetchRealtimeClientSecret();
      const model = import.meta.env.VITE_WZRD_REALTIME_MODEL ?? 'gpt-4o-realtime-preview-2025-06-03';
      const voice = import.meta.env.VITE_WZRD_REALTIME_VOICE ?? 'marin';

      const transport = new WebRTCTransport();
      const executeToolCall = async (call: RealtimeFunctionCall) => {
        if (processedToolCallsRef.current.has(call.call_id)) return;
        processedToolCallsRef.current.add(call.call_id);

        setStatus('thinking');

        try {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.arguments);
          } catch { /* empty args */ }

          let result: unknown;
          if (call.name === 'execute_worldstudio_action') {
            const actionName = args.name as string;
            const input = (args.input as Record<string, unknown>) ?? {};
            const confirmed = args.confirmed as boolean | undefined;
            result = await registryRef.current.execute(
              actionName as Parameters<typeof registryRef.current.execute>[0],
              input,
              { confirmed: confirmed ?? undefined },
            );
          } else {
            result = { ok: false, status: 'invalid_input', message: `Unknown tool: ${call.name}` };
          }

          transport.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify(result),
            },
          });

          transport.send({ type: 'response.create' });
        } catch (err) {
          console.error('[Voice] tool execution error:', err);
          transport.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify({
                ok: false,
                status: 'error',
                message: err instanceof Error ? err.message : 'Tool execution failed',
              }),
            },
          });
          transport.send({ type: 'response.create' });
        }
      };

      // --- Wire event handlers BEFORE connecting ---

      // Audio playback events
      transport.on('response.audio.delta', () => setStatus('speaking'));
      transport.on('response.audio_transcript.delta', () => setStatus('speaking'));
      transport.on('response.audio.done', () => {
        // Will get response.done shortly after
      });
      transport.on('response.done', (event) => {
        const toolCalls = getFunctionCallsFromResponseDone(event);
        if (toolCalls.length > 0) {
          void Promise.all(toolCalls.map(executeToolCall));
          return;
        }
        setStatus('connected');
      });

      // Tool call handling
      transport.on('response.function_call_arguments.done', async (event) => {
        await executeToolCall({
          call_id: event.call_id as string,
          name: event.name as string,
          arguments: (event.arguments as string | undefined) ?? '{}',
        });
      });

      // Error handling
      transport.on('error', (event) => {
        if (isBenignError(event)) {
          console.debug('[Voice] benign error suppressed:', event);
          return;
        }
        const msg = normalizeVoiceError(event);
        console.warn('[Voice] session error:', msg, event);
        setStatus('error');
        setErrorMessage(msg);
      });

      transport.on('*', (event) => {
        if (!isErrorEvent(event) || event.type === 'error') return;
        if (isBenignError(event)) return;
        const msg = normalizeVoiceError(event);
        console.warn('[Voice] realtime error event:', msg, event);
        setStatus('error');
        setErrorMessage(msg);
      });

      // Session created confirmation
      transport.on('session.created', () => {
        console.info('[Voice] session created');
      });

      transport.on('session.updated', () => {
        console.info('[Voice] session configured');
      });

      // Input audio speech events (for status feedback)
      transport.on('input_audio_buffer.speech_started', () => setStatus('listening'));
      transport.on('input_audio_buffer.speech_stopped', () => setStatus('thinking'));

      // --- Connect ---
      await transport.connect({
        apiKey,
        model,
        sessionConfig: {
          modalities: ['text', 'audio'],
          voice,
          instructions: getVoiceInstructions(),
          tools: getVoiceToolDefinitions(registryRef.current),
          tool_choice: 'auto',
          turn_detection: null,
          input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        },
      });

      transportRef.current = transport;
      setStatus('connected');
      return transport;
    } catch (error) {
      setStatus('error');
      const msg = error instanceof Error ? error.message : 'Voice connection failed.';
      setErrorMessage(msg);
      throw error;
    }
  }, []);

  const pushToTalkStart = useCallback(async () => {
    const transport = transportRef.current ?? (await connect());
    transport.interrupt();
    transport.send({ type: 'output_audio_buffer.clear' });
    transport.send({ type: 'input_audio_buffer.clear' });
    setStatus('listening');
  }, [connect]);

  const pushToTalkStop = useCallback(() => {
    const transport = transportRef.current;
    if (!transport || transport.status !== 'connected') {
      console.warn('[Voice] pushToTalkStop skipped — transport not connected');
      return;
    }
    transport.send({ type: 'input_audio_buffer.commit' });
    transport.send({ type: 'response.create' });
    setStatus('thinking');
  }, []);

  // Clean up on unmount
  useEffect(() => disconnect, [disconnect]);

  // Clean up when user closes/refreshes the tab
  useEffect(() => {
    const handleBeforeUnload = () => disconnect();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [disconnect]);

  useEffect(() => {
    const handleNarration = (event: Event) => {
      const customEvent = event as CustomEvent<{ text?: string; topic?: string }>;
      const text = customEvent.detail?.text?.trim();
      const transport = transportRef.current;
      if (!text || !transport || transport.status !== 'connected') return;

      transport.sendOutOfBandAudio(
        [
          'Read this project update as one concise spoken highlight.',
          'Do not ask a question.',
          `Update: ${text}`,
        ].join('\n'),
        { topic: customEvent.detail?.topic ?? 'storyline_stream' },
      );
    };

    window.addEventListener('wzrd:voice-oob-narrate', handleNarration);
    return () => window.removeEventListener('wzrd:voice-oob-narrate', handleNarration);
  }, []);

  return {
    status,
    errorMessage,
    isSessionActive,
    connect,
    disconnect,
    pushToTalkStart,
    pushToTalkStop,
  };
}
