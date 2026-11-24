# Análise de Vendas por Data da Venda vs. Dia do Envio (Mercado Livre API)

## Goal
Implementar extração Read-Only da data real de despacho (`shipped_at`) na API oficial do Mercado Livre (`/shipments/{id}`) e habilitar alternância completa de análise entre **Data da Venda (`order_date`)** e **Dia do Envio (`shipped_at`)** em `/vendas/gestao-diaria` e `/pedidos`.

## Tasks
- [x] Task 1: Criar migration `supabase/migrations/20261124180000_add_shipped_at_to_ml_sales_orders.sql` adicionando `shipped_at`, `delivered_at` e `logistic_type` em `ml_sales_orders` com índices compostos por tenant (`organization_id`/`user_id` + `shipped_at DESC`) → Verify: Sintaxe SQL, constraints e índices parciais `WHERE shipped_at IS NOT NULL` validados.
- [x] Task 2: Atualizar tipos e schemas (`apps/web/src/types/ml-sales.ts`, `apps/web/src/lib/validators/ml-sales.ts`, `apps/web/src/lib/mercadolivre/financial-reconciliation.ts`) com `SalesAnalysisMode` (`"order_date" | "shipping_date"`), `shipped_at`, `delivered_at`, `logistic_type` e contadores de pendência/backfill → Verify: `npx tsc --noEmit -p apps/web/tsconfig.json` passou sem erros.
- [x] Task 3: Aprimorar extração Read-Only em `apps/web/src/lib/mercadolivre/shipment-extraction.ts`, `sales-sync.ts` e `webhook-sync.ts` para capturar `status_history.date_shipped` (com fallback automático em cascata `/shipments/{id}` padrão e `/shipments/{id}/tracking/timeline`), lookback de 14 dias no modo envio e re-sync automático de pedidos `paid` ou enviados sem `shipped_at` → Verify: Extração unitária e preservação de `shipped_at` no upsert.
- [x] Task 4: Atualizar motor analítico (`apps/web/src/lib/mercadolivre/sales-analytics.ts`) e endpoints (`GET /api/ml/sales`, `POST /api/ml/sales/sync`) para filtrar, ordenar e agrupar o fechamento diário por `order_date` ou `shipped_at` (fuso `America/Sao_Paulo`), retornando `pendingShipmentCount`, `backfillMissingShippedAtCount` e fallback seguro pré-migration → Verify: Testes automatizados `node:test` cobrindo ambos os modos.
- [x] Task 5: Implementar seletor `Data da Venda | Dia do Envio` (`AnalysisModeToggle.tsx`), badges de pendentes/backfill, colunas dinâmicas e exportação CSV em `gestao-diaria/page.tsx`, `DailySalesTable.tsx`, `DailyClosingTable.tsx`, `SalesKpiSection.tsx`, `formatters.ts` e `pedidos/page.tsx` → Verify: `npm run lint` e `npm run build`.
- [x] Task 6: Criar e executar testes unitários em `apps/web/src/lib/mercadolivre/__tests__/ml-sales.test.ts` validando extração de `date_shipped`, lookback de 14 dias e apuração diária por data de envio vs. data de venda → Verify: `node --test`.

## Done When
- [x] `shipped_at` extraído com precisão da API oficial do ML (com cache por `shipment_id`, lookback de 14 dias e backfill automático de pendentes).
- [x] Filtro `Data da Venda` vs `Dia do Envio` funcionando ponta a ponta em `/vendas/gestao-diaria` e `/pedidos` (KPIs, Repasse por Vendedor, Fechamento Diário, Tabela e CSV).
- [x] Script SQL de migração entregue pronto para execução no SQL Editor do Supabase, com proteção contra erro caso ainda não tenha sido rodado.
- [x] `tsc --noEmit`, `npm run build` e suíte de testes (`11/11`) passando 100%.
