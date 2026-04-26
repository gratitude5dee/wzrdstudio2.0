import { describe, expect, it } from 'vitest';

import {
  CANONICAL_NODE_KINDS,
  getNodeExecutionDisposition,
  getNodeExecutionWarning,
  getNodePreflightError,
  isCompatibleDataType,
  normalizeNodeKind,
  normalizeNodeStatus,
  normalizeRunStatus,
} from '@/lib/compute/contract';

describe('shared compute contract', () => {
  it('normalizes legacy kinds and statuses to canonical values', () => {
    expect(normalizeNodeKind('image_edit')).toBe('ImageEdit');
    expect(normalizeNodeKind('text_to_video')).toBe('Video');
    expect(normalizeNodeStatus('completed')).toBe('succeeded');
    expect(normalizeRunStatus('completed')).toBe('succeeded');
  });

  it('classifies every canonical node kind with an explicit execution disposition', () => {
    const dispositions = CANONICAL_NODE_KINDS.map((kind) => getNodeExecutionDisposition(kind));
    expect(dispositions).not.toContain(undefined);
    expect(getNodeExecutionDisposition('comment')).toBe('excluded');
    expect(getNodeExecutionDisposition('Model')).toBe('passthrough');
    expect(getNodeExecutionDisposition('Image')).toBe('generator');
  });

  it('applies ImageEdit materialization preflight rules', () => {
    expect(
      getNodePreflightError({
        kind: 'ImageEdit',
        params: { layers: [] },
      })
    ).toBe('ImageEdit nodes require a materialized preview or output asset before execution.');

    expect(
      getNodePreflightError({
        kind: 'ImageEdit',
        params: { previewAssetUrl: 'https://example.com/preview.png' },
      })
    ).toBeNull();
  });

  it('keeps Model and Gateway explicit rather than falling through silently', () => {
    expect(getNodeExecutionWarning('Model')).toContain('pass-through');
    expect(getNodeExecutionWarning('Gateway')).toContain('pass-through');
    expect(getNodeExecutionWarning('Transform')).toBeNull();
  });

  it('uses one compatibility table for edge validation', () => {
    expect(isCompatibleDataType('text', 'string')).toBe(true);
    expect(isCompatibleDataType('image', 'json')).toBe(false);
    expect(isCompatibleDataType('any', 'video')).toBe(true);
  });
});
