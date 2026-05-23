import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('StudioCanvas callback ordering regression guard', () => {
  it('declares openConnectionMenuFromPort before the node-mapping effect uses it', () => {
    const filePath = path.resolve(
      __dirname,
      'StudioCanvas.tsx'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    const declarationIndex = source.indexOf('const openConnectionMenuFromPort = useCallback(');
    const mappingEffectIndex = source.indexOf('const computeNodes: Node[] = nodeDefinitions.map((nodeDef) => {');
    const usageIndex = source.indexOf('onOpenConnectionMenu: (sourcePortId: string, rect?: DOMRect | null) =>');

    expect(declarationIndex).toBeGreaterThan(-1);
    expect(mappingEffectIndex).toBeGreaterThan(-1);
    expect(usageIndex).toBeGreaterThan(-1);
    expect(declarationIndex).toBeLessThan(mappingEffectIndex);
    expect(declarationIndex).toBeLessThan(usageIndex);
  });
});
