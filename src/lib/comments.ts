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

/** Lightweight count fetcher for many items at once (open & not expired). */
export async function fetchOpenCommentsByItem(listId: string) {
  const { data, error } = await supabase
    .from("item_comments")
    .select("item_key")
    .eq("list_id", listId)
    .is("resolved_at", null);
  if (error) return new Map<string, number>();
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const k = (r as { item_key: string }).item_key;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
