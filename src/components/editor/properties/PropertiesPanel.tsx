import { useCallback } from 'react';
import { useVideoEditorStore, type ClipEffect, type ClipTransition } from '@/store/videoEditorStore';
import { PropertySection } from './PropertySection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';

interface PropertiesPanelProps {
  selectedClipIds: string[];
  selectedAudioTrackIds: string[];
}

const inputStyle = {
  height: `${exactMeasurements.propertiesPanel.fieldHeight}px`,
  background: editorTheme.bg.tertiary,
  border: `1px solid ${editorTheme.border.default}`,
  borderRadius: '4px',
  color: editorTheme.text.primary,
  fontSize: typography.fontSize.base,
};

const commonEffects: Array<{ id: string; name: string; params: Record<string, number> }> = [
  { id: 'blur', name: 'Blur', params: { amount: 4 } },
  { id: 'brightness', name: 'Brightness', params: { amount: 1.12 } },
  { id: 'contrast', name: 'Contrast', params: { amount: 1.15 } },
  { id: 'saturation', name: 'Saturation', params: { amount: 1.2 } },
  { id: 'grayscale', name: 'Grayscale', params: { amount: 1 } },
  { id: 'sepia', name: 'Sepia', params: { amount: 1 } },
  { id: 'invert', name: 'Invert', params: { amount: 1 } },
  { id: 'vignette', name: 'Vignette', params: { amount: 0.35 } },
  { id: 'grain', name: 'Grain', params: { amount: 0.18 } },
];

const fieldNumber = (value: number | undefined, fallback = 0) => Number.isFinite(value ?? NaN) ? value ?? fallback : fallback;

