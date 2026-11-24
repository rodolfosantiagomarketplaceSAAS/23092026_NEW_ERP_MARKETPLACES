# Gestão de Vendas & Repasse por Vendedor (Mercado Livre)

## Goal
Implementar o módulo completo **Gestão de Vendas & Repasse por Vendedor** (`/vendas/gestao-diaria`) com sincronização 100% Read-Only (`GET`) da API oficial do Mercado Livre, apuração automática de repasse pós-taxas/frete + estornos promocionais, custos operacionais unitários, atribuição individual/em lote por vendedor e consolidado dia a dia.

## Decisions Confirmed (Socratic Gate)
1. **Carrinhos (`ml_pack_id`) e Frete:** Prioriza frete individual do pagamento/pedido e, quando consolidado no `shipment`/`pack`, faz rateio proporcional ao `gross_sale_amount` de cada pedido do carrinho.
2. **Cota de Sociedade (`sellers.commission_pct`):** `seller_transfer_profit` guarda 100% da base limpa pós-ML/frete+estorno na linha da venda; Cards por Vendedor e Consolidado Dia a Dia aplicam `commission_pct` no valor efetivo a repassar (com badge de cota quando `< 100%`).
3. **Multitenancy, Multi-Contas ML e Navegação:** `organization_id` e `user_id` incluídos nas 3 tabelas (`sellers`, `product_cost_templates`, `ml_sales_orders`) com RLS nativo; sincronização de todas as contas ML ativas da organização; entrada **"Gestão de Vendas & Repasse"** adicionada na `Sidebar.tsx` + atalho em `/pedidos`.

## Task Breakdown
1. **Database Migration (`supabase/migrations/20261124120000_create_ml_sales_and_seller_transfers.sql`)**
   - Criar tabelas `sellers`, `product_cost_templates` e `ml_sales_orders` (incluindo `product_thumbnail` para a miniatura da tabela, `ml_seller_id` da conta ML, `organization_id`, `user_id`).
   - Implementar trigger `BEFORE INSERT OR UPDATE` em `ml_sales_orders` que calcula `tax_amount` (quando `tax_pct` muda), `seller_transfer_profit` e `net_operational_profit` (zerando automaticamente quando `status IN ('cancelled', 'returned')`).
   - Habilitar RLS multitenant (`public.get_current_user_org_id()` / `auth.uid()`) e criar índices B-Tree de alta performance.
2. **Tipos e Contratos (`apps/web/src/types/ml-sales.ts` + Zod Validators)**
   - Tipagem estrita TypeScript para entidades, filtros, KPIs, resumo por vendedor e fechamento dia a dia.
3. **Serviço Read-Only Mercado Livre (`apps/web/src/lib/mercadolivre/sales-sync.ts`)**
   - Guardrail estrito `assertReadOnlyGet()` bloqueando qualquer método diferente de `GET` para `api.mercadolibre.com`.
   - Renovação transparente de `access_token` via `getActiveMarketplaceToken` / `refreshMercadoLivreIntegration`, backoff exponencial em `429 Rate Limit` e paginação segura em `/orders/search`.
   - Extração de `/orders/{id}`, `/v1/payments/{id}` (ou `/collections/{id}`), `/shipments/{id}` e miniaturas em batch `/items?ids=...`.
   - Cálculo exato de `ml_commission_amount`, `ml_shipping_cost` (com rateio proporcional em carrinhos `ml_pack_id`), `ml_promo_rebate` conciliado com `mp_net_released`, aplicação de `product_cost_templates` em novos pedidos e `upsert` preservando `assigned_seller_id`, `verified_at` e custos já editados manualmente.
4. **Rotas de API Next.js (`apps/web/src/app/api/ml/...`)**
   - `GET /api/ml/sales` — listagem filtrada + KPIs + resumo por vendedor + consolidado diário + lojas disponíveis (com resiliência caso a migration ainda não tenha sido aplicada).
   - `POST /api/ml/sales/sync` — dispara sincronização Read-Only (`GET` externo) das contas ML ativas no período informado.
   - `PATCH /api/ml/sales/assign` — atribuição individual ou em massa de vendedor, marcação de `verified_at` em massa e opção *"Salvar como padrão para este anúncio (MLB)"* em `product_cost_templates`.
   - `PATCH /api/ml/sales/[id]/costs` — atualização unitária de custos operacionais e alíquota de imposto (com opção de salvar template padrão do `MLB`).
   - `GET/POST/PATCH/DELETE /api/ml/sellers` — CRUD de vendedores/sócios.
   - `GET/POST/DELETE /api/ml/cost-templates` — CRUD de templates de custos e vendedor padrão por `MLB`.
5. **Frontend (`/vendas/gestao-diaria` + Componentes + `Sidebar.tsx` + `/pedidos`)**
   - Barra superior com atalhos de data (`Hoje`, `Ontem`, `Últimos 7 dias`, `Este Mês`, `Mês Passado`, personalizado), filtro por loja ML, pills de Vendedor com contadores, filtro de Status, botão **Sincronizar Vendas ML** e Drawer **Gerenciar Vendedores & Custos Padrão**.
   - Cards de Resumo Financeiro + Cards individuais lado a lado por Vendedor (Qtd, Base/Total a Repassar com cota %, Liberado no MP vs. A Liberar).
   - Tabela operacional dia a dia com seleção em massa + barra flutuante (Batch Action), dropdown inline de vendedor (1 clique + salvar padrão `MLB`), tooltip de taxas/frete/estorno, destaque de repasse (riscado + badge de motivo se cancelada/devolvida), Popover interativo de custos & imposto, status de liberação MP e checkbox de conferência (**Verificado**).
   - Sub-aba **Consolidado Dia a Dia (Fechamento)** com colunas dinâmicas por vendedor e exportação CSV/Excel compatível com Excel PT-BR (BOM UTF-8 + `;`).
6. **Verification**
   - Executar `npx tsc --noEmit` e `npm run lint` em `apps/web` + scripts de validação do projeto.

