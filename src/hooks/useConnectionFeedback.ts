/**
 * Connection Feedback Hook
 *
 * Manages visual feedback state for rejected edge connections in the studio canvas.
 * Shows a red flash on the target handle/node and a tooltip with the rejection reason.
 *
 * Debounces rapid rejections (isValidConnection fires on every hover) so the flash
 * and tooltip only trigger once per unique target+error combination.
 */

import { useCallback, useRef, useState } from 'react';

export interface ConnectionRejection {
  /** The error message to display in the tooltip */
  error: string;
  /** Screen-space position of the rejection (near the target handle) */
  position: { x: number; y: number };
  /** ID of the target node being rejected */
  targetNodeId: string;
  /** Unique key to re-trigger animations on repeated rejections */
  key: number;
}

const REJECTION_DISPLAY_MS = 2200;
const DEBOUNCE_MS = 300;

export function useConnectionFeedback() {
  const [rejection, setRejection] = useState<ConnectionRejection | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);
  const lastRejectionRef = useRef<{ targetNodeId: string; error: string; time: number } | null>(null);

  const showRejection = useCallback(
    (error: string, targetNodeId: string, position?: { x: number; y: number }) => {
      // Debounce: skip if the same node+error was rejected recently
      const now = Date.now();
      const last = lastRejectionRef.current;
      if (
        last &&
        last.targetNodeId === targetNodeId &&
        last.error === error &&
        now - last.time < DEBOUNCE_MS
      ) {
        return;
      }
      lastRejectionRef.current = { targetNodeId, error, time: now };

      // Resolve position from the target node's DOM element if not provided
      let resolvedPosition = position;
      if (!resolvedPosition) {
        const nodeElement = document.querySelector(
          `[data-id="${targetNodeId}"]`
        ) as HTMLElement | null;
        if (nodeElement) {
          const rect = nodeElement.getBoundingClientRect();
          resolvedPosition = {
            x: rect.left + rect.width / 2,
            y: rect.top,
          };
        } else {
          // Fallback to center of viewport
          resolvedPosition = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          };
        }
      }

      // Add the red flash CSS class to the target node
      const nodeElement = document.querySelector(
        `[data-id="${targetNodeId}"]`
      ) as HTMLElement | null;
      if (nodeElement) {
        nodeElement.classList.remove('connection-rejected-flash');
        // Force reflow to restart the animation
        void nodeElement.offsetWidth;
        nodeElement.classList.add('connection-rejected-flash');
      }

      keyRef.current += 1;
      setRejection({
        error,
        position: resolvedPosition,
        targetNodeId,
        key: keyRef.current,
      });

      // Clear any existing timeout
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }

      clearTimerRef.current = setTimeout(() => {
        setRejection(null);
        clearTimerRef.current = null;

        // Remove flash class
        if (nodeElement) {
          nodeElement.classList.remove('connection-rejected-flash');
        }
      }, REJECTION_DISPLAY_MS);
    },
    []
  );

  const clearRejection = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setRejection(null);
  }, []);

  return {
    rejection,
    showRejection,
    clearRejection,
  };
}

export default useConnectionFeedback;
