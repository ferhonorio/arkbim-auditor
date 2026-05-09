import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileUploader } from "@/components/ark/FileUploader";
import { FiltersPanel } from "@/components/ark/FiltersPanel";

import { AnaliseTab } from "@/components/ark/AnaliseTab";
import { AuditoriaTab } from "@/components/ark/AuditoriaTab";
import { ListsTab } from "@/components/ark/ListsTab";
import { DiagnosticoTab } from "@/components/ark/DiagnosticoTab";
import { useArk } from "@/lib/store";
import { installGlobalErrorCapture } from "@/lib/diagnostics";
import { useAuth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/AuthForm";
import { PendingApproval } from "@/components/auth/PendingApproval";
import { useCloudSync } from "@/lib/cloud-sync";
import { usePermissions } from "@/lib/permissions";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { FloorView } from "@/components/ark/FloorView";
import { CommentsCenter } from "@/components/ark/lists/CommentsCenter";
import { useProjectName } from "@/lib/project-settings";

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
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const dataset = useArk((s) => s.dataset);
  const setActiveList = useArk((s) => s.setActiveComponentList);
  const { user, loading, signOut } = useAuth();
  const perms = usePermissions(user?.id ?? null);
  const navigate = useNavigate();
  const { projectName } = useProjectName();
  useCloudSync(user?.id ?? null);

  useEffect(() => {
    installGlobalErrorCapture();
  }, []);

  useEffect(() => {
    if (user && !perms.loading && perms.mustChangePassword) {
      navigate({ to: "/change-password" });
    }
  }, [user, perms.loading, perms.mustChangePassword, navigate]);

  if (loading || (user && perms.loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster richColors position="top-right" />
        <AuthForm />
      </>
    );
  }

  if (perms.status !== "approved") {
    return (
      <>
        <Toaster richColors position="top-right" />
        <PendingApproval
          status={perms.status === "rejected" ? "rejected" : "pending"}
          email={user.email ?? ""}
          onSignOut={signOut}
        />
      </>
    );
  }

  const canEdit = perms.canEdit;
  const isMaster = perms.isMaster;
  const defaultTab = canEdit ? "analise" : "consolidada";
  const roleLabel =
    perms.role === "master"
      ? "Master"
      : perms.role === "coordenador"
        ? "Coordenador"
        : perms.role === "comentador"
          ? "Comentador"
          : "Sem permissão";

  return (
    <div className="flex min-h-screen bg-background">
      <Toaster richColors position="top-right" />

      {/* Sidebar — só para usuários com permissão de edição */}
      {canEdit && (
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
            </div>
          )}
        </aside>
      )}

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <header className="flex items-start justify-between gap-4 border-b bg-card px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {canEdit ? (dataset?.fileName ?? "Nenhum arquivo carregado") : "Visualização da lista consolidada"}
            </p>
            <h1 className="text-xl font-semibold">
              {canEdit ? "Tabela pronta para analise" : projectName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> {roleLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-3.5 w-3.5" /> Sair
            </Button>
          </div>
        </header>

        <div className="p-6">
          <Tabs value={activeTab ?? defaultTab} onValueChange={setActiveTab}>
            <TabsList>
              {canEdit && <TabsTrigger value="analise">Analise e agrupamento</TabsTrigger>}
              <TabsTrigger value="consolidada">Listas consolidadas</TabsTrigger>
              <TabsTrigger value="pavimento">Por pavimento</TabsTrigger>
              {canEdit && <TabsTrigger value="comentarios">Comentários</TabsTrigger>}
              {canEdit && <TabsTrigger value="auditoria">Auditoria BIM</TabsTrigger>}
              {canEdit && <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>}
              {isMaster && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
            </TabsList>
            {canEdit && (
              <TabsContent value="analise" className="mt-4">
                <AnaliseTab />
              </TabsContent>
            )}
            <TabsContent value="consolidada" className="mt-4">
              <ListsTab readOnly={!canEdit} canComment={perms.canComment} />
            </TabsContent>
            <TabsContent value="pavimento" className="mt-4">
              <FloorView />
            </TabsContent>
            {canEdit && (
              <TabsContent value="comentarios" className="mt-4">
                <CommentsCenter
                  onNavigateToItem={(listId) => {
                    setActiveList(listId);
                    setActiveTab("consolidada");
                  }}
                />
              </TabsContent>
            )}
            {canEdit && (
              <TabsContent value="auditoria" className="mt-4">
                <AuditoriaTab />
              </TabsContent>
            )}
            {canEdit && (
              <TabsContent value="diagnostico" className="mt-4">
                <DiagnosticoTab />
              </TabsContent>
            )}
            {isMaster && (
              <TabsContent value="usuarios" className="mt-4">
                <UsersPanel currentUserId={user.id} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
