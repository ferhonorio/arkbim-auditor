import { useMemo, useState } from "react";
import { useArk } from "@/lib/store";
import type { ComponentList } from "@/lib/component-lists";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  list: ComponentList;
}

export function FloorMappingPanel({ list }: Props) {
  const dataset = useArk((s) => s.dataset);
  const setAlias = useArk((s) => s.setFloorAlias);
  const reapply = useArk((s) => s.reapplyFloorAliases);

  const aliases = list.floorAliases ?? {};

  const rawValues = useMemo(() => {
    const set = new Set<string>();
    // From existing occurrences
    for (const i of list.items) for (const o of i.occurrences) {
      // floor here may already be aliased; we still track it but also include keys from aliases map
      set.add(o.floor);
    }
    for (const k of Object.keys(aliases)) set.add(k);
    // From current dataset
    if (dataset && list.floorColumn && dataset.columns.includes(list.floorColumn)) {
      for (const r of dataset.rows) {
        const v = (r[list.floorColumn] ?? "").trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort();
  }, [list.items, list.floorColumn, aliases, dataset]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const valueOf = (raw: string) =>
    drafts[raw] !== undefined ? drafts[raw] : aliases[raw] ?? "";

  const save = (raw: string) => {
    setAlias(list.id, raw, valueOf(raw));
    setDrafts((d) => {
      const n = { ...d };
      delete n[raw];
      return n;
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Nomes de pavimentos</h4>
          <p className="text-[11px] text-muted-foreground">
            Mapeie cada valor da coluna <strong>{list.floorColumn}</strong> a um
            nome amigável (ex.: <em>MO-0101…rvt → PAVIMENTO TÉRREO</em>). Ficam
            salvos por categoria.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            reapply(list.id);
            toast.success("Pavimentos reescritos com os nomes mapeados");
          }}
        >
          Aplicar agora
        </Button>
      </div>
      {rawValues.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum valor de pavimento detectado ainda.
        </p>
      ) : (
        <div className="max-h-72 space-y-1 overflow-auto">
          {rawValues.map((raw) => (
            <div key={raw} className="flex items-center gap-2">
              <Badge variant="outline" className="max-w-[260px] truncate text-[10px]" title={raw}>
                {raw}
              </Badge>
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                value={valueOf(raw)}
                placeholder="Nome amigável"
                onChange={(e) => setDrafts((d) => ({ ...d, [raw]: e.target.value }))}
                onBlur={() => save(raw)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    save(raw);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="h-7 max-w-xs text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
