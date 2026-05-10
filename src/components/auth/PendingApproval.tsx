import { Button } from "@/components/ui/button";
import { LogOut, Clock, ShieldX } from "lucide-react";

export function PendingApproval({
  status,
  email,
  onSignOut,
}: {
  status: "pending" | "blocked";
  email: string;
  onSignOut: () => void;
}) {
  const blocked = status === "blocked";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            blocked ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700"
          }`}
        >
          {blocked ? <ShieldX className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            {blocked ? "Acesso bloqueado" : "Aguardando aprovação"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {blocked
              ? "Sua conta foi bloqueada. Entre em contato com o administrador do projeto para reativá-la."
              : "Seu cadastro foi recebido. Um administrador precisa aprovar seu acesso antes que você possa entrar."}
          </p>
          <p className="text-xs text-muted-foreground">{email}</p>
        </div>
        <Button variant="outline" className="w-full" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );
}
