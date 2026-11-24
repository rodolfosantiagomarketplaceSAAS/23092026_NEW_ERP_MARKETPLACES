# Correção de Repasse Vendedor, Taxas ML e Código Oficial da Venda

## Goal
Corrigir o cálculo financeiro de repasse/comissão/frete do Mercado Livre (coparticipação de frete em pagamento separado vs embutido, juros de parcelamento do comprador e rateio de packs) e exibir/buscar o Código Oficial da Venda (`ml_pack_id ?? ml_order_id`), ressincronizando os pedidos já salvos no banco.

## Tasks
- [x] Task 1: Extrair motor contábil puro `apps/web/src/lib/mercadolivre/financial-reconciliation.ts` e integrar em `sales-sync.ts` (razão contábil `charges_details`, neutralização de `financing_transfer`/`financing_fee`, deduplicação de `payment_id` em `/shipments/{id}/payments` vs `shipping_amount` embutido e frete `0` em packs/d2c) → Verify: Testes unitários cobrindo todos os cenários reais passam.
- [x] Task 2: Exibir `#{ml_pack_id ?? ml_order_id}` (`getOfficialMlSaleCode`) como Código Oficial da Venda em `DailySalesTable.tsx`, `apps/web/src/app/pedidos/page.tsx` e exportação CSV em `formatters.ts`, mantendo `ml_order_id` no tooltip e incluindo `ml_pack_id` na busca em `apps/web/src/app/api/ml/sales/route.ts` → Verify: `npx tsc --noEmit` e `npm run build` passam.
- [x] Task 3: Adicionar suíte de testes de regressão em `apps/web/src/lib/mercadolivre/__tests__/ml-sales-reconcile.test.ts` (Israel `#2000016233183319`, Augusto, Ítalo `pack: null` e Pack `#2000015487297721`) → Verify: `node --test` 7/7 aprovados.
- [x] Task 4: Executar ressincronização retroativa segura dos 255 pedidos existentes em `ml_sales_orders` no Supabase preservando `assigned_seller_id`, `verified_at` e `costs_manually_edited` → Verify: Vendas auditadas e conciliadas ao centavo no banco.

## Done When
- [x] Código da Venda e Repasse Vendedor conciliam ao centavo com o painel oficial do Mercado Livre.
- [x] Todos os 255 pedidos históricos conciliados e suíte de testes/build 100% aprovados.
