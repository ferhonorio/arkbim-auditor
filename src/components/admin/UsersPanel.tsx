import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Check, X, RefreshCw, KeyRound, Copy } from "lucide-react";
import { handleSupabaseError } from "@/lib/error-handling";
import { useProjectName, setProjectName as saveProjectName } from "@/lib/project-settings";

type AssignableRole = "coordenador" | "comentador";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  user_label: string | null;
  status: "pending" | "approved" | "rejected";
  role: string | null;
  created_at: string;
}

function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({});
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const { projectName, refresh: refreshProjectName } = useProjectName();
  const [projectDraft, setProjectDraft] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  useEffect(() => { setProjectDraft(projectName); }, [projectName]);
  const onSaveProject = async () => {
    setSavingProject(true);
    try {
      await saveProjectName(projectDraft, currentUserId);
      await refreshProjectName();
      toast.success("Nome do projeto salvo");
    } catch (e) {
      handleSupabaseError(e as { message?: string }, "save");
    } finally {
      setSavingProject(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, user_label, status, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      handleSupabaseError(error, "load");
      setLoading(false);
      return;
    }
    const ids = (profiles ?? []).map((p) => p.id);
    const { data: roles } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as { user_id: string; role: string }[] };
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    const list: UserRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      display_name: p.display_name,
      user_label: p.user_label ?? null,
      status: p.status as UserRow["status"],
      created_at: p.created_at,
      role: roleMap.get(p.id) ?? null,
    }));
    setRows(list);
    setLabelDraft(Object.fromEntries(list.map((r) => [r.id, r.user_label ?? ""])));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: UserRow["status"]) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) return handleSupabaseError(error, "save");
    toast.success("Status atualizado");
    load();
  };

  const assignRole = async (id: string, role: AssignableRole) => {
    await supabase.from("user_roles").delete().eq("user_id", id);
    const { error } = await supabase.from("user_roles").insert({ user_id: id, role });
    if (error) return handleSupabaseError(error, "save");
    toast.success("Permissão atualizada");
    load();
  };

  const saveLabel = async (id: string) => {
    const value = (labelDraft[id] ?? "").trim() || null;
    const { error } = await supabase.from("profiles").update({ user_label: value }).eq("id", id);
    if (error) return handleSupabaseError(error, "save");
    toast.success("Etiqueta salva");
    load();
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const newPassword = generatePassword(12);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { user_id: resetTarget.id, new_password: newPassword },
      });
      if (error || (data as { ok?: boolean })?.ok === false) {
        throw error ?? new Error("reset_failed");
      }
      setResetResult({ email: resetTarget.email ?? "", password: newPassword });
      setResetTarget(null);
    } catch (e) {
      handleSupabaseError(e as { message?: string }, "save");
    } finally {
      setResetting(false);
    }
  };

  const statusBadge = (s: UserRow["status"]) => {
    if (s === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Aprovado</Badge>;
    if (s === "pending") return <Badge variant="secondary">Pendente</Badge>;
    return <Badge variant="destructive">Rejeitado</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gerenciar usuários</h2>
          <p className="text-sm text-muted-foreground">
            Aprove novos cadastros, defina permissões, etiquetas e redefina senhas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Permissão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isMe = r.id === currentUserId;
              const isMaster = r.role === "master";
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        value={labelDraft[r.id] ?? ""}
                        onChange={(e) =>
                          setLabelDraft((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                        placeholder="Ex.: Hidráulica"
                        className="h-8 w-40 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => saveLabel(r.id)}
                        disabled={(labelDraft[r.id] ?? "") === (r.user_label ?? "")}
                      >
                        Salvar
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>
                    {isMaster ? (
                      <Badge className="bg-primary">Master</Badge>
                    ) : (
                      <Select
                        value={(r.role as AssignableRole) ?? ""}
                        onValueChange={(v) => assignRole(r.id, v as AssignableRole)}
                        disabled={r.status !== "approved"}
                      >
                        <SelectTrigger className="h-8 w-44">
                          <SelectValue placeholder="Sem permissão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="coordenador">Coordenador</SelectItem>
                          <SelectItem value="comentador">Comentador</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isMe ? (
                      <span className="text-xs text-muted-foreground">você</span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {!isMaster && r.status !== "approved" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "approved")}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                          </Button>
                        )}
                        {!isMaster && r.status !== "rejected" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}>
                            <X className="mr-1 h-3.5 w-3.5" /> Rejeitar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResetTarget(r)}
                          title="Gerar senha temporária"
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" /> Redefinir senha
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir senha?</AlertDialogTitle>
            <AlertDialogDescription>
              Uma senha temporária será gerada para <strong>{resetTarget?.email}</strong>.
              O usuário será obrigado a definir uma nova senha no próximo login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset} disabled={resetting}>
              {resetting ? "Gerando…" : "Sim, redefinir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Senha temporária gerada</AlertDialogTitle>
            <AlertDialogDescription>
              Envie estas credenciais ao usuário <strong>{resetResult?.email}</strong> por um canal seguro.
              Esta janela é a única vez que a senha será exibida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="select-all">{resetResult?.password}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (resetResult?.password) {
                    navigator.clipboard.writeText(resetResult.password);
                    toast.success("Senha copiada");
                  }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResetResult(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
