import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useArk } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function ColumnsPanel() {
  const dataset = useArk((s) => s.dataset);
  const hidden = useArk((s) => s.hiddenColumns);
  const setHidden = useArk((s) => s.setHiddenColumns);
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");

  const cols = dataset?.columns ?? [];
  const filtered = cols.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  const toggle = (c: string) => {
    if (hidden.includes(c)) setHidden(hidden.filter((x) => x !== c));
    else setHidden([...hidden, c]);
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Colunas</h3>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setHidden([])}
          >
            Mostrar tudo
          </button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setOpen(!open)}
        >
          {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <Input
            className="h-8 text-xs"
            placeholder="Buscar coluna"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-[300px] space-y-1 overflow-y-auto">
            {filtered.map((c) => (
              <label
                key={c}
                className="flex cursor-pointer items-center gap-2 rounded p-1 text-xs hover:bg-accent"
              >
                <Checkbox checked={!hidden.includes(c)} onCheckedChange={() => toggle(c)} />
                <span className="flex-1 truncate">{c}</span>
              </label>
            ))}
            {!cols.length && (
              <p className="text-xs text-muted-foreground">Carregue um arquivo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
