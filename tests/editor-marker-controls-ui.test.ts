import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor marker controls UI", () => {
  it("wires marker add, jump, and delete controls into the editor shell", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Marker controls");
    expect(source).toContain("markerDraft");
    expect(source).toContain("addMarkerAtPlayhead");
    expect(source).toContain("deleteMarker");
    expect(source).toContain("deleteMarkerCommand");
    expect(source).toContain("Add marker at playhead");
    expect(source).toContain("Jump to marker");
    expect(source).toContain("Delete marker");
    expect(source).toContain("state.snapshot.markers.map");
  });
});

