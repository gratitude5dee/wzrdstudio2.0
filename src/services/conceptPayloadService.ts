/**
 * Structured JSON payload builder for concept generation prompts.
 *
 * All generation payloads must use structured JSON with explicit field mapping
 * instead of string concatenation.  This service centralizes the logic so every
 * edge-function call site shares a single contract.
 */

import type { ProjectData } from '@/components/project-setup/types';

// ─── Payload types ──────────────────────────────────────────────────

export interface BaseConceptPayload {
  format: string;
  title: string;
  concept: string;
  genre: string;
  tone: string;
  conceptOption: 'ai' | 'manual';
  specialRequests?: string;
  customFormat?: string;
}

export interface CommercialPayload extends BaseConceptPayload {
  format: 'commercial';
  commercial: {
    product: string;
    brandName: string;
    productType: string;
    targetAudience: string;
    mainMessage: string;
    callToAction: string;
    tone: string;
    adDuration: string;
    platform: string;
    brandGuidelines: string;
    productImageUrl: string;
  };
}

export interface MusicVideoPayload extends BaseConceptPayload {
  format: 'music_video';
  musicVideo: {
    artistName: string;
    trackTitle: string;
    genre: string;
    lyrics: string;
    performanceRatio: number;
    bpm: number | null;
    beatTimeline: number[];
    audioFileName: string;
    // Optional enrichments from new music production pipeline
    stems?: Array<{ stem: string; url: string; selected: boolean }>;
    selectedStems?: Array<{ stem: string; url: string }>;
    annotatedLyrics?: string;
    transcriptionModel?: string;
  };
}

export interface InfotainmentPayload extends BaseConceptPayload {
  format: 'infotainment';
  infotainment: {
    topic: string;
    targetAudience: string;
    keyFacts: string;
    educationalGoals: string[];
    hostStyle: string;
    visualStyle: string;
  };
}

export interface ShortFilmPayload extends BaseConceptPayload {
  format: 'short_film';
  shortFilm: {
    genre: string;
    tone: string;
    duration: string;
    visualStyle: string;
  };
}

export interface CustomPayload extends BaseConceptPayload {
  format: 'custom';
  metaPrompts?: {
    storylineSystem?: string;
    storylineStructure?: string;
    shotPrompting?: string;
    characterExtraction?: string;
    negativeConstraints?: string;
    version?: string;
  };
}

export type ConceptPayload =
  | CommercialPayload
  | MusicVideoPayload
  | InfotainmentPayload
  | ShortFilmPayload
  | CustomPayload;

// ─── Builder ────────────────────────────────────────────────────────

function buildBase(data: ProjectData): BaseConceptPayload {
  return {
    format: data.format,
    title: data.title || 'Untitled Project',
    concept: data.concept || '',
    genre: data.genre || '',
    tone: data.tone || '',
    conceptOption: data.conceptOption,
    ...(data.specialRequests ? { specialRequests: data.specialRequests } : {}),
    ...(data.customFormat ? { customFormat: data.customFormat } : {}),
  };
}

/**
 * Build a structured JSON payload from the project's concept data.
 *
 * The result is format-discriminated so downstream consumers can
 * narrow the type by checking `payload.format`.
 */
export function buildConceptPayload(data: ProjectData): ConceptPayload {
  const base = buildBase(data);

  switch (data.format) {
    case 'commercial': {
      const ab = data.adBrief ?? ({} as Record<string, unknown>);
      return {
        ...base,
        format: 'commercial',
        commercial: {
          product: (ab.product as string) || data.product || '',
          brandName: (ab.brandName as string) || '',
          productType: (ab.productType as string) || '',
          targetAudience: (ab.targetAudience as string) || data.targetAudience || '',
          mainMessage: (ab.mainMessage as string) || data.mainMessage || '',
          callToAction: (ab.callToAction as string) || data.callToAction || '',
          tone: (ab.tone as string) || '',
          adDuration: (ab.adDuration as string) || '30s',
          platform: (ab.platform as string) || 'all',
          brandGuidelines: (ab.brandGuidelines as string) || '',
          productImageUrl: (ab.productImageUrl as string) || '',
        },
      };
    }

    case 'music_video': {
      const mv = data.musicVideoData ?? ({} as Record<string, unknown>);
      const stemsRaw = (mv.stems as Array<{ stem: string; url: string; selected: boolean }> | undefined) ?? undefined;
      const selectedStems = stemsRaw?.filter((s) => s.selected).map((s) => ({ stem: s.stem, url: s.url }));
      return {
        ...base,
        format: 'music_video',
        musicVideo: {
          artistName: (mv.artistName as string) || '',
          trackTitle: (mv.trackTitle as string) || '',
          genre: (mv.genre as string) || '',
          lyrics: (mv.lyrics as string) || '',
          performanceRatio: (mv.performanceRatio as number) ?? 50,
          bpm: (mv.bpm as number) ?? null,
          beatTimeline: (mv.beatTimeline as number[]) || [],
          audioFileName: (mv.audioFileName as string) || '',
          ...(stemsRaw ? { stems: stemsRaw } : {}),
          ...(selectedStems && selectedStems.length ? { selectedStems } : {}),
          ...(mv.annotatedLyrics ? { annotatedLyrics: mv.annotatedLyrics as string } : {}),
          ...(mv.transcriptionModel ? { transcriptionModel: mv.transcriptionModel as string } : {}),
        },
      };
    }

    case 'infotainment': {
      const info = data.infotainmentData ?? ({} as Record<string, unknown>);
      return {
        ...base,
        format: 'infotainment',
        infotainment: {
          topic: (info.topic as string) || '',
          targetAudience: (info.targetDemographic as string) || '',
          keyFacts: (info.keyFacts as string) || '',
          educationalGoals: (info.educationalGoals as string[]) || [],
          hostStyle: (info.hostStyle as string) || 'casual',
          visualStyle: (info.visualStyle as string) || '',
        },
      };
    }

    case 'short_film': {
      const sf = data.shortFilmData ?? ({} as Record<string, unknown>);
      return {
        ...base,
        format: 'short_film',
        shortFilm: {
          genre: (sf.genre as string) || data.genre || '',
          tone: (sf.tone as string) || data.tone || '',
          duration: (sf.duration as string) || '',
          visualStyle: (sf.visualStyle as string) || '',
        },
      };
    }

    case 'custom':
    default: {
      const mp = data.customMetaPrompts;
      const hasMeta = mp && Object.values(mp).some((v) => typeof v === 'string' && v.trim().length > 0);
      return {
        ...base,
        format: 'custom',
        ...(hasMeta ? { metaPrompts: mp } : {}),
      };
    }
  }
}
