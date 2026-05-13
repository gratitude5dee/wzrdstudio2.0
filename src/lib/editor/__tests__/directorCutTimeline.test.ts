import { describe, expect, it } from 'vitest';
import {
  buildDirectorCutTimeline,
  type DirectorCutSceneRow,
  type DirectorCutShotRow,
  type ProjectVisualAssetRow,
} from '../../../../supabase/functions/_shared/director-cut-timeline';

const baseShot = (overrides: Partial<DirectorCutShotRow> & Pick<DirectorCutShotRow, 'id' | 'scene_id' | 'shot_number'>): DirectorCutShotRow => ({
  image_url: null,
  video_url: null,
  audio_url: null,
  audio_status: null,
  image_status: null,
  video_status: null,
  prompt_idea: null,
  visual_prompt: null,
  dialogue: null,
  sound_effects: null,
  ...overrides,
});

const buildScenesWithShots = (sceneCount: number, shotsPerScene: number) => {
  const scenes: DirectorCutSceneRow[] = [];
  const shots: DirectorCutShotRow[] = [];

  for (let sceneNumber = 1; sceneNumber <= sceneCount; sceneNumber += 1) {
    const sceneId = `scene-${sceneNumber}`;
    scenes.push({ id: sceneId, scene_number: sceneNumber });
    for (let shotNumber = 1; shotNumber <= shotsPerScene; shotNumber += 1) {
      shots.push(baseShot({ id: `shot-${sceneNumber}-${shotNumber}`, scene_id: sceneId, shot_number: shotNumber }));
    }
  }

  return { scenes, shots };
};

const buildTimeline = (
  scenes: DirectorCutSceneRow[],
  shots: DirectorCutShotRow[],
  projectVisualAssets: ProjectVisualAssetRow[] = []
) =>
  buildDirectorCutTimeline({
    projectId: 'project-1',
    userId: 'user-1',
    scenes,
    shots,
    projectVisualAssets,
  });

describe('buildDirectorCutTimeline', () => {
  it('allows available-content export when ordered shots have some missing visuals', () => {
    const { scenes, shots } = buildScenesWithShots(5, 3);
    const readyShots = new Map([
      ['shot-1-1', { video_url: 'https://cdn.example.com/shot-1-1.mp4' }],
      ['shot-1-2', { image_url: 'https://cdn.example.com/shot-1-2.png' }],
      ['shot-1-3', { upscaled_image_url: 'https://cdn.example.com/shot-1-3-upscaled.png' }],
    ]);
    const patchedShots = shots.map((shot) => baseShot({ ...shot, ...(readyShots.get(shot.id) ?? {}) }));

    const result = buildTimeline(scenes, patchedShots);
    const visualRows = result.rowsToInsert.filter((row) => row.asset_type === 'image' || row.asset_type === 'video');

    expect(result.summary.canExport).toBe(true);
    expect(result.summary.exportMode).toBe('available_content');
    expect(result.summary.isCompleteCut).toBe(false);
    expect(result.summary.visualAssets).toBe(3);
    expect(result.summary.readyShots).toBe(3);
    expect(result.summary.missingShots).toBe(12);
    expect(result.summary.skippedShotCount).toBe(12);
    expect(visualRows).toHaveLength(3);
    expect(result.skippedShotFailures).toHaveLength(12);
    expect(result.skippedShotFailures[0]).toMatchObject({
      assetId: 'shot-2-1',
      orderIndex: 3,
      sceneNumber: 2,
      shotNumber: 1,
    });
  });

  it('uses matching generated project assets when shot media columns are empty', () => {
    const scenes: DirectorCutSceneRow[] = [{ id: 'scene-1', scene_number: 1 }];
    const shots = [baseShot({ id: 'shot-1', scene_id: 'scene-1', shot_number: 1 })];
    const result = buildTimeline(scenes, shots, [
      {
        id: 'asset-old',
        asset_type: 'image',
        asset_category: 'generated',
        processing_status: 'completed',
        is_archived: false,
        cdn_url: 'https://cdn.example.com/old.png',
        media_metadata: { shot_id: 'shot-1' },
        created_at: '2026-05-12T10:00:00Z',
      },
      {
        id: 'asset-new',
        asset_type: 'image',
        asset_category: 'generated',
        processing_status: 'completed',
        is_archived: false,
        cdn_url: 'https://cdn.example.com/new.png',
        media_metadata: { shot_id: 'shot-1' },
        created_at: '2026-05-12T11:00:00Z',
      },
    ]);

    expect(result.summary.canExport).toBe(true);
    expect(result.summary.visualAssets).toBe(1);
    expect(result.summary.missingShots).toBe(0);
    expect(result.rowsToInsert[0]).toMatchObject({
      asset_type: 'image',
      source_url: 'https://cdn.example.com/new.png',
      metadata: expect.objectContaining({
        visual_source: 'project_asset_image',
        project_asset_id: 'asset-new',
      }),
    });
  });

  it('blocks when no usable visual assets exist', () => {
    const scenes: DirectorCutSceneRow[] = [{ id: 'scene-1', scene_number: 1 }];
    const shots = [baseShot({ id: 'shot-1', scene_id: 'scene-1', shot_number: 1 })];
    const result = buildTimeline(scenes, shots);

    expect(result.summary.canExport).toBe(false);
    expect(result.summary.exportMode).toBe('blocked');
    expect(result.summary.visualAssets).toBe(0);
    expect(result.summary.blockingReason).toBe("No generated shot image or video assets are available for Director's Cut.");
    expect(result.rowsToInsert).toHaveLength(0);
  });

  it('prefers video over image when both are available for a shot', () => {
    const scenes: DirectorCutSceneRow[] = [{ id: 'scene-1', scene_number: 1 }];
    const shots = [
      baseShot({
        id: 'shot-1',
        scene_id: 'scene-1',
        shot_number: 1,
        image_url: 'https://cdn.example.com/shot-1.png',
      }),
    ];
    const result = buildTimeline(scenes, shots, [
      {
        id: 'asset-video',
        type: 'video',
        url: 'https://cdn.example.com/shot-1.mp4',
        metadata: { shot_id: 'shot-1' },
        created_at: '2026-05-12T12:00:00Z',
      },
    ]);

    expect(result.summary.readyVideos).toBe(1);
    expect(result.summary.fallbackImages).toBe(0);
    expect(result.rowsToInsert[0]).toMatchObject({
      asset_type: 'video',
      source_url: 'https://cdn.example.com/shot-1.mp4',
      metadata: expect.objectContaining({
        visual_source: 'project_asset_video',
      }),
    });
  });
});
