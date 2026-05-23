import { test, expect } from "@playwright/test";
import {
  adminClient,
  cleanupEditorProject,
  hasDatabaseCredentials,
  seedEditorProjectWithAsset,
} from "./helpers";

test.describe("WorldStudio editor smoke", () => {
  test.skip(
    !hasDatabaseCredentials,
    "Set E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY to run DB-backed editor e2e tests.",
  );

  test("edits project settings, adds a seeded asset to the timeline, saves, reloads, and verifies persistence", async ({ page }) => {
    const client = adminClient();
    const seed = await seedEditorProjectWithAsset(client);

    try {
      await page.goto(`/editor/${seed.projectId}`);
      await expect(page.getByRole("heading", { name: /WorldStudio Editor/i })).toBeVisible();
      await expect(page.getByText("Project settings")).toBeVisible();

      await page.getByLabel("Project title").fill("E2E WorldStudio Smoke");
      await page.getByLabel("Aspect ratio").selectOption("1:1");
      await page.getByLabel("Duration seconds").fill("12");
      await page.getByLabel("Canvas background").fill("#111111");
      await page.getByRole("button", { name: "Apply project settings" }).click();
      await expect(page.getByText("Project settings updated.")).toBeVisible();

      await expect(page.getByText("E2E seeded video")).toBeVisible();
      await page.getByRole("button", { name: "Add to timeline" }).click();
      await expect(page.getByText("1 clips")).toBeVisible();

      await page.getByRole("button", { name: /^Save$/ }).click();
      await expect(page.getByText("Saved editor revision.")).toBeVisible();

      const { data, error } = await client
        .from("video_editor_revisions")
        .select("revision_number,snapshot")
        .eq("project_id", seed.projectId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      const snapshot = data.snapshot as {
        project: { title: string; aspectRatio: string; durationMs: number; background: string };
        clips: unknown[];
      };
      expect(snapshot.project.title).toBe("E2E WorldStudio Smoke");
      expect(snapshot.project.aspectRatio).toBe("1:1");
      expect(snapshot.project.durationMs).toBe(12000);
      expect(snapshot.project.background).toBe("#111111");
      expect(snapshot.clips).toHaveLength(1);

      await page.reload();
      await expect(page.getByRole("heading", { name: /E2E WorldStudio Smoke/i })).toBeVisible();
      await expect(page.getByText("1 clips")).toBeVisible();
    } finally {
      await cleanupEditorProject(seed, client);
    }
  });
});

