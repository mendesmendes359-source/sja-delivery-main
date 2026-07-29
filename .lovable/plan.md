
# SJA Fast Food — Plano

Design minimalista claro: fundo branco/cinza claro, acento vermelho `#e63946`, navy `#1d3557`. Tipografia sans-serif limpa (Space Grotesk + Inter).

## 1. Backend (Lovable Cloud)

Ativar Lovable Cloud e criar as tabelas:

- `categories` — categorias do menu (Burgers, Bebidas, etc.)
- `menu_items` — nome, descrição, preço, imagem, categoria, disponível, `stock_item_id` opcional
- `stock_items` — matéria-prima/produto (nome, unidade, quantidade atual, min_stock, custo unitário)
- `menu_item_ingredients` — receita: menu_item → stock_item + quantidade (usado para descontar stock ao servir)
- `orders` — id curto, cliente (nome, telefone, morada), tipo (entrega/take-away), status (pendente, aceite, em preparação, saiu para entrega, entregue, cancelado), total, notas, `created_at`
- `order_items` — order_id, menu_item_id, qty, preço unitário
- `deliveries` — order_id, estafeta, status, hora saída/entrega
- `expenses` — despesas para balanço (categoria, valor, data, notas)
- `sms_logs` — histórico de SMS enviados
- `admin_users` — via Supabase Auth (email/password) para o backoffice
- Tabela `user_roles` + enum `app_role` ('admin','staff') com função `has_role()` (padrão seguro)

Todas com RLS: público lê `menu_items`, `categories`; pedidos inseridos por qualquer um (guest checkout); tudo o resto restrito a role `admin`/`staff`.

Seed inicial: ~4 categorias e ~10 itens de menu, ~10 stock items.

## 2. Server functions

- `createOrder` — público, valida input com Zod, cria order+items, envia SMS de confirmação, desconta stock via receitas
- `updateOrderStatus` — protegido, atualiza estado + envia SMS ao cliente em cada transição
- `sendSms` — helper interno via connector Twilio
- `getFinancials` — protegido, agrega receitas (orders entregues) e despesas por período
- `getStockAlerts` — protegido, itens abaixo de min_stock

## 3. Frontoffice (público)

- `/` — Homepage: hero, sobre, destaques do menu, CTA "Fazer pedido"
- `/menu` — Menu completo por categorias, botão adicionar ao carrinho
- `/checkout` — Carrinho + form (nome, telefone, morada, entrega/take-away, notas) → cria pedido → página de confirmação com id do pedido
- `/pedido/$id` — Ver estado do pedido (consulta pública por id)

Carrinho em `localStorage` + Zustand/Context.

## 4. Backoffice (`/admin/*`, autenticado)

Rotas em `_authenticated/admin/`:

- `/admin` — Dashboard: pedidos de hoje, receita do dia, alertas de stock
- `/admin/pedidos` — Lista de pedidos com filtros; ver/atualizar estado; cada mudança envia SMS
- `/admin/entregas` — Pedidos em entrega, atribuir estafeta, marcar entregue
- `/admin/menu` — CRUD de categorias e itens de menu (com upload de imagem via Storage)
- `/admin/stock` — CRUD stock, ajustes manuais, alertas de mínimo
- `/admin/financeiro` — Balanço: receitas vs. despesas por período; CRUD despesas
- `/admin/sms` — Histórico + enviar SMS avulso a cliente

Layout: sidebar navy com links, área principal branca.

## 5. Integrações

- **Twilio** (SMS) — via connector Lovable, chamado só de server functions. Pedirei ao user para conectar após ativar Cloud.
- **Storage** — bucket público `menu-images` para fotos dos pratos.
- **Auth** — email/password para admins (criado manualmente ou via seed do primeiro admin).

## 6. Ordem de execução

1. Ativar Lovable Cloud
2. Migration schema + seed + RLS + storage bucket
3. Design system (styles.css) + layout components
4. Frontoffice: home, menu, checkout, tracking
5. Auth + backoffice: dashboard, pedidos, entregas, menu admin, stock, financeiro
6. Conectar Twilio + integrar SMS nas transições de estado
7. SEO (head por rota) + sitemap/robots

## Detalhes técnicos

- TanStack Start + React 19 + Tailwind v4 + shadcn
- TanStack Query para data fetching, `useServerFn` para mutações
- Zod para validação input
- Design tokens semânticos em `src/styles.css` (oklch), incluindo `--brand-red` e `--brand-navy`
- Preços em cêntimos (integer) para evitar float
- IDs de pedido curtos legíveis (ex.: `SJA-2607-0042`)
