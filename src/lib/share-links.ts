import { supabase } from "@/integrations/supabase/client";

function randomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ShareLinkRow {
  id: string;
  token: string;
  scope: "all" | "category";
  list_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
  note: string | null;
}

export interface CreateShareLinkInput {
  scope: "all" | "category";
  listId?: string;
  expiresInDays?: number | null;
  note?: string | null;
}

export async function createShareLink(input: CreateShareLinkInput, userId: string) {
  const token = randomToken();
  const expires_at = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const trimmedNote = (input.note ?? "").trim();
  const payload = {
    token,
    scope: input.scope,
    list_id: input.scope === "category" ? (input.listId ?? null) : null,
    expires_at,
    is_active: true,
    created_by: userId,
    note: trimmedNote ? trimmedNote.slice(0, 120) : null,
  };
  const { data, error } = await supabase
    .from("public_share_links")
    .insert(payload)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ShareLinkRow;
}

export async function listShareLinks(scope?: "all" | "category", listId?: string) {
  let q = supabase
    .from("public_share_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (scope) q = q.eq("scope", scope);
  if (listId) q = q.eq("list_id", listId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ShareLinkRow[];
}

export async function revokeShareLink(id: string) {
  const { error } = await supabase
    .from("public_share_links")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Public share base URL. Always points to the published custom domain
 * (edise.ld.arkbim.com) which is public and does not require login.
 * Preview/lovable.app domains require Lovable auth, so we never use them
 * for shared links — even when the editor is using the preview.
 * Override via VITE_PUBLIC_SHARE_BASE_URL if needed.
 */
const PUBLIC_SHARE_DOMAIN = "https://edise.ld.arkbim.com";

function getShareBaseUrl(): string {
  const envBase = (import.meta.env.VITE_PUBLIC_SHARE_BASE_URL as string | undefined)
    ?.replace(/\/$/, "");
  if (envBase) return envBase;
  // If user is already on the public custom domain, use it. Otherwise
  // (preview, lovable.app, localhost), force the public custom domain.
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === "edise.ld.arkbim.com") return window.location.origin;
  }
  return PUBLIC_SHARE_DOMAIN;
}

export function buildShareUrl(token: string) {
  return `${getShareBaseUrl()}/share/${token}`;
}

/** Friendly display version of the link (host + truncated token). */
export function formatShareUrlDisplay(token: string) {
  const base = getShareBaseUrl();
  const host = base.replace(/^https?:\/\//, "");
  const short = token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token;
  return `${host}/share/${short}`;
}
