import { useCallback } from 'react';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { PropertySection } from './PropertySection';
import { ColorPicker } from './ColorPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';

interface PropertiesPanelProps {
  selectedClipIds: string[];
  selectedAudioTrackIds: string[];
}

export default function PropertiesPanel({ selectedClipIds, selectedAudioTrackIds }: PropertiesPanelProps) {
  const clips = useVideoEditorStore((s) => s.clips);
  const audioTracks = useVideoEditorStore((s) => s.audioTracks);
  const updateClip = useVideoEditorStore((s) => s.updateClip);
  const updateAudioTrack = useVideoEditorStore((s) => s.updateAudioTrack);

  const selectedClip = selectedClipIds.length === 1 ? clips.find(c => c.id === selectedClipIds[0]) : null;
  const selectedAudioTrack = selectedAudioTrackIds.length === 1 ? audioTracks.find(t => t.id === selectedAudioTrackIds[0]) : null;

  const handleTransformChange = useCallback(
    (property: string, value: number) => {
      if (!selectedClip) return;
      const transforms = { ...selectedClip.transforms };
      switch (property) {
        case 'opacity':
          transforms.opacity = value;
          break;
        case 'positionX':
          transforms.position = { ...transforms.position, x: value };
          break;
        case 'positionY':
          transforms.position = { ...transforms.position, y: value };
          break;
        case 'scaleX':
          transforms.scale = { ...transforms.scale, x: value };
          break;
        case 'scaleY':
          transforms.scale = { ...transforms.scale, y: value };
          break;
        case 'rotation':
          transforms.rotation = value;
          break;
      }
      updateClip(selectedClip.id, { transforms }, { skipHistory: true });
    },
    [selectedClip, updateClip]
  );

  const handleVolumeChange = useCallback(
    (volume: number) => {
      if (!selectedAudioTrack) return;
      updateAudioTrack(selectedAudioTrack.id, { volume }, { skipHistory: true });
    },
    [selectedAudioTrack, updateAudioTrack]
  );

  const inputStyle = {
    height: `${exactMeasurements.propertiesPanel.fieldHeight}px`,
    background: editorTheme.bg.tertiary,
    border: `1px solid ${editorTheme.border.default}`,
    borderRadius: '4px',
    color: editorTheme.text.primary,
    fontSize: typography.fontSize.base,
  };

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
        <p
          style={{
            fontSize: typography.fontSize.sm,
            color: editorTheme.text.tertiary,
          }}
        >
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
      {/* Header - Clip Name */}
      <div
        style={{
          padding: `${exactMeasurements.propertiesPanel.padding}px`,
          borderBottom: `1px solid ${editorTheme.border.subtle}`,
        }}
      >
        <h2
          style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: editorTheme.text.primary,
          }}
        >
          {selectedClip ? selectedClip.name || 'Clip Properties' : 'Audio Properties'}
        </h2>
        {selectedClip && (
          <span
            style={{
              fontSize: typography.fontSize.xs,
              color: editorTheme.text.tertiary,
              textTransform: 'uppercase',
            }}
          >
            {selectedClip.type}
          </span>
        )}
      </div>

      {/* Clip Properties */}
      {selectedClip && (
        <>
          {/* Transform Section - Opacity */}
          <PropertySection title="Opacity">
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${exactMeasurements.propertiesPanel.fieldGap}px` }}>
              <div className="flex items-center gap-3">
                <div style={{ flex: 1 }}>
                  <Slider
                    value={[selectedClip.transforms.opacity * 100]}
                    onValueChange={([v]) => handleTransformChange('opacity', v / 100)}
                    min={0}
                    max={100}
                    step={1}
                    className="cursor-pointer"
                  />
                </div>
                <span
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                    minWidth: '40px',
                    textAlign: 'right',
                  }}
                >
                  {Math.round(selectedClip.transforms.opacity * 100)}%
                </span>
              </div>
            </div>
          </PropertySection>

          {/* Transform Section - Position */}
          <PropertySection title="Position">
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${exactMeasurements.propertiesPanel.fieldGap}px` }}>
              <div className="flex items-center gap-2">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                    minWidth: '16px',
                  }}
                >
                  X
                </Label>
                <Input
                  type="number"
                  value={selectedClip.transforms.position.x}
                  onChange={(e) => handleTransformChange('positionX', parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                    minWidth: '16px',
                  }}
                >
                  Y
                </Label>
                <Input
                  type="number"
                  value={selectedClip.transforms.position.y}
                  onChange={(e) => handleTransformChange('positionY', parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            </div>
          </PropertySection>

          {/* Transform Section - Scale */}
          <PropertySection title="Scale">
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${exactMeasurements.propertiesPanel.fieldGap}px` }}>
              <div className="flex items-center gap-2">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                    minWidth: '16px',
                  }}
                >
                  X
                </Label>
                <Input
                  type="number"
                  value={selectedClip.transforms.scale.x}
                  onChange={(e) => handleTransformChange('scaleX', parseFloat(e.target.value) || 1)}
                  step={0.1}
                  min={0.1}
                  max={5}
                  style={inputStyle}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                    minWidth: '16px',
                  }}
                >
                  Y
                </Label>
                <Input
                  type="number"
                  value={selectedClip.transforms.scale.y}
                  onChange={(e) => handleTransformChange('scaleY', parseFloat(e.target.value) || 1)}
                  step={0.1}
                  min={0.1}
                  max={5}
                  style={inputStyle}
                />
              </div>
            </div>
          </PropertySection>

          {/* Transform Section - Rotation */}
          <PropertySection title="Rotation">
            <div className="flex items-center gap-3">
              <div style={{ flex: 1 }}>
                <Slider
                  value={[selectedClip.transforms.rotation]}
                  onValueChange={([v]) => handleTransformChange('rotation', v)}
                  min={-360}
                  max={360}
                  step={1}
                  className="cursor-pointer"
                />
              </div>
              <span
                style={{
                  fontSize: typography.fontSize.sm,
                  color: editorTheme.text.secondary,
                  minWidth: '40px',
                  textAlign: 'right',
                }}
              >
                {Math.round(selectedClip.transforms.rotation)}°
              </span>
            </div>
          </PropertySection>

          {/* Preset Section */}
          <PropertySection title="Preset">
            <Select defaultValue="none">
              <SelectTrigger
                style={{
                  height: `${exactMeasurements.propertiesPanel.fieldHeight}px`,
                  background: editorTheme.bg.tertiary,
                  border: `1px solid ${editorTheme.border.default}`,
                  borderRadius: '4px',
                  color: editorTheme.text.primary,
                  fontSize: typography.fontSize.sm,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={{
                  background: editorTheme.bg.tertiary,
                  border: `1px solid ${editorTheme.border.default}`,
                  zIndex: 9999,
                }}
              >
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="preset1">Style 1</SelectItem>
                <SelectItem value="preset2">Style 2</SelectItem>
              </SelectContent>
            </Select>
          </PropertySection>

          {/* Animations Section */}
          <PropertySection title="Animations">
            <div>
              <Label
                className="block"
                style={{
                  fontSize: typography.fontSize.sm,
                  color: editorTheme.text.secondary,
                  marginBottom: '8px',
                }}
              >
                Animation
              </Label>
              <Select defaultValue="none">
                <SelectTrigger
                  style={{
                    height: `${exactMeasurements.propertiesPanel.fieldHeight}px`,
                    background: editorTheme.bg.tertiary,
                    border: `1px solid ${editorTheme.border.default}`,
                    borderRadius: '4px',
                    color: editorTheme.text.primary,
                    fontSize: typography.fontSize.sm,
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: editorTheme.bg.tertiary, border: `1px solid ${editorTheme.border.default}`, zIndex: 9999 }}>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="fade">Fade In</SelectItem>
                  <SelectItem value="slide">Slide In</SelectItem>
                  <SelectItem value="zoom">Zoom In</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </PropertySection>

          {/* Colors Section */}
          <PropertySection title="Colors">
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${exactMeasurements.propertiesPanel.fieldGap}px` }}>
              <div className="flex items-center justify-between">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                  }}
                >
                  Appeared
                </Label>
                <ColorPicker defaultColor="#FFFFFF" />
              </div>

              <div className="flex items-center justify-between">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                  }}
                >
                  Active
                </Label>
                <ColorPicker defaultColor="#FF6B4A" />
              </div>

              <div className="flex items-center justify-between">
                <Label
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: editorTheme.text.secondary,
                  }}
                >
                  Active Fill
                </Label>
                <ColorPicker defaultColor="#A78BFA" />
              </div>
            </div>
          </PropertySection>
        </>
      )}

      {/* Audio Track Properties */}
      {selectedAudioTrack && (
        <PropertySection title="Volume">
          <div className="flex items-center gap-3">
            <div style={{ flex: 1 }}>
              <Slider
                value={[selectedAudioTrack.volume * 100]}
                onValueChange={([v]) => handleVolumeChange(v / 100)}
                min={0}
                max={100}
                step={1}
                className="cursor-pointer"
              />
            </div>
            <span
              style={{
                fontSize: typography.fontSize.sm,
                color: editorTheme.text.secondary,
                minWidth: '40px',
                textAlign: 'right',
              }}
            >
              {Math.round(selectedAudioTrack.volume * 100)}%
            </span>
          </div>
        </PropertySection>
      )}
    </div>
  );
}
