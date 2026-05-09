import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/error-handling";

export interface ItemComment {
  id: string;
  list_id: string;
  item_key: string;
  user_id: string;
  text: string;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  author_name?: string | null;
  author_label?: string | null;
}

/** Comments for a single (list,item). Hides resolved + expired automatically via RLS for non-editors. */
export function useItemComments(listId: string | null, itemKey: string | null) {
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!listId || !itemKey) {
      setComments([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("item_comments")
      .select("*")
      .eq("list_id", listId)
      .eq("item_key", itemKey)
      .order("created_at", { ascending: true });
    if (error) {
      handleSupabaseError(error, "load");
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as ItemComment[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, user_label")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      for (const c of rows) {
        const p = map.get(c.user_id);
        c.author_name = p?.display_name ?? null;
        c.author_label = p?.user_label ?? null;
      }
    }
    setComments(rows);
    setLoading(false);
  }, [listId, itemKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = async (text: string, userId: string) => {
    if (!listId || !itemKey || !text.trim()) return;
    const { error } = await supabase.from("item_comments").insert({
      list_id: listId,
      item_key: itemKey,
      user_id: userId,
      text: text.trim(),
    });
    if (error) return handleSupabaseError(error, "save");
    reload();
  };

  const resolve = async (id: string, userId: string) => {
    const { error } = await supabase
      .from("item_comments")
      .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", id);
    if (error) return handleSupabaseError(error, "save");
    reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("item_comments").delete().eq("id", id);
    if (error) return handleSupabaseError(error, "delete");
    reload();
  };

  const openCount = comments.filter((c) => !c.resolved_at).length;

  return { comments, loading, add, resolve, remove, reload, openCount };
}

export interface ItemCommentSummary {
  count: number;
  lastAuthorName: string | null;
  lastAuthorLabel: string | null;
  lastCreatedAt: string | null;
}

/** Summary of open comments per item (count + last author). */
export async function fetchOpenCommentSummaryByItem(
  listId: string,
): Promise<Map<string, ItemCommentSummary>> {
  const { data, error } = await supabase
    .from("item_comments")
    .select("item_key, user_id, created_at")
    .eq("list_id", listId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) return new Map();
  const userIds = Array.from(new Set((data ?? []).map((r) => r.user_id)));
  const profMap = new Map<string, { display_name: string | null; user_label: string | null }>();
  if (userIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, user_label")
      .in("id", userIds);
    for (const p of profs ?? []) {
      profMap.set(p.id, { display_name: p.display_name, user_label: p.user_label });
    }
  }
  const map = new Map<string, ItemCommentSummary>();
  for (const r of data ?? []) {
    const k = r.item_key as string;
    const cur = map.get(k);
    if (!cur) {
      const prof = profMap.get(r.user_id as string);
      map.set(k, {
        count: 1,
        lastAuthorName: prof?.display_name ?? null,
        lastAuthorLabel: prof?.user_label ?? null,
        lastCreatedAt: r.created_at as string,
      });
    } else {
      cur.count += 1;
    }
  }
  return map;
}

/** @deprecated Use fetchOpenCommentSummaryByItem. Kept for compat. */
export async function fetchOpenCommentsByItem(listId: string) {
  const sum = await fetchOpenCommentSummaryByItem(listId);
  const out = new Map<string, number>();
  for (const [k, v] of sum) out.set(k, v.count);
  return out;
}

export interface OpenCommentRow {
  id: string;
  list_id: string;
  item_key: string;
  text: string;
  created_at: string;
  expires_at: string;
  user_id: string;
  author_name: string | null;
  author_label: string | null;
}

/** All open comments across all lists, with author info. */
export async function fetchAllOpenComments(): Promise<OpenCommentRow[]> {
  const { data, error } = await supabase
    .from("item_comments")
    .select("id, list_id, item_key, text, created_at, expires_at, user_id")
    .is("resolved_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Omit<OpenCommentRow, "author_name" | "author_label">[];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const profMap = new Map<string, { display_name: string | null; user_label: string | null }>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, user_label")
      .in("id", ids);
    for (const p of profs ?? []) {
      profMap.set(p.id, { display_name: p.display_name, user_label: p.user_label });
    }
  }
  return rows.map((r) => ({
    ...r,
    author_name: profMap.get(r.user_id)?.display_name ?? null,
    author_label: profMap.get(r.user_id)?.user_label ?? null,
  }));
}

export async function resolveCommentById(id: string, userId: string) {
  const { error } = await supabase
    .from("item_comments")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id);
  if (error) handleSupabaseError(error, "save");
}

export async function deleteCommentById(id: string) {
  const { error } = await supabase.from("item_comments").delete().eq("id", id);
  if (error) handleSupabaseError(error, "delete");
}
