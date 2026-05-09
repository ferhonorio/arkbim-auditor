
# Plano — Reestruturação ArkBIM

Trabalho organizado em 6 blocos. Implementaremos em sequência, com migrations agrupadas no início para evitar quebras intermediárias.

---

## Bloco 1 — Banco de dados (1 migration consolidada)

### 1.1 Remover `visualizador`
- Como Postgres não permite remover valor de enum em uso, criaremos novo enum `app_role_v2` (`master`,`coordenador`,`comentador`) e migraremos a coluna `user_roles.role`.
- Linhas existentes com `visualizador` → convertidas para `comentador` (mais próximo) e log opcional.

### 1.2 Etiqueta de usuário
- Adicionar coluna `user_label text` em `profiles`.

### 1.3 Tabela `public_share_links`
```
id uuid pk, token text unique not null, list_id uuid null,
scope text check in ('all','category'), expires_at timestamptz null,
created_by uuid not null, is_active boolean default true,
created_at timestamptz default now()
```
- RLS: SELECT/INSERT/UPDATE/DELETE só para `can_edit_lists(auth.uid())`.
- Função `public.get_share_payload(_token text)` SECURITY DEFINER que retorna jsonb com `list_id`, `scope` e `data` filtrado da `component_lists` — chamada via `supabase.rpc` sem auth (GRANT EXECUTE TO anon, authenticated). Validações: `is_active`, `expires_at > now()`.

### 1.4 Tabela `item_comments`
```
id uuid pk, list_id uuid not null, item_key text not null,
user_id uuid not null, text text not null,
created_at timestamptz default now(),
expires_at timestamptz default now() + interval '15 days',
resolved_at timestamptz null, resolved_by uuid null
```
- RLS:
  - SELECT: `is_approved(auth.uid())` e (não expirado OR `can_edit_lists`).
  - INSERT: `can_comment(auth.uid())` e `user_id = auth.uid()`.
  - UPDATE/DELETE: autor (próprio) OU `can_edit_lists` (resolver/excluir).

### 1.5 RLS de `component_lists` — restringir DELETE ao Master
- Trocar policy `lists_delete_owner_or_master` para apenas `is_master(auth.uid())`.
- Manter UPDATE/INSERT para Master + Coordenador.

### 1.6 Auth — desabilitar reset por e-mail
- Não há ajuste de DB (Supabase ainda aceita resetPasswordForEmail no dashboard); apenas removeremos do código.

### 1.7 Edge Function `admin-reset-password`
- Deno function que valida JWT do chamador, confere `is_master` no DB, e usa `SUPABASE_SERVICE_ROLE_KEY` (server-side) para `auth.admin.updateUserById(id,{password})` + marcar `profiles.must_change_password = true`.
- Adicionar coluna `must_change_password boolean default false` em `profiles`.

---

## Bloco 2 — Auth e reset de senha

- **Remover** botão "Esqueci minha senha", estado `forgotOpen`, função `sendReset` em `AuthForm.tsx`.
- **Remover** rota `src/routes/reset-password.tsx`.
- **Novo fluxo**: ao logar, se `profiles.must_change_password === true`, redirecionar para nova rota `/change-password` (formulário `supabase.auth.updateUser({password})` + marca `must_change_password=false`). Bloqueia o app até trocar.
- **UsersPanel**: nova ação "Redefinir senha" (somente Master) → modal com campos "Nova senha" + botão "Gerar" (random 12 chars). Chama edge function via `supabase.functions.invoke('admin-reset-password', {...})`. Mostra a senha em texto + botão copiar.

---

## Bloco 3 — Permissões e UI por papel

- `src/lib/permissions.ts`: remover `visualizador`. Tipos: `master | coordenador | comentador`.
- `UsersPanel.tsx`:
  - Remover opção "Visualizador" do `<Select>`.
  - Coluna nova "Etiqueta" (input editável → update `profiles.user_label`).
  - Botão "Redefinir senha" (apenas se viewer = master e linha != master/me).
- `ListsTab.tsx` / `index.tsx`:
  - `canEdit` (master|coordenador): edição de itens, criar/limpar/editar categoria, gerar share link.
  - `canDeleteCategory` (somente master): botão "Excluir categoria" só visível p/ master.
  - `canComment` (master|coord|comentador): vê e cria comentários.
  - Comentador: modo de leitura igual ao visualizador anterior, mas com indicador de comentário e formulário inline.

---

## Bloco 4 — Link público de visualização

- Botão "Compartilhar" em `CategoryView` (master/coord) → modal:
  - Escopo: categoria atual / todas
  - Validade: nunca / 7 / 30 dias
  - Gera token (`crypto.randomUUID()` + base36) inserido em `public_share_links`
  - Mostra URL `${origin}/share/{token}` + copiar
  - Lista links existentes com toggle ativar/desativar e revogar
- Nova rota pública `src/routes/share.$token.tsx`:
  - Não usa `_authenticated`. Chama `supabase.rpc('get_share_payload', {token})`.
  - Renderiza um `PresentationView` simplificado com: tabs de categorias permitidas, filtro por pavimento, "Copiar lista", "Copiar célula".
  - Sem botões de export interno, sem sidebar admin, sem comentários.

---

## Bloco 5 — Comentários, visão por pavimento e exportação

