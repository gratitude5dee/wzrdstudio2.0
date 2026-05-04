import { useCallback, useEffect, useRef, useState } from 'react';

import type { VoiceActionRegistry } from '../actions/registry';
import { fetchRealtimeClientSecret } from './realtimeClientSecret';

export type VoiceSessionStatus =
  | 'idle'
  | 'connecting'
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
    sendEvent: (event: { type: string }) => void;
  };
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

type RealtimeRuntime = {
  RealtimeSession: new (agent: unknown, options: Record<string, unknown>) => RealtimeSessionInstance;
  OpenAIRealtimeWebRTC: new (options: { audioElement: HTMLAudioElement }) => unknown;
  agent: unknown;
};

export function useWzrdRealtimeSession({ registry }: UseWzrdRealtimeSessionOptions) {
  const sessionRef = useRef<RealtimeSessionInstance | null>(null);
  const runtimeRef = useRef<Promise<RealtimeRuntime> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const connect = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    setStatus('connecting');
    setErrorMessage(null);

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
    }

    try {
      // Request microphone permission up-front so we get a clear error
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release immediately — the WebRTC transport will request its own stream
        micStream.getTracks().forEach((t) => t.stop());
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

      const { RealtimeSession, OpenAIRealtimeWebRTC, agent } = await loadRuntime();
      const apiKey = await fetchRealtimeClientSecret();
      const model = import.meta.env.VITE_WZRD_REALTIME_MODEL ?? 'gpt-realtime';
      const voice = import.meta.env.VITE_WZRD_REALTIME_VOICE ?? 'ash';
      const session = new RealtimeSession(agent, {
        transport: new OpenAIRealtimeWebRTC({
          audioElement: audioRef.current,
        }),
        model,
        config: {
          voice,
          modalities: ['text', 'audio'],
          inputAudioTranscription: {
            model: 'gpt-4o-mini-transcribe',
            language: 'en',
          },
          turnDetection: null as unknown as Record<string, unknown>,
        },
      });

      session.on('audio_start', () => setStatus('speaking'));
      session.on('audio_stopped', () => setStatus('idle'));
      session.on('agent_tool_start', () => setStatus('thinking'));
      session.on('agent_tool_end', () => setStatus('idle'));
      session.on('error', (error: unknown) => {
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Voice session error.');
      });
      session.on('transport_event', (event: { type?: string }) => {
        if (event.type === 'response.output_audio_transcript.delta') {
          setStatus('speaking');
        }
        if (event.type === 'response.done') {
          setStatus('idle');
        }
      });

      await session.connect({ apiKey, model });
      sessionRef.current = session;
      setStatus('idle');
      return session;
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Voice connection failed.');
      throw error;
    }
  }, [loadRuntime]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus('idle');
  }, []);

  const pushToTalkStart = useCallback(async () => {
    const session = await connect();
    session.interrupt();
    session.transport.sendEvent({ type: 'input_audio_buffer.clear' } as never);
    setStatus('listening');
  }, [connect]);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as never);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as never);
    setStatus('thinking');
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    status,
    errorMessage,
    connect,
    disconnect,
    pushToTalkStart,
    pushToTalkStop,
  };
}
