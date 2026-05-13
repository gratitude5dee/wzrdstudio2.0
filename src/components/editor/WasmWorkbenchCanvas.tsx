import type { Clip, AudioTrack, CompositionSettings } from '@/store/videoEditorStore';

interface WasmWorkbenchCanvasProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
}

/**
 * Lightweight canvas placeholder. Replaces the removed Editframe-based
 * workbench. The full WASM ffmpeg renderer + visual timeline lives in a
 * follow-up PR; for now this keeps the editor shell rendering.
 */
export function WasmWorkbenchCanvas({ clips, audioTracks, composition }: WasmWorkbenchCanvasProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-black/40 text-zinc-400">
      <div className="text-sm uppercase tracking-widest text-orange-400">WASM workbench</div>
      <div className="text-xs text-zinc-500">
        {clips.length} clip{clips.length === 1 ? '' : 's'} · {audioTracks.length} audio track
        {audioTracks.length === 1 ? '' : 's'} · {composition.width}×{composition.height} @ {composition.fps}fps
      </div>
      <div className="max-w-md text-center text-xs text-zinc-600">
        Editframe has been removed. Exports now run through FAL ffmpeg with an in-browser ffmpeg.wasm
        fallback (coming next). Use the Export button to render via FAL.
      </div>
    </div>
  );
}

export default WasmWorkbenchCanvas;
