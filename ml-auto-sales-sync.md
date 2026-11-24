# Sincronização Automática de Vendas Mercado Livre (Free Tier)

## Goal
Fazer vendas e atualizações de status do Mercado Livre entrarem automaticamente no ERP (com atualização ao vivo na tela e baixa de estoque no Catálogo) mantendo consumo mínimo nos planos gratuitos da Vercel e Supabase.

## Tasks
- [x] Task 1: Criar migration `supabase/migrations/20261124150000_enable_realtime_ml_sales_orders.sql` habilitando `REPLICA IDENTITY FULL` e publicação `supabase_realtime` em `ml_sales_orders` → Verify: SQL idempotente validado.
- [x] Task 2: Criar validador e parser de notificações em `apps/web/src/lib/validators/ml-webhook.ts` (`orders_v2`, `orders`, `shipments`, `items`, validação `application_id` e `ML_WEBHOOK_SECRET`) → Verify: Testes unitários passam.
- [x] Task 3: Evoluir `apps/web/src/lib/mercadolivre/sales-sync.ts` e `apps/web/src/lib/mercadolivre/webhook-sync.ts` com sync unitário rápido Read-Only (`syncMercadoLivreSingleOrderBySeller`, `syncMercadoLivreOrderByShipment`) e atualização automática de estoque/vendidos em `my_listings` (`syncListingsStockInCatalog`) → Verify: `npx tsc --noEmit` sem erros.
- [x] Task 4: Criar endpoint `apps/web/src/app/api/webhooks/mercadolivre/route.ts` (`GET` healthcheck + `POST` receptor oficial ML) e documentar `ML_WEBHOOK_SECRET` em `apps/web/.env.example` → Verify: Build e tipagem das rotas Next.js passam.
- [x] Task 5: Criar hook `apps/web/src/hooks/useRealtimeSalesOrders.ts` e integrar Realtime + Auto-Sync inteligente (cooldown de 10 min) em `apps/web/src/app/vendas/gestao-diaria/page.tsx` → Verify: UI atualiza automaticamente sem reload.
- [x] Task 6: Conectar `apps/web/src/app/pedidos/page.tsx` aos pedidos reais sincronizados + Realtime e exibir URL copiável do Webhook no card ML em `apps/web/src/components/config/ConfiguracoesDashboard.tsx` → Verify: Sem dados estáticos fictícios em `/pedidos` e lint limpo.
- [x] Task 7: Criar testes unitários em `apps/web/src/lib/mercadolivre/__tests__/ml-webhook.test.ts` e executar validações (`tsc`, build, testes) → Verify: 100% dos testes e checagens aprovados.

## Done When
- [x] Webhook ML processa vendas, envios e estoque de anúncios em modo Read-Only (`GET`).
- [x] Telas `/vendas/gestao-diaria` e `/pedidos` refletem vendas reais em tempo real + auto-sync com cooldown seguro para Vercel/Supabase Free.
- [x] Testes unitários, TypeScript e Build passam sem erros.
