import { describe, expect, it } from 'vitest';
import {
  createEditframeWebhookSignature,
  verifyEditframeWebhookSignature,
} from '../../../../shared/editframeWebhookSignature';

describe('Editframe webhook signatures', () => {
  it('accepts valid raw-body HMAC signatures', async () => {
    const body = JSON.stringify({ type: 'render.completed', data: { id: 'render-1' } });
    const secret = 'test-secret';
    const signature = await createEditframeWebhookSignature(body, secret);

    await expect(
      verifyEditframeWebhookSignature(body, `sha256=${signature}`, secret)
    ).resolves.toBe(true);
  });

  it('rejects invalid or missing signatures', async () => {
    const body = JSON.stringify({ type: 'render.completed', data: { id: 'render-1' } });
    const signature = await createEditframeWebhookSignature(body, 'test-secret');

    await expect(
      verifyEditframeWebhookSignature(`${body} `, `sha256=${signature}`, 'test-secret')
    ).resolves.toBe(false);
    await expect(
      verifyEditframeWebhookSignature(body, null, 'test-secret')
    ).resolves.toBe(false);
    await expect(
      verifyEditframeWebhookSignature(body, `sha256=${signature}`, undefined)
    ).resolves.toBe(false);
  });
});
