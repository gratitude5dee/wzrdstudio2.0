import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const readSrc = (rel: string) =>
  readFileSync(resolve(__dirname, '../../..', rel), 'utf-8');

describe('Performance guardrails', () => {
  describe('App.tsx provider isolation', () => {
    const appSource = readSrc('src/App.tsx');

    it('does not import AuthProvider at module scope', () => {
      expect(appSource).not.toMatch(/import.*AuthProvider/);
    });

    it('does not import ThirdwebProvider at module scope', () => {
      expect(appSource).not.toMatch(/import.*ThirdwebProvider/);
    });

    it('does not import VoiceAgentProvider at module scope', () => {
      expect(appSource).not.toMatch(/import.*VoiceAgentProvider/);
    });

    it('does not import LoadingScreen at module scope', () => {
      expect(appSource).not.toMatch(/import.*LoadingScreen/);
    });

    it('does not import CursorLoadingProvider at module scope', () => {
      expect(appSource).not.toMatch(/import.*CursorLoadingProvider/);
    });
  });

  describe('Raw asset imports blocked', () => {
    const heroSource = readSrc('src/components/landing/HeroSection.tsx');

    it('HeroSection does not import raw GIF', () => {
      expect(heroSource).not.toMatch(/import.*wzrd-intro\.gif/);
    });
  });

  describe('index.html cleanup', () => {
    const html = readSrc('index.html');

    it('does not include GPT Engineer script', () => {
      expect(html).not.toMatch(/gptengineer\.js/);
      expect(html).not.toMatch(/gpteng\.co/);
    });

    it('does not preconnect to API services not needed on landing', () => {
      expect(html).not.toMatch(/api\.supabase\.co/);
      expect(html).not.toMatch(/fal\.media/);
      expect(html).not.toMatch(/api\.gmicloud\.ai/);
    });
  });
});
