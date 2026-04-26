import { useCallback, useState } from 'react';
import { Send, Loader2, Music, Disc3, Mic2, Megaphone, Film, Wand2, ChevronRight, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkflowGeneration } from '@/hooks/studio/useWorkflowGeneration';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';
import { WorkflowPromptAutocomplete, type AutocompleteSuggestion } from './WorkflowPromptAutocomplete';
import { WorkflowSettingsMenu, DEFAULT_SETTINGS, type WorkflowSettings } from './WorkflowSettingsMenu';

const WORKFLOW_EXAMPLES = [
  {
    id: 'music-video-treatment',
    prompt:
      'Generate a music video treatment workflow: mood board image nodes, a shot list of cinematic stills, and reference-to-video clips for each scene',
    title: 'Music video treatment',
    type: 'Multi-node workflow',
    icon: Film,
  },
  {
    id: 'album-cover-campaign',
    prompt:
      'Create an album cover campaign workflow: hero cover art, alternate covers, square + 9:16 story crops, and animated social teasers',
    title: 'Album cover campaign',
    type: 'Multi-node workflow',
    icon: Disc3,
  },
  {
    id: 'tour-visual-loop',
    prompt:
      'Build a tour visual loop pack: looping background visuals for stage screens in 16:9 and vertical, plus high-energy transition stings',
    title: 'Tour visual loop',
    type: 'Multi-node workflow',
    icon: Music,
  },
  {
    id: 'artist-promo-pack',
    prompt:
      'Generate an artist promo pack: press shots, EPK header image, square social avatars, and lyric story templates',
    title: 'Artist promo pack',
    type: 'Multi-node workflow',
    icon: Megaphone,
  },
  {
    id: 'lyric-video-starter',
    prompt:
      'Generate a lyric video starter: typography frames, kinetic backgrounds, and audio-reactive video clips for a visualizer',
    title: 'Lyric video / visualizer',
    type: 'Multi-node workflow',
    icon: Mic2,
  },
];

interface WorkflowGeneratorTabProps {
  projectId?: string;
  selectedNodeId?: string | null;
  onWorkflowGenerated: (nodes: NodeDefinition[], edges: EdgeDefinition[]) => void;
  onClose?: () => void;
  selectedNodeLabel?: string | null;
  variant?: 'panel' | 'popup';
  maxHeight?: number | string;
}

