import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Music2, FileText, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { MusicVideoData, StemAsset, AnnotatedSection } from './types';

interface MusicProductionPanelProps {
  projectId: string | null;
  musicData: MusicVideoData;
  onUpdate: (patch: Partial<MusicVideoData>) => void;
}

const STEM_LABEL: Record<string, string> = {
  vocals: 'Vocals', drums: 'Drums', bass: 'Bass',
  other: 'Other', guitar: 'Guitar', piano: 'Piano',
};

export const MusicProductionPanel: React.FC<MusicProductionPanelProps> = ({ projectId, musicData, onUpdate }) => {
  const [splitting, setSplitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const audioUrl = musicData.audioFileUrl;
  const stems = musicData.stems ?? [];
  const transcriptionModel = musicData.transcriptionModel ?? 'gmi/gemini-3.1-flash';

  const handleSplit = async () => {
    if (!audioUrl) { toast.error('Upload an audio file first'); return; }
    if (!projectId) { toast.error('Save the project first'); return; }
    setSplitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('split-audio-stems', {
        body: { project_id: projectId, audio_url: audioUrl },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Stem split failed');
      onUpdate({ stems: data.stems as StemAsset[], stemSplitJobId: data.request_id });
      toast.success(`Generated ${data.stems.length} stems`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stem split failed');
    } finally {
      setSplitting(false);
    }
  };

  const toggleStem = (stem: string) => {
    onUpdate({
      stems: stems.map((s) => s.stem === stem ? { ...s, selected: !s.selected } : s),
    });
  };

  const handleTranscribe = async () => {
    if (!audioUrl) { toast.error('Upload an audio file first'); return; }
    if (!projectId) { toast.error('Save the project first'); return; }
    setTranscribing(true);
    try {
      const selected = stems.filter((s) => s.selected).map((s) => ({ stem: s.stem, url: s.url }));
      const { data, error } = await supabase.functions.invoke('transcribe-music-annotated', {
        body: {
          project_id: projectId,
          audio_url: audioUrl,
          selected_stems: selected,
          model: transcriptionModel,
          include_timing: true,
          style_mode: 'suno_annotated',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Transcription failed');
      onUpdate({
        annotatedLyrics: data.annotated_lyrics_text,
        transcriptionSections: data.sections as AnnotatedSection[],
        transcriptionModel,
      });
      toast.success('Annotated lyrics generated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <Music2 className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Music Production</h4>
      </div>

      {/* Stem split */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Stem Separation (Demucs htdemucs_6s)</Label>
          <Button size="sm" onClick={handleSplit} disabled={splitting || !audioUrl}>
            {splitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
            Split Stems
          </Button>
        </div>
        {stems.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stems.map((s) => (
              <button
                key={s.stem}
                type="button"
                onClick={() => toggleStem(s.stem)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition',
                  s.selected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background/60 border-border hover:border-primary/60',
                )}
              >
                {s.selected && <Check className="h-3 w-3" />}
                {STEM_LABEL[s.stem] ?? s.stem}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transcription */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Transcription Model</Label>
        <RadioGroup
          value={transcriptionModel}
          onValueChange={(v) => onUpdate({ transcriptionModel: v as MusicVideoData['transcriptionModel'] })}
          className="flex gap-4"
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="gmi/gemini-3.1-flash" id="model-flash" />
            Gemini 3.1 Flash
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="gmi/gemini-3.1-pro" id="model-pro" />
            Gemini 3.1 Pro
          </label>
        </RadioGroup>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Annotated Lyrics
          </span>
          <Button size="sm" variant="secondary" onClick={handleTranscribe} disabled={transcribing || !audioUrl}>
            {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
            Generate Annotated Lyrics
          </Button>
        </div>
        <Textarea
          value={musicData.annotatedLyrics ?? ''}
          onChange={(e) => onUpdate({ annotatedLyrics: e.target.value })}
          placeholder="[Intro]\n(Soft pad enters with rising filter sweep)\n…"
          rows={10}
          className="bg-background/60 text-sm font-mono"
        />
      </div>
    </div>
  );
};
