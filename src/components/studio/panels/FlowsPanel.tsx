import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2,
  Copy,
  Edit2,
  Check,
  X,
  Plus,
  Loader2,
  Workflow,
  Clock,
  MoreVertical,
  Globe,
  Lock,
  Share2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowsStore, type SavedFlow } from '@/store/flowsStore';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface FlowsPanelProps {
  projectId: string;
  onClose: () => void;
}

type TabKey = 'mine' | 'templates' | 'shared';

export const FlowsPanel: React.FC<FlowsPanelProps> = ({ projectId, onClose }) => {
  const {
    savedFlows,
    publicTemplates,
    isLoading,
    fetchFlows,
    fetchPublicTemplates,
    saveCurrentFlow,
    loadFlow,
    deleteFlow,
    duplicateFlow,
    renameFlow,
    publishFlow,
    unpublishFlow,
    remixFlow,
    getShareUrl,
    selectedFlowId,
  } = useFlowsStore();

  const [tab, setTab] = useState<TabKey>('mine');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchFlows(projectId);
  }, [projectId, fetchFlows]);

  useEffect(() => {
    if (tab === 'templates') void fetchPublicTemplates();
  }, [tab, fetchPublicTemplates]);

  const sharedFlows = useMemo(
    () => savedFlows.filter((f) => f.visibility === 'public' || f.visibility === 'shared'),
    [savedFlows]
  );

  const handleSaveFlow = async () => {
    if (!newFlowName.trim()) {
      toast.error('Please enter a flow name');
      return;
    }
    await saveCurrentFlow(projectId, newFlowName, newFlowDescription);
    toast.success('Flow saved successfully');
    setShowSaveDialog(false);
    setNewFlowName('');
    setNewFlowDescription('');
  };

  const handleLoadFlow = async (flowId: string) => {
    await loadFlow(flowId);
    toast.success('Flow loaded');
    onClose();
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      await deleteFlow(flowId);
      toast.success('Flow deleted');
    }
  };

  const handleDuplicate = async (flow: SavedFlow) => {
    await duplicateFlow(flow.id, `${flow.name} (Copy)`);
    toast.success('Flow duplicated');
  };

  const handleRename = async (flowId: string) => {
    if (!editName.trim()) return;
    await renameFlow(flowId, editName);
    setEditingFlowId(null);
    toast.success('Flow renamed');
  };

  const handlePublish = async (flow: SavedFlow) => {
    const slug = await publishFlow(flow.id, { templateCategory: 'music' });
    if (slug) toast.success('Published as a public template');
    else toast.error('Failed to publish');
  };

  const handleUnpublish = async (flow: SavedFlow) => {
    await unpublishFlow(flow.id);
    toast.success('Reverted to private');
  };

  const handleShareLink = async (flow: SavedFlow) => {
    const url = getShareUrl(flow);
    if (!url) {
      toast.error('Publish this flow first to get a share link');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      toast.message(url);
    }
  };

  const handleRemix = async (flow: SavedFlow) => {
    const newId = await remixFlow(flow.id, projectId);
    if (newId) {
      await loadFlow(newId);
      toast.success(`Remixed "${flow.name}" into this project`);
      onClose();
    } else {
      toast.error('Failed to remix template');
    }
  };

  const renderFlowRow = (flow: SavedFlow, opts: { isTemplate?: boolean } = {}) => (
    <motion.div
      key={flow.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group p-3 rounded-lg transition-all cursor-pointer',
        selectedFlowId === flow.id
          ? 'bg-primary/15 border border-primary/30'
          : 'hover:bg-zinc-800/50 border border-transparent'
      )}
      onClick={() => (opts.isTemplate ? handleRemix(flow) : handleLoadFlow(flow.id))}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {editingFlowId === flow.id ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-sm text-white"
                onClick={(event) => event.stopPropagation()}
                autoFocus
              />
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleRename(flow.id);
                }}
                className="p-1 text-primary hover:opacity-80"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingFlowId(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{flow.name}</p>
                {flow.visibility === 'public' && (
                  <span title="Public template" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                    <Globe className="w-3 h-3" /> Public
                  </span>
                )}
                {flow.visibility === 'private' && !opts.isTemplate && (
                  <Lock className="w-3 h-3 text-zinc-500" />
                )}
              </div>
              {flow.description && (
                <p className="text-xs text-zinc-500 truncate mt-0.5">{flow.description}</p>
              )}
            </>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(event) => event.stopPropagation()}
              className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-opacity"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
            {opts.isTemplate ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemix(flow); }}>
                <Sparkles className="w-4 h-4 mr-2" /> Remix into project
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingFlowId(flow.id);
                    setEditName(flow.name);
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDuplicate(flow);
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {flow.visibility === 'public' ? (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUnpublish(flow); }}>
                    <Lock className="w-4 h-4 mr-2" /> Make private
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePublish(flow); }}>
                    <Globe className="w-4 h-4 mr-2" /> Publish as template
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShareLink(flow); }}>
                  <Share2 className="w-4 h-4 mr-2" /> Copy share link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteFlow(flow.id);
                  }}
                  className="text-red-400 focus:text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
        <span>{flow.nodeCount} nodes</span>
        <span>•</span>
        <span>{flow.edgeCount} edges</span>
        {flow.templateCategory && (
          <>
            <span>•</span>
            <span className="uppercase tracking-wide">{flow.templateCategory}</span>
          </>
        )}
        <span>•</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(flow.updatedAt, { addSuffix: true })}
        </span>
        {opts.isTemplate && flow.remixCount > 0 && (
          <>
            <span>•</span>
            <span>{flow.remixCount} remixes</span>
          </>
        )}
      </div>
    </motion.div>
  );

  const renderEmpty = (label: string, hint: string) => (
    <div className="p-8 text-center">
      <Workflow className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-xs text-zinc-600 mt-1">{hint}</p>
    </div>
  );

  return (
    <div className="w-80 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/50 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-white">Flows</span>
        </div>
        <button
          onClick={() => setShowSaveDialog(true)}
          className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
          title="Save current flow"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-zinc-800/50 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder="Flow name..."
                value={newFlowName}
                onChange={(event) => setNewFlowName(event.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)..."
                value={newFlowDescription}
                onChange={(event) => setNewFlowDescription(event.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50 resize-none h-16"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveFlow}
                  disabled={isLoading}
                  className="flex-1 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Flow'}
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <TabsList className="grid grid-cols-3 mx-3 mt-3 bg-zinc-800/40">
          <TabsTrigger value="mine" className="text-xs">My Flows</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs">Templates</TabsTrigger>
          <TabsTrigger value="shared" className="text-xs">Shared</TabsTrigger>
        </TabsList>

        <div className="max-h-[26rem] overflow-y-auto">
          <TabsContent value="mine" className="m-0">
            {isLoading && savedFlows.length === 0 ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : savedFlows.length === 0 ? (
              renderEmpty('No saved flows yet', 'Save your current workflow to get started')
            ) : (
              <div className="p-2 space-y-1">
                {savedFlows.map((flow) => renderFlowRow(flow))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="m-0">
            {isLoading && publicTemplates.length === 0 ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : publicTemplates.length === 0 ? (
              renderEmpty('No public templates yet', 'Publish a flow to feature it here')
            ) : (
              <div className="p-2 space-y-1">
                {publicTemplates.map((flow) => renderFlowRow(flow, { isTemplate: true }))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="shared" className="m-0">
            {sharedFlows.length === 0 ? (
              renderEmpty('Nothing shared from this project', 'Publish a flow to share it')
            ) : (
              <div className="p-2 space-y-1">
                {sharedFlows.map((flow) => renderFlowRow(flow))}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
