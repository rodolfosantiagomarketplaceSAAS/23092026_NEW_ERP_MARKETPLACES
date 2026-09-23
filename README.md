# SaaS de Gestão de Marketplaces & Inteligência Competitiva (Tiny ERP Style)

Plataforma de alta densidade para gestão e inteligência competitiva em e-commerce com foco em **Mercado Livre** e **Shopee**, equipada com monitoramento 1:N de Buybox, sincronização em tempo real via **Supabase Realtime** e **Chrome Extension Manifest V3** com algoritmo de extração de dupla camada.

---

## 1. Estrutura do Monorepo

```
├── apps/
│   ├── web/                     # Aplicação Next.js 14+ (App Router, Tailwind, Lucide, Supabase SSR/Realtime)
│   └── extension/               # Chrome Extension (Manifest V3) para coleta assistida de concorrentes
├── packages/
│   └── types/                   # Tipos e interfaces TypeScript estritos compartilhados
├── supabase/
│   └── migrations/              # Arquivo SQL DDL completo, RLS, Triggers e Função de Seed
├── package.json                 # Orquestração de Workspaces
└── README.md
```

---

## 2. Tecnologias Utilizadas

- **Frontend & Backend (Web):** Next.js 14+ (App Router, Route Handlers), TypeScript Strict (`noImplicitAny: true`), Tailwind CSS (Design System Tiny ERP `#F4F6F8`), Lucide React.
- **Banco de Dados & Realtime:** Supabase (PostgreSQL 15+), Supabase Realtime com `REPLICA IDENTITY FULL`, Row Level Security (RLS) multitenant por `user_id`, Triggers automáticos de auditoria temporal em `price_history`.
- **Validação de Contratos:** Zod v3.
- **Chrome Extension:** Manifest V3, Service Worker em Background, Content Scripts com parser duplo (`__NEXT_DATA__` / Schema.org `application/ld+json` + Fallback de seletores DOM resilientes) e Popup com pareamento assistido.

---

## 3. Guia de Instalação e Execução

### A. Configuração do Banco de Dados (Supabase)
1. Acesse o painel do seu projeto no Supabase (ou instância local do Supabase CLI).
2. Vá em **SQL Editor** e execute o script contido em:
   ```
   supabase/migrations/20260923000000_init_marketplaces_schema.sql
   ```
3. O script criará:
   - As tabelas: `products`, `my_listings`, `competitor_listings`, `listing_matches`, `price_history`.
   - Índices B-Tree de alta performance para consultas rápidas de BI.
   - Triggers de auditoria automática em `price_history` e `updated_at`.
   - Políticas RLS rigorosas de isolamento por `user_id`.
   - Publicação no canal `supabase_realtime` para notificações automáticas de mudança de preço.
4. Para carregar dados de demonstração imediatos, execute no SQL Editor:
   ```sql
   SELECT public.seed_demo_marketplaces_data('SEU_USER_ID_AQUI');
   ```

### B. Execução da Aplicação Web (Next.js)
1. Na pasta `apps/web/`, crie o arquivo `.env.local` baseado em `.env.example`:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```
2. Instale as dependências na raiz:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Acesse no navegador:
   ```
   http://localhost:3000/inteligencia
   ```

---

## 4. Como Carregar e Usar a Chrome Extension (Manifest V3)

1. Abra o Google Chrome e digite na barra de endereços: `chrome://extensions/`
2. Ative a chave **"Modo do desenvolvedor"** no canto superior direito.
3. Clique no botão **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta:
   ```
   apps/extension/
   ```
5. A extensão **"ERP Marketplaces - Coleta de Concorrentes"** estará ativa na barra de ferramentas do Chrome.

### Pareamento e Captura Assistida:
1. Clique no ícone da extensão para abrir o popup.
2. Configure:
   - **URL da API:** `http://localhost:3000` (ou sua URL na Vercel).
   - **Bearer Token:** O token JWT do usuário ou chave de integração.
   - Clique em **"Testar Conexão"** e depois em **"Salvar"**.
3. Navegue até a página de qualquer produto no **Mercado Livre** ou na **Shopee**:
   - O Content Script identificará automaticamente o produto.
   - Você verá um botão flutuante discreto no canto inferior direito: **"⚡ Capturar Concorrente (ERP)"**.
   - Ou abra o popup para selecionar a qual anúncio próprio (SKU) você deseja vincular aquele concorrente e clique em **"Capturar e Vincular no ERP"**.
4. A extensão enviará o payload higienizado para o endpoint `POST /api/competitors/sync`.

---

## 5. Endpoints de API

### `POST /api/competitors/sync`
- **Autenticação:** Header `Authorization: Bearer <token>`
- **Validação:** Zod (`competitorSyncSchema`)
- **Ações:** Executa upsert em `competitor_listings`, insere log em `price_history` e associa a `listing_matches` caso `my_listing_id` seja enviado.
- **Payload de Exemplo:**
```json
{
  "platform": "mercadolivre",
  "external_id": "MLB3492817263",
  "seller_name": "Tech Store Brasil",
  "seller_reputation": "platinum",
  "title": "Teclado Mecânico Gamer Led RGB Switch Blue",
  "current_price": 184.90,
  "original_price": 219.90,
  "shipping_type": "ml_full",
  "promo_badge": "Oferta do Dia",
  "permalink": "https://produto.mercadolivre.com.br/MLB-3492817263",
  "my_listing_id": "00000000-0000-0000-0000-000000000001"
}
```

### `GET /api/bi/comparative`
- **Query Params:**
  - `platform`: `mercadolivre` | `shopee`
  - `search`: Texto para busca instantânea em SKU, título ou ID
  - `status`: `all` | `LOSING` | `WINNING` | `TIED` | `UNMATCHED`
- **Retorno:** Estrutura agrupada 1:N com cálculo em tempo de execução de discrepância monetária (`diff_brl`), percentual (`diff_pct`) e status de Buybox.

### `GET /api/my-listings`
- **Query Params:** `platform=mercadolivre|shopee`
- **Finalidade:** Fornece a lista resumida de anúncios próprios para preencher o dropdown de pareamento da Chrome Extension.

---

## 6. Demonstração do Supabase Realtime (Sem Reload)

A tabela comparativa escuta o canal do Postgres no Supabase Realtime:
1. Quando a extensão (ou um webhook) atualizar o preço de um concorrente, o hook `useRealtimeCompetitors` captura o evento.
2. A linha do concorrente na tabela executa a animação CSS `realtime-flash` (destaque visual suave em tom amarelo-âmbar que desvanece suavemente).
3. O menor preço concorrente e a discrepância percentual são recalculados em memória sem refresh de tela.
4. Para validar visualmente a animação a qualquer momento no navegador, clique no botão **"Simular Realtime Drop"** na barra superior da tela de Inteligência.
