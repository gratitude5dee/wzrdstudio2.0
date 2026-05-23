import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { errorResponse, handleCors, successResponse } from "../_shared/response.ts";

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

type VaultItem = Record<string, any>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
  }
  return value;
}

async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function inferMediaKind(item: VaultItem): string {
  const value = String(item.media_type ?? item.media_url ?? "");
  if (value.startsWith("image") || /\.(png|jpe?g|gif|webp|avif)$/i.test(value)) return "image";
  if (value.startsWith("video") || /\.(mp4|webm|mov|m4v)$/i.test(value)) return "video";
  if (value.startsWith("audio") || /\.(mp3|wav|m4a|ogg)$/i.test(value)) return "audio";
  return "asset";
}

function ipfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function buildStoryMetadata(item: VaultItem, mediaIpfsUri: string | null) {
  const mediaKind = inferMediaKind(item);
  const mediaUri = mediaIpfsUri ?? item.media_url ?? undefined;
  const thumbnailUri = item.thumbnail_url ?? item.media_url ?? mediaUri;
  const description =
    typeof item.description === "string" && item.description.trim()
      ? item.description.trim()
      : `WorldStudio ${item.asset_kind} finalized from ${String(item.source_type).replaceAll("_", " ")}.`;

  const attributes = [
    { key: "Source Type", value: item.source_type },
    { key: "Source ID", value: item.source_id },
    { key: "Asset Kind", value: item.asset_kind },
    { key: "Story Network", value: item.story_network },
    { key: "Relationship", value: item.relationship_type },
  ].map((attribute) => ({ key: attribute.key, value: String(attribute.value ?? "") }));

  const ipMetadata = {
    title: item.title,
    description,
    createdAt: item.created_at,
    creators: [
      {
        name: "WorldStudio creator",
        contributionPercent: 100,
      },
    ],
    image: thumbnailUri,
    mediaUrl: mediaUri,
    mediaType: item.media_type ?? mediaKind,
    ipType: item.asset_kind || mediaKind,
    tags: ["worldstudio", item.asset_kind, mediaKind].filter(Boolean),
    attributes,
  };

  const nftMetadata: Record<string, unknown> = {
    name: item.title,
    description,
    image: thumbnailUri ?? mediaUri,
    attributes: attributes.map((attribute) => ({
      trait_type: attribute.key,
      value: attribute.value,
    })),
  };

  if (mediaKind === "video" || mediaKind === "audio") {
    nftMetadata.animation_url = mediaUri;
  }

  return { ipMetadata, nftMetadata };
}

async function pinFileToPinata(jwt: string, item: VaultItem): Promise<{ uri: string | null; hash: string | null }> {
  if (!item.media_url) {
    return { uri: null, hash: null };
  }

  const mediaResponse = await fetch(item.media_url);
  if (!mediaResponse.ok) {
    throw new Error(`Failed to fetch media for pinning (${mediaResponse.status}).`);
  }

  const mediaBytes = new Uint8Array(await mediaResponse.arrayBuffer());
  const contentType = mediaResponse.headers.get("content-type") ?? item.media_type ?? "application/octet-stream";
  const filename = fileNameFromUrl(item.media_url, `${item.id}-media`);
  const form = new FormData();
  form.append("file", new File([mediaBytes], filename, { type: contentType }));
  form.append("pinataMetadata", JSON.stringify({ name: filename }));

  const pinResponse = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const payload = await pinResponse.json().catch(() => null);
  if (!pinResponse.ok || !payload?.IpfsHash) {
    throw new Error(payload?.error?.details ?? payload?.error ?? "Pinata media pin failed.");
  }

  return {
    uri: ipfsUri(payload.IpfsHash),
    hash: `0x${await sha256Hex(mediaBytes)}`,
  };
}

async function pinJsonToPinata(jwt: string, name: string, body: unknown) {
  const response = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: body,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.IpfsHash) {
    throw new Error(payload?.error?.details ?? payload?.error ?? "Pinata JSON pin failed.");
  }

  return {
    uri: ipfsUri(payload.IpfsHash),
    hash: `0x${await sha256Hex(stableJsonStringify(body))}`,
  };
}

async function verifySourceOwnership(supabase: any, item: VaultItem, userId: string) {
  if (item.user_id !== userId) {
    throw new AuthError("IP Vault item does not belong to the authenticated user.");
  }

  if (item.source_type === "project_asset") {
    const { data, error } = await supabase
      .from("project_assets")
      .select("id,user_id,project_id")
      .eq("id", item.source_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.user_id && data.user_id !== userId) throw new AuthError("Source asset is not owned by this user.");
    return;
  }

  if (item.source_type === "final_project_asset") {
    const { data, error } = await supabase
      .from("final_project_assets")
      .select("id,user_id")
      .eq("id", item.source_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId) throw new AuthError("Final source asset is not owned by this user.");
    return;
  }

  if (item.source_type === "character_blueprint") {
    const { data, error } = await supabase
      .from("character_blueprints")
      .select("id,user_id")
      .eq("id", item.source_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId) throw new AuthError("Character source is not owned by this user.");
    return;
  }

  if (item.source_type === "generation_output" && item.project_id) {
    const { data, error } = await supabase
      .from("projects")
      .select("id,user_id")
      .eq("id", item.project_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId) throw new AuthError("Generation source project is not owned by this user.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const user = await authenticateRequest(req.headers);
    const pinataJwt = Deno.env.get("PINATA_JWT");
    if (!pinataJwt) {
      return errorResponse("PINATA_JWT is not configured", 500);
    }

    const body = await req.json().catch(() => ({}));
    const itemId = typeof body.itemId === "string" ? body.itemId : null;
    if (!itemId) {
      return errorResponse("itemId is required", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: item, error: loadError } = await supabase
      .from("ip_vault_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!item) {
      return errorResponse("IP Vault item not found", 404);
    }

    await verifySourceOwnership(supabase, item, user.id);

    const mediaPin = await pinFileToPinata(pinataJwt, item);
    const { ipMetadata, nftMetadata } = buildStoryMetadata(item, mediaPin.uri);
    const ipPin = await pinJsonToPinata(pinataJwt, `${item.id}-story-ip-metadata.json`, ipMetadata);
    const nftPin = await pinJsonToPinata(pinataJwt, `${item.id}-story-nft-metadata.json`, nftMetadata);

    const proofPacket = {
      ...asRecord(item.proof_packet),
      ipfs: {
        mediaUri: mediaPin.uri,
        mediaHash: mediaPin.hash,
        ipMetadataUri: ipPin.uri,
        ipMetadataHash: ipPin.hash,
        nftMetadataUri: nftPin.uri,
        nftMetadataHash: nftPin.hash,
      },
      metadataPinnedAt: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await supabase
      .from("ip_vault_items")
      .update({
        registration_status: "metadata_ready",
        media_hash: mediaPin.hash,
        ip_metadata_uri: ipPin.uri,
        ip_metadata_hash: ipPin.hash,
        nft_metadata_uri: nftPin.uri,
        nft_metadata_hash: nftPin.hash,
        proof_packet: proofPacket,
      })
      .eq("id", item.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return successResponse({
      item: updated,
      mediaIpfsUri: mediaPin.uri,
      mediaHash: mediaPin.hash,
      ipMetadataUri: ipPin.uri,
      ipMetadataHash: ipPin.hash,
      nftMetadataUri: nftPin.uri,
      nftMetadataHash: nftPin.hash,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to pin Story metadata", 500);
  }
});
