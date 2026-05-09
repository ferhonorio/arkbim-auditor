import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, RefreshCw } from "lucide-react";

type AssignableRole = "coordenador" | "comentador" | "visualizador";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  status: "pending" | "approved" | "rejected";
  role: string | null;
  created_at: string;
}

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, status, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Falha ao carregar usuários: " + error.message);
      setLoading(false);
      return;
    }
    const ids = (profiles ?? []).map((p) => p.id);
    const { data: roles } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as { user_id: string; role: string }[] };
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    setRows(
      (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        status: p.status as UserRow["status"],
        created_at: p.created_at,
        role: roleMap.get(p.id) ?? null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: UserRow["status"]) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    load();
  };

  const assignRole = async (id: string, role: AssignableRole) => {
    // remove existing role then insert (1 role per user)
    await supabase.from("user_roles").delete().eq("user_id", id);
    const { error } = await supabase.from("user_roles").insert({ user_id: id, role });
    if (error) return toast.error(error.message);
    toast.success("Permissão atualizada");
    load();
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
            Aprove novos cadastros e defina o tipo de permissão de cada usuário.
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
                          <SelectItem value="visualizador">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isMaster || isMe ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {r.status !== "approved" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "approved")}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                          </Button>
                        )}
                        {r.status !== "rejected" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}>
                            <X className="mr-1 h-3.5 w-3.5" /> Rejeitar
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
