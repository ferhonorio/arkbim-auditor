import { toast } from "sonner";

/**
 * Contextos para mapear mensagens amigáveis ao usuário.
 */
export type ErrorContext =
  | "load"
  | "save"
  | "delete"
  | "permission"
  | "auth"
  | "unexpected";

const FRIENDLY: Record<ErrorContext, string> = {
  load: "Não foi possível carregar os dados agora.",
  save: "Não foi possível salvar as alterações. Tente novamente.",
  delete: "Não foi possível excluir este item. Verifique suas permissões.",
  permission: "Você não tem permissão para realizar esta ação.",
  auth: "Não foi possível autenticar. Verifique seus dados e tente novamente.",
  unexpected: "Ocorreu um erro inesperado. Tente novamente em instantes.",
};

interface SupaLikeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

function pickContext(error: SupaLikeError, fallback: ErrorContext): ErrorContext {
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  const status = error.status ?? 0;

  if (
    status === 401 ||
    status === 403 ||
    code === "42501" || // insufficient_privilege
    code === "PGRST301" || // RLS
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("not authorized")
  ) {
    return "permission";
  }
  return fallback;
}

/**
 * Mapeia um erro do Supabase (ou qualquer erro) para uma mensagem amigável,
 * exibe um toast genérico e registra detalhes apenas em desenvolvimento.
 */
export function handleSupabaseError(
  error: unknown,
  context: ErrorContext = "unexpected",
): string {
  const err = (error ?? {}) as SupaLikeError;

  // Log completo apenas em desenvolvimento — nunca expor detalhes ao usuário.
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[supabase:${context}]`, error);
  }

  const ctx = pickContext(err, context);
  const friendly = FRIENDLY[ctx];
  toast.error(friendly);
  return friendly;
}

/**
 * Mensagens amigáveis para o fluxo de autenticação. Não expõe mensagens
 * técnicas; faz best-effort para casos comuns mantendo o restante genérico.
 */
export function handleAuthError(error: unknown, mode: "signin" | "signup" | "reset" | "update"): string {
  const err = (error ?? {}) as SupaLikeError;
  const msg = (err.message ?? "").toLowerCase();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[auth:${mode}]`, error);
  }

  let friendly = FRIENDLY.auth;
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    friendly = "E-mail ou senha incorretos.";
  } else if (msg.includes("already registered") || msg.includes("user already")) {
    friendly = "Este e-mail já está cadastrado.";
  } else if (msg.includes("email not confirmed")) {
    friendly = "Confirme seu e-mail antes de entrar.";
  } else if (msg.includes("password") && msg.includes("short")) {
    friendly = "A senha é muito curta.";
  } else if (msg.includes("rate limit") || msg.includes("too many")) {
    friendly = "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  } else if (mode === "reset") {
    friendly = "Não foi possível enviar o e-mail de recuperação. Verifique o endereço informado.";
  } else if (mode === "update") {
    friendly = "Não foi possível atualizar a senha. Tente novamente.";
  } else if (mode === "signup") {
    friendly = "Não foi possível concluir o cadastro. Tente novamente.";
  }

  toast.error(friendly);
  return friendly;
}
