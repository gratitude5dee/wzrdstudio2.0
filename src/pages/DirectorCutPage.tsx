import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Film, Loader2, Play, RefreshCw, Scissors, TriangleAlert, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppHeader from '@/components/AppHeader';
import { supabaseService } from '@/services/supabaseService';
import { useAppStore } from '@/store/appStore';
import { useDirectorCut, STAGE_LABELS, type DirectorCutStage } from '@/hooks/useDirectorCut';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { DIRECTORS_CUT_CREDITS } from '@/lib/constants/credits';

const StatCard = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warn' | 'success';
}) => (
  <div
    className={cn(
      'rounded-xl border px-4 py-3 backdrop-blur-sm',
      tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10'
        : tone === 'success'
          ? 'border-orange-500/40 bg-orange-500/10'
          : 'border-zinc-700/50 bg-zinc-900/50'
    )}
  >
    <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
  </div>
);

/** The ordered pipeline stages for the Director's Cut. */
const PIPELINE_STAGES: DirectorCutStage[] = [
  'syncing_assets',
  'submitting_to_provider',
  'provider_processing',
  'downloading_assets',
  'uploading_final_video',
  'completed',
];

const stageIndex = (stage: DirectorCutStage): number =>
  PIPELINE_STAGES.indexOf(stage);

