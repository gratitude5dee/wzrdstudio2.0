import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { exportRemixVideo, type CanvasExportOptions } from '@/features/remix/canvasExporter';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  exportOptions: Omit<CanvasExportOptions, 'onProgress' | 'signal'>;
  templateTitle: string;
}

export function ExportModal({ open, onClose, exportOptions, templateTitle }: ExportModalProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'recording' | 'done' | 'error'>('recording');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startExport = useCallback(async () => {
    setProgress(0);
    setStatus('recording');
    setBlobUrl(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const blob = await exportRemixVideo({
        ...exportOptions,
        onProgress: setProgress,
        signal: controller.signal,
      });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setStatus('done');
      toast.success('Video export complete!');
    } catch (err) {
      if ((err as Error).message === 'Export cancelled') {
        onClose();
        return;
      }
      console.error('[remix-export]', err);
      setStatus('error');
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }, [exportOptions, onClose]);

  useEffect(() => {
    if (open) {
      startExport();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!open) return null;

  const pct = Math.round(progress * 100);
  const safeName = (templateTitle || 'kanvas-remix').replace(/[^a-zA-Z0-9_-]/g, '_');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#f97316]/20 bg-[#0A0A0A] p-6 shadow-[0_0_40px_rgba(249,115,22,0.16)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">
            {status === 'done' ? 'Export Ready' : status === 'error' ? 'Export Failed' : 'Exporting Video…'}
          </h2>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === 'recording' && (
          <>
            <p className="mt-3 text-sm text-zinc-400">
              Recording at real-time speed with audio sync. Keep this tab active.
            </p>
            <div className="mt-4">
              <div className="flex justify-between text-xs uppercase tracking-[0.16em] text-zinc-500">
                <span>Progress</span>
                <span className="text-[#f97316]">{pct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-[#f97316] to-amber-400 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin text-[#f97316]" />
              <span>Recording… {Math.round((progress * exportOptions.durationMs) / 1000)}s / {Math.round(exportOptions.durationMs / 1000)}s</span>
            </div>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-4 w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/5"
            >
              Cancel Export
            </button>
          </>
        )}

        {status === 'done' && blobUrl && (
          <>
            <p className="mt-3 text-sm text-zinc-400">
              Your video is ready to download.
            </p>
            <a
              href={blobUrl}
              download={`${safeName}.webm`}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-4 py-3 text-sm font-black text-black shadow-[0_0_22px_rgba(249,115,22,0.24)]"
            >
              <Download className="h-4 w-4" />
              Download WebM
            </a>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/5"
            >
              Close
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="mt-3 text-sm text-rose-300">
              Something went wrong during export. Check the console for details.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={startExport}
                className="flex-1 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-bold text-black"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
