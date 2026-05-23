import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createBlankEditorProject,
  createEditorProjectFromLibraryItem,
  createEditorProjectFromLyricTemplate,
} from "@/lib/editor/api";
import { appRoutes } from "@/lib/routes";

export default function EditorCreateRedirectPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [message, setMessage] = useState("Creating editor project…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const templateId = params.get("templateId");
        const libraryItemId = params.get("libraryItemId");
        const title = params.get("title") ?? undefined;
        const result = templateId
          ? await createEditorProjectFromLyricTemplate({ templateId, title, openExisting: true })
          : libraryItemId
            ? await createEditorProjectFromLibraryItem({ libraryItemId, title, openExisting: true })
            : await createBlankEditorProject({ title });
        if (!cancelled) nav(appRoutes.editorProject(result.project.id), { replace: true });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nav, params]);

  return (
    <main className="page editor-page">
      <div className="lyrics-loading">{message}</div>
    </main>
  );
}