const StageIndicator = ({ currentStage }: { currentStage: DirectorCutStage }) => {
  const activeIdx = stageIndex(currentStage);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isActive = idx === activeIdx;
        const isDone = idx < activeIdx;
        const isPending = idx > activeIdx;
        return (
          <div key={stage} className="flex items-center gap-1.5">
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
            ) : isActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            ) : (
              <Circle className={cn('h-4 w-4', isPending ? 'text-zinc-600' : 'text-zinc-400')} />
            )}
            <span
              className={cn(
                'text-xs whitespace-nowrap',
                isDone && 'text-orange-300/80',
                isActive && 'text-cyan-200 font-medium',
                isPending && 'text-zinc-600'
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
            {idx < PIPELINE_STAGES.length - 1 && (
              <span className={cn('text-xs mx-1', isDone ? 'text-orange-500/50' : 'text-zinc-700')}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const DirectorCutPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { setActiveProject } = useAppStore();

  const {
    summary,
    job,
    error,
    isSyncing,
    isStarting,
    isPolling,
    syncAssets,
    startDirectorCut,
  } = useDirectorCut(projectId);

  useEffect(() => {
    if (!projectId) {
      navigate(appRoutes.home);
      return;
    }

    const loadProject = async () => {
      const project = await supabaseService.projects.find(projectId);
      setActiveProject(projectId, project?.title || 'Untitled');
    };

    loadProject().catch(() => undefined);
  }, [navigate, projectId, setActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    syncAssets().catch(() => undefined);
  }, [projectId, syncAssets]);

  const progressValue = job?.progress ?? 0;
  const isWorking = isSyncing || isStarting || isPolling || job?.status === 'processing';
  const providerReason =
    (job?.providerPayload?.fallbackReason as string | undefined) ||
    (job?.providerPayload?.falError as string | undefined) ||
    null;

  return (
    <div className="flex h-screen flex-col bg-[#0A0D16]">
      <AppHeader />
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Timeline Export</p>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-white">
                <Scissors className="h-7 w-7 text-cyan-300" />
                Director&apos;s Cut
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Build a chronological final cut from timeline shots with Fal-first export and automatic fallback.
              </p>
            </div>
            <Button variant="outline" className="border-zinc-700 text-zinc-100" asChild>
              <Link to={projectId ? appRoutes.projects.timeline(projectId) : appRoutes.home}>Back to Timeline</Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <StatCard label="Shots" value={summary?.totalShots ?? 0} />
            <StatCard label="Synced Assets" value={summary?.syncedAssets ?? 0} />
            <StatCard label="Ready Videos" value={summary?.readyVideos ?? 0} tone="success" />
            <StatCard label="Image Fallbacks" value={summary?.fallbackImages ?? 0} tone="warn" />
            <StatCard label="Missing" value={summary?.missingShots ?? 0} tone="warn" />
          </div>

          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/60 p-5">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => syncAssets()}
                disabled={isSyncing || isStarting}
                className="bg-zinc-200 text-zinc-900 hover:bg-zinc-100"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Timeline Assets
                  </>
                )}
              </Button>

              <Button
                onClick={() => startDirectorCut()}
                disabled={isWorking || !summary || summary.syncedAssets === 0}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Film className="mr-2 h-4 w-4" />
                    Start Director&apos;s Cut ({DIRECTORS_CUT_CREDITS} credits)
                  </>
                )}
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-zinc-400">
                <span>
                  {job?.status
                    ? `${job.status}${job.stage && job.stage !== 'idle' ? ` — ${STAGE_LABELS[job.stage]}` : ''}`
                    : 'Idle'}
                </span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2 bg-zinc-800" />
              {job?.status === 'processing' && job.stage && (
                <div className="pt-1">
                  <StageIndicator currentStage={job.stage} />
                </div>
              )}
              {(!job || job.status !== 'processing') && (
                <p className="text-xs text-zinc-500">
                  Pipeline: sync assets → submit to provider → process → upload → done
                </p>
              )}
            </div>

            {(error || job?.error) && (
              <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-medium">Director&apos;s Cut failed</p>
                    <p className="text-rose-200/80">{job?.error || error}</p>
                    <p className="mt-1 text-xs text-rose-200/70">
                      Provider: {job?.provider || 'fal'}
                      {job?.providerStatus ? ` (${job.providerStatus})` : ''}
                      {job?.fallbackUsed ? ' · fallback used' : ''}
                    </p>
                    {providerReason && (
                      <p className="mt-1 text-xs text-rose-200/70">Reason: {providerReason}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-300/40 text-rose-100 hover:bg-rose-500/20"
                    onClick={() => syncAssets()}
                    disabled={isWorking}
                  >
                    Sync Again
                  </Button>
                  <Button
                    size="sm"
                    className="bg-rose-500 text-white hover:bg-rose-400"
                    onClick={() => startDirectorCut()}
                    disabled={isWorking}
                  >
                    Retry Export
                  </Button>
                </div>
              </div>
            )}
          </div>

          {job?.status === 'processing' && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                <div>
                  <p className="font-medium text-cyan-100">Generating Director&apos;s Cut...</p>
                  <p className="text-sm text-cyan-200/70">
                    Stage: {STAGE_LABELS[job.stage] || 'Processing'}
                    {' · '}Provider: {job.provider || 'fal'}
                    {job.providerStatus ? ` (${job.providerStatus})` : ''}
                    {job.fallbackUsed ? ' · Fallback active' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {job?.status === 'completed' && job.outputUrl && (
            <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-6">
              <p className="mb-4 flex items-center gap-2 text-orange-200">
                <Play className="h-4 w-4" />
                Director&apos;s Cut Ready
              </p>
              <video
                src={job.outputUrl}
                controls
                className="w-full rounded-xl border border-orange-300/30 bg-black"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button className="bg-orange-500 text-white hover:bg-orange-400" asChild>
                  <a href={job.outputUrl} target="_blank" rel="noreferrer">
                    <Video className="mr-2 h-4 w-4" />
                    Download Final Video
                  </a>
                </Button>
              </div>
            </div>
          )}

          {/* Partial failure warning */}
          {job?.partialSuccess && job.shotFailures && job.shotFailures.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-medium text-amber-200">
                    {job.shotFailures.length} shot(s) were skipped
                  </p>
                  <p className="mt-1 text-sm text-amber-200/70">
                    The final video was produced from the remaining successful shots.
                    Re-generate the failed shots and run Director&apos;s Cut again for a complete export.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {job.shotFailures.map((failure) => (
                      <li key={failure.assetId} className="text-xs text-amber-200/60">
                        Shot #{failure.orderIndex + 1}: {failure.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DirectorCutPage;
