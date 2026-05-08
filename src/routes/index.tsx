import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/ark/FileUploader";
import { FiltersPanel } from "@/components/ark/FiltersPanel";
import { ColumnsPanel } from "@/components/ark/ColumnsPanel";
import { AnaliseTab } from "@/components/ark/AnaliseTab";
import { AuditoriaTab } from "@/components/ark/AuditoriaTab";
import { ConsolidadaTab } from "@/components/ark/ConsolidadaTab";
import { useArk } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArkBIM — Validacao de dados" },
      {
        name: "description",
        content:
          "Audite, agrupe e consolide exports do Autodesk Construction Cloud. Compare pavimentos contra um arquivo de referencia aprovado.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [collapsed, setCollapsed] = useState(false);
  const dataset = useArk((s) => s.dataset);

  return (
    <div className="flex min-h-screen bg-background">
      <Toaster richColors position="top-right" />

      {/* Sidebar */}
      <aside
        className={`relative shrink-0 border-r bg-card transition-all ${
          collapsed ? "w-12" : "w-80"
        }`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
        {!collapsed && (
          <div className="flex h-screen flex-col gap-3 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                AB
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">ArkBIM</p>
                <p className="text-xs text-muted-foreground">Validacao de dados</p>
              </div>
            </div>
            <FileUploader />
            <FiltersPanel />
            <ColumnsPanel />
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <header className="border-b bg-card px-6 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {dataset?.fileName ?? "Nenhum arquivo carregado"}
          </p>
          <h1 className="text-xl font-semibold">Tabela pronta para analise</h1>
        </header>

        <div className="p-6">
          <Tabs defaultValue="analise">
            <TabsList>
              <TabsTrigger value="analise">Analise e agrupamento</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoria BIM</TabsTrigger>
              <TabsTrigger value="consolidada">Lista consolidada</TabsTrigger>
            </TabsList>
            <TabsContent value="analise" className="mt-4">
              <AnaliseTab />
            </TabsContent>
            <TabsContent value="auditoria" className="mt-4">
              <AuditoriaTab />
            </TabsContent>
            <TabsContent value="consolidada" className="mt-4">
              <ConsolidadaTab />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

// Suppress unused warning
void Button;
