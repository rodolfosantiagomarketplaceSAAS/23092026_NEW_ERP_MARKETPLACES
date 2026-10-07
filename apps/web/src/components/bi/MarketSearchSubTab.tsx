"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Tag,
  Star,
  Zap,
  Truck,
  CheckCircle2,
  ExternalLink,
  Download,
  Link2,
  BarChart3,
  Flame,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  Store,
  Layers,
  Sparkles,
  Settings,
} from "lucide-react";
import type {
  MarketSearchItem,
  MarketSearchAnalytics,
  MarketSearchResponse,
  MarketplacePlatform,
} from "@crm/types";
import { PairFromSearchModal } from "./PairFromSearchModal";

const SUGGESTED_QUERIES = [
  "Películas PPF",
  "Película PPF TPU Autoregenerativa",
  "PPF Maçaneta Carro 4 Portas",
  "Película PPF Farol Fumê",
  "PPF Soleira Automotiva",
  "Película PPF Black Piano Teto",
  "PPF Proteção Parachoque 5 Metros",
];

export function MarketSearchSubTab() {
  const [query, setQuery] = useState("Películas PPF");
  const [platform, setPlatform] = useState<MarketplacePlatform | "all">("all");
  const [limit, setLimit] = useState<number>(30);
  const [sort, setSort] = useState<string>("relevance");

  // Filtros Avançados
  const [campaignOnly, setCampaignOnly] = useState(false);
  const [topRatedOnly, setTopRatedOnly] = useState(false);
  const [fastShippingOnly, setFastShippingOnly] = useState(false);
  const [freeShippingOnly, setFreeShippingOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Estados de Dados
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarketSearchResponse | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal de Pareamento
  const [pairingItem, setPairingItem] = useState<MarketSearchItem | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("q", query.trim());
      params.set("platform", platform);
      params.set("limit", limit.toString());
      params.set("sort", sort);
      if (campaignOnly) params.set("campaignOnly", "true");
      if (topRatedOnly) params.set("topRated", "true");
      if (fastShippingOnly) params.set("fastShipping", "true");
      if (freeShippingOnly) params.set("freeShipping", "true");
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);

      const res = await fetch(`/api/bi/market-search?${params.toString()}`);
      if (res.ok) {
        const json: MarketSearchResponse = await res.json();
        setData(json);
      } else {
        showToast("Erro ao realizar pesquisa de mercado.");
      }
    } catch (err) {
      console.error("Falha na busca:", err);
      showToast("Falha de conexão com a API de pesquisa.");
    } finally {
      setLoading(false);
    }
  }, [query, platform, limit, sort, campaignOnly, topRatedOnly, fastShippingOnly, freeShippingOnly, minPrice, maxPrice]);

  // Carrega busca padrão inicial ou lê query params caso venha da extensão
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const urlQ = sp.get("q");
      const urlP = sp.get("platform");
      if (urlQ) {
        setQuery(urlQ);
      }
      if (urlP && (urlP === "mercadolivre" || urlP === "shopee" || urlP === "all")) {
        setPlatform(urlP as any);
      }
    }
    handleSearch();
  }, []);

  // Monitorar anúncio com 1 clique (sem parear de imediato)
  const handleQuickMonitor = async (item: MarketSearchItem) => {
    try {
      const res = await fetch("/api/competitors/import-from-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: item.platform,
          external_id: item.external_id,
          seller_name: item.seller_name,
          seller_reputation: item.seller_reputation,
          title: item.title,
          current_price: item.current_price,
          original_price: item.original_price,
          shipping_type: item.shipping_type,
          promo_badge: item.promo_badge,
          permalink: item.permalink,
          thumbnail_url: item.thumbnail_url,
          sales_count_approx: item.sales_count_approx,
          rating: item.rating,
        }),
      });

      if (res.ok) {
        showToast(`Anúncio ${item.external_id} adicionado ao radar de monitoramento!`);
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.external_id === item.external_id ? { ...i, is_already_monitored: true } : i
            ),
          };
        });
      }
    } catch (err) {
      console.error(err);
      showToast("Falha ao salvar anúncio.");
    }
  };

  // Exportar para CSV
  const handleExportCsv = () => {
    if (!data || data.items.length === 0) return;

    const headers = [
      "Canal",
      "ID Externo",
      "Titulo",
      "Preco Atual (R$)",
      "Preco Original (R$)",
      "Desconto (%)",
      "Vendedor",
      "Reputacao",
      "Vendas Aprox",
      "Avaliacao",
      "Campanha/Promocao",
      "Tipo Envio",
      "Link",
    ];

    const rows = data.items.map((item) => [
      item.platform === "mercadolivre" ? "Mercado Livre" : "Shopee",
      item.external_id,
      `"${item.title.replace(/"/g, '""')}"`,
      item.current_price.toFixed(2),
      item.original_price ? item.original_price.toFixed(2) : "",
      item.discount_pct ? `${item.discount_pct}%` : "",
      `"${item.seller_name.replace(/"/g, '""')}"`,
      item.seller_reputation || "Comum",
      item.sales_count_approx,
      item.rating,
      item.promo_badge ? `"${item.promo_badge.replace(/"/g, '""')}"` : "",
      item.shipping_type,
      item.permalink,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pesquisa_mercado_${query.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Relatório CSV gerado e baixado com sucesso!");
  };

  const analytics = data?.analytics;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-lg shadow-xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Banner de Status & Conexão de APIs */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-xl p-3.5 sm:p-4 border border-slate-700/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Pesquisa de Mercado Multi-Canal (Mercado Livre & Shopee)
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                Online
              </span>
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Pesquise produtos para extrair preços reais, campanhas e melhores ofertas com pareamento 1:N no ERP.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <a
            href="/configuracoes"
            className="text-[11px] font-semibold text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/10 transition flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Conectar APIs</span>
          </a>
        </div>
      </div>

      {/* Barra de Busca de Alta Performance */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="space-y-3.5"
        >
          <div className="flex flex-col lg:flex-row items-stretch gap-3">
            {/* Input Principal com Ícone */}
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Exemplo: Películas PPF, Óleo 5W30, Suporte Celular..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-sm pl-11 pr-4 py-2.5 bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
            </div>

            {/* Seletor de Marketplace */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/70 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setPlatform("all")}
                className={`px-3 py-1.5 rounded-md transition ${
                  platform === "all"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todos Canais
              </button>
              <button
                type="button"
                onClick={() => setPlatform("mercadolivre")}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                  platform === "mercadolivre"
                    ? "bg-[#FFE600] text-slate-950 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Mercado Livre</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatform("shopee")}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                  platform === "shopee"
                    ? "bg-[#EE4D2D] text-white shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Shopee</span>
              </button>
            </div>

            {/* Quantidade de Itens (10, 20, 30, 50) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs text-slate-500 font-medium">Qtd:</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="text-xs font-semibold py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={10}>10 Anúncios</option>
                <option value={20}>20 Anúncios</option>
                <option value={30}>30 Anúncios</option>
                <option value={50}>50 Anúncios</option>
              </select>
            </div>

            {/* Botão de Busca */}
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analisando Anúncios...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Pesquisar no Mercado</span>
                </>
              )}
            </button>
          </div>

          {/* Sugestões Rápidas de Nicho */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] font-semibold text-slate-400">Sugestões de nicho:</span>
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuery(q);
                  // Executa busca para a nova query
                  setTimeout(() => {
                    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                    if (btn) btn.click();
                  }, 50);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium ${
                  query.toLowerCase() === q.toLowerCase()
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Ações de Extensão & Abertura Direta no Marketplace */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500">Coleta ao Vivo no Navegador:</span>
              <a
                href={`https://lista.mercadolivre.com.br/${encodeURIComponent(
                  query
                    .trim()
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^\w\s-]/g, "")
                    .replace(/\s+/g, "-")
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-[#FFE600] hover:bg-[#F0D800] border border-amber-300 rounded-lg shadow-2xs transition"
                title="Abre a pesquisa no Mercado Livre. A Extensão Chrome injetará o botão flutuante para sincronizar 50+ anúncios ao vivo com 1 clique!"
              >
                <span>🟡 Abrir Busca no Mercado Livre</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-800" />
              </a>

              <a
                href={`https://shopee.com.br/search?keyword=${encodeURIComponent(query.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#EE4D2D] hover:bg-[#D73211] border border-[#EE4D2D] rounded-lg shadow-2xs transition"
                title="Abre a pesquisa na Shopee. A Extensão Chrome injetará o botão flutuante para sincronizar 50+ anúncios ao vivo com 1 clique!"
              >
                <span>🟠 Abrir Busca na Shopee</span>
                <ExternalLink className="w-3.5 h-3.5 text-white" />
              </a>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-medium text-slate-600">Extensão Chrome Integrada (Sem bloqueios de IP)</span>
            </div>
          </div>
        </form>
      </div>

      {/* Dica para Shopee se selecionada */}
      {platform === "shopee" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 shadow-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Busca na Shopee</p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              A Shopee possui proteção anti-raspagem (Cloudflare) que bloqueia servidores em nuvem sem sessão humana. O ERP exibe os concorrentes da Shopee cadastrados no seu Radar. Para capturar novos produtos da Shopee em massa, utilize a Extensão Chrome do ERP ou utilize o filtro &quot;Mercado Livre&quot; (que extrai dados 100% reais em tempo real).
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards & Painel Analítico de Nicho */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Card Preço Médio & Mediana */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Preço Médio</span>
              <Tag className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">
                R$ {analytics.avg_price.toFixed(2).replace(".", ",")}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Mediana:</span>
                <span className="font-semibold text-slate-700">
                  R$ {analytics.median_price.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>
          </div>

          {/* Card Faixa de Preço (Min x Max) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Faixa de Preço</span>
              <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">
                R$ {analytics.min_price.toFixed(0)} ~ R$ {analytics.max_price.toFixed(0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Total Analisado:</span>
                <span className="font-semibold text-slate-700">
                  {analytics.analyzed_count} anúncios
                </span>
              </div>
            </div>
          </div>

          {/* Card Campanhas & Promoções */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Em Campanha</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-amber-600 tracking-tight flex items-baseline gap-1">
                {analytics.campaign_pct}%
                <span className="text-xs font-normal text-slate-500">dos concorrentes</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Ofertas Relâmpago e Cupons ativos
              </div>
            </div>
          </div>

          {/* Card Envio Rápido & Full */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Full & Flex</span>
              <Zap className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-700 tracking-tight flex items-baseline gap-1">
                {analytics.fast_shipping_pct}%
                <span className="text-xs font-normal text-slate-500">envio expresso</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {analytics.free_shipping_pct}% oferecem Frete Grátis
              </div>
            </div>
          </div>

          {/* Card Índice de Oportunidade */}
          <div className="bg-gradient-to-br from-indigo-50 to-white p-4 rounded-xl border border-indigo-200/80 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-indigo-700 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Oportunidade</span>
              <BarChart3 className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-indigo-700">
                  {analytics.opportunity_score}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                  {analytics.opportunity_label}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                {analytics.opportunity_insight}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Seção Gráfica e Distribuição Analítica de Mercado */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Distribuição por Faixas de Preço (Sweet Spot) */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs lg:col-span-2">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  Distribuição por Faixas de Preço (Sweet Spot de Conversão)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Onde a concorrência concentra o maior volume de anúncios para o termo &quot;{query}&quot;
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {analytics.price_distribution.map((bin, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 font-semibold">{bin.range}</span>
                    <span className="text-slate-500 text-[11px]">
                      {bin.count} anúncios ({bin.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0
                          ? "bg-emerald-500"
                          : idx === 1
                          ? "bg-indigo-500"
                          : idx === 2
                          ? "bg-amber-500"
                          : "bg-purple-500"
                      }`}
                      style={{ width: `${Math.max(5, bin.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Vendedores Dominantes no Nicho */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <Store className="w-4 h-4 text-indigo-600" />
                Top Vendedores Dominando o Nicho
              </h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Lojas com maior presença no resultado da busca
              </p>

              <div className="divide-y divide-slate-100 text-xs">
                {analytics.top_sellers.map((seller, sIdx) => (
                  <div key={sIdx} className="py-2 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-slate-800 truncate">
                        {seller.seller_name}
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        Reputação: {seller.seller_reputation || "Líder"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900">
                        {seller.listings_count} anúncios
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Méd: R$ {seller.avg_price.toFixed(2).replace(".", ",")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Filtros Avançados & Ordenação de Inteligência */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Filtros Rápidos (Chips Interativos) */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Filtros:
          </span>

          {/* Melhores Preços (Menor Preço) */}
          <button
            type="button"
            onClick={() => {
              const newSort = sort === "price_asc" ? "relevance" : "price_asc";
              setSort(newSort);
              setTimeout(handleSearch, 50);
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              sort === "price_asc"
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>Melhores Preços</span>
          </button>

          {/* Em Campanha / Promoção */}
          <button
            type="button"
            onClick={() => {
              setCampaignOnly(!campaignOnly);
              setTimeout(handleSearch, 50);
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              campaignOnly
                ? "bg-amber-50 border-amber-300 text-amber-700 shadow-2xs"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Em Campanha / Promoção</span>
          </button>

          {/* Mais Elogiados (Rating 4.7+) */}
          <button
            type="button"
            onClick={() => {
              setTopRatedOnly(!topRatedOnly);
              setTimeout(handleSearch, 50);
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              topRatedOnly
                ? "bg-amber-50 border-amber-300 text-amber-800 shadow-2xs"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Mais Elogiados (4.7+)</span>
          </button>

          {/* Envio Full / Flex */}
          <button
            type="button"
            onClick={() => {
              setFastShippingOnly(!fastShippingOnly);
              setTimeout(handleSearch, 50);
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              fastShippingOnly
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Full / Flex</span>
          </button>

          {/* Frete Grátis */}
          <button
            type="button"
            onClick={() => {
              setFreeShippingOnly(!freeShippingOnly);
              setTimeout(handleSearch, 50);
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              freeShippingOnly
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Frete Grátis</span>
          </button>

          {/* Alternar Filtros de Preço Mín/Máx */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="text-indigo-600 hover:text-indigo-800 font-semibold ml-1 flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showAdvancedFilters ? "Ocultar Faixa de Preço" : "Faixa de Preço (R$)"}</span>
          </button>
        </div>

        {/* Ações à Direita: Exportar CSV e Ordenação */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium">Ordenar:</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setTimeout(handleSearch, 50);
              }}
              className="text-xs font-semibold py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="relevance">Relevância de Mercado</option>
              <option value="price_asc">Menor Preço (Melhores Ofertas)</option>
              <option value="price_desc">Maior Preço (Alto Ticket)</option>
              <option value="rating_desc">Mais Bem Avaliados (Estrelas)</option>
              <option value="sales_desc">Mais Vendidos Aprox.</option>
              <option value="discount_desc">Maior % de Desconto</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data || data.items.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>

        {/* Painel Expansível de Faixa de Preço */}
        {showAdvancedFilters && (
          <div className="w-full pt-3 mt-2 border-t border-slate-100 flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Preço Mínimo (R$):</span>
              <input
                type="number"
                placeholder="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-24 px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Preço Máximo (R$):</span>
              <input
                type="number"
                placeholder="9999"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-24 px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="px-3 py-1 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 transition"
            >
              Aplicar Faixa
            </button>
          </div>
        )}
      </div>

      {/* Listagem de Anúncios Pesquisados (Tabela de Análise Comparativa) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Anúncios Encontrados no Mercado ({data?.items.length || 0})
            </h3>
            <p className="text-[11px] text-slate-500">
              Dados extraídos e normalizados para o termo pesquisado com análises de preço, frete e campanha
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Atualizado em tempo real
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              Coletando e estruturando anúncios de &quot;{query}&quot;...
            </p>
            <p className="text-[11px] text-slate-400">
              Calculando preços médios, histórico de descontos e taxas de entrega rápida.
            </p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">Nenhum anúncio encontrado com os filtros selecionados.</p>
            <p className="text-[11px] text-slate-400">Tente ajustar os filtros ou pesquisar por outro termo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-3">Anúncio / Produto</th>
                  <th className="py-3 px-3 text-right">Preço Atual</th>
                  <th className="py-3 px-3 text-center">Desconto & Campanha</th>
                  <th className="py-3 px-3">Vendedor & Reputação</th>
                  <th className="py-3 px-3 text-center">Envio / Logística</th>
                  <th className="py-3 px-3 text-center">Avaliação / Vendas</th>
                  <th className="py-3 px-4 text-right">Ações de Inteligência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.items.map((item) => {
                  const isML = item.platform === "mercadolivre";
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Badge do Marketplace */}
                      <td className="py-3.5 px-4 align-top">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isML
                              ? "bg-[#FFE600]/80 text-slate-900 border border-yellow-300"
                              : "bg-[#EE4D2D]/10 text-[#EE4D2D] border border-orange-200"
                          }`}
                        >
                          {isML ? "ML" : "Shopee"}
                        </span>
                      </td>

                      {/* Imagem + Título + ID */}
                      <td className="py-3.5 px-3 max-w-[340px] align-top">
                        <div className="flex items-start gap-3">
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 block"
                            title="Abrir anúncio oficial"
                          >
                            <img
                              src={item.thumbnail_url || "https://placehold.co/60x60/f1f5f9/64748b?text=Img"}
                              alt={item.title}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 shadow-2xs group-hover:scale-105 hover:ring-2 hover:ring-indigo-500 transition-all"
                            />
                          </a>
                          <div className="min-w-0">
                            <a
                              href={item.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-slate-900 hover:text-indigo-600 line-clamp-2 leading-tight transition"
                            >
                              {item.title}
                            </a>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                              <span className="font-mono text-slate-500">{item.external_id}</span>
                              <span>•</span>
                              <span className="capitalize">{item.listing_type}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Preço Atual e Original */}
                      <td className="py-3.5 px-3 text-right align-top whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-sm">
                          R$ {item.current_price.toFixed(2).replace(".", ",")}
                        </div>
                        {item.original_price && item.original_price > item.current_price && (
                          <div className="text-[11px] text-slate-400 line-through">
                            R$ {item.original_price.toFixed(2).replace(".", ",")}
                          </div>
                        )}
                      </td>

                      {/* Desconto & Campanhas */}
                      <td className="py-3.5 px-3 text-center align-top whitespace-nowrap">
                        {item.promo_badge ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                              <Flame className="w-3 h-3 text-rose-500" />
                              {item.promo_badge}
                            </span>
                            {item.discount_pct && (
                              <span className="text-[10px] font-semibold text-rose-600">
                                -{item.discount_pct}% OFF
                              </span>
                            )}
                          </div>
                        ) : item.discount_pct ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            -{item.discount_pct}% OFF
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Preço Regular</span>
                        )}
                      </td>

                      {/* Vendedor & Reputação */}
                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <div className="font-semibold text-slate-800 text-xs truncate max-w-[160px]">
                          {item.seller_name}
                        </div>
                        <div className="text-[10px] flex items-center gap-1 mt-0.5">
                          {item.seller_reputation === "platinum" ? (
                            <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                              Líder Platinum
                            </span>
                          ) : item.seller_reputation === "gold" ? (
                            <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Líder Gold
                            </span>
                          ) : item.seller_reputation === "indicado" ? (
                            <span className="text-orange-600 font-bold bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200">
                              Loja Indicada
                            </span>
                          ) : (
                            <span className="text-slate-500">Vendedor Ativo</span>
                          )}
                        </div>
                      </td>

                      {/* Envio / Logística */}
                      <td className="py-3.5 px-3 text-center align-top whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          {item.shipping_type === "ml_full" ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-700 text-white flex items-center gap-1 shadow-2xs">
                              <Zap className="w-2.5 h-2.5 fill-current" />
                              FULL
                            </span>
                          ) : item.shipping_type === "ml_flex" ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-400 text-slate-900 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5" />
                              FLEX
                            </span>
                          ) : item.shipping_type === "shopee_xpress" ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-orange-600 text-white flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5 fill-current" />
                              SPX
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500">
                              Envio Padrão
                            </span>
                          )}

                          {item.is_free_shipping && (
                            <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                              <Truck className="w-3 h-3" /> Frete Grátis
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Avaliações & Vendas Estimadas */}
                      <td className="py-3.5 px-3 text-center align-top whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-bold text-slate-800 text-xs">
                            {item.rating.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({item.reviews_count})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          ~{item.sales_count_approx.toLocaleString("pt-BR")} vendas
                        </div>
                      </td>

                      {/* Ações de Inteligência */}
                      <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.is_already_monitored ? (
                            <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              No Radar
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleQuickMonitor(item)}
                              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1"
                              title="Salvar no banco de dados para acompanhar histórico"
                            >
                              <ShieldCheck className="w-3 h-3 text-slate-500" />
                              Monitorar
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setPairingItem(item)}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition flex items-center gap-1"
                            title="Vincular 1:N ao meu anúncio próprio para reprecificação"
                          >
                            <Link2 className="w-3 h-3 text-indigo-600" />
                            Parear
                          </button>

                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition"
                            title="Abrir anúncio oficial"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Pareamento Dinâmico */}
      {pairingItem && (
        <PairFromSearchModal
          item={pairingItem}
          isOpen={Boolean(pairingItem)}
          onClose={() => setPairingItem(null)}
          onSuccess={(msg) => {
            showToast(msg);
            // Atualiza status local
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                items: prev.items.map((i) =>
                  i.external_id === pairingItem.external_id
                    ? { ...i, is_already_monitored: true }
                    : i
                ),
              };
            });
          }}
        />
      )}
    </div>
  );
}
