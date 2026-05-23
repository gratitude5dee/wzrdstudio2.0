import type { EdgeDefinition, NodeDefinition } from '@/types/computeFlow';

export interface HistorySnapshot {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  timestamp: number;
  description?: string;
}

const TRANSIENT_FIELDS = [
  'status',
  'progress',
  'preview',
  'error',
] as const;

export function nodesMeaningfullyChanged(
  oldNodes: NodeDefinition[],
  newNodes: NodeDefinition[]
): boolean {
  if (oldNodes.length !== newNodes.length) return true;

  const oldMap = new Map(oldNodes.map((node) => [node.id, node]));

  for (const newNode of newNodes) {
    const oldNode = oldMap.get(newNode.id);
    if (!oldNode) return true;

    const oldData = { ...oldNode } as Record<string, unknown>;
    const newData = { ...newNode } as Record<string, unknown>;

    for (const field of TRANSIENT_FIELDS) {
      delete oldData[field];
      delete newData[field];
    }

    delete oldData.position;
    delete newData.position;

    if (JSON.stringify(oldData) !== JSON.stringify(newData)) return true;
  }

  return false;
}

export function edgesMeaningfullyChanged(
  oldEdges: EdgeDefinition[],
  newEdges: EdgeDefinition[]
): boolean {
  if (oldEdges.length !== newEdges.length) return true;

  const oldIds = new Set(
    oldEdges.map(
      (edge) =>
        `${edge.source.nodeId}:${edge.source.portId}->${edge.target.nodeId}:${edge.target.portId}`
    )
  );
  const newIds = new Set(
    newEdges.map(
      (edge) =>
        `${edge.source.nodeId}:${edge.source.portId}->${edge.target.nodeId}:${edge.target.portId}`
    )
  );

  if (oldIds.size !== newIds.size) return true;

  for (const id of newIds) {
    if (!oldIds.has(id)) return true;
  }

  return false;
}

export function createSnapshot(
  nodes: NodeDefinition[],
  edges: EdgeDefinition[],
  description?: string
): HistorySnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)) as NodeDefinition[],
    edges: JSON.parse(JSON.stringify(edges)) as EdgeDefinition[],
    timestamp: Date.now(),
    description,
  };
}

export class ComputeFlowHistoryManager {
  private history: HistorySnapshot[] = [];
  private historyIndex = -1;
  private maxHistory = 10;
  private isDragging = false;

  // PR-6: edit-session coalescing.
  // While a session is open, snapshots are suppressed. The session ends when
  // `endEditSession()` is called or after `editSessionIdleMs` of inactivity,
  // at which point a single snapshot is pushed.
  private editSession: { nodeId: string | null; idleTimer: ReturnType<typeof setTimeout> | null } | null = null;
  private editSessionIdleMs = 400;
  private pendingFinalize: (() => void) | null = null;

  setDragging(dragging: boolean): void {
    this.isDragging = dragging;
  }

  /**
   * Begin a coalesced edit session. Subsequent `pushSnapshot` calls during the
   * session are suppressed. Calling this while a session is open re-arms the
   * idle timer so a stream of keystrokes only produces one snapshot.
   */
  beginEditSession(nodeId: string | null = null): void {
    if (this.editSession?.idleTimer) {
      clearTimeout(this.editSession.idleTimer);
    }
    this.editSession = {
      nodeId,
      idleTimer: setTimeout(() => this.endEditSession(), this.editSessionIdleMs),
    };
  }

  /** Close the current edit session and flush a single coalesced snapshot. */
  endEditSession(): void {
    if (!this.editSession) return;
    if (this.editSession.idleTimer) {
      clearTimeout(this.editSession.idleTimer);
    }
    this.editSession = null;
    if (this.pendingFinalize) {
      const finalize = this.pendingFinalize;
      this.pendingFinalize = null;
      finalize();
    }
  }

  isInEditSession(): boolean {
    return this.editSession !== null;
  }

  pushSnapshot(
    nodes: NodeDefinition[],
    edges: EdgeDefinition[],
    description?: string
  ): void {
    if (this.isDragging) return;

    if (this.historyIndex >= 0) {
      const last = this.history[this.historyIndex];
      if (
        !nodesMeaningfullyChanged(last.nodes, nodes) &&
        !edgesMeaningfullyChanged(last.edges, edges)
      ) {
        return;
      }
    }

    // While an edit session is active, defer to a single coalesced snapshot
    // taken when the session ends. We always remember the latest payload so
    // the eventual snapshot reflects the user's final state.
    if (this.editSession) {
      // Re-arm idle timer on every change.
      if (this.editSession.idleTimer) clearTimeout(this.editSession.idleTimer);
      this.editSession.idleTimer = setTimeout(() => this.endEditSession(), this.editSessionIdleMs);

      const latestNodes = nodes;
      const latestEdges = edges;
      const latestDescription = description;
      this.pendingFinalize = () => {
        this.commitSnapshot(latestNodes, latestEdges, latestDescription);
      };
      return;
    }

    this.commitSnapshot(nodes, edges, description);
  }

  private commitSnapshot(
    nodes: NodeDefinition[],
    edges: EdgeDefinition[],
    description?: string
  ): void {
    const snapshot = createSnapshot(nodes, edges, description);

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex += 1;

    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyIndex -= 1;
    }
  }

  undo(): HistorySnapshot | null {
    if (this.historyIndex <= 0) return null;
    this.historyIndex -= 1;
    return this.history[this.historyIndex];
  }

  redo(): HistorySnapshot | null {
    if (this.historyIndex >= this.history.length - 1) return null;
    this.historyIndex += 1;
    return this.history[this.historyIndex];
  }

  getState(): { canUndo: boolean; canRedo: boolean } {
    return {
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    };
  }

  clear(): void {
    this.history = [];
    this.historyIndex = -1;
  }
}
