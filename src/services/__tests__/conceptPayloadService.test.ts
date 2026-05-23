import { describe, it, expect } from 'vitest';
import { buildConceptPayload, ConceptPayload } from '../conceptPayloadService';
import type { ProjectData } from '@/components/project-setup/types';

const baseProjectData: ProjectData = {
  title: 'Test Project',
  concept: 'A test concept',
  genre: 'Drama',
  tone: 'Dark',
  format: 'custom',
  addVoiceover: false,
  conceptOption: 'ai',
};

describe('buildConceptPayload', () => {
  it('builds a custom payload with base fields', () => {
    const payload = buildConceptPayload(baseProjectData);
    expect(payload.format).toBe('custom');
    expect(payload.title).toBe('Test Project');
    expect(payload.concept).toBe('A test concept');
    expect(payload.genre).toBe('Drama');
    expect(payload.tone).toBe('Dark');
    expect(payload.conceptOption).toBe('ai');
  });

  it('builds a commercial payload with all ad brief fields', () => {
    const data: ProjectData = {
      ...baseProjectData,
      format: 'commercial',
      adBrief: {
        product: 'Air Max 2025',
        brandName: 'Nike',
        productType: 'Running shoe',
        targetAudience: 'Millennials',
        mainMessage: 'Just Do It',
        callToAction: 'Visit nike.com',
        tone: 'Inspirational',
        adDuration: '30s',
        platform: 'social',
        brandGuidelines: 'Orange primary',
        productImageUrl: 'blob:http://localhost/some-image',
      },
    };

    const payload = buildConceptPayload(data) as Extract<ConceptPayload, { format: 'commercial' }>;
    expect(payload.format).toBe('commercial');
    expect(payload.commercial.product).toBe('Air Max 2025');
    expect(payload.commercial.brandName).toBe('Nike');
    expect(payload.commercial.productType).toBe('Running shoe');
    expect(payload.commercial.targetAudience).toBe('Millennials');
    expect(payload.commercial.mainMessage).toBe('Just Do It');
    expect(payload.commercial.callToAction).toBe('Visit nike.com');
    expect(payload.commercial.tone).toBe('Inspirational');
    expect(payload.commercial.adDuration).toBe('30s');
    expect(payload.commercial.platform).toBe('social');
    expect(payload.commercial.brandGuidelines).toBe('Orange primary');
    expect(payload.commercial.productImageUrl).toBe('blob:http://localhost/some-image');
  });

  it('builds a music video payload with BPM and beat timeline', () => {
    const data: ProjectData = {
      ...baseProjectData,
      format: 'music_video',
      musicVideoData: {
        artistName: 'The Weeknd',
        trackTitle: 'Blinding Lights',
        genre: 'Synthwave',
        lyrics: 'Some lyrics here',
        performanceRatio: 60,
        audioFileUrl: 'blob:http://localhost/audio',
        audioFileName: 'blinding-lights.mp3',
        bpm: 171,
        beatTimeline: [0, 0.351, 0.702, 1.053],
      },
    };

    const payload = buildConceptPayload(data) as Extract<ConceptPayload, { format: 'music_video' }>;
    expect(payload.format).toBe('music_video');
    expect(payload.musicVideo.artistName).toBe('The Weeknd');
    expect(payload.musicVideo.trackTitle).toBe('Blinding Lights');
    expect(payload.musicVideo.genre).toBe('Synthwave');
    expect(payload.musicVideo.bpm).toBe(171);
    expect(payload.musicVideo.beatTimeline).toEqual([0, 0.351, 0.702, 1.053]);
    expect(payload.musicVideo.performanceRatio).toBe(60);
    expect(payload.musicVideo.audioFileName).toBe('blinding-lights.mp3');
  });

  it('builds an infotainment payload with all fields', () => {
    const data: ProjectData = {
      ...baseProjectData,
      format: 'infotainment',
      infotainmentData: {
        topic: 'The Science of Sleep',
        educationalGoals: ['Understand REM cycles', 'Learn sleep hygiene'],
        targetDemographic: 'Adults 25-45',
        hostStyle: 'documentary',
        keyFacts: 'Humans spend 1/3 of their life sleeping',
        visualStyle: 'animated_explainer',
      },
    };

    const payload = buildConceptPayload(data) as Extract<ConceptPayload, { format: 'infotainment' }>;
    expect(payload.format).toBe('infotainment');
    expect(payload.infotainment.topic).toBe('The Science of Sleep');
    expect(payload.infotainment.targetAudience).toBe('Adults 25-45');
    expect(payload.infotainment.keyFacts).toBe('Humans spend 1/3 of their life sleeping');
    expect(payload.infotainment.educationalGoals).toEqual(['Understand REM cycles', 'Learn sleep hygiene']);
    expect(payload.infotainment.hostStyle).toBe('documentary');
    expect(payload.infotainment.visualStyle).toBe('animated_explainer');
  });

  it('builds a short film payload with structured fields', () => {
    const data: ProjectData = {
      ...baseProjectData,
      format: 'short_film',
      shortFilmData: {
        genre: 'thriller',
        tone: 'suspenseful',
        duration: '5-10min',
        visualStyle: 'noir',
      },
    };

    const payload = buildConceptPayload(data) as Extract<ConceptPayload, { format: 'short_film' }>;
    expect(payload.format).toBe('short_film');
    expect(payload.shortFilm.genre).toBe('thriller');
    expect(payload.shortFilm.tone).toBe('suspenseful');
    expect(payload.shortFilm.duration).toBe('5-10min');
    expect(payload.shortFilm.visualStyle).toBe('noir');
  });

  it('handles missing format-specific data gracefully', () => {
    const commercial = buildConceptPayload({
      ...baseProjectData,
      format: 'commercial',
    }) as Extract<ConceptPayload, { format: 'commercial' }>;
    expect(commercial.commercial.product).toBe('');
    expect(commercial.commercial.brandName).toBe('');

    const music = buildConceptPayload({
      ...baseProjectData,
      format: 'music_video',
    }) as Extract<ConceptPayload, { format: 'music_video' }>;
    expect(music.musicVideo.bpm).toBeNull();
    expect(music.musicVideo.beatTimeline).toEqual([]);

    const info = buildConceptPayload({
      ...baseProjectData,
      format: 'infotainment',
    }) as Extract<ConceptPayload, { format: 'infotainment' }>;
    expect(info.infotainment.keyFacts).toBe('');
    expect(info.infotainment.visualStyle).toBe('');

    const shortFilm = buildConceptPayload({
      ...baseProjectData,
      format: 'short_film',
    }) as Extract<ConceptPayload, { format: 'short_film' }>;
    expect(shortFilm.shortFilm.genre).toBe('Drama'); // Falls back to top-level genre
    expect(shortFilm.shortFilm.duration).toBe('');
  });

  it('includes specialRequests and customFormat when present', () => {
    const payload = buildConceptPayload({
      ...baseProjectData,
      specialRequests: 'Plot twist at end',
      customFormat: 'Interactive fiction',
    });
    expect(payload.specialRequests).toBe('Plot twist at end');
    expect(payload.customFormat).toBe('Interactive fiction');
  });

  it('omits specialRequests when empty', () => {
    const payload = buildConceptPayload({
      ...baseProjectData,
      specialRequests: '',
    });
    expect('specialRequests' in payload).toBe(false);
  });

  it('all payloads are valid JSON-serializable objects', () => {
    const formats = ['commercial', 'music_video', 'infotainment', 'short_film', 'custom'] as const;
    for (const format of formats) {
      const payload = buildConceptPayload({ ...baseProjectData, format });
      const serialized = JSON.stringify(payload);
      const parsed = JSON.parse(serialized);
      expect(parsed.format).toBe(format);
    }
  });
});
