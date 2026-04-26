import { describe, expect, it } from 'vitest';

import { CANONICAL_NODE_KINDS } from '@/lib/compute/contract';
import {
  HANDLE_BINDINGS,
  INPUT_FREE_KINDS,
  findBindingForHandle,
  getBindingsForKind,
} from '@/lib/compute/handleBindings';

describe('handleBindings', () => {
  it('covers every canonical node kind with a binding entry or an input-free flag', () => {
    for (const kind of CANONICAL_NODE_KINDS) {
      const bindings = HANDLE_BINDINGS[kind];
      expect(bindings, `missing entry for kind=${kind}`).toBeDefined();
      if (bindings.length === 0) {
        expect(
          INPUT_FREE_KINDS.has(kind),
          `kind=${kind} has empty bindings but is not declared input-free`
        ).toBe(true);
      }
    }
  });

  it('defines non-empty paramKey and a valid mode for every binding', () => {
    for (const [kind, bindings] of Object.entries(HANDLE_BINDINGS)) {
      for (const b of bindings) {
        expect(b.handle, `kind=${kind}`).toBeTruthy();
        expect(b.paramKey, `kind=${kind} handle=${b.handle}`).toBeTruthy();
        expect(['overwrite', 'append-unique', 'concat-prompt']).toContain(b.mode);
      }
    }
  });

  it('exposes getBindingsForKind / findBindingForHandle lookups', () => {
    expect(getBindingsForKind('Image').length).toBe(3);
    expect(findBindingForHandle('Image', 'reference')?.paramKey).toBe('referenceImageUrls');
    expect(findBindingForHandle('Video', 'image')?.paramKey).toBe('firstFrameImageUrl');
    expect(findBindingForHandle('Prompt', 'anything')).toBeUndefined();
  });
});
