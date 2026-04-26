import { Sparkles, Share2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface StudioInspectorPanelProps {
  activeJobs?: number;
  onGenerate?: () => void;
}

const StudioInspectorPanel = ({ activeJobs = 0, onGenerate }: StudioInspectorPanelProps) => {
  return (
    <aside className="w-80 bg-[#0f0f0f] border-l border-[rgba(249,115,22,0.15)] flex flex-col p-4 gap-4 shadow-[0_0_8px_rgba(249,115,22,0.06)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-orange-400" />
          <span className="text-white font-medium">Generate</span>
        </div>
        <Button variant="outline" size="sm" className="border-[rgba(249,115,22,0.2)] text-white">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-zinc-400">Model</label>
        <Select defaultValue="gpt-5">
          <SelectTrigger className="bg-[#0a0a0a] border-[rgba(249,115,22,0.15)] text-white">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-5">GPT-5</SelectItem>
            <SelectItem value="flux-dev">Flux Dev</SelectItem>
            <SelectItem value="kling-2-1">Kling 2.1</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        className="w-full bg-orange-500 text-black hover:bg-orange-400"
        onClick={onGenerate}
      >
        Generate
      </Button>

      <div className="mt-auto pt-4 border-t border-[rgba(249,115,22,0.15)]">
        <div className="text-sm text-zinc-400">Queue</div>
        <div className="text-white text-lg leading-tight">{activeJobs} active</div>
      </div>
    </aside>
  );
};

export default StudioInspectorPanel;