export function WorkflowGeneratorTab({
  projectId,
  selectedNodeId,
  onWorkflowGenerated,
  onClose,
  selectedNodeLabel,
  variant = 'panel',
  maxHeight,
}: WorkflowGeneratorTabProps) {
  const [settings, setSettings] = useState<WorkflowSettings>(DEFAULT_SETTINGS);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const { prompt, setPrompt, isGenerating, handleGenerate, handleExampleClick, handleKeyDown } =
    useWorkflowGeneration({
      projectId,
      selectedNodeId,
      onWorkflowGenerated,
      onComplete: onClose,
      settings,
    });

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      setShowAutocomplete(value.trim().length > 0);
    },
    [setPrompt]
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      setPrompt(suggestion.prompt);
      setShowAutocomplete(false);
    },
    [setPrompt]
  );

  const handlePromptFocus = useCallback(() => {
    if (prompt.trim().length > 0) {
      setShowAutocomplete(true);
    }
  }, [prompt]);

  const handlePromptBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowAutocomplete(false), 200);
  }, []);

  const wrappedHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't trigger generate when autocomplete is open and Tab is pressed
      if (showAutocomplete && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
        return; // Let the autocomplete handle these keys
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
      handleKeyDown(e);
    },
    [handleKeyDown, showAutocomplete]
  );

  const isPopup = variant === 'popup';

  return (
    <div
      className={cn(
        'flex overflow-hidden border border-[rgba(249,115,22,0.12)] bg-[#0f0f0f]/98 text-white shadow-[0_24px_72px_rgba(0,0,0,0.38)]',
        isPopup ? 'rounded-[30px] bg-[#111111]/98 backdrop-blur-2xl' : 'rounded-[28px]'
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('border-b border-[rgba(249,115,22,0.10)]', isPopup ? 'px-5 py-4' : 'px-5 py-4')}>
        <div className="flex items-start gap-3">
          <motion.div
            className={cn(
              'flex items-center justify-center border border-[#f97316]/20 bg-[#1c1510] text-[#fdba74]',
              isPopup ? 'h-10 w-10 rounded-2xl' : 'h-11 w-11 rounded-2xl'
            )}
            animate={{ boxShadow: ['0 0 0 rgba(249,115,22,0)', '0 0 18px rgba(249,115,22,0.18)', '0 0 0 rgba(249,115,22,0)'] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Wand2 className="h-4 w-4" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className={cn('font-medium text-white', isPopup ? 'text-base' : 'text-sm')}>Workflow Generator</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Generate a connected graph using your current canvas context.
                </p>
              </div>
              {isPopup && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(249,115,22,0.12)] bg-[#141414] text-zinc-400 transition-colors hover:border-[rgba(249,115,22,0.20)] hover:bg-[#1b1b1b] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {isPopup ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(249,115,22,0.12)] bg-[#151515] px-3 py-1 text-[11px] text-zinc-300">
                  New workflow
                </span>
                {selectedNodeLabel ? (
                  <span className="rounded-full border border-[#f97316]/20 bg-[#1a1408] px-3 py-1 text-[11px] text-[#fdba74]">
                    {selectedNodeLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto space-y-4', isPopup ? 'p-4' : 'p-5')}>
        <div className={cn('border border-[rgba(249,115,22,0.10)] bg-[#121212]', isPopup ? 'rounded-[24px] p-4' : 'rounded-[22px] p-4')}>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isPopup ? 'Starter workflows' : 'Prompt'}</span>
          </div>
          <div className="space-y-2">
            {WORKFLOW_EXAMPLES.map((example, index) => {
              const Icon = example.icon;
              return (
                <motion.button
                  key={example.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleExampleClick(example.prompt)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-[18px] border border-[rgba(249,115,22,0.10)] bg-[#171717] px-3 py-3 text-left transition-colors hover:border-[rgba(249,115,22,0.18)] hover:bg-[#1b1b1b]'
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(249,115,22,0.10)] bg-[#111111] text-zinc-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{example.title}</p>
                    <p className="text-[11px] text-zinc-500">{example.type}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-zinc-300" />
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className={cn('border border-[rgba(249,115,22,0.10)] bg-[#121212]', isPopup ? 'rounded-[24px] p-4' : 'rounded-[22px] p-4')}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              {isPopup ? 'Message' : 'Examples'}
            </div>
            <WorkflowSettingsMenu settings={settings} onSettingsChange={setSettings} />
          </div>
          <div className="relative">
            <WorkflowPromptAutocomplete
              query={prompt}
              visible={showAutocomplete && !isGenerating}
              onSelect={handleSuggestionSelect}
            />
            <textarea
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={wrappedHandleKeyDown}
              onFocus={handlePromptFocus}
              onBlur={handlePromptBlur}
              placeholder="Describe the workflow you want to create..."
              className={cn(
                'w-full resize-none rounded-[20px] border border-[rgba(249,115,22,0.12)] bg-[#171717] px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-0',
                isPopup ? 'min-h-[132px]' : 'min-h-[120px]'
              )}
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {isPopup ? (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="rounded-full border border-[rgba(249,115,22,0.10)] bg-[#171717] px-2.5 py-1 text-zinc-300">
                Workflow only
              </span>
              <span>Uses your current canvas context</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-zinc-600">
              <span>
                Press <kbd className="rounded bg-[#171717] px-1.5 py-0.5 font-mono text-zinc-300">Enter</kbd> to
                generate
              </span>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isGenerating ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-[rgba(249,115,22,0.10)] px-5 py-4"
          >
            <div className="flex items-center gap-2 rounded-[18px] border border-[#f97316]/15 bg-[#1c1510] px-3 py-3 text-sm text-[#fdba74]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Building a context-aware workflow…</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!isPopup ? (
        <div className="border-t border-[rgba(249,115,22,0.10)] px-5 py-3 text-center text-[11px] text-zinc-500">
          Press <kbd className="rounded bg-[#171717] px-1.5 py-0.5 font-mono text-zinc-300">Enter</kbd> to generate
        </div>
      ) : (
        <div className="border-t border-[rgba(249,115,22,0.10)] px-5 py-3 text-[11px] text-zinc-500">
          Starter workflows insert through the same Studio graph path as manual node creation.
        </div>
      )}
      </div>
    </div>
  );
}
