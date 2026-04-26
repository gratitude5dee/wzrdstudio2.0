type ViewMode = 'grid' | 'list';

interface ProjectViewModeSelectorProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ProjectViewModeSelector = ({ viewMode, setViewMode }: ProjectViewModeSelectorProps) => {
  return (
    <div className="flex bg-zinc-100 dark:bg-white/[0.04] rounded-lg border border-zinc-200 dark:border-white/[0.08] p-0.5">
      <button
        onClick={() => setViewMode('grid')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
          viewMode === 'grid'
            ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-sm'
            : 'text-zinc-500 dark:text-white/60 hover:text-zinc-800 dark:hover:text-white'
        }`}
      >
        Grid
      </button>
      <button
        onClick={() => setViewMode('list')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
          viewMode === 'list'
            ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-sm'
            : 'text-zinc-500 dark:text-white/60 hover:text-zinc-800 dark:hover:text-white'
        }`}
      >
        List
      </button>
    </div>
  );
};
