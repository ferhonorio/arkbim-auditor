import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "master" | "coordenador" | "comentador" | "visualizador" | "admin" | "user" | null;
export type ProfileStatus = "pending" | "approved" | "rejected";

export interface Permissions {
  loading: boolean;
  role: AppRole;
  status: ProfileStatus | null;
  isMaster: boolean;
  canEdit: boolean;
  canComment: boolean;
  isApproved: boolean;
  refresh: () => Promise<void>;
}

export function usePermissions(userId: string | null): Permissions {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [status, setStatus] = useState<ProfileStatus | null>(null);

  const load = async () => {
    if (!userId) {
      setRole(null);
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("status").eq("id", userId).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setStatus((profileRow?.status as ProfileStatus) ?? "pending");
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isMaster = role === "master";
  const canEdit = role === "master" || role === "coordenador";
  const canComment = canEdit || role === "comentador";
  const isApproved = status === "approved";

  return { loading, role, status, isMaster, canEdit, canComment, isApproved, refresh: load };
}
