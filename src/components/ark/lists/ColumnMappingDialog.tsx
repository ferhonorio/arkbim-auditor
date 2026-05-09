import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const IGNORE = "__ignore__";
const NEW = "__new__";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  /** Columns coming in from the dataset/preview (excluding key/floor). */
  incomingColumns: string[];
  /** Columns already present in the destination list. */
  existingColumns: string[];
  onConfirm: (mapping: Record<string, string | null>) => void;
}

const norm = (s: string) => s.trim().toLowerCase();

function autoSuggest(incoming: string, existing: string[]): string {
  const n = norm(incoming);
  const exact = existing.find((e) => norm(e) === n);
  if (exact) return exact;
  const partial = existing.find((e) => norm(e).includes(n) || n.includes(norm(e)));
  return partial ?? NEW;
}

export function ColumnMappingDialog({
  open,
  onOpenChange,
  incomingColumns,
  existingColumns,
  onConfirm,
}: Props) {
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of incomingColumns) m[c] = autoSuggest(c, existingColumns);
    return m;
  }, [incomingColumns, existingColumns]);
  const [map, setMap] = useState<Record<string, string>>(initial);

  const confirm = () => {
    const out: Record<string, string | null> = {};
    for (const [src, dst] of Object.entries(map)) {
      if (dst === IGNORE) out[src] = null;
      else if (dst === NEW) out[src] = src;
      else out[src] = dst;
    }
    onConfirm(out);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conferir mapeamento de colunas</DialogTitle>
          <DialogDescription>
            Algumas colunas do dataset não casam exatamente com as já existentes
            na lista. Confirme como cada uma deve ser registrada.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs">
              <tr>
                <th className="p-2 text-left">Coluna do dataset</th>
                <th className="p-2 text-left">Coluna na lista</th>
              </tr>
            </thead>
            <tbody>
              {incomingColumns.map((c) => (
                <tr key={c} className="border-b last:border-0">
                  <td className="p-2 align-middle">
                    <Badge variant="outline" className="text-[11px]">{c}</Badge>
                  </td>
                  <td className="p-2 align-middle">
                    <Select
                      value={map[c]}
                      onValueChange={(v) => setMap((m) => ({ ...m, [c]: v }))}
                    >
                      <SelectTrigger className="h-8 w-72 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW}>(criar nova: {c})</SelectItem>
                        <SelectItem value={IGNORE}>(ignorar)</SelectItem>
                        {existingColumns.map((e) => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirm}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
