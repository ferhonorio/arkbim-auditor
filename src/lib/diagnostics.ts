// Centralized diagnostics for ArkBIM. Captures runtime errors and exposes
// schema/version metadata so the user can inspect the app state.

export const RULES_SCHEMA_VERSION = 2;
export const STORE_VERSION = "1.1.0";

export interface DiagLog {
  id: string;
  at: number;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  stack?: string;
}

const MAX_LOGS = 200;
const logs: DiagLog[] = [];
const listeners = new Set<() => void>();

export function pushLog(entry: Omit<DiagLog, "id" | "at">) {
  logs.unshift({ ...entry, id: crypto.randomUUID(), at: Date.now() });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  listeners.forEach((l) => l());
}

export function getLogs(): DiagLog[] {
  return logs.slice();
}

export function clearLogs() {
  logs.length = 0;
  listeners.forEach((l) => l());
}

export function subscribeLogs(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let installed = false;
export function installGlobalErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    pushLog({
      level: "error",
      source: "window.error",
      message: e.message || String(e.error),
      stack: (e.error as Error | undefined)?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string;
    pushLog({
      level: "error",
      source: "unhandledrejection",
      message: typeof r === "string" ? r : (r?.message ?? String(r)),
      stack: typeof r === "object" ? r?.stack : undefined,
    });
  });
  // Wrap console.error so app errors land in the panel too
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const msg = args
        .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ");
      const stack = args.find((a) => a instanceof Error) as Error | undefined;
      pushLog({ level: "error", source: "console.error", message: msg, stack: stack?.stack });
    } catch {
      // ignore
    }
    orig(...args);
  };
  pushLog({ level: "info", source: "diagnostics", message: "Captura global de erros instalada." });
}
