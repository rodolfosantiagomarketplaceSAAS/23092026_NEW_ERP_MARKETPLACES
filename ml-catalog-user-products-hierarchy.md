# Organização Hierárquica de Anúncios & Catálogo (Padrão Oficial Mercado Livre User Products)

## Goal
Reestruturar a sincronização da API do Mercado Livre (`/api/my-listings/sync`) e a tabela de "Anúncios & Catálogo" (`MyListingsTable.tsx` / `catalogo/page.tsx`) para reproduzir fielmente a arquitetura oficial de 3 níveis do Mercado Livre (**1. Anúncio Principal / Família `#family_id`** → **2. Sub-anúncio / Variação (`user_product_id` / atributos / SKU / `#MLBs`)** → **3. Opções de Venda Clássico e Premium empilhadas à direita**), eliminando anúncios pulados ou separados indevidamente.

## Tasks
- [x] **Task 1: Diagnóstico e Alinhamento Socratic Gate** → Analisar imagens enviadas e confirmar arquitetura de 3 níveis, agrupamento multi-camada e colunas estilo ML.
- [x] **Task 2: Migração SQL Supabase (`20261104170000_add_ml_family_and_user_product_hierarchy.sql`)** → Adicionar colunas `family_id`, `family_name`, `user_product_id`, `parent_item_id`, `catalog_product_id`, `is_catalog`, `sale_fee_amount`, `shipping_cost`, `free_shipping`, `net_amount` e `quality_score` na tabela `public.my_listings` (com fallback seguro em `raw_data`).
- [x] **Task 3: Atualização da Sincronização Oficial ML (`/api/my-listings/sync/route.ts`)** →
  - Buscar todos os anúncios da conta (`active`, `paused`, `under_review`) usando paginação `search_type=scan` para não pular nenhum anúncio acima de 1.000 registros.
  - Extrair `family_id`, `family_name`, `user_product_id`, `parent_item_id`, `catalog_product_id`, `catalog_listing`, `attributes` de variação (Cor, Fragrância, Modelo, Veículo, Acabamento), `sale_terms`, tarifas estimadas, custo de envio e líquido ("Você recebe").
  - Persistir tanto nas novas colunas quanto em `raw_data` (garantindo funcionamento imediato mesmo antes da migração SQL).
- [x] **Task 4: Motor de Agrupamento Inteligente Multi-Camada (`apps/web/src/lib/catalogo/mlGroupingEngine.ts`)** →
  - Nível 1 (Anúncio Principal / Família): Agrupar por `family_id` / `family_name` oficial do ML ou por raiz semântica do título (unindo variações que possuem SKUs numéricos diferentes como `0106202601` e `0106202602` ou `2707202602` e `0608202601`).
  - Nível 2 (Sub-anúncios / Variações): Agrupar itens dentro da mesma família por `user_product_id`, SKU da variação ou combinação de atributos/sufixo da variação, consolidando todos os `#MLB...` daquela variação, foto própria, SKU e estoque da variação.
  - Nível 3 (Opções de Venda Clássico / Premium / Catálogo): Manter lista completa (`sellingOptions: SellingOptionItem[]`) ordenada (Clássico / Premium) sem sobrescrever quando houver 2, 3 ou mais MLBs na mesma variação, com botão expansível `"Ver mais X opção(ões) de venda"`.
- [x] **Task 5: Refatoração da Interface `MyListingsTable.tsx` e `catalogo/page.tsx`** →
  - Construir layout idêntico ao gerenciador de anúncios do Mercado Livre (fotos em collage no Pai, `#family_id`, estoque total, faixa de preço + faixa promocional, "Clássico e Premium", faixa de "Você recebe", métricas e qualidade).
  - Renderizar cada Sub-anúncio/Variação à esquerda (com miniatura, título da variação, lista de `#MLBs` clicáveis/copiáveis, `SKU` e `Estoque`) e suas Opções de Venda empilhadas à direita (Preço + Promoção + Atacado, Condições Clássico/Premium + tarifa + frete, "Você recebe" líquido, Métricas 7d/30d + Conversão, Status Ativo/Pausado/Inativo e ações).
- [x] **Task 6: Validação e Testes (`tsc --noEmit` & scripts de auditoria)** → Garantir tipagem estrita TypeScript zero erros e código limpo/modular.

## Done When
- [x] Todos os anúncios da loja são sincronizados sem pular páginas ou status (`active` e `paused`).
- [x] Variações com SKUs distintos da mesma família ficam agrupadas debaixo do mesmo Anúncio Principal (`#family_id` / Família).
- [x] Cada variação exibe todos os seus códigos `#MLB` empilhados e suas respectivas opções de venda (`Clássico`, `Premium`, etc.) lado a lado como nas imagens do Mercado Livre.
- [x] `npx tsc --noEmit` executa com zero erros.
