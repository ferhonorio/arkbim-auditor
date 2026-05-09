import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { PresentationView } from "@/components/ark/lists/PresentationView";
import { migrateComponentList, type ComponentList } from "@/lib/component-lists";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "ArkBIM — Lista compartilhada" },
      { name: "description", content: "Visualização pública (somente leitura) de uma lista consolidada do ArkBIM." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharePage,
});

interface RpcResult {
  ok: boolean;
  reason?: string;
  scope?: "all" | "category";
  project_name?: string | null;
  lists?: { id: string; name: string; data: unknown; updated_at: string }[];
}

function SharePage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<ComponentList[]>([]);
  const [projectName, setProjectName] = useState<string>("ArkBIM");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_share_payload", { _token: token });
      if (!alive) return;
      if (error) {
        setError("Não foi possível carregar este link agora.");
        setLoading(false);
        return;
      }
      const res = (data as unknown) as RpcResult;
      if (!res?.ok) {
        if (res?.reason === "expired") setError("Este link expirou.");
        else if (res?.reason === "not_found") setError("Link inválido ou revogado.");
        else setError("Conteúdo indisponível.");
        setLoading(false);
        return;
      }
      const parsed: ComponentList[] = (res.lists ?? []).map((row) => {
        const raw = (row.data ?? {}) as Partial<ComponentList>;
        return migrateComponentList({ ...raw, id: row.id, name: row.name });
      });
      setLists(parsed);
      setProjectName((res.project_name ?? "").trim() || "ArkBIM");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AB
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">ArkBIM</p>
            <p className="text-xs text-muted-foreground">
              Visualização pública · somente leitura
            </p>
          </div>
        </div>
      </header>
      <main className="p-6">
        <PresentationView lists={lists} onClose={() => { /* sem ação */ }} />
      </main>
    </div>
  );
}
