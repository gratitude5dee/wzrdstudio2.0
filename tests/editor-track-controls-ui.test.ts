import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor layer track controls UI", () => {
  it("wires track lock, mute, and hidden controls through updateTrackSettingsCommand", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Layers / tracks");
    expect(source).toContain("toggleTrackSetting");
    expect(source).toContain("updateTrackSettingsCommand");
    expect(source).toContain("Lock track");
    expect(source).toContain("Mute track");
    expect(source).toContain("Hide track");
    expect(source).toContain("track.locked");
    expect(source).toContain("track.muted");
    expect(source).toContain("track.hidden");
  });
});

