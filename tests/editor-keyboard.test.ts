import { describe, expect, it } from "vitest";
import { editorShortcutForKeyEvent } from "@/lib/editor/keyboard";

describe("editor keyboard shortcuts", () => {
  it("maps transport, undo/redo, delete, split, and nudge shortcuts", () => {
    expect(editorShortcutForKeyEvent({ key: " ", targetTagName: "BODY" })).toBe("togglePlayback");
    expect(editorShortcutForKeyEvent({ key: "z", metaKey: true, targetTagName: "BODY" })).toBe("undo");
    expect(editorShortcutForKeyEvent({ key: "z", ctrlKey: true, shiftKey: true, targetTagName: "BODY" })).toBe("redo");
    expect(editorShortcutForKeyEvent({ key: "y", ctrlKey: true, targetTagName: "BODY" })).toBe("redo");
    expect(editorShortcutForKeyEvent({ key: "Delete", targetTagName: "BODY" })).toBe("deleteSelectedClip");
    expect(editorShortcutForKeyEvent({ key: "s", targetTagName: "BODY" })).toBe("splitSelectedClip");
    expect(editorShortcutForKeyEvent({ key: "ArrowLeft", targetTagName: "BODY" })).toBe("nudgeSelectedClipLeft");
    expect(editorShortcutForKeyEvent({ key: "ArrowRight", shiftKey: true, targetTagName: "BODY" })).toBe("nudgePlayheadRight");
  });

  it("ignores shortcuts while users type into form fields", () => {
    expect(editorShortcutForKeyEvent({ key: "z", metaKey: true, targetTagName: "INPUT" })).toBeNull();
    expect(editorShortcutForKeyEvent({ key: "Delete", targetTagName: "TEXTAREA" })).toBeNull();
  });
});

