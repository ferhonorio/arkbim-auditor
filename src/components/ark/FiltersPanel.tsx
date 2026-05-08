import { Plus, Minus, Save, Trash2 } from "lucide-react";
import { useArk } from "@/lib/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Filter, FilterOp } from "@/lib/grouping";
import { useState } from "react";
import { toast } from "sonner";

const OPS: FilterOp[] = [
  "preenchido",
  "vazio",
  "igual a",
  "diferente de",
  "contem",
  "nao contem",
];

export function FiltersPanel() {
  const dataset = useArk((s) => s.dataset);
  const filters = useArk((s) => s.filters);
  const setFilters = useArk((s) => s.setFilters);
  const presets = useArk((s) => s.filterPresets);
  const savePreset = useArk((s) => s.saveFilterPreset);
  const loadPreset = useArk((s) => s.loadFilterPreset);
  const deletePreset = useArk((s) => s.deleteFilterPreset);
  const [open, setOpen] = useState(true);

  const cols = dataset?.columns ?? [];

  const add = () => {
    setFilters([
      ...filters,
      { id: crypto.randomUUID(), column: cols[0] ?? "", op: "preenchido", value: "" },
    ]);
  };
  const remove = (id: string) => setFilters(filters.filter((f) => f.id !== id));
  const update = (id: string, patch: Partial<Filter>) =>
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const handleSave = () => {
    const name = window.prompt("Nome do preset de filtros:");
    if (name?.trim()) {
      savePreset(name.trim());
      toast.success("Filtro salvo");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filtros</h3>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setOpen(!open)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background/50 p-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSave}>
              <Save className="mr-1 h-3 w-3" /> Salvar
            </Button>
            {presets.length > 0 && (
              <Select value="" onValueChange={(v) => loadPreset(v)}>
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="Carregar preset" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <div key={p.id} className="flex items-center">
                      <SelectItem value={p.id} className="flex-1">{p.name}</SelectItem>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deletePreset(p.id); }}
                        className="px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {filters.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum filtro ativo.</p>
          )}
          {filters.map((f) => (
            <div key={f.id} className="space-y-2 rounded-md border bg-background p-2">
              <Select
                value={f.column}
                onValueChange={(v) => update(f.id, { column: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Coluna" />
                </SelectTrigger>
                <SelectContent>
                  {cols.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={f.op}
                onValueChange={(v) => update(f.id, { op: v as FilterOp })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.op !== "preenchido" && f.op !== "vazio" && (
                <Input
                  className="h-8 text-xs"
                  placeholder="Valor"
                  value={f.value}
                  onChange={(e) => update(f.id, { value: e.target.value })}
                />
              )}
              <button
                onClick={() => remove(f.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
