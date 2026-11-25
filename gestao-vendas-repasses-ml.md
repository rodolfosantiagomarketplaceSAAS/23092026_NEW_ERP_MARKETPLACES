# Evolução Gestão de Vendas & Repasses ML

## Goal
Implementar filtros por Mês/Ano/Todas as Vendas e Dia Específico com extração fatiada na API do Mercado Livre, definição manual (individual e em lote) da Data de Envio protegida contra sobrescrita, apuração de valor obtido por dia específico de envio, edição de cor do vendedor e correção definitiva do zoom de imagem cortado pelo cabeçalho.

## Tasks
- [x] Task 1: Criar branch `feature/sales-management-enhancements` e mapear contratos → Verify: `git branch --show-current`
- [x] Task 2: Criar migration `20261125150000_add_manual_shipped_at_to_ml_sales_orders.sql` (`shipped_at_manual`, `api_shipped_at`) e evoluir fatiamento mensal + `/shipments/{id}/history` + HD thumbnails em `sales-sync.ts` e paginação completa em `/api/ml/sales` → Verify: testes unitários em `ml-sales.test.ts`
- [x] Task 3: Evoluir `PATCH /api/ml/sales/assign` para suportar definição manual/em lote de `shipped_at` e reversão para `api_shipped_at` → Verify: validação Zod + fallback gracioso sem migration
- [x] Task 4: Implementar filtros por Mês, Ano, Todas as Vendas e Dia Específico + faixa interativa de Valor Obtido por Dia de Envio em `gestao-diaria/page.tsx` → Verify: checagem de tipos e renderização
- [x] Task 5: Implementar edição de Data de Envio inline/lote em `DailySalesTable.tsx`, edição de cor do vendedor (Drawer + Popover rápido) e `ProductThumbnailPreview` via Portal (`position: fixed`) → Verify: `tsc --noEmit` + `ux_audit.py`
- [x] Task 6: Rodar bateria de testes, TypeScript e build Next.js → Verify: 0 erros

## Done When
- [x] Filtros de Mês, Ano, Todas as Vendas e Dia Específico funcionam com 100% do histórico paginado e sync mensal seguro
- [x] Data de envio pode ser definida manualmente por venda ou em lote, preservada em syncs futuros e reversível para a API do ML
- [x] Usuário visualiza instantaneamente o valor bruto, repasse pós-ML e lucro limpo obtido em qualquer dia específico de envio
- [x] Cor do vendedor pode ser alterada no Drawer e por clique rápido na cor (paleta + Hex livre)
- [x] Zoom da miniatura do produto flutua em alta resolução via Portal sem jamais cortar abaixo do cabeçalho
