import { expect, test, type ElementHandle, type Page } from '@playwright/test';

const imageEditNodeId = '00000000-0000-4000-8000-000000000101';
const videoNodeId = '00000000-0000-4000-8000-000000000102';
const existingNodeIds = [imageEditNodeId, videoNodeId] as const;

type NodeSnapshot = {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  opacity: string;
  selected: boolean;
  previewExists: boolean;
};

type StabilitySnapshot = {
  viewportTransform: string;
  nodeCount: number;
  nodes: NodeSnapshot[];
};

function nodeSelector(id: string) {
  return `.react-flow__node[data-id="${id}"]`;
}

function previewSelector(id: string) {
  return id === imageEditNodeId
    ? `[data-testid="studio-image-edit-preview-${id}"]`
    : `[data-testid="studio-video-preview-${id}"]`;
}

async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function readSnapshot(page: Page): Promise<StabilitySnapshot> {
  return page.evaluate(
    ({ ids, imageEditId }) => {
      const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
      return {
        viewportTransform: viewport?.style.transform ?? '',
        nodeCount: document.querySelectorAll('.react-flow__node').length,
        nodes: ids.map((id) => {
          const node = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
          if (!node) {
            throw new Error(`Missing node ${id}`);
          }
          const previewSelector =
            id === imageEditId
              ? `[data-testid="studio-image-edit-preview-${id}"]`
              : `[data-testid="studio-video-preview-${id}"]`;
          const preview = document.querySelector(previewSelector);
          const box = node.getBoundingClientRect();
          return {
            id,
            box: {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            },
            opacity: getComputedStyle(node).opacity,
            selected: node.classList.contains('selected'),
            previewExists: Boolean(preview),
          };
        }),
      };
    },
    { ids: existingNodeIds, imageEditId: imageEditNodeId }
  );
}

async function captureElementHandles(page: Page) {
  const nodeHandles = new Map<string, ElementHandle<Element>>();
  const previewHandles = new Map<string, ElementHandle<Element>>();

  for (const id of existingNodeIds) {
    const node = await page.locator(nodeSelector(id)).elementHandle();
    const preview = await page.locator(previewSelector(id)).elementHandle();
    if (!node || !preview) {
      throw new Error(`Unable to capture handles for ${id}`);
    }
    nodeHandles.set(id, node);
    previewHandles.set(id, preview);
  }

  return { nodeHandles, previewHandles };
}

async function expectHandlesToRemainStable(
  page: Page,
  handles: Awaited<ReturnType<typeof captureElementHandles>>
) {
  for (const id of existingNodeIds) {
    const sameNode = await handles.nodeHandles.get(id)!.evaluate(
      (node, selector) => node.isSameNode(document.querySelector(selector)),
      nodeSelector(id)
    );
    const samePreview = await handles.previewHandles.get(id)!.evaluate(
      (preview, selector) => preview.isSameNode(document.querySelector(selector)),
      previewSelector(id)
    );

    expect(sameNode, `${id} node DOM should not be replaced`).toBe(true);
    expect(samePreview, `${id} preview DOM should not be replaced`).toBe(true);
  }
}

function expectStableSnapshot(before: StabilitySnapshot, current: StabilitySnapshot) {
  expect(current.viewportTransform).toBe(before.viewportTransform);
  expect(current.nodeCount).toBeGreaterThanOrEqual(before.nodeCount);

  for (const beforeNode of before.nodes) {
    const currentNode = current.nodes.find((node) => node.id === beforeNode.id);
    expect(currentNode, `${beforeNode.id} should still exist`).toBeTruthy();
    expect(currentNode!.opacity).toBe('1');
    expect(currentNode!.previewExists).toBe(true);
    expect(Math.abs(currentNode!.box.x - beforeNode.box.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentNode!.box.y - beforeNode.box.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentNode!.box.width - beforeNode.box.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentNode!.box.height - beforeNode.box.height)).toBeLessThanOrEqual(1);
  }

  expect(current.nodes.find((node) => node.id === imageEditNodeId)?.selected).toBe(true);
}

test('populating new ImageEdit and Video nodes keeps existing cards visually stable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio?e2e=node-population');
  await page.waitForFunction(() => Boolean((window as any).__wzrdStudioTest));

  await page.evaluate(() => (window as any).__wzrdStudioTest.seedPopulationGraph());

  for (const id of existingNodeIds) {
    await expect(page.locator(nodeSelector(id))).toBeVisible();
    await expect(page.locator(previewSelector(id))).toBeVisible();
  }
  await expect(page.locator(nodeSelector(imageEditNodeId))).toHaveClass(/selected/);

  await nextFrame(page);
  const before = await readSnapshot(page);
  const handles = await captureElementHandles(page);

  await page.evaluate(() => {
    void (window as any).__wzrdStudioTest.populateNewNodes();
  });

  for (let index = 0; index < 8; index += 1) {
    await nextFrame(page);
    await expectHandlesToRemainStable(page, handles);
    expectStableSnapshot(before, await readSnapshot(page));
  }

  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});
