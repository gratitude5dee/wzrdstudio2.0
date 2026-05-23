export type EditorShortcutAction =
  | "togglePlayback"
  | "undo"
  | "redo"
  | "deleteSelectedClip"
  | "splitSelectedClip"
  | "nudgeSelectedClipLeft"
  | "nudgeSelectedClipRight"
  | "nudgePlayheadLeft"
  | "nudgePlayheadRight";

export type EditorShortcutKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  targetTagName?: string | null;
};

function isEditableTarget(targetTagName?: string | null): boolean {
  if (!targetTagName) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(targetTagName.toUpperCase());
}

export function editorShortcutForKeyEvent(event: EditorShortcutKeyEvent): EditorShortcutAction | null {
  if (isEditableTarget(event.targetTagName)) return null;

  const key = event.key.toLowerCase();
  const commandKey = Boolean(event.metaKey || event.ctrlKey);

  if (event.key === " ") return "togglePlayback";
  if (commandKey && key === "z" && !event.shiftKey) return "undo";
  if ((commandKey && key === "z" && event.shiftKey) || (commandKey && key === "y")) return "redo";
  if (event.key === "Delete" || event.key === "Backspace") return "deleteSelectedClip";
  if (!commandKey && !event.altKey && !event.shiftKey && key === "s") return "splitSelectedClip";
  if (event.key === "ArrowLeft" && event.shiftKey) return "nudgePlayheadLeft";
  if (event.key === "ArrowRight" && event.shiftKey) return "nudgePlayheadRight";
  if (event.key === "ArrowLeft") return "nudgeSelectedClipLeft";
  if (event.key === "ArrowRight") return "nudgeSelectedClipRight";

  return null;
}

