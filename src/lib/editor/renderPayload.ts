import type { EditorClip, EditorClipStyle, EditorProjectSnapshot, EditorTrack } from "./schema";

export type EditorRenderPlan = {
  projectId: string;
  revisionId: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  assets: Array<{ id: string; kind: string; url: string; durationMs?: number | null }>;
  tracks: EditorTrack[];
  clips: EditorClip[];
  captions: Array<{ startMs: number; endMs: number; text: string; style?: EditorClipStyle }>;
  output: { format: "mp4"; codec: "h264"; audioCodec: "aac" };
};

export function buildEditorRenderPlan(input: {
  projectId: string;
  revisionId: string;
  snapshot: EditorProjectSnapshot;
}): EditorRenderPlan {
  const { snapshot } = input;
  const assets = snapshot.assets
    .filter((asset) => ["video", "audio", "image"].includes(asset.kind))
    .map((asset) => {
      const url = asset.signedUrl ?? asset.publicUrl;
      if (!url) throw new Error(`Asset ${asset.id} is missing a renderable URL.`);
      return {
        id: asset.id,
        kind: asset.kind,
        url,
        durationMs: asset.durationMs,
      };
    });

  const captions = snapshot.clips.flatMap((clip) => {
    if (clip.kind === "lyrics" && clip.lyrics) {
      return clip.lyrics.blocks.map((block) => ({
        startMs: clip.startMs + block.startMs + clip.lyrics!.offsetMs,
        endMs: clip.startMs + block.endMs + clip.lyrics!.offsetMs,
        text: block.text,
        style: clip.style,
      }));
    }
    if ((clip.kind === "text" || clip.kind === "caption") && clip.text?.text) {
      return [{
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        text: clip.text.text,
        style: clip.style,
      }];
    }
    return [];
  });

  return {
    projectId: input.projectId,
    revisionId: input.revisionId,
    width: snapshot.renderSettings.width || snapshot.project.width,
    height: snapshot.renderSettings.height || snapshot.project.height,
    fps: snapshot.renderSettings.fps || snapshot.project.fps,
    durationMs: snapshot.project.durationMs,
    assets,
    tracks: snapshot.tracks,
    clips: snapshot.clips,
    captions,
    output: {
      format: snapshot.renderSettings.format,
      codec: snapshot.renderSettings.codec,
      audioCodec: snapshot.renderSettings.audioCodec,
    },
  };
}

