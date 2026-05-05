import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Shield, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AuraJudgeInput, AuraJudgeMode, AuraJudgeResult } from '@/services/observabilityService';

interface AuraJudgePanelProps {
  projectId?: string;
  onEvaluate: (input: AuraJudgeInput) => Promise<AuraJudgeResult>;
}

const scoreLabel = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return value.toFixed(0);
};

const ScoreBar = ({ label, value, maxValue = 100 }: { label: string; value: unknown; maxValue?: number }) => {
  const numVal = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(100, Math.round((numVal / maxValue) * 100)));
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className="font-mono text-white/70">{scoreLabel(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

function splitReferenceUrls(value: string) {
  return value
    .split('\n')
    .map((url) => url.trim())
    .filter(Boolean);
}

function hasConsistencyScores(result: AuraJudgeResult) {
  return [
    result.promptAdherence,
    result.characterConsistency,
    result.spatialConsistency,
    result.temporalConsistency,
    result.continuity,
  ].some((value) => typeof value === 'number');
}

export function AuraJudgePanel({ projectId, onEvaluate }: AuraJudgePanelProps) {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mode, setMode] = useState<AuraJudgeMode>('full');
  const [criteria, setCriteria] = useState('');
  const [promptText, setPromptText] = useState('');
  const [referenceUrls, setReferenceUrls] = useState('');
  const [result, setResult] = useState<AuraJudgeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const persist = Boolean(projectId);
  const parsedReferenceUrls = useMemo(() => splitReferenceUrls(referenceUrls), [referenceUrls]);

  const runJudge = useCallback(async () => {
    if (!mediaUrl.trim()) {
      toast.error('Enter an image or video URL first.');
      return;
    }

    setLoading(true);
    try {
      const nextResult = await onEvaluate({
        mediaUrl: mediaUrl.trim(),
        mediaType,
        mode,
        criteria: criteria.trim() || undefined,
        promptText: promptText.trim() || undefined,
        referenceUrls: parsedReferenceUrls,
        projectId,
        targetType: projectId ? 'project' : undefined,
        persist,
      });
      setResult(nextResult);
      toast.success('Aura judge evaluation complete.');
    } catch (error) {
      console.error('Aura judge failed', error);
      toast.error(error instanceof Error ? error.message : 'Aura judge failed');
    } finally {
      setLoading(false);
    }
  }, [criteria, mediaType, mediaUrl, mode, onEvaluate, parsedReferenceUrls, persist, projectId, promptText]);

  return (
    <div className="space-y-6">
      <Card className="border-white/[0.06] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="h-4 w-4 text-primary" /> Aura Overshoot judge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_0.6fr]">
            <Input
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="https://example.com/media.png"
              className="border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
            />
            <select
              aria-label="Media type"
              value={mediaType}
              onChange={(event) => setMediaType(event.target.value as 'image' | 'video')}
              className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white focus:border-primary/30 focus:outline-none"
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
            <select
              aria-label="Judge mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as AuraJudgeMode)}
              className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white focus:border-primary/30 focus:outline-none"
            >
              <option value="quality">Quality</option>
              <option value="safety">Safety</option>
              <option value="aesthetic">Aesthetic</option>
              <option value="full">Full</option>
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Textarea
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Original generation prompt or shot prompt"
              className="min-h-24 border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
            />
            <Textarea
              value={referenceUrls}
              onChange={(event) => setReferenceUrls(event.target.value)}
              placeholder="Reference URLs, one per line"
              className="min-h-24 border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
            />
          </div>

          <Textarea
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
            placeholder="Optional evaluation criteria or project-specific notes"
            className="min-h-20 border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-white/35">
              <Shield className="h-3.5 w-3.5" />
              {persist ? 'Draft-only judgment will be persisted to project observability.' : 'Draft-only judgment will not be persisted.'}
            </div>
            <Button onClick={() => void runJudge()} disabled={loading} className="bg-primary text-black hover:bg-primary/90">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Evaluate
            </Button>
          </div>
        </CardContent>
      </Card>

      {!result ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <Shield className="mb-4 h-10 w-10 text-white/20" />
          <h3 className="text-sm font-medium text-white/60">No manual evaluation yet</h3>
          <p className="mt-1 max-w-sm text-xs text-white/30">
            Run the Aura judge against an image or video URL to inspect scores, consistency, and draft improvements.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-white/[0.06] bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-white">Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScoreBar label="Overall" value={result.scores.overall} />
              {result.scores.technical !== undefined && <ScoreBar label="Technical" value={result.scores.technical} />}
              {result.scores.aesthetic !== undefined && <ScoreBar label="Aesthetic" value={result.scores.aesthetic} />}
              {result.scores.safety !== undefined && <ScoreBar label="Safety" value={result.scores.safety} />}
              {hasConsistencyScores(result) && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    <AlertCircle className="h-3.5 w-3.5" /> Consistency
                  </div>
                  {result.promptAdherence !== undefined && <ScoreBar label="Prompt adherence" value={result.promptAdherence} />}
                  {result.characterConsistency !== undefined && <ScoreBar label="Character consistency" value={result.characterConsistency} />}
                  {result.spatialConsistency !== undefined && <ScoreBar label="Spatial consistency" value={result.spatialConsistency} />}
                  {result.temporalConsistency !== undefined && <ScoreBar label="Temporal consistency" value={result.temporalConsistency} />}
                  {result.continuity !== undefined && <ScoreBar label="Continuity" value={result.continuity} />}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/[0.06] bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-white">Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-[10px] text-white/35">
                {result.modelUsed && (
                  <span className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-0.5 font-mono">
                    {result.modelUsed}
                  </span>
                )}
                {result.runId && (
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-300">
                    Persisted run {result.runId}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-white/75">{result.feedback}</p>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {result.tags.length > 0 ? (
                    result.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-white/25">No tags returned</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Suggestions</p>
                {result.suggestions.length > 0 ? (
                  <ul className="space-y-2 text-sm text-white/65">
                    {result.suggestions.map((suggestion) => (
                      <li key={suggestion} className="rounded-lg bg-black/20 px-3 py-2">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/25">No suggestions returned</p>
                )}
              </div>

              {result.draftImprovements?.length ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    <Wand2 className="h-3.5 w-3.5" /> Draft improvements
                  </p>
                  <div className="space-y-2">
                    {result.draftImprovements.map((improvement) => (
                      <div key={`${improvement.type}-${improvement.title}`} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                        <p className="text-sm font-medium text-white/80">{improvement.title}</p>
                        <p className="mt-1 text-xs text-white/45">{improvement.rationale}</p>
                        {improvement.draftPrompt && (
                          <p className="mt-2 rounded-md bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-white/65">
                            {improvement.draftPrompt}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
