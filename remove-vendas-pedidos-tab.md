# Remoção Cirúrgica da Aba Vendas & Pedidos (`/pedidos`)

## Goal
Remover exclusivamente a aba `Vendas & Pedidos` da navegação lateral (`Sidebar.tsx`) e sua página/tabela visual (`apps/web/src/app/pedidos/page.tsx`), mantendo 100% intactas a aba `Gestão de Vendas & Repasse` (`/vendas/gestao-diaria`), todas as demais abas, métricas, APIs e a tabela `public.ml_sales_orders` no Supabase.

## Tasks
- [x] Task 1: Criar branch dedicada `feature/remove-vendas-pedidos-tab` e mapear dependências exclusivas vs compartilhadas → Verify: `git branch --show-current` e `git grep` sem impactos colaterais.
- [x] Task 2: Remover o item `Vendas & Pedidos` (`/pedidos`) e o ícone não utilizado `ShoppingCart` de `apps/web/src/components/layout/Sidebar.tsx` → Verify: Demais itens da Sidebar intactos.
- [x] Task 3: Excluir o diretório exclusivo `apps/web/src/app/pedidos/` (rota retorna `404` padrão) e limpar tipos em cache `.next/types/app/pedidos` → Verify: Diretório inexistente e sem referências órfãs no código-fonte.
- [x] Task 4: Executar validação completa (`tsc --noEmit`, `npm run typecheck`, testes unitários de vendas/webhooks e `npm run build`) → Verify: Zero erros de compilação, 15/15 testes aprovados e build Next.js limpo.

## Done When
- [x] Aba `Vendas & Pedidos` e rota `/pedidos` removidas do sistema sem qualquer impacto em `Gestão de Vendas & Repasse`, demais abas/métricas ou `public.ml_sales_orders`.
- [x] TypeScript, testes automatizados (15/15) e `next build` 100% aprovados.
