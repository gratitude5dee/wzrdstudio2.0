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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWzrdRealtimeSession({ registry }: UseWzrdRealtimeSessionOptions) {
  const transportRef = useRef<WebRTCTransport | null>(null);
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const voice = import.meta.env.VITE_WZRD_REALTIME_VOICE ?? 'ash';

      const transport = new WebRTCTransport();

      // --- Wire event handlers BEFORE connecting ---

      // Audio playback events
      transport.on('response.audio.delta', () => setStatus('speaking'));
      transport.on('response.audio_transcript.delta', () => setStatus('speaking'));
      transport.on('response.audio.done', () => {
        // Will get response.done shortly after
      });
      transport.on('response.done', () => setStatus('connected'));

      // Tool call handling
      transport.on('response.function_call_arguments.done', async (event) => {
        const callId = event.call_id as string;
        const fnName = event.name as string;
        const argsStr = event.arguments as string;

        setStatus('thinking');

        try {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(argsStr);
          } catch { /* empty args */ }

          // The tool is always execute_worldstudio_action; extract the inner action
          let result: unknown;
          if (fnName === 'execute_worldstudio_action') {
            const actionName = args.name as string;
            const input = (args.input as Record<string, unknown>) ?? {};
            const confirmed = args.confirmed as boolean | undefined;
            result = await registryRef.current.execute(
              actionName as Parameters<typeof registryRef.current.execute>[0],
              input,
              { confirmed: confirmed ?? undefined },
            );
          } else {
            result = { ok: false, status: 'invalid_input', message: `Unknown tool: ${fnName}` };
          }

          // Send tool result back
          transport.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify(result),
            },
          });

          // Trigger model to respond after receiving tool output
          transport.send({ type: 'response.create' });
        } catch (err) {
          console.error('[Voice] tool execution error:', err);
          transport.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({
                ok: false,
                status: 'error',
                message: err instanceof Error ? err.message : 'Tool execution failed',
              }),
            },
          });
          transport.send({ type: 'response.create' });
        }
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
          turn_detection: { type: 'server_vad' },
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
  }, [disconnect]);

  const pushToTalkStart = useCallback(async () => {
    const transport = transportRef.current ?? (await connect());
    transport.interrupt();
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
