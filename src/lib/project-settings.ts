import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_NAME = "ArkBIM";

/** Loads the singleton project name. Returns DEFAULT_NAME until loaded. */
export function useProjectName(): {
  projectName: string;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [projectName, setProjectName] = useState<string>(DEFAULT_NAME);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("project_name")
      .limit(1)
      .maybeSingle();
    setProjectName((data?.project_name ?? "").trim() || DEFAULT_NAME);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { projectName, loading, refresh };
}

export async function setProjectName(name: string, userId: string) {
  // Ensure singleton row exists
  const { data: existing } = await supabase
    .from("app_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const value = name.trim() || null;
  if (existing?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update({ project_name: value, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("app_settings")
      .insert({ project_name: value, updated_by: userId });
    if (error) throw error;
  }
}

export const DEFAULT_PROJECT_NAME = DEFAULT_NAME;