export default function PropertiesPanel({ selectedClipIds, selectedAudioTrackIds }: PropertiesPanelProps) {
  const clips = useVideoEditorStore((s) => s.clips);
  const audioTracks = useVideoEditorStore((s) => s.audioTracks);
  const updateClip = useVideoEditorStore((s) => s.updateClip);
  const updateAudioTrack = useVideoEditorStore((s) => s.updateAudioTrack);

  const selectedClip = selectedClipIds.length === 1 ? clips.find((clip) => clip.id === selectedClipIds[0]) : null;
  const selectedAudioTrack = selectedAudioTrackIds.length === 1 ? audioTracks.find((track) => track.id === selectedAudioTrackIds[0]) : null;

  const updateTiming = useCallback(
    (field: 'startTime' | 'duration' | 'layer' | 'trimStart' | 'trimEnd', value: number) => {
      if (!selectedClip) return;
      const updates: any = { [field]: value };
      if (field === 'startTime') updates.endTime = value + selectedClip.duration;
      if (field === 'duration') updates.endTime = selectedClip.startTime + value;
      updateClip(selectedClip.id, updates);
    },
    [selectedClip, updateClip]
  );

  const updateTransform = useCallback(
    (property: string, value: number) => {
      if (!selectedClip) return;
      const transforms = { ...selectedClip.transforms };
      if (property === 'opacity') transforms.opacity = value;
      if (property === 'positionX') transforms.position = { ...transforms.position, x: value };
      if (property === 'positionY') transforms.position = { ...transforms.position, y: value };
      if (property === 'scaleX') transforms.scale = { ...transforms.scale, x: value };
      if (property === 'scaleY') transforms.scale = { ...transforms.scale, y: value };
      if (property === 'rotation') transforms.rotation = value;
      updateClip(selectedClip.id, { transforms }, { skipHistory: true });
    },
    [selectedClip, updateClip]
  );

  const updateTextStyle = useCallback(
    (updates: Record<string, unknown>) => {
      if (!selectedClip) return;
      updateClip(selectedClip.id, { style: { ...(selectedClip.style ?? {}), ...updates } });
    },
    [selectedClip, updateClip]
  );

  const setTransition = useCallback(
    (type: ClipTransition['type']) => {
      if (!selectedClip) return;
      updateClip(selectedClip.id, {
        transition: type === 'none' ? { type: 'none', duration: 0 } : { type, duration: selectedClip.transition?.duration ?? 500 },
      });
    },
    [selectedClip, updateClip]
  );

  const addEffect = useCallback(
    (effectId: string) => {
      if (!selectedClip || effectId === 'none') return;
      const preset = commonEffects.find((effect) => effect.id === effectId);
      if (!preset) return;
      const effect: ClipEffect = {
        id: preset.id,
        name: preset.id,
        type: preset.id === 'vignette' || preset.id === 'grain' ? 'overlay' : 'filter',
        params: preset.params,
      };
      updateClip(selectedClip.id, {
        effects: [...(selectedClip.effects ?? []).filter((item) => item.id !== effect.id), effect],
      });
    },
    [selectedClip, updateClip]
  );

  if (!selectedClip && !selectedAudioTrack) {
    return (
      <div
        className="flex items-center justify-center backdrop-blur-xl relative z-10"
        style={{
          width: `${exactMeasurements.propertiesPanel.width}px`,
          background: 'rgba(15, 15, 20, 0.8)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <p style={{ fontSize: typography.fontSize.sm, color: editorTheme.text.tertiary }}>
          Select a clip to edit properties
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-y-auto backdrop-blur-xl relative z-10"
      style={{
        width: `${exactMeasurements.propertiesPanel.width}px`,
        background: 'rgba(15, 15, 20, 0.8)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div style={{ padding: `${exactMeasurements.propertiesPanel.padding}px`, borderBottom: `1px solid ${editorTheme.border.subtle}` }}>
        <h2 style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: editorTheme.text.primary }}>
          {selectedClip ? selectedClip.name || 'Clip Properties' : selectedAudioTrack?.name || 'Audio Properties'}
        </h2>
        <span style={{ fontSize: typography.fontSize.xs, color: editorTheme.text.tertiary, textTransform: 'uppercase' }}>
          {selectedClip?.type ?? 'audio'}
        </span>
      </div>

      {selectedClip && (
        <>
          <PropertySection title="Timing">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start" value={selectedClip.startTime} onChange={(value) => updateTiming('startTime', value)} />
              <Field label="Duration" value={selectedClip.duration} onChange={(value) => updateTiming('duration', Math.max(100, value))} />
              <Field label="Layer" value={selectedClip.layer ?? 0} onChange={(value) => updateTiming('layer', Math.max(0, Math.round(value)))} />
              <Field label="Trim In" value={selectedClip.trimStart ?? 0} onChange={(value) => updateTiming('trimStart', Math.max(0, value))} />
              <Field label="Trim Out" value={selectedClip.trimEnd ?? selectedClip.duration} onChange={(value) => updateTiming('trimEnd', Math.max(0, value))} />
            </div>
          </PropertySection>

          <PropertySection title="Transform">
            <div className="grid grid-cols-2 gap-2">
              <Field label="X" value={selectedClip.transforms.position.x} onChange={(value) => updateTransform('positionX', value)} />
              <Field label="Y" value={selectedClip.transforms.position.y} onChange={(value) => updateTransform('positionY', value)} />
              <Field label="Scale X" value={selectedClip.transforms.scale.x} step={0.05} onChange={(value) => updateTransform('scaleX', Math.max(0.05, value))} />
              <Field label="Scale Y" value={selectedClip.transforms.scale.y} step={0.05} onChange={(value) => updateTransform('scaleY', Math.max(0.05, value))} />
            </div>
            <div className="mt-3 space-y-3">
              <SliderRow label="Rotation" value={selectedClip.transforms.rotation} min={-360} max={360} onChange={(value) => updateTransform('rotation', value)} suffix="deg" />
              <SliderRow label="Opacity" value={selectedClip.transforms.opacity * 100} min={0} max={100} onChange={(value) => updateTransform('opacity', value / 100)} suffix="%" />
            </div>
          </PropertySection>

          {selectedClip.type === 'text' && (
            <PropertySection title="Text">
              <textarea
                className="mb-3 min-h-[74px] w-full resize-none rounded border bg-transparent p-2 text-sm text-white"
                value={selectedClip.text ?? ''}
                onChange={(event) => updateClip(selectedClip.id, { text: event.target.value, name: event.target.value.slice(0, 32) || 'Text' })}
                style={{ borderColor: editorTheme.border.default }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Size" value={fieldNumber(selectedClip.style?.fontSize as number, 72)} onChange={(value) => updateTextStyle({ fontSize: value })} />
                <div>
                  <Label style={{ fontSize: typography.fontSize.xs, color: editorTheme.text.tertiary }}>Color</Label>
                  <Input type="color" value={(selectedClip.style?.color as string) ?? '#ffffff'} onChange={(event) => updateTextStyle({ color: event.target.value })} style={inputStyle} />
                </div>
              </div>
            </PropertySection>
          )}

          <PropertySection title="Motion And Effects">
            <div className="space-y-3">
              <div>
                <Label style={{ fontSize: typography.fontSize.xs, color: editorTheme.text.tertiary }}>Transition</Label>
                <Select value={selectedClip.transition?.type ?? 'none'} onValueChange={(value) => setTransition(value as ClipTransition['type'])}>
                  <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="dissolve">Dissolve</SelectItem>
                    <SelectItem value="slide">Slide</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="blur">Blur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ fontSize: typography.fontSize.xs, color: editorTheme.text.tertiary }}>Add Effect</Label>
                <Select value="none" onValueChange={addEffect}>
                  <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose effect</SelectItem>
                    {commonEffects.map((effect) => <SelectItem key={effect.id} value={effect.id}>{effect.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedClip.effects?.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedClip.effects.map((effect) => (
                    <button
                      key={effect.id}
                      type="button"
                      onClick={() => updateClip(selectedClip.id, { effects: selectedClip.effects?.filter((item) => item.id !== effect.id) ?? [] })}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      {effect.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </PropertySection>
        </>
      )}

      {selectedAudioTrack && (
        <>
          <PropertySection title="Audio Timing">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start" value={selectedAudioTrack.startTime} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { startTime: value, endTime: value + selectedAudioTrack.duration })} />
              <Field label="Duration" value={selectedAudioTrack.duration} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { duration: value, endTime: selectedAudioTrack.startTime + value })} />
              <Field label="Track" value={selectedAudioTrack.trackIndex ?? 0} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { trackIndex: Math.max(0, Math.round(value)) })} />
              <Field label="Fade In" value={selectedAudioTrack.fadeInDuration ?? 0} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { fadeInDuration: Math.max(0, value) })} />
              <Field label="Fade Out" value={selectedAudioTrack.fadeOutDuration ?? 0} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { fadeOutDuration: Math.max(0, value) })} />
            </div>
          </PropertySection>

          <PropertySection title="Volume">
            <SliderRow label="Volume" value={selectedAudioTrack.volume * 100} min={0} max={150} onChange={(value) => updateAudioTrack(selectedAudioTrack.id, { volume: value / 100 }, { skipHistory: true })} suffix="%" />
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={selectedAudioTrack.isMuted}
                onChange={(event) => updateAudioTrack(selectedAudioTrack.id, { isMuted: event.target.checked })}
              />
              Mute
            </label>
          </PropertySection>
        </>
      )}
    </div>
  );
}

function Field({ label, value, step = 100, onChange }: { label: string; value?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div>
      <Label style={{ fontSize: typography.fontSize.xs, color: editorTheme.text.tertiary }}>{label}</Label>
      <Input type="number" value={fieldNumber(value)} step={step} onChange={(event) => onChange(Number(event.target.value) || 0)} style={inputStyle} />
    </div>
  );
}

function SliderRow({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{Math.round(value)}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([next]) => onChange(next)} />
    </div>
  );
}
