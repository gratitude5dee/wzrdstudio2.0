import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useExport } from '@/hooks/useExport';
import { collectRemoteRenderWarnings, isRemoteFetchableMediaUrl } from '@/lib/editor/renderCapabilities';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import {
  getExportStartBlocker,
  shouldShowRemotePreflightWarnings,
  type ExportRenderBackend,
} from './exportDialogState';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const qualities: Array<{ label: string; value: 'low' | 'medium' | 'high' | '4k' }> = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: '4K', value: '4k' },
];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | '4k'>('high');
  const [renderBackend, setRenderBackend] = useState<ExportRenderBackend>('fal_remote');
  const { exportVideo, isExporting, progress, error, downloadUrl, renderWarnings, resetExportState } = useExport();
  const projectId = useVideoEditorStore((state) => state.project.id);
  const clips = useVideoEditorStore((state) => state.clips);
  const keyframes = useVideoEditorStore((state) => state.keyframes);
  const preflightWarnings = useMemo(
    () => collectRemoteRenderWarnings(clips, keyframes),
    [clips, keyframes]
  );
  const preflightFeatures = useMemo(
    () => Array.from(new Set(preflightWarnings.flatMap((warning) => warning.features))),
    [preflightWarnings]
  );
  const remoteVisualClipCount = useMemo(
    () => clips.filter((clip) => isRemoteFetchableMediaUrl(clip.url)).length,
    [clips]
  );
  const exportBlocker = useMemo(
    () => getExportStartBlocker({
      projectId,
      visualClipCount: clips.length,
      remoteVisualClipCount,
    }),
    [projectId, clips.length, remoteVisualClipCount]
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetExportState();
    }
    onOpenChange(nextOpen);
  };

  const handleExport = async () => {
    await exportVideo({ format, quality, renderBackend });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#0F1117] border border-[#1D2130] text-white">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription className="text-[#8E94A8]">
            Render the saved editor timeline through the Director&apos;s Cut FFmpeg pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase text-[#8E94A8] mb-2">Format</p>
            <div className="flex gap-2">
              {['mp4'].map((option) => (
                <Button
                  key={option}
                  variant={format === option ? 'default' : 'outline'}
                  className={format === option ? 'bg-[#9b87f5] hover:bg-[#b5a3f9]' : 'border-[#1D2130] text-white'}
                  onClick={() => setFormat(option as 'mp4' | 'webm')}
                >
                  {option.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-[#8E94A8] mb-2">Quality</p>
            <div className="grid grid-cols-2 gap-2">
              {qualities.map((option) => (
                <Button
                  key={option.value}
                  variant={quality === option.value ? 'default' : 'outline'}
                  className={quality === option.value ? 'bg-[#9b87f5] hover:bg-[#b5a3f9]' : 'border-[#1D2130] text-white'}
                  onClick={() => setQuality(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-[#8E94A8] mb-2">Renderer</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={renderBackend === 'fal_remote' ? 'default' : 'outline'}
                className={renderBackend === 'fal_remote' ? 'bg-[#9b87f5] hover:bg-[#b5a3f9]' : 'border-[#1D2130] text-white'}
                onClick={() => setRenderBackend('fal_remote')}
              >
                Fast
              </Button>
              <Button
                variant={renderBackend === 'remotion_worker' ? 'default' : 'outline'}
                className={renderBackend === 'remotion_worker' ? 'bg-[#9b87f5] hover:bg-[#b5a3f9]' : 'border-[#1D2130] text-white'}
                onClick={() => setRenderBackend('remotion_worker')}
              >
                Styled
              </Button>
            </div>
          </div>
          {shouldShowRemotePreflightWarnings({
            renderBackend,
            warningCount: preflightWarnings.length,
            hasDownloadUrl: !!downloadUrl,
          }) && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="font-medium">Remote render will skip some editor styling.</p>
              <p className="mt-1 text-amber-100/80">
                {preflightWarnings.length} clip{preflightWarnings.length === 1 ? '' : 's'} use{' '}
                {preflightFeatures.join(', ')}.
              </p>
            </div>
          )}
          {exportBlocker && !downloadUrl && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
              <p className="font-medium">Export needs remote media.</p>
              <p className="mt-1 text-red-100/80">{exportBlocker}</p>
            </div>
          )}
          {isExporting && (
            <div className="space-y-2">
              <Progress value={progress} className="bg-[#1D2130]" />
              <p className="text-xs text-[#8E94A8]">Rendering your video...</p>
            </div>
          )}
          {downloadUrl && (
            <div className="space-y-2">
              <p className="text-xs text-[#8E94A8]">Export complete!</p>
              <Button asChild className="bg-[#9b87f5] hover:bg-[#b5a3f9] w-full">
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  Download
                </a>
              </Button>
            </div>
          )}
          {renderWarnings.length > 0 && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="font-medium">Some editor styling was preserved as metadata only.</p>
              <p className="mt-1 text-amber-100/80">
                {renderWarnings.length} clip{renderWarnings.length === 1 ? '' : 's'} used{' '}
                {Array.from(new Set(renderWarnings.flatMap((warning) => warning.features))).join(', ')}.
              </p>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={isExporting || !!exportBlocker}
            onClick={handleExport}
            className="bg-[#9b87f5] hover:bg-[#b5a3f9]"
          >
            {isExporting ? 'Exporting...' : 'Start Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
