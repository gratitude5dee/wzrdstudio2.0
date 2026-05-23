import { memo, useCallback, useMemo, useState } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Music, Loader2, Play, Pause, SendHorizontal } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { NodeStatusBadge } from '../status/NodeStatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { NodeStatus, Port, PortPosition } from '@/types/computeFlow';
import { useCatalogModels } from '@/hooks/useCatalogModels';

const DEFAULT_VOICES = [
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Professional)' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Warm)' },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Authoritative)' },
  { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Friendly)' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Calm)' },
];

const portPositionToReactFlow = (position: PortPosition) => {
  switch (position) {
    case 'right':
      return Position.Right;
    case 'bottom':
      return Position.Bottom;
    case 'top':
      return Position.Top;
    case 'left':
    default:
      return Position.Left;
  }
};

export const ReactFlowAudioNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = (data as any) || {};
  const status = (nodeData?.status || 'idle') as NodeStatus;
  const progress = nodeData?.progress || 0;
  const error = nodeData?.error;
  const inputPorts = (nodeData?.inputs as Port[] | undefined) ?? [];
  const outputPorts = (nodeData?.outputs as Port[] | undefined) ?? [];

  const params = (nodeData?.params ?? {}) as Record<string, unknown>;
  const promptValue = typeof params.prompt === 'string' ? params.prompt : '';
  const { models: catalogModels } = useCatalogModels({ mediaType: 'audio', autoFetch: true });
  const audioModels = useMemo(
    () => catalogModels.filter((model) => model.ui_group === 'generation'),
    [catalogModels]
  );
  const audioModel =
    (params.audioModel as string) ??
    (params.model as string) ??
    audioModels[0]?.id ??
    'gmi/minime-talks-workflow';
  const voiceId = (params.voiceId as string) ?? DEFAULT_VOICES[0].voice_id;

  // Get audio URL from preview or params
  const audioUrl =
    (nodeData?.preview as any)?.url ??
    (nodeData?.preview as any)?.data?.audioUrl ??
    (params.audioUrl as string) ??
    null;

  const [isPlaying, setIsPlaying] = useState(false);
  const title = nodeData?.label || 'Audio';

  const handleModelChange = useCallback(
    (modelId: string) => {
      nodeData?.onUpdateParams?.({ audioModel: modelId, model: modelId });
    },
    [nodeData]
  );

  const handleVoiceChange = useCallback(
    (newVoiceId: string) => {
      nodeData?.onUpdateParams?.({ voiceId: newVoiceId });
    },
    [nodeData]
  );

  const togglePlay = useCallback(() => {
    const audio = document.getElementById(`audio-gen-${id}`) as HTMLAudioElement;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [id, isPlaying]);

  const handles = [
    ...inputPorts.map((port) => ({
      id: port.id,
      type: 'target' as const,
      position: portPositionToReactFlow(port.position),
      dataType: port.datatype,
      label: port.name,
      maxConnections: port.cardinality === '1' ? 1 : undefined,
      variant: 'flora' as const,
    })),
    ...outputPorts.map((port) => ({
      id: port.id,
      type: 'source' as const,
      position: portPositionToReactFlow(port.position),
      dataType: port.datatype,
      label: port.name,
      maxConnections: port.cardinality === '1' ? 1 : undefined,
      variant: 'flora' as const,
    })),
  ];

  const isGenerating = status === 'running' || status === 'queued';
  const selectedAudioModel = audioModels.find((model) => model.id === audioModel);
  const modelLabel = selectedAudioModel?.name ?? audioModel;
  const audioModelOptions = audioModels.map((model) => ({
    id: model.id,
    label: model.name,
  }));
  const supportsVoiceSelection = selectedAudioModel?.supports.includes('voice_id') ?? false;
  const isSpeechModel =
    selectedAudioModel?.workflow_type === 'text-to-speech' ||
    selectedAudioModel?.category === 'tts' ||
    supportsVoiceSelection;

  return (
    <BaseNode
      handles={handles}
      nodeType="audio"
      isSelected={selected}
      hoverMenu={{
        selectedModel: audioModel,
        modelOptions: audioModelOptions,
        onModelChange: handleModelChange,
        onGenerate: nodeData?.onGenerate,
        onDuplicate: nodeData?.onDuplicate,
        onDelete: nodeData?.onDelete,
      }}
    >
      <NodeStatusBadge status={status} progress={progress} error={error} />
      <div className={cn(
        "w-80 bg-[#1a1a1a] border border-[rgba(249,115,22,0.08)] rounded-lg overflow-hidden",
        selected && "ring-2 ring-[#f97316]/50"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f0f] border-b border-[rgba(249,115,22,0.08)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-pink-500/10">
              <Music className="w-3.5 h-3.5 text-pink-400" />
            </div>
            <span className="text-white font-mono text-sm">{title}</span>
          </div>
          <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
            {modelLabel}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Model Selector */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Type</label>
            <Select value={audioModel} onValueChange={handleModelChange}>
              <SelectTrigger className="h-8 text-xs bg-zinc-900 border-[rgba(249,115,22,0.12)]" disabled={audioModels.length === 0}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audioModels.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice Selector - only for TTS */}
          {isSpeechModel && supportsVoiceSelection && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Voice</label>
              <Select value={voiceId} onValueChange={handleVoiceChange}>
                <SelectTrigger className="h-8 text-xs bg-zinc-900 border-[rgba(249,115,22,0.12)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_VOICES.map(v => (
                    <SelectItem key={v.voice_id} value={v.voice_id} className="text-xs">
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Prompt/Text Input */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
              {isSpeechModel ? 'Text' : 'Prompt'}
            </label>
            <textarea
              value={promptValue}
              onChange={(e) => nodeData?.onUpdateParams?.({ prompt: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder={
                isSpeechModel
                  ? 'Enter the text you want to convert to speech...'
                  : selectedAudioModel?.category === 'music'
                    ? 'Epic orchestral soundtrack...'
                    : 'Footsteps on gravel...'
              }
              className="min-h-[60px] w-full text-xs bg-zinc-900 border border-[rgba(249,115,22,0.12)] rounded-md px-3 py-2 resize-none text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="flex items-center gap-2 p-2 bg-zinc-900/60 rounded-lg border border-[rgba(249,115,22,0.12)]">
              <button
                onClick={togglePlay}
                className="p-2 bg-[#f97316]/20 rounded-full hover:bg-[#f97316]/30 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 text-pink-400" />
                ) : (
                  <Play className="w-4 h-4 text-pink-400" />
                )}
              </button>
              <div className="flex-1 h-1 bg-zinc-700 rounded-full">
                <div className="h-full bg-pink-500 rounded-full w-0" />
              </div>
              <audio
                id={`audio-gen-${id}`}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>
          )}

          {/* Generate Button */}
          <div className="rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111]">
            <div className="flex items-center justify-between border-t border-[rgba(249,115,22,0.06)] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {isGenerating ? `Generating ${progress}%` : 'Audio'}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  nodeData?.onGenerate?.();
                }}
                disabled={!promptValue.trim() || isGenerating}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-500"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </BaseNode>
  );
});

ReactFlowAudioNode.displayName = 'ReactFlowAudioNode';
