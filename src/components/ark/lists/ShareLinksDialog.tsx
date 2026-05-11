import { useEffect, useState } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  buildShareUrl,
  createShareLink,
  formatShareUrlDisplay,
  listShareLinks,
  revokeShareLink,
  updateShareLinkNote,
  type ShareLinkRow,
} from "@/lib/share-links";
import { handleSupabaseError } from "@/lib/error-handling";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Pencil, Check } from "lucide-react";
import { logActivity } from "@/lib/activity-log";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: "all" | "category";
  listId?: string;
  listName?: string;
}

const VALIDITY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "Sem expiração", days: null },
];

export function ShareLinksDialog({ open, onOpenChange, scope, listId, listName }: Props) {
  const { user } = useAuth();
  const [validity, setValidity] = useState<string>("15");
  const [note, setNote] = useState<string>("");
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [accessCounts, setAccessCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState<string>("");

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await listShareLinks(scope, listId);
      setLinks(rows);
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: logs } = await supabase
          .from("share_link_access_logs")
          .select("link_id")
          .in("link_id", ids);
        const counts: Record<string, number> = {};
        for (const l of logs ?? []) {
          const k = (l as { link_id: string }).link_id;
          counts[k] = (counts[k] ?? 0) + 1;
        }
        setAccessCounts(counts);
      } else {
        setAccessCounts({});
      }
    } catch (e) {
      handleSupabaseError(e as { message?: string }, "load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, listId]);

  const handleCreate = async () => {
    if (!user?.id) return;
    setCreating(true);
    try {
      const days = validity === "null" ? null : Number(validity);
      const row = await createShareLink(
        { scope, listId, expiresInDays: days },
        user.id,
      );
      const url = buildShareUrl(row.token);
      void logActivity("share.create", "share_link", row.id, {
        scope,
        list_id: listId ?? null,
        expires_in_days: days,
      });
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link gerado e copiado");
      } catch {
        toast.success("Link gerado");
      }
      reload();
    } catch (e) {
      handleSupabaseError(e as { message?: string }, "save");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(token));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Revogar este link? Quem o tiver não conseguirá mais acessar.")) return;
    try {
      await revokeShareLink(id);
      void logActivity("share.revoke", "share_link", id, {});
      toast.success("Link revogado");
      reload();
    } catch (e) {
      handleSupabaseError(e as { message?: string }, "delete");
    }
  };

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return "Sem expiração";
    const d = new Date(iso);
    const expired = d.getTime() < Date.now();
    return `${expired ? "Expirado em " : "Expira em "}${d.toLocaleString("pt-BR")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Compartilhar
            {scope === "category" && listName ? ` — ${listName}` : " (todas as listas)"}
          </DialogTitle>
          <DialogDescription>
            Gere um link público (somente leitura). O link é gerado para o domínio atual
            em que você está acessando o sistema. Pessoas sem cadastro acessam direto pelo link.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Validade</label>
            <Select value={validity} onValueChange={setValidity}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALIDITY_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.label}
                    value={o.days === null ? "null" : String(o.days)}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? "Gerando…" : "Gerar novo link"}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">
              Links existentes
            </h4>
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
              Atualizar
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {links.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground">Nenhum link gerado ainda.</p>
            )}
            {links.map((l) => {
              const expired = l.expires_at && new Date(l.expires_at).getTime() < Date.now();
              const inactive = !l.is_active;
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-md border p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono" title={buildShareUrl(l.token)}>
                      {formatShareUrlDisplay(l.token)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground">
                      {inactive ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Revogado
                        </Badge>
                      ) : expired ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Expirado
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                          Ativo
                        </Badge>
                      )}
                      <span>{fmtExpiry(l.expires_at)}</span>
                      <span>· {accessCounts[l.id] ?? 0} acesso(s)</span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopy(l.token)}
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {l.is_active && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleRevoke(l.id)}
                      title="Revogar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
