import { useCallback, useEffect, useRef, useState } from 'react';

import type { VoiceActionRegistry } from '../actions/registry';
import { fetchRealtimeClientSecret } from './realtimeClientSecret';

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

type RealtimeSessionInstance = {
  connect: (options: { apiKey: string; model?: string }) => Promise<void>;
  close: () => void;
  interrupt: () => void;
  transport: {
    status: string;
    sendEvent: (event: { type: string }) => void;
  };
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

type RealtimeRuntime = {
  RealtimeSession: new (agent: unknown, options: Record<string, unknown>) => RealtimeSessionInstance;
  OpenAIRealtimeWebRTC: new (options: { audioElement: HTMLAudioElement; mediaStream: MediaStream }) => unknown;
  agent: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stop all tracks on a MediaStream, ignoring errors. */
function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
}

/** Errors we can silently ignore (e.g. committing an empty audio buffer on short press). */
function isBenignError(raw: unknown): boolean {
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const inner = rec.error as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object') {
      const nested = inner.error as Record<string, unknown> | undefined;
      const code = nested?.code ?? inner.code;
      if (code === 'input_audio_buffer_commit_empty') return true;
    }
  }
  return false;
}

/**
 * Extract a user-friendly message from the SDK's `error` event payload.
 */
function normalizeVoiceError(raw: unknown): string {
  if (raw instanceof Error) {
    const msg = raw.message;
    if (msg.includes('Failed to parse SessionDescription') || msg.includes('Expect line: v=')) {
      return 'Voice connection failed — the Realtime API rejected the WebRTC session. Please try again.';
    }
    return msg;
  }
  if (typeof raw === 'string') return raw;

  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;

    const inner = rec.error;
    if (inner && typeof inner === 'object') {
      const err = inner as Record<string, unknown>;
      // Handle double-nested { error: { error: { message } } }
      const nested = err.error as Record<string, unknown> | undefined;
      if (nested && typeof nested === 'object' && typeof nested.message === 'string') {
        return nested.message;
      }
      const errType = typeof err.type === 'string' ? err.type : '';
      const errMsg = typeof err.message === 'string' ? err.message : '';

      if (errType === 'service_unavailable' || errMsg.includes('temporarily unavailable')) {
        return 'OpenAI Realtime service is temporarily unavailable — please try again in a moment.';
      }
      if (errMsg) return errMsg;
      if (errType) return errType;
    }

    if (typeof rec.message === 'string') return rec.message;
  }

  return 'Voice session error.';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWzrdRealtimeSession({ registry }: UseWzrdRealtimeSessionOptions) {
  const sessionRef = useRef<RealtimeSessionInstance | null>(null);
  const runtimeRef = useRef<Promise<RealtimeRuntime> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSessionActive = useCallback(() => sessionRef.current !== null, []);

  const loadRuntime = useCallback(() => {
    if (!runtimeRef.current) {
      runtimeRef.current = Promise.all([
        import('@openai/agents/realtime'),
        import('../agent'),
      ]).then(([realtime, agentModule]) => ({
        RealtimeSession: realtime.RealtimeSession as RealtimeRuntime['RealtimeSession'],
        OpenAIRealtimeWebRTC: realtime.OpenAIRealtimeWebRTC as RealtimeRuntime['OpenAIRealtimeWebRTC'],
        agent: agentModule.createWzrdRealtimeAgent(registry),
      }));
    }
    return runtimeRef.current;
  }, [registry]);

  const disconnect = useCallback(() => {
    try {
      sessionRef.current?.close();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
    stopStream(micStreamRef.current);
    micStreamRef.current = null;
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const connect = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    setStatus('connecting');
    setErrorMessage(null);

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
    }

    let micStream: MediaStream | null = null;

    try {
      // 1. Acquire microphone
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
      } catch (micError) {
        const msg = micError instanceof Error ? micError.message : String(micError);
        const denied =
          msg.includes('Permission denied') ||
          msg.includes('NotAllowedError') ||
          msg.includes('Permission dismissed');
        throw new Error(
          denied
            ? 'Microphone access denied. Please allow microphone permission in your browser and try again.'
            : `Microphone error: ${msg}`,
        );
      }

      // 2. Load runtime, fetch ephemeral key
      const { RealtimeSession, OpenAIRealtimeWebRTC, agent } = await loadRuntime();
      const apiKey = await fetchRealtimeClientSecret();
      const model = import.meta.env.VITE_WZRD_REALTIME_MODEL ?? 'gpt-realtime';
      const voice = import.meta.env.VITE_WZRD_REALTIME_VOICE ?? 'ash';

      // 3. Create session — audio-only output (the API rejects ['text', 'audio'])
      const session = new RealtimeSession(agent, {
        transport: new OpenAIRealtimeWebRTC({
          audioElement: audioRef.current,
          mediaStream: micStream,
        }),
        model,
        tracingDisabled: true,
        config: {
          voice,
          outputModalities: ['audio'],
          audio: {
            input: {
              transcription: {
                model: 'gpt-4o-mini-transcribe',
                language: 'en',
              },
              turnDetection: {
                type: 'semantic_vad',
                createResponse: false,
              },
            },
          },
        },
      });

      // 4. Wire up event handlers
      session.on('audio_start', () => setStatus('speaking'));
      session.on('audio_stopped', () => setStatus('connected'));
      session.on('agent_tool_start', () => setStatus('thinking'));
      session.on('agent_tool_end', () => setStatus('connected'));

      session.on('error', (error: unknown) => {
        // Silently ignore benign errors like empty audio buffer commits
        if (isBenignError(error)) {
          console.debug('[Voice] benign error suppressed:', error);
          return;
        }
        const msg = normalizeVoiceError(error);
        console.warn('[Voice] session error:', msg, error);
        setStatus('error');
        setErrorMessage(msg);
      });

      session.on('transport_event', (event: { type?: string }) => {
        if (event.type === 'response.output_audio_transcript.delta') {
          setStatus('speaking');
        }
        if (event.type === 'response.done') {
          setStatus('connected');
        }
      });

      // 5. Connect
      await session.connect({ apiKey, model });
      sessionRef.current = session;
      setStatus('connected');
      return session;
    } catch (error) {
      stopStream(micStream);
      micStreamRef.current = null;
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Voice connection failed.');
      throw error;
    }
  }, [loadRuntime]);

  const pushToTalkStart = useCallback(async () => {
    const session = await connect();
    session.interrupt();
    session.transport.sendEvent({ type: 'input_audio_buffer.clear' } as never);
    setStatus('listening');
  }, [connect]);

  const pushToTalkStop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.transport.status !== 'connected') {
      console.warn('[Voice] pushToTalkStop skipped — transport not connected');
      return;
    }
    session.transport.sendEvent({ type: 'input_audio_buffer.commit' } as never);
    session.transport.sendEvent({ type: 'response.create' } as never);
    setStatus('thinking');
  }, []);

  // Clean up on unmount
  useEffect(() => disconnect, [disconnect]);

  // Clean up when user closes/refreshes the tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      disconnect();
    };
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
