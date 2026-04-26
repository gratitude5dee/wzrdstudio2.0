// ============================================================================
// EDGE FUNCTION: kanvas-lyrics-audio-register
// PURPOSE: Register a project_assets row for an audio file the browser has
//          already uploaded directly to Storage. Never touches file bytes,
//          so it stays well under the 150MB worker memory limit.
// ROUTE:   POST /functions/v1/kanvas-lyrics-audio-register
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "project-assets";
const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/flac",
]);
const MAX_BYTES = 100 * 1024 * 1024; // 100MB ceiling, mirrors asset-upload audio limit

interface RegisterRequest {
  projectId?: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  durationMs?: number | null;
  visibility?: "private" | "project" | "public";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await authenticateRequest(req.headers);

    let body: RegisterRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const {
      projectId = null,
      storagePath,
      fileName,
      mimeType,
      size,
      durationMs = null,
      visibility = "private",
    } = body ?? {};

    // ---- validation ------------------------------------------------------
    if (!storagePath || typeof storagePath !== "string") {
      return json({ error: "storagePath is required" }, 400);
    }
    if (!fileName || typeof fileName !== "string") {
      return json({ error: "fileName is required" }, 400);
    }
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
      return json({ error: `Unsupported mime type: ${mimeType}` }, 400);
    }
    if (typeof size !== "number" || size <= 0 || size > MAX_BYTES) {
      return json({ error: `Invalid size (max ${MAX_BYTES} bytes)` }, 400);
    }

    // RLS-safe path: must live under the user's own folder.
    // Storage RLS checks foldername(name)[1] === auth.uid().
    const expectedPrefix = `${user.id}/lyric-audio/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return json(
        { error: "storagePath must be under {userId}/lyric-audio/" },
        400
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ---- verify the object actually exists in storage --------------------
    // createSignedUrl(short ttl) is a cheap existence check — fails fast if
    // the upload didn't complete.
    const { data: signed, error: signErr } = await admin
      .storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60);

    if (signErr || !signed?.signedUrl) {
      console.error("Storage object not found:", storagePath, signErr?.message);
      return json(
        { error: "Uploaded object not found in storage" },
        404
      );
    }

    const { data: urlData } = admin
      .storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    // ---- insert project_assets row --------------------------------------
    const { data: asset, error: dbError } = await admin
      .from("project_assets")
      .insert({
        project_id: projectId,
        name: fileName,
        url: urlData.publicUrl,
        thumbnail_url: urlData.publicUrl,
        type: "audio",
        size,
        metadata: {
          mime_type: mimeType,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          asset_category: "template",
          visibility,
          original_file_name: fileName,
          user_id: user.id,
          source: "kanvas-lyrics",
          duration_ms: durationMs,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      // best-effort cleanup
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return json({ error: `Database error: ${dbError.message}` }, 500);
    }

    return json({
      success: true,
      assetId: asset.id,
      asset,
      url: urlData.publicUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return json({ error: err.message }, 401);
    }
    console.error("kanvas-lyrics-audio-register error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500
    );
  }
});
