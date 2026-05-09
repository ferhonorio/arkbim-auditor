import { useState } from "react";
import { MessageSquare, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useItemComments, type ItemComment } from "@/lib/comments";

interface Props {
  listId: string;
  itemKey: string;
  canComment: boolean;
  canModerate: boolean;
  /** Pre-loaded count of open comments — shown without opening the popover. */
  initialOpenCount?: number;
  /** Pre-loaded last author name (for tooltip). */
  lastAuthorName?: string | null;
  /** Pre-loaded last author label (for tooltip). */
  lastAuthorLabel?: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function timeRemaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `expira em ${days} dia${days === 1 ? "" : "s"}`;
}

export function ItemCommentsPopover({
  listId,
  itemKey,
  canComment,
  canModerate,
  initialOpenCount = 0,
  lastAuthorName,
  lastAuthorLabel,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { comments, add, resolve, remove, openCount, loading } = useItemComments(
    open ? listId : null,
    open ? itemKey : null,
  );

  const submit = async () => {
    if (!user?.id || !draft.trim()) return;
    await add(draft, user.id);
    setDraft("");
  };

  const displayCount = open ? openCount : initialOpenCount;
  const hasComments = displayCount > 0;
  const tooltip = hasComments
    ? `${displayCount} comentário${displayCount === 1 ? "" : "s"}${
        lastAuthorName
          ? ` · último por ${lastAuthorName}${lastAuthorLabel ? ` (${lastAuthorLabel})` : ""}`
          : ""
      }`
    : "Comentários";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={`relative h-6 w-6 ${hasComments ? "text-primary" : ""}`}
          title={tooltip}
        >
          <MessageSquare className={`h-3.5 w-3.5 ${hasComments ? "fill-primary/20" : ""}`} />
          {hasComments && (
            <Badge className="absolute -right-1.5 -top-1.5 h-3.5 min-w-3.5 px-1 text-[9px]">
              {displayCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold">Comentários — {itemKey}</h4>
            <p className="text-[10px] text-muted-foreground">
              Comentários expiram automaticamente em 15 dias.
            </p>
          </div>

          <div className="max-h-64 space-y-2 overflow-auto">
            {loading && (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            )}
            {!loading && comments.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum comentário.</p>
            )}
            {comments.map((c: ItemComment) => {
              const isMine = c.user_id === user?.id;
              return (
                <div
                  key={c.id}
                  className={`rounded border p-2 text-xs ${
                    c.resolved_at ? "border-dashed bg-muted/30 opacity-70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 truncate">
                      <span className="truncate font-medium">
                        {c.author_name ?? "Usuário"}
                      </span>
                      {c.author_label && (
                        <Badge variant="secondary" className="text-[9px]">
                          {c.author_label}
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words">{c.text}</p>
                  <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                    <span>
                      {c.resolved_at ? "resolvido" : timeRemaining(c.expires_at)}
                    </span>
                    <div className="flex gap-1">
                      {!c.resolved_at && canModerate && user?.id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          title="Marcar como resolvido"
                          onClick={() => resolve(c.id, user.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      {(isMine || canModerate) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-destructive"
                          title="Remover"
                          onClick={() => remove(c.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canComment && (
            <div className="space-y-1 border-t pt-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escreva um comentário…"
                className="min-h-[60px] text-xs"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                  Comentar
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
