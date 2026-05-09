import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useArk } from "./store";
import { migrateComponentList, type ComponentList } from "./component-lists";
import { toast } from "sonner";

interface RowDB {
  id: string;
  name: string;
  data: ComponentList;
  client_updated_at: string;
}

/**
 * Syncs `componentLists` between local zustand store and Supabase `component_lists`
 * for the authenticated user. Strategy:
 *   - On user change: pull all rows, migrate localStorage-only lists up to the cloud once.
 *   - On local changes: debounced upsert per modified list; delete removed lists.
 */
export function useCloudSync(userId: string | null) {
  const lastSyncedRef = useRef<Map<string, number>>(new Map());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load on user change
  useEffect(() => {
    if (!userId) {
      initializedRef.current = null;
      lastSyncedRef.current.clear();
      knownIdsRef.current.clear();
      return;
    }
    if (initializedRef.current === userId) return;
    initializedRef.current = userId;

    (async () => {
      const { data, error } = await supabase
        .from("component_lists")
        .select("id, name, data, client_updated_at")
        .order("client_updated_at", { ascending: false });

      if (error) {
        toast.error("Falha ao carregar listas da nuvem: " + error.message);
        return;
      }

      const cloudRows = (data ?? []) as unknown as RowDB[];
      const cloudMap = new Map<string, ComponentList>();
      for (const r of cloudRows) {
        cloudMap.set(r.id, migrateComponentList(r.data));
        lastSyncedRef.current.set(r.id, new Date(r.client_updated_at).getTime());
        knownIdsRef.current.add(r.id);
      }

      const localLists = useArk.getState().componentLists;
      const localMap = new Map(localLists.map((l) => [l.id, l]));

      // Lists in local but not in cloud → first-time migration push
      const toUpload: ComponentList[] = [];
      for (const l of localLists) {
        if (!cloudMap.has(l.id)) toUpload.push(l);
      }

      if (toUpload.length) {
        const { error: upErr } = await supabase.from("component_lists").upsert(
          toUpload.map((l) => ({
            id: l.id,
            user_id: userId,
            name: l.name,
            data: l as unknown as never,
            client_updated_at: new Date(l.updatedAt).toISOString(),
          })),
        );
        if (upErr) {
          toast.error("Falha ao enviar listas locais para a nuvem: " + upErr.message);
        } else {
          for (const l of toUpload) {
            lastSyncedRef.current.set(l.id, l.updatedAt);
            knownIdsRef.current.add(l.id);
          }
          toast.success(`${toUpload.length} lista(s) local(is) enviadas para a nuvem.`);
        }
      }

      // Merge: cloud wins for IDs that exist in cloud (authoritative). Local-only IDs remain.
      const merged: ComponentList[] = [];
      const seen = new Set<string>();
      for (const r of cloudRows) {
        merged.push(cloudMap.get(r.id)!);
        seen.add(r.id);
      }
      for (const l of localLists) {
        if (!seen.has(l.id)) merged.push(l);
      }

      useArk.setState({ componentLists: merged });
    })();
  }, [userId]);

  // Subscribe to local changes and debounce upserts
  useEffect(() => {
    if (!userId) return;

    const flush = async () => {
      const lists = useArk.getState().componentLists;
      const synced = lastSyncedRef.current;
      const known = knownIdsRef.current;

      // Detect deletions
      const currentIds = new Set(lists.map((l) => l.id));
      const removed: string[] = [];
      for (const id of known) if (!currentIds.has(id)) removed.push(id);

      // Detect changes
      const changed: ComponentList[] = [];
      for (const l of lists) {
        const last = synced.get(l.id);
        if (last == null || l.updatedAt > last) changed.push(l);
      }

      if (removed.length) {
        const { error } = await supabase.from("component_lists").delete().in("id", removed);
        if (error) {
          toast.error("Falha ao remover lista da nuvem: " + error.message);
        } else {
          for (const id of removed) {
            synced.delete(id);
            known.delete(id);
          }
        }
      }

      if (changed.length) {
        const { error } = await supabase.from("component_lists").upsert(
          changed.map((l) => ({
            id: l.id,
            user_id: userId,
            name: l.name,
            data: l as unknown as never,
            client_updated_at: new Date(l.updatedAt).toISOString(),
          })),
        );
        if (error) {
          toast.error("Falha ao salvar na nuvem: " + error.message);
        } else {
          for (const l of changed) {
            synced.set(l.id, l.updatedAt);
            known.add(l.id);
          }
        }
      }
    };

    const unsub = useArk.subscribe((state, prev) => {
      if (state.componentLists === prev.componentLists) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        flush();
      }, 800);
    });

    // Flush on unload (best-effort)
    const onBeforeUnload = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        flush();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsub();
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId]);
}
