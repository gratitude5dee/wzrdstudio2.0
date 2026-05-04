import { expect, test } from '@playwright/test';

test('voice action layer appears and can drive core navigation through the test harness', async ({ page }) => {
  await page.goto('/home');

  await page.waitForFunction(() => Boolean(window.__wzrdVoiceActionTest), undefined, {
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Hold to speak' })).toBeVisible({
    timeout: 15_000,
  });

  const projectResult = await page.evaluate(() =>
    window.__wzrdVoiceActionTest!.execute('start_new_project'),
  );
  expect(projectResult.ok).toBe(true);
  await expect(page).toHaveURL(/\/project-setup$/);

  const characterResult = await page.evaluate(() =>
    window.__wzrdVoiceActionTest!.execute('character_open'),
  );
  expect(characterResult.ok).toBe(true);
  await expect(page).toHaveURL(/\/kanvas\?studio=character-creation$/);
});
