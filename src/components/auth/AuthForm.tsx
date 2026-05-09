import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { handleAuthError } from "@/lib/error-handling";

export function AuthForm() {
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name },
          },
        });
        if (error) throw error;
        toast.success("Conta criada — aguarde aprovação do administrador.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha na autenticação";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    if (!email) return toast.error("Informe seu e-mail no campo acima primeiro.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de recuperação enviado. Verifique sua caixa de entrada.");
    setForgotOpen(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            AB
          </div>
          <h1 className="text-2xl font-semibold">ArkBIM</h1>
          <p className="text-sm text-muted-foreground">
            Acesse sua conta para gerenciar listas consolidadas com persistência segura na nuvem.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <form onSubmit={handle} className="mt-4 space-y-3">
            <TabsContent value="signup" className="m-0 space-y-3">
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required={tab === "signup"} />
              </div>
            </TabsContent>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                {tab === "signin" && (
                  <button
                    type="button"
                    onClick={() => setForgotOpen((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {forgotOpen && tab === "signin" && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                Enviaremos um link de recuperação para <strong>{email || "seu e-mail"}</strong>.
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={sendReset} disabled={loading}>
                    Enviar link
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setForgotOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde…" : tab === "signup" ? "Criar conta" : "Entrar"}
            </Button>

            {tab === "signup" && (
              <p className="text-center text-xs text-muted-foreground">
                Novos cadastros precisam ser aprovados pelo administrador antes de acessar o sistema.
              </p>
            )}
          </form>
        </Tabs>
      </div>
    </div>
  );
}
