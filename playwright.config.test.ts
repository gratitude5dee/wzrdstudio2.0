import { afterEach, describe, expect, it, vi } from 'vitest';

const originalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const originalCi = process.env.CI;

const loadConfig = async () => {
  vi.resetModules();
  return (await import('./playwright.config')).default;
};

afterEach(() => {
  if (originalBaseUrl === undefined) {
    delete process.env.PLAYWRIGHT_BASE_URL;
  } else {
    process.env.PLAYWRIGHT_BASE_URL = originalBaseUrl;
  }

  if (originalCi === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCi;
  }
});

describe('playwright config', () => {
  it('uses the local dev server by default', async () => {
    delete process.env.PLAYWRIGHT_BASE_URL;
    delete process.env.CI;

    const config = await loadConfig();

    expect(config.timeout).toBe(60_000);
    expect(config.use?.baseURL).toBe('http://127.0.0.1:8080');
    expect(config.webServer?.url).toBe('http://127.0.0.1:8080');
    expect(config.webServer?.reuseExistingServer).toBe(true);
  });

  it('honors env overrides for CI and remote base urls', async () => {
    process.env.PLAYWRIGHT_BASE_URL = 'https://preview.example.com';
    process.env.CI = 'true';

    const config = await loadConfig();

    expect(config.use?.baseURL).toBe('https://preview.example.com');
    expect(config.webServer?.reuseExistingServer).toBe(false);
  });
});
