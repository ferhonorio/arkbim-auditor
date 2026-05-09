## Visão geral

Implementar sistema de permissões hierárquico com aprovação manual + reset de senha por e-mail.

## 1. Banco de dados (migration)

**Atualizar enum `app_role`** — adicionar novos valores:
- `master` (super admin, primeiro usuário)
- `coordenador` (edita listas e trata dados)
- `comentador` (apenas visualiza + comenta)
- `visualizador` (apenas visualiza)
- manter `admin` e `user` por compat (não usados na nova UX)

**Adicionar coluna `status` em `profiles`**:
- `pending` (default para novos cadastros)
- `approved`
- `rejected`

**Atualizar trigger `handle_new_user`**:
- Se for o **primeiro usuário** do sistema (count=0 em `user_roles`): atribuir role `master` + status `approved`
- Caso contrário: status `pending`, **sem role atribuída** (master atribui depois)

**Funções auxiliares**:
- `is_master(uid)` — security definer
- `can_edit_lists(uid)` — true para master ou coordenador
- `can_comment(uid)` — true para master, coordenador ou comentador
- `is_approved(uid)` — checa profiles.status

**Atualizar RLS de `component_lists`**:
- SELECT: qualquer usuário aprovado (todos os tipos veem)
- INSERT/UPDATE/DELETE: apenas master ou coordenador

**Permitir master gerenciar roles e status**:
- Adicionar policies INSERT/UPDATE/DELETE em `user_roles` para master
- Adicionar policy UPDATE em `profiles` para master (mudar status)
- Adicionar policy SELECT em `profiles` para master ver todos

## 2. Reset de senha

- Botão "Esqueci minha senha" em `AuthForm.tsx` → chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`
- Nova rota pública `src/routes/reset-password.tsx` — formulário para nova senha, chama `supabase.auth.updateUser({ password })`

## 3. Hook de permissões

`src/lib/permissions.ts` — hook `usePermissions()` retornando:
- `role`, `status`, `isMaster`, `canEdit`, `canComment`, `isApproved`, `loading`

## 4. Gate de aprovação no app

Em `src/routes/index.tsx`:
- Se logado mas `status === 'pending'` → tela "Aguardando aprovação do administrador"
- Se `status === 'rejected'` → tela "Acesso negado"
- Se aprovado → app normal, mas:
  - `canEdit=false` esconde upload, botão consolidar, edição
  - Apenas `comentador`/`visualizador` veem só a aba "Listas consolidadas" em modo leitura

## 5. Painel de administração (master)

Nova aba "Usuários" visível só para master:
- Lista todos profiles com email, nome, role atual, status
- Ações: Aprovar / Rejeitar / Mudar role (dropdown com 3 opções) / Revogar acesso
- Implementado em `src/components/admin/UsersPanel.tsx`

## 6. Restrições de UI por role

- **Coordenador**: igual ao master, sem aba "Usuários"
- **Comentador/Visualizador**: só aba "Listas consolidadas" em modo apresentação read-only; comentador vê botão de comentar (comentários ficam para fase futura — não estão no escopo agora pois sistema de comentários ainda não existe; vou apenas preparar a permissão)

## Arquivos

**Criar**:
- `src/lib/permissions.ts`
- `src/components/admin/UsersPanel.tsx`
- `src/components/auth/PendingApproval.tsx`
- `src/routes/reset-password.tsx`

**Editar**:
- `src/components/auth/AuthForm.tsx` (forgot password)
- `src/routes/index.tsx` (gate de status + aba Users + gating de UI)
- migration SQL

## Observações

- Comentários por linha não fazem parte deste escopo (Phase 2 sharing); apenas a permissão `canComment` será preparada.
- Email de reset usa o template padrão do Supabase Auth — sem necessidade de scaffold customizado agora.
