import { supabase } from "@/integrations/supabase/client";

/**
 * Registro de atividades. NÃO grava dados sensíveis:
 * - sem senhas, sem tokens completos, sem conteúdo de listas.
 * - metadata deve conter apenas identificadores curtos / contagens.
 *
 * Falhas de logging são silenciosas — nunca devem quebrar o fluxo do usuário.
 */
export type ActivityAction =
  | "user.approve"
  | "user.block"
  | "user.reactivate"
  | "user.role_change"
  | "user.password_reset"
  | "list.create"
  | "list.update"
  | "list.delete"
  | "share.create"
  | "share.revoke";

export async function logActivity(
  action: ActivityAction,
  entityType: string | null,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return;
    await supabase.from("activity_logs").insert({
      user_id: uid,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: sanitize(metadata),
    });
  } catch {
    // logging nunca pode interromper o fluxo
  }
}

/** Remove campos potencialmente sensíveis e limita o tamanho. */
function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const BANNED = /password|secret|token|authorization|cookie/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (BANNED.test(k)) continue;
    if (typeof v === "string" && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
