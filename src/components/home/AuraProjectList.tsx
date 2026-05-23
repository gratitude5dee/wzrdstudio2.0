import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, Activity, AlertTriangle, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { observabilityService, type ObservabilityOverview } from '@/services/observabilityService';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project } from '@/components/home/ProjectCard';

interface AuraProjectListProps {
  projects: Project[];
}

interface ProjectSummary {
  overview: ObservabilityOverview;
  projectTitle: string;
}

export const AuraProjectList = ({ projects }: AuraProjectListProps) => {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleExpand = useCallback(async (projectId: string) => {
    if (expandedId === projectId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(projectId);

    if (summaries[projectId] || loading[projectId]) return;

    setLoading(prev => ({ ...prev, [projectId]: true }));
    try {
      const data = await observabilityService.getProjectObservability(projectId);
      setSummaries(prev => ({
        ...prev,
        [projectId]: { overview: data.overview, projectTitle: data.projectTitle },
      }));
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [projectId]: err?.message ?? 'Failed to load' }));
    } finally {
      setLoading(prev => ({ ...prev, [projectId]: false }));
    }
  }, [expandedId, summaries, loading]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-accent-purple" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No projects yet</h3>
        <p className="text-sm text-muted-foreground">Create a project to start using Aura observability.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-purple/15 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-accent-purple" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Aura Observability</h2>
          <p className="text-xs text-muted-foreground">Evaluation summaries across all projects</p>
        </div>
      </div>

      {projects.map((project, i) => {
        const isExpanded = expandedId === project.id;
        const summary = summaries[project.id];
        const isLoading = loading[project.id];
        const error = errors[project.id];

        const hasIssues = summary && (
          summary.overview.failedJudgeFamilies.length > 0 ||
          summary.overview.openReviewTasks > 0 ||
          summary.overview.needsAttentionShots > 0
        );

        return (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={cn(
              "rounded-xl border overflow-hidden transition-colors",
              "bg-card/50 backdrop-blur-sm",
              "border-border/50",
              isExpanded && "border-accent-purple/30 bg-card/80"
            )}
          >
            {/* Project Row */}
            <button
              onClick={() => toggleExpand(project.id)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
            >
              {/* Status indicator */}
              <div className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                !summary && "bg-muted-foreground/30",
                summary && !hasIssues && "bg-emerald-500",
                summary && hasIssues && "bg-amber-500"
              )} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{project.title}</p>
                <p className="text-xs text-muted-foreground">
                  {(project as any).format || 'Video'} · Updated {new Date(project.updated_at).toLocaleDateString()}
                </p>
              </div>

              {summary && (
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {summary.overview.completedEvaluations}
                  </span>
                  {summary.overview.openReviewTasks > 0 && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {summary.overview.openReviewTasks}
                    </span>
                  )}
                </div>
              )}

              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </motion.div>
            </button>

            {/* Expanded Summary */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1 border-t border-border/30">
                    {isLoading ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
                        {[...Array(4)].map((_, j) => (
                          <Skeleton key={j} className="h-16 rounded-lg" />
                        ))}
                      </div>
                    ) : error ? (
                      <p className="text-xs text-destructive py-3">{error}</p>
                    ) : summary ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3">
                          <MiniStat
                            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            label="Evaluations"
                            value={summary.overview.completedEvaluations}
                          />
                          <MiniStat
                            icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                            label="Open Reviews"
                            value={summary.overview.openReviewTasks}
                            alert={summary.overview.openReviewTasks > 0}
                          />
                          <MiniStat
                            icon={<Activity className="w-4 h-4 text-accent-purple" />}
                            label="Active Jobs"
                            value={summary.overview.activeEvaluationJobs}
                          />
                          <MiniStat
                            icon={<Clock className="w-4 h-4 text-muted-foreground" />}
                            label="Pending Revisions"
                            value={summary.overview.pendingRevisions}
                          />
                        </div>

                        {summary.overview.failedJudgeFamilies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pb-3">
                            {summary.overview.failedJudgeFamilies.map(f => (
                              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                                {f.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(appRoutes.projects.observability(project.id));
                          }}
                          className={cn(
                            "flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors",
                            "text-accent-purple hover:bg-accent-purple/10"
                          )}
                        >
                          View Details
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
};

function MiniStat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 p-3 rounded-lg",
      "bg-muted/30 border border-border/30",
      alert && "border-amber-500/30 bg-amber-500/5"
    )}>
      {icon}
      <div>
        <p className="text-sm font-semibold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
