## Objetivo
Cinco ajustes funcionais no ArkBIM + recurso de nome do projeto.

---

### 1. Renomear (mascarar) a coluna chave
- Remover bloqueio em `handleHeaderRename` para a coluna chave (Master/Editor).
- Alias funciona como **máscara**: nome original (`Type Mark`) continua sendo a chave interna; só o cabeçalho muda.
- Aplicar alias também em Visão por Pavimento e nas exportações.

### 2. Edição de dados nos itens
Manter edição inline por **duplo clique** (sem ícone de lápis). Apenas:
- `Enter` salva, `Esc` cancela (já existe).
- Toast discreto "Atualizado" no commit.
- Coluna chave continua editável pelo lápis ao lado da chave.

### 3. Link público no domínio `edise.ld.arkbim.com`
- Criar `VITE_PUBLIC_SHARE_BASE_URL` (default `https://edise.ld.arkbim.com`).
- `buildShareUrl` usa essa base sempre, ignorando `window.location.origin`.
- Display truncado no diálogo (`edise.ld.arkbim.com/share/0ee6…481c`); copiar continua copiando link completo.
- Nota: o login que aparece é só do preview do Lovable; no domínio publicado o link abre direto.

### 4. Comentários — marcador, autor e central
- **Marcador na linha**: pré-carregar contagens via `fetchOpenCommentsByItem(listId)`; ícone destacado + badge quando há comentários.
- **Autor visível**: tooltip mostra "N comentários · último por <nome> (<etiqueta>)".
- **Central de comentários (nova)**: aba/botão "Comentários" para Master/Editor. Lista todos os abertos agrupados por categoria, com autor + etiqueta, item, trecho, data e ações "Ir para item" / "Resolver" / "Remover".
- Comentador continua só com a popover do próprio item.

### 5. Visão por pavimento — exportar LI por pavimento
- Substituir "Copiar resumo" por **"Exportar LI (.xlsx)"** em `FloorView.tsx`.
- Uma aba por categoria do pavimento selecionado, com chave (alias), parâmetros, quantidade no pavimento, arquivos e linha "Total".
- Nome: `LI_<pavimento>_<YYYY-MM-DD>.xlsx`.

### 6. Nome do projeto da lista consolidada (NOVO)
Hoje a tela de Visualizador/Comentador e o link público mostram fixo "ArkBIM" no header. Vamos permitir que o Master defina um **Nome do projeto** que aparece nesse lugar.

- Armazenar em `profiles` (do Master) um campo `project_name TEXT` (ou em uma nova tabela `app_settings` de linha única — escolho `app_settings` pra ser global ao workspace, não por usuário). Ver detalhe técnico abaixo.
- Master edita o nome em **Usuários** (ou no header da home) através de um campo "Nome do projeto" com botão "Salvar".
- O nome substitui o texto "ArkBIM" em:
  - Header do `PresentationView` (modo apresentação para Visualizador/Comentador).
  - Header da rota pública `/share/$token` (link compartilhado).
  - Cabeçalho principal da home (acima de "Tabela pronta para análise"), opcional — confirmar.
- Fallback: se não definido, mostra "ArkBIM".
- Para o link público, expor o nome dentro de `get_share_payload` para o `share.$token` ler sem fazer query autenticada.

**Detalhe técnico:**
- Nova tabela `public.app_settings` (singleton) com colunas `id uuid PK default gen_random_uuid()`, `project_name text`, `updated_at`, `updated_by uuid`.
- RLS: `select` para qualquer usuário aprovado; `insert`/`update` apenas `is_master(auth.uid())`.
- Atualizar a função `get_share_payload` para incluir `project_name` no JSON retornado.
- Hook `useProjectName()` para componentes autenticados.

---

## Arquivos afetados
- `src/components/ark/ListsTab.tsx` — destravar alias da chave; marcador de comentário; toast no commitEdit.
- `src/components/ark/lists/ItemCommentsPopover.tsx` — `count`/`lastAuthor` para tooltip e destaque.
- `src/components/ark/lists/CommentsCenter.tsx` (novo) — central de comentários.
- `src/routes/index.tsx` — central, exibir nome do projeto.
- `src/lib/share-links.ts` — base configurável.
- `src/components/ark/lists/ShareLinksDialog.tsx` — display truncado + nota.
- `src/components/ark/FloorView.tsx` — substituir resumo pela exportação XLSX.
- `src/lib/comments.ts` — helper para listar comentários abertos de todas as listas.
- `src/components/ark/lists/PresentationView.tsx` — usar nome do projeto no header.
- `src/routes/share.$token.tsx` — usar nome do projeto vindo do payload RPC.
- `src/components/admin/UsersPanel.tsx` (ou novo `ProjectSettings.tsx`) — campo "Nome do projeto" para Master.
- `src/lib/project-settings.ts` (novo) — `useProjectName()` + setter.

## Migration necessária (somente para item 6)
- Criar tabela `app_settings` com RLS (select aprovado, write master only).
- Atualizar `get_share_payload` para devolver `project_name`.

## Como testar
- **Master**: define "Edifício X" em Configurações; vê o nome aparecendo no header da apresentação e no link público.
- **Visualizador/Comentador**: ao entrar, header mostra "Edifício X" no lugar de "ArkBIM".
- **Link público**: header mostra "Edifício X" sem precisar de login.
- Demais itens (1–5) testados como já descrito.