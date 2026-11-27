# Filtro e Análise de Devoluções & Cancelamentos + Correções Visuais (Gestão de Vendas & Repasse)

## Goal
Implementar filtros granulares e painel analítico completo de produtos com devolução e cancelamento (com ranking por MLB/SKU e % sobre vendas do item), adicionar botão `X` para limpar o campo de busca e corrigir via React Portal o corte do card "Composição Plataforma ML" na tabela operacional.

## Tasks
- [x] Task 1: Atualizar tipos em `apps/web/src/types/ml-sales.ts` (`SalesStatusFilter`, `MlSalesStatusCounts`, `MlProductReturnRankingRow`, `MlReturnsAnalyticsSummary`) → Verify: `npx tsc --noEmit` sem erros.
- [x] Task 2: Implementar `matchesSalesStatusFilter` e `computeReturnsAndCancellationsAnalytics` em `apps/web/src/lib/mercadolivre/sales-analytics.ts` e expor `statusCounts` + `returnsAnalytics` em `apps/web/src/app/api/ml/sales/route.ts` → Verify: testes unitários em `ml-sales.test.ts` passando (9/9).
- [x] Task 3: Criar `PlatformFeeBreakdownTooltip.tsx` usando `createPortal(..., document.body)` (`position: fixed`) com composição completa (Venda Bruta, Comissão ML %, Frete Vendedor, Estorno/Subsídio ML, Desconto Líquido e Base Limpa de Repasse) e integrar em `DailySalesTable.tsx` → Verify: zero corte em tabelas de 1 linha.
- [x] Task 4: Criar `ReturnsAndCancellationsPanel.tsx` (KPIs de perda, Ranking de Produtos MLB/SKU com % sobre vendas do item, Motivos ML, exportação CSV e drill-down por MLB) → Verify: compilação limpa e responsividade.
- [x] Task 5: Atualizar `apps/web/src/app/vendas/gestao-diaria/page.tsx` com botão `X` de limpeza instantânea na busca, filtros rápidos separados (`Todos`, `Só Válidos`, `Devoluções`, `Cancelamentos`, `Ambos`, `Não Verificados`), banner contextual e nova sub-aba `Devoluções & Cancelamentos` → Verify: `npx tsc --noEmit`, testes e `next build` aprovados.

## Done When
- [x] Botão `X` limpa o código de busca em 1 clique sem atraso de debounce e mantém foco no campo.
- [x] Tooltip "Composição Plataforma ML" exibe todos os dados completos fora do container `overflow-x-auto` sem nunca cortar.
- [x] Gestor consegue filtrar separadamente Devoluções vs. Cancelamentos e analisar o ranking de MLBs/SKUs com taxa percentual real sobre as vendas de cada item.
- [x] Testes automatizados, TypeScript e Build de produção aprovados sem erros.

## Notes
- Nenhuma migration SQL adicional é necessária no Supabase (`ml_sales_orders` já possui `status IN ('paid','shipped','delivered','cancelled','returned')`, `cancellation_reason` e índices).
