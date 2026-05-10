import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "master" | "coordenador" | "comentador" | "admin" | "user" | null;
/**
 * Status de aprovação. `rejected` é mantido apenas como fallback para
 * registros legados ainda não migrados — o valor canônico atual é `blocked`.
 */
export type ProfileStatus = "pending" | "approved" | "blocked" | "rejected";

export interface Permissions {
  loading: boolean;
  role: AppRole;
  status: ProfileStatus | null;
  userLabel: string | null;
  mustChangePassword: boolean;
  isMaster: boolean;
  canEdit: boolean;
  canComment: boolean;
  canDeleteCategory: boolean;
  isApproved: boolean;
  isBlocked: boolean;
  refresh: () => Promise<void>;
}

export function usePermissions(userId: string | null): Permissions {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const load = async () => {
    if (!userId) {
      setRole(null);
      setStatus(null);
      setUserLabel(null);
      setMustChangePassword(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("status, user_label, must_change_password")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setStatus((profileRow?.status as ProfileStatus) ?? "pending");
    setUserLabel((profileRow?.user_label as string | null) ?? null);
    setMustChangePassword(Boolean(profileRow?.must_change_password));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isMaster = role === "master";
  const canEdit = role === "master" || role === "coordenador";
  const canComment = canEdit || role === "comentador";
  const canDeleteCategory = isMaster;
  const isApproved = status === "approved";
  const isBlocked = status === "blocked" || status === "rejected";

  return {
    loading,
    role,
    status,
    userLabel,
    mustChangePassword,
    isMaster,
    canEdit,
    canComment,
    canDeleteCategory,
    isApproved,
    isBlocked,
    refresh: load,
  };
}
