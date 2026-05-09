import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchAllOpenComments,
  resolveCommentById,
  deleteCommentById,
  type OpenCommentRow,
} from "@/lib/comments";
import { useArk } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Props {
  /** Switches to the consolidated lists tab and selects the given list+item. */
  onNavigateToItem: (listId: string, itemKey: string) => void;
}

function timeRemaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `expira em ${days} dia${days === 1 ? "" : "s"}`;
}

export function CommentsCenter({ onNavigateToItem }: Props) {
  const { user } = useAuth();
  const lists = useArk((s) => s.componentLists);
  const [rows, setRows] = useState<OpenCommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const data = await fetchAllOpenComments();
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const listNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lists) m.set(l.id, l.name);
    return m;
  }, [lists]);

  const grouped = useMemo(() => {
    const m = new Map<string, { listName: string; items: OpenCommentRow[] }>();
    for (const r of rows) {
      const name = listNameById.get(r.list_id) ?? "(categoria removida)";
      if (!m.has(r.list_id)) m.set(r.list_id, { listName: name, items: [] });
      m.get(r.list_id)!.items.push(r);
    }
    return Array.from(m, ([listId, v]) => ({ listId, ...v })).sort((a, b) =>
      a.listName.localeCompare(b.listName),
    );
  }, [rows, listNameById]);

  const handleResolve = async (r: OpenCommentRow) => {
    if (!user?.id) return;
    await resolveCommentById(r.id, user.id);
    toast.success("Comentário resolvido");
    reload();
  };

  const handleDelete = async (r: OpenCommentRow) => {
    if (!window.confirm("Remover este comentário?")) return;
    await deleteCommentById(r.id);
    toast.success("Comentário removido");
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Comentários abertos</h2>
          <p className="text-xs text-muted-foreground">
            Todos os comentários ativos das listas consolidadas, agrupados por categoria.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {!loading && grouped.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-6 w-6" />
          Nenhum comentário aberto no momento.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <div key={g.listId} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{g.listName}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {g.items.length}
                </Badge>
              </div>
            </div>
            <ul className="divide-y">
              {g.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.item_key}
                      </Badge>
                      <span className="truncate font-medium text-foreground">
                        {r.author_name ?? "Usuário"}
                      </span>
                      {r.author_label && (
                        <Badge variant="secondary" className="text-[9px]">
                          {r.author_label}
                        </Badge>
                      )}
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                      <span>·</span>
                      <span>{timeRemaining(r.expires_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateToItem(r.list_id, r.item_key)}
                      title="Abrir na categoria"
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Ir para item
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleResolve(r)}
                      title="Marcar como resolvido"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(r)}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