### 5.1 Comentários
- Hook `useItemComments(listId)` carrega comentários ativos (não expirados, não resolvidos) e expõe `add/resolve/delete`.
- Em `CategoryView`: ícone `MessageSquare` com contador na coluna chave (linha do item). Click abre `Popover` com lista de comentários + textarea (se `canComment`). Master/Coord veem botão "Resolver" e "Excluir".
- Comentador continua vendo a tabela em modo leitura, mas com ícone de comentário ativo na linha.

### 5.2 Visão por pavimento
- Toggle no topo do `ListsTab`: "Por categoria" | "Por pavimento".
- Novo componente `FloorView`: select de pavimento → lista accordion: cada categoria com seus itens cujas occurrences contêm o pavimento (qtd recalculada).
- Disponível para master/coord/comentador. No share público, exibido se escopo=`all`.

### 5.3 Exportação reorganizada (`ExportMenu.tsx`)
- DropdownMenu com dois grupos:
  - **Por categoria**: atual XLSX, todas (uma aba cada), CSV atual.
  - **Por pavimento**: pavimento atual, todos (uma aba por pavimento), matriz categoria × pavimento.
- Helpers em `src/lib/export.ts` adicionar funções `exportFloorCurrent`, `exportFloorsAll`, `exportMatrix`.
- Padronizar nomes: `ArkBIM - {Categoria} - categoria.xlsx`, `ArkBIM - {Pavimento} - consolidado.xlsx`, `ArkBIM - matriz categoria-pavimento.xlsx`.

---

## Bloco 6 — UI das colunas e segurança final

### 6.1 Larguras inteligentes
- Em `CategoryView` e `PresentationView`:
  - Ajustar defaults: ID/Type Mark 90px, Quantidade 80px, Modelo/Fabricante 160px, Descrição 320px (flex), URL 200px (truncate + tooltip).
  - Substituir `truncate` por `whitespace-normal break-words` em descrição.
  - `line-clamp-3` opcional em descrição no modo apresentação.
  - Manter `table-layout: fixed` mas larguras heurísticas por nome de coluna (regex).

### 6.2 Segurança
- Confirmar que nenhum componente importa `client.server` ou usa `service_role`.
- Edge function `admin-reset-password` é a única superfície privilegiada.
- Revisão de RLS final via `supabase--linter`.
- Garantir `handleSupabaseError` em todos os novos fluxos.

---

## Detalhamento técnico

**Arquivos a alterar**
- `src/components/auth/AuthForm.tsx` (remove forgot)
- `src/lib/permissions.ts` (remove visualizador)
- `src/components/admin/UsersPanel.tsx` (etiqueta + reset senha)
- `src/components/ark/ListsTab.tsx` (toggle visão, comentários, share, larguras)
- `src/components/ark/lists/PresentationView.tsx` (larguras, sem export)
- `src/components/ark/lists/ExportMenu.tsx` (reorganização)
- `src/lib/export.ts` (novas funções)
- `src/routes/index.tsx` (gates por papel + must_change_password)
- `src/routes/__root.tsx` (rota /share não autenticada)

**Arquivos a criar**
- `src/routes/share.$token.tsx`
- `src/routes/change-password.tsx`
- `src/components/ark/comments/ItemCommentsPopover.tsx`
- `src/components/ark/lists/FloorView.tsx`
- `src/components/ark/lists/ShareLinksDialog.tsx`
- `src/lib/comments.ts` (hook)
- `src/lib/share-links.ts` (helpers)
- `supabase/functions/admin-reset-password/index.ts`

**Arquivos a remover**
- `src/routes/reset-password.tsx`

**Migrations**
1. `*_role_visualizador_remove_share_comments.sql`:
   - novo enum, migrate `user_roles.role`, drop antigo
   - `profiles`: `user_label`, `must_change_password`
   - tabelas `public_share_links`, `item_comments` + RLS
   - função `get_share_payload`
   - novo policy DELETE em `component_lists` (apenas master)

**Novas tabelas**: `public_share_links`, `item_comments`.

**Novas RLS** (resumo): `public_share_links_*` (apenas editores), `item_comments_*` (visíveis a aprovados, edição por autor/master/coord), `component_lists_delete_master_only`.

**Edge function**: `admin-reset-password` (Master apenas).

---

## Como testar cada perfil

- **Master** (você): login → vê aba Usuários, pode aprovar, editar etiqueta, redefinir senha de outros, criar/excluir categorias, gerar share, comentar, resolver comentários.
- **Coordenador (Editor)**: cria conta → master aprova e atribui role + etiqueta → consegue editar dados, criar/limpar listas, gerar share link, comentar, **não vê** botão "Excluir categoria".
- **Comentador**: aprovado + role comentador → vê tabela em leitura, vê ícone de comentários por linha, pode adicionar comentário próprio, **não pode** editar/excluir/limpar/exportar configurações internas, mas pode "Copiar lista".
- **Anônimo via /share/{token}**: abre URL → vê apenas a(s) categoria(s) autorizada(s), filtro por pavimento, copiar célula/lista, sem nenhum botão administrativo. Tokens expirados/desativados retornam mensagem amigável.
- **Reset de senha**: master clica "Redefinir senha" do usuário X → recebe nova senha → comunica fora do sistema → X faz login → forçado a `/change-password` → define nova → entra normal.

Confirma para eu implementar?
