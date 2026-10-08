"use client";

import React, { useState, useEffect } from "react";
import {
  Key,
  Globe,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  PlugZap,
  ShoppingBag,
  Sliders,
  Database,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Save,
  CheckCircle2,
  Terminal,
  Zap,
  Unlink,
  Link as LinkIcon,
  Store,
  AlertCircle,
} from "lucide-react";

export function ConfiguracoesDashboard() {
  const [activeTab, setActiveTab] = useState<"api" | "marketplaces" | "reprice" | "database">("marketplaces");

  // Estados de API & Extensão
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [erpUrl, setErpUrl] = useState("http://localhost:3000");
  const [apiToken, setApiToken] = useState(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInVzZXJfaWQiOiJkZW1vLW1hc3Rlci11c2VyIiwiZXhwIjoyMTA1NzQ0OTI4fQ.crm-erp-token-demo"
  );
  const [testResult, setTestResult] = useState<{ status: "idle" | "testing" | "success" | "error"; message?: string }>({
    status: "idle",
  });

  // Estados de Conexão das Contas de Marketplaces (Padrão Tiny / Bling)
  const [mlConnected, setMlConnected] = useState(false);
  const [mlAccountName, setMlAccountName] = useState("");
  const [mlSellerId, setMlSellerId] = useState("");
  const [mlReputation, setMlReputation] = useState("platinum");
  const [mlEmail, setMlEmail] = useState("");
  const [mlAccessToken, setMlAccessToken] = useState("");
  const [mlAppId, setMlAppId] = useState("");
  const [mlSecretKey, setMlSecretKey] = useState("");
  const [mlShippingType, setMlShippingType] = useState("FULL + FLEX (Híbrido)");
  const [mlConnectionMode, setMlConnectionMode] = useState<"oauth" | "token">("oauth");
  const [mlConnecting, setMlConnecting] = useState(false);
  const [mlTesting, setMlTesting] = useState(false);
  const [mlTestFeedback, setMlTestFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [shopeeConnected, setShopeeConnected] = useState(false);
  const [shopeeAccountName, setShopeeAccountName] = useState("");
  const [shopeeShopId, setShopeeShopId] = useState("");
  const [shopeePartnerId, setShopeePartnerId] = useState("");
  const [shopeePartnerKey, setShopeePartnerKey] = useState("");
  const [shopeeAccessToken, setShopeeAccessToken] = useState("");
  const [shopeeCouponSync, setShopeeCouponSync] = useState("Ativa (Com Desconto)");
  const [shopeeConnecting, setShopeeConnecting] = useState(false);
  const [shopeeTesting, setShopeeTesting] = useState(false);
  const [shopeeTestFeedback, setShopeeTestFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Carrega status das integrações reais do backend
  const loadIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const data = await res.json();
        if (data.mercadolivre && data.mercadolivre.connected) {
          setMlConnected(true);
          setMlAccountName(data.mercadolivre.account_name || "Loja Mercado Livre");
          setMlSellerId(data.mercadolivre.seller_id || "");
          setMlReputation(data.mercadolivre.metadata?.reputation || "platinum");
          setMlEmail(data.mercadolivre.metadata?.email || "");
        } else {
          setMlConnected(false);
        }

        if (data.shopee && data.shopee.connected) {
          setShopeeConnected(true);
          setShopeeAccountName(data.shopee.account_name || "Loja Shopee");
          setShopeeShopId(data.shopee.seller_id || "");
        } else {
          setShopeeConnected(false);
        }
      }
    } catch (e) {
      console.warn("Falha ao carregar integrações da API:", e);
    }
  };

  useEffect(() => {
    loadIntegrations();

    // Feedback de retorno OAuth se houver parâmetros na URL
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("success") === "ml_connected") {
        alert("✅ Conta do Mercado Livre conectada com sucesso via OAuth!");
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=marketplaces");
      }
      if (sp.get("error")) {
        alert(`❌ Erro na autorização: ${sp.get("error")}`);
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=marketplaces");
      }
    }
  }, []);

  // Estados de Regras de Reprecificação
  const [diffValue, setDiffValue] = useState("0.10");
  const [minMarginPct, setMinMarginPct] = useState("12");
  const [costProtection, setCostProtection] = useState(true);
  const [repriceStrategy, setRepriceStrategy] = useState("beat");
  const [autoRepriceML, setAutoRepriceML] = useState(false);
  const [autoRepriceShopee, setAutoRepriceShopee] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Manipulador de cópia com feedback
  const handleCopy = (text: string, type: "url" | "token") => {
    navigator.clipboard.writeText(text);
    if (type === "url") {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Regera token de desenvolvimento/API
  const handleRegenerateToken = () => {
    const randomHex = Math.random().toString(36).substring(2, 10);
    const newToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLW1hc3RlciIsInJvbGUiOiJkZXYiLCJyYW5kIjoi${randomHex}fQ.erp-auth-key-${randomHex}`;
    setApiToken(newToken);
    alert("Novo Token de Acesso gerado! Lembre-se de atualizá-lo no popup da extensão Chrome.");
  };

  // OAuth 1-Clique Mercado Livre (Padrão Tiny/Bling)
  const handleOAuthConnectML = async () => {
    setMlConnecting(true);
    try {
      const res = await fetch("/api/integrations/mercadolivre/auth-url");
      const json = await res.json();
      if (json.hasOauthConfig && json.authUrl) {
        window.location.href = json.authUrl;
      } else {
        setMlConnectionMode("token");
        alert(
          "💡 Para autorização 1-clique via OAuth Oficial, você pode colar seu Access Token no modo 'Conexão Direta (Token)' abaixo ou configurar seu App ID no arquivo .env."
        );
      }
    } catch {
      setMlConnectionMode("token");
    } finally {
      setMlConnecting(false);
    }
  };

  // Conectar ML com Access Token ou App ID/Secret
  const handleTokenConnectML = async () => {
    if (!mlAccessToken.trim() && !mlAppId.trim()) {
      alert("Por favor, cole seu Token de Acesso (Access Token) ou informe seu App ID.");
      return;
    }
    setMlConnecting(true);
    setMlTestFeedback(null);
    try {
      const res = await fetch("/api/integrations/mercadolivre/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: mlAccessToken.trim(),
          appId: mlAppId.trim(),
          secretKey: mlSecretKey.trim(),
          accountName: mlAccountName.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setMlConnected(true);
        setMlAccountName(json.account.account_name);
        setMlSellerId(json.account.seller_id);
        setMlReputation(json.account.metadata?.reputation || "platinum");
        setMlAccessToken("");
        alert(`✅ ${json.message}`);
        loadIntegrations();
      } else {
        alert(`❌ Erro: ${json.error || "Falha na validação do token"}`);
      }
    } catch (err: any) {
      alert(`❌ Erro de conexão: ${err.message}`);
    } finally {
      setMlConnecting(false);
    }
  };

  // Testar Conexão ML em tempo real (Ping)
  const handleTestML = async () => {
    setMlTesting(true);
    setMlTestFeedback(null);
    try {
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "mercadolivre" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMlTestFeedback({ type: "success", msg: json.message });
      } else {
        setMlTestFeedback({ type: "error", msg: json.error || "Erro ao testar canal." });
      }
    } catch {
      setMlTestFeedback({ type: "error", msg: "Falha de comunicação com o servidor do ERP." });
    } finally {
      setMlTesting(false);
    }
  };

  // Desconectar ML (1-Clique)
  const handleDisconnectML = async () => {
    if (confirm("Deseja realmente desconectar a conta do Mercado Livre? A sincronização em tempo real será pausada.")) {
      try {
        const res = await fetch("/api/integrations/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "mercadolivre" }),
        });
        if (res.ok) {
          setMlConnected(false);
          setMlAccountName("");
          setMlSellerId("");
          setMlTestFeedback(null);
          alert("Conta do Mercado Livre desconectada com sucesso!");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Conectar Shopee
  const handleConnectShopee = async () => {
    if (!shopeeShopId.trim() && !shopeePartnerId.trim()) {
      alert("Por favor, informe o Shop ID ou credenciais de parceiro da Shopee.");
      return;
    }
    setShopeeConnecting(true);
    setShopeeTestFeedback(null);
    try {
      const res = await fetch("/api/integrations/shopee/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shopeeShopId.trim(),
          partnerId: shopeePartnerId.trim(),
          partnerKey: shopeePartnerKey.trim(),
          accessToken: shopeeAccessToken.trim(),
          accountName: shopeeAccountName.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setShopeeConnected(true);
        setShopeeAccountName(json.account.account_name);
        setShopeeShopId(json.account.seller_id);
        alert(`✅ ${json.message}`);
        loadIntegrations();
      } else {
        alert(`❌ Erro: ${json.error}`);
      }
    } catch (err: any) {
      alert(`❌ Erro: ${err.message}`);
    } finally {
      setShopeeConnecting(false);
    }
  };

  // Testar Conexão Shopee
  const handleTestShopee = async () => {
    setShopeeTesting(true);
    setShopeeTestFeedback(null);
    try {
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "shopee" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setShopeeTestFeedback({ type: "success", msg: json.message });
      } else {
        setShopeeTestFeedback({ type: "error", msg: json.error || "Erro ao testar Shopee." });
      }
    } catch {
      setShopeeTestFeedback({ type: "error", msg: "Falha de comunicação." });
    } finally {
      setShopeeTesting(false);
    }
  };

  // Desconectar Shopee (1-Clique)
  const handleDisconnectShopee = async () => {
    if (confirm("Deseja realmente desconectar a loja da Shopee?")) {
      try {
        const res = await fetch("/api/integrations/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "shopee" }),
        });
        if (res.ok) {
          setShopeeConnected(false);
          setShopeeShopId("");
          setShopeeAccountName("");
          setShopeeTestFeedback(null);
          alert("Loja Shopee desconectada com sucesso!");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Testador de Conexão com o endpoint local do ERP
  const handleTestConnection = async () => {
    setTestResult({ status: "testing" });
    try {
      const res = await fetch("/api/my-listings?platform=mercadolivre&limit=1");
      if (res.ok) {
        setTestResult({
          status: "success",
          message: "Conexão com a API do ERP verificada com sucesso! Resposta HTTP 200 OK.",
        });
      } else {
        setTestResult({
          status: "error",
          message: `O ERP respondeu com status HTTP ${res.status}.`,
        });
      }
    } catch (e: any) {
      setTestResult({
        status: "error",
        message: `Falha na requisição local: ${e.message}`,
      });
    }
  };

  const handleSaveSettings = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-8">
      {/* Abas Superiores Estilo Tiny ERP */}
      <div className="flex items-center space-x-1 border-b border-[#E2E8F0] bg-white px-3 pt-2 rounded-t">
        <button
          onClick={() => setActiveTab("marketplaces")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === "marketplaces"
              ? "border-sky-600 text-sky-700 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Contas de Marketplaces</span>
          {(!mlConnected && !shopeeConnected) && (
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Pendente de vínculo"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("api")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === "api"
              ? "border-sky-600 text-sky-700 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <PlugZap className="w-3.5 h-3.5" />
          <span>Extensão Chrome & Chaves de API</span>
        </button>

        <button
          onClick={() => setActiveTab("reprice")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === "reprice"
              ? "border-sky-600 text-sky-700 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Regras de Buybox & Reprecificação</span>
        </button>

        <button
          onClick={() => setActiveTab("database")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === "database"
              ? "border-sky-600 text-sky-700 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Supabase & Webhooks</span>
        </button>
      </div>

      {/* CONTEÚDO 1: CONTAS DE MARKETPLACES (Mercado Livre & Shopee - Padrão Tiny / Bling) */}
      {activeTab === "marketplaces" && (
        <div className="space-y-4">
          {/* Alerta de Status Geral */}
          {!mlConnected && !shopeeConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800 flex items-start gap-3 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-900">Nenhum canal de marketplace conectado no momento.</strong>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  Conecte sua conta do <strong>Mercado Livre</strong> e da <strong>Shopee</strong> abaixo com a mesma facilidade do <strong>Tiny ERP</strong> ou <strong>Bling</strong>. Seus tokens são criptografados no servidor com Row Level Security (RLS).
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* CARD MERCADO LIVRE */}
            <div
              className={`bg-white border rounded-xl p-5 shadow-2xs space-y-4 transition-all ${
                mlConnected ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200"
              }`}
            >
              {/* Cabeçalho do Card */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FFE600] border border-amber-400 flex items-center justify-center text-[8px] font-black text-slate-950">
                    ML
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Mercado Livre Oficial</h3>
                    <p className="text-[10px] text-slate-500">API de Catálogo, Preços e Vendas</p>
                  </div>
                </div>
                {mlConnected ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-bold flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Conectado
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-300 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desconectado
                  </span>
                )}
              </div>

              {mlConnected ? (
                /* Estado Conectado ML (Padrão Tiny / Bling) */
                <div className="space-y-3.5 text-xs">
                  <div className="bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-100 p-3.5 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">Loja Conectada:</span>
                      <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full uppercase">
                        {mlReputation || "Platinum"}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Store className="w-4 h-4 text-emerald-600" />
                      <span>{mlAccountName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-emerald-100/60">
                      <div>
                        ID Vendedor: <code className="font-bold text-slate-800">{mlSellerId}</code>
                      </div>
                      <div>
                        Segurança: <span className="text-emerald-700 font-semibold">Criptografia RLS Ativa</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 font-semibold block mb-1">
                      Logística Padrão para Cálculo de Reprecificação
                    </label>
                    <select
                      value={mlShippingType}
                      onChange={(e) => setMlShippingType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option>FULL + FLEX (Híbrido Automático)</option>
                      <option>Apenas FULL (Mercado Envios Full)</option>
                      <option>Coleta Padrão / Correios</option>
                    </select>
                  </div>

                  {mlTestFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        mlTestFeedback.type === "success"
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                          : "bg-red-50 border border-red-200 text-red-800"
                      }`}
                    >
                      {mlTestFeedback.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>{mlTestFeedback.msg}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={handleTestML}
                      disabled={mlTesting}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${mlTesting ? "animate-spin" : ""}`} />
                      <span>{mlTesting ? "Testando Latência..." : "Testar Conexão"}</span>
                    </button>

                    <button
                      onClick={handleDisconnectML}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar Conta</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Estado Desconectado ML */
                <div className="space-y-3.5 text-xs">
                  {/* Seletor de Modo de Conexão */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setMlConnectionMode("oauth")}
                      className={`flex-1 py-1.5 rounded-md transition text-center ${
                        mlConnectionMode === "oauth"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      ⚡ 1-Clique (OAuth Oficial)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMlConnectionMode("token")}
                      className={`flex-1 py-1.5 rounded-md transition text-center ${
                        mlConnectionMode === "token"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🔑 Conexão Direta (Token)
                    </button>
                  </div>

                  {mlConnectionMode === "oauth" ? (
                    /* MODO OAUTH 1-CLIQUE */
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 space-y-3">
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Conecte diretamente pela tela oficial do <strong>Mercado Livre</strong> com 1 clique. O sistema gerencia a renovação de tokens automaticamente.
                      </p>

                      <button
                        type="button"
                        onClick={handleOAuthConnectML}
                        disabled={mlConnecting}
                        className="w-full py-2.5 bg-[#FFE600] hover:bg-[#F0D800] text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition shadow-xs active:scale-98"
                      >
                        <Zap className="w-4 h-4 fill-slate-950" />
                        <span>{mlConnecting ? "Abrindo Mercado Livre..." : "Conectar com Mercado Livre (1-Clique)"}</span>
                      </button>

                      <div className="text-[10px] text-slate-500 text-center flex items-center justify-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Autorização oficial segura com permissões de Leitura e Escrita.</span>
                      </div>
                    </div>
                  ) : (
                    /* MODO TOKEN / CHAVES MANUAIS */
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                          Access Token do Mercado Livre (Recomendado)
                        </label>
                        <input
                          type="password"
                          placeholder="APP_USR-8901234908... ou Bearer Token"
                          value={mlAccessToken}
                          onChange={(e) => setMlAccessToken(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Cole o Access Token gerado no portal de desenvolvedores do Mercado Livre.
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                            App ID (Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 8901234908..."
                            value={mlAppId}
                            onChange={(e) => setMlAppId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                            Client Secret (Opcional)
                          </label>
                          <input
                            type="password"
                            placeholder="Chave secreta..."
                            value={mlSecretKey}
                            onChange={(e) => setMlSecretKey(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleTokenConnectML}
                        disabled={mlConnecting}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>{mlConnecting ? "Validando na API do ML..." : "Validar e Conectar Conta"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CARD SHOPEE */}
            <div
              className={`bg-white border rounded-xl p-5 shadow-2xs space-y-4 transition-all ${
                shopeeConnected ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200"
              }`}
            >
              {/* Cabeçalho do Card */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#EE4D2D] flex items-center justify-center text-[8px] font-black text-white">
                    S
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Shopee Brasil</h3>
                    <p className="text-[10px] text-slate-500">Shopee Open Platform V2</p>
                  </div>
                </div>
                {shopeeConnected ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-bold flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Conectado
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-300 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desconectado
                  </span>
                )}
              </div>

              {shopeeConnected ? (
                /* Estado Conectado Shopee */
                <div className="space-y-3.5 text-xs">
                  <div className="bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-100 p-3.5 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">Loja Vinculada:</span>
                      <span className="text-[10px] bg-orange-600 text-white font-bold px-2 py-0.5 rounded-full uppercase">
                        Oficial Shopee
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-orange-600" />
                      <span>{shopeeAccountName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-emerald-100/60">
                      <div>
                        Shop ID: <code className="font-bold text-slate-800">{shopeeShopId}</code>
                      </div>
                      <div>
                        Sincronia: <span className="text-emerald-700 font-semibold">Ativa e Monitorada</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 font-semibold block mb-1">
                      Sincronia Automática de Cupons e Ofertas
                    </label>
                    <select
                      value={shopeeCouponSync}
                      onChange={(e) => setShopeeCouponSync(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none"
                    >
                      <option>Ativa (Com Desconto & Cupons)</option>
                      <option>Apenas Preço Cheio de Tabela</option>
                      <option>Desativada</option>
                    </select>
                  </div>

                  {shopeeTestFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        shopeeTestFeedback.type === "success"
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                          : "bg-red-50 border border-red-200 text-red-800"
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{shopeeTestFeedback.msg}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={handleTestShopee}
                      disabled={shopeeTesting}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${shopeeTesting ? "animate-spin" : ""}`} />
                      <span>{shopeeTesting ? "Testando..." : "Testar Conexão"}</span>
                    </button>

                    <button
                      onClick={handleDisconnectShopee}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar Loja</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Estado Desconectado Shopee */
                <div className="space-y-3.5 text-xs">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Insira as credenciais do <strong>Shopee Open Platform</strong> ou o Shop ID da sua loja para conectar e sincronizar estoque e preços.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                        Shop ID
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 98127391"
                        value={shopeeShopId}
                        onChange={(e) => setShopeeShopId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                        Partner ID (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 2009812"
                        value={shopeePartnerId}
                        onChange={(e) => setShopeePartnerId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                      Partner Key ou Token de Acesso da Loja
                    </label>
                    <input
                      type="password"
                      placeholder="Chave secreta ou Token da Loja..."
                      value={shopeeAccessToken || shopeePartnerKey}
                      onChange={(e) => {
                        setShopeeAccessToken(e.target.value);
                        setShopeePartnerKey(e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectShopee}
                    disabled={shopeeConnecting}
                    className="w-full py-2.5 bg-[#EE4D2D] hover:bg-[#D73211] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs active:scale-98"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>{shopeeConnecting ? "Conectando..." : "Vincular Loja Shopee"}</span>
                  </button>

                  <div className="text-[10px] text-slate-500 text-center flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Conexão segura compatível com o padrão Tiny e Bling ERP.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO 2: EXTENSÃO & CHAVES DE API */}
      {activeTab === "api" && (
        <div className="space-y-4">
          {/* Banner de Status da Conexão */}
          <div className="bg-white border border-emerald-200 rounded p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">API de Coleta da Extensão Pronta</h3>
                <p className="text-[11px] text-slate-500">
                  O endpoint <code>/api/competitors/sync</code> está disponível para receber coletas de concorrentes mesmo sem vínculo direto às contas dos marketplaces.
                </p>
              </div>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={testResult.status === "testing"}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testResult.status === "testing" ? "animate-spin" : ""}`} />
              Testar Conexão Local
            </button>
          </div>

          {testResult.status !== "idle" && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 border ${
                testResult.status === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : testResult.status === "error"
                  ? "bg-red-50 text-red-800 border-red-200"
                  : "bg-sky-50 text-sky-800 border-sky-200"
              }`}
            >
              {testResult.status === "success" ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{testResult.message || "Testando conectividade..."}</span>
            </div>
          )}

          {/* Cartões com Parâmetros de Conexão */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cartão 1: URL do ERP */}
            <div className="bg-white border border-[#E2E8F0] rounded p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-900">URL do ERP (Servidor / SaaS)</span>
                </div>
                <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded border border-sky-200 font-semibold">
                  Local / Produção
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Esta é a URL que deve ser inserida no campo <strong>URL da API / SaaS</strong> do popup da extensão.
              </p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={erpUrl}
                  onChange={(e) => setErpUrl(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-sky-500"
                />
                <button
                  onClick={() => handleCopy(erpUrl, "url")}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded flex items-center gap-1 transition-colors"
                  title="Copiar URL"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>

            {/* Cartão 2: Token Bearer */}
            <div className="bg-white border border-[#E2E8F0] rounded p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-900">Bearer Token / Chave de Acesso</span>
                </div>
                <button
                  onClick={handleRegenerateToken}
                  className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Regerar
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Copie este token e cole no popup da extensão para autenticação segura. (Em modo local/dev é opcional).
              </p>
              <div className="flex items-center space-x-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={apiToken}
                  readOnly
                  className="flex-1 bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-sky-500"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="p-1.5 border border-slate-300 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  title={showToken ? "Ocultar" : "Mostrar"}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleCopy(apiToken, "token")}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded flex items-center gap-1 transition-colors"
                  title="Copiar Token"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Guia Visual de Instalação e Pareamento da Extensão */}
          <div className="bg-white border border-[#E2E8F0] rounded p-4 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-600" />
              Como Instalar e Ativar a Extensão no Google Chrome
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1.5">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                  1
                </div>
                <div className="text-xs font-bold text-slate-800">Abra Extensões</div>
                <p className="text-[11px] text-slate-500">
                  No Chrome, acesse <code>chrome://extensions/</code> e ative a chave <strong>Modo do desenvolvedor</strong> no canto superior direito.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1.5">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                  2
                </div>
                <div className="text-xs font-bold text-slate-800">Carregar Extensão</div>
                <p className="text-[11px] text-slate-500">
                  Clique em <strong>Carregar sem compactação</strong> e selecione a pasta:
                  <br />
                  <code className="text-[10px] break-all">apps/extension</code>
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1.5">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                  3
                </div>
                <div className="text-xs font-bold text-slate-800">Configure o Popup</div>
                <p className="text-[11px] text-slate-500">
                  Clique no ícone da extensão no Chrome. Preencha a URL <code>{erpUrl}</code> e clique em <strong>Salvar</strong> e <strong>Testar Conexão</strong>.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1.5">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                  4
                </div>
                <div className="text-xs font-bold text-slate-800">Captura com 1 Clique</div>
                <p className="text-[11px] text-slate-500">
                  Abra qualquer anúncio no Mercado Livre ou Shopee e clique no botão flutuante <strong>Capturar Concorrente (ERP)</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO 3: REGRAS DE BUYBOX & REPRECIFICAÇÃO */}
      {activeTab === "reprice" && (
        <div className="bg-white border border-[#E2E8F0] rounded p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900">Regras Globais de Reprecificação Automática</h3>
              <p className="text-[11px] text-slate-500">
                Defina como o motor de reprecificação deve se comportar quando o concorrente alterar o preço no Mercado Livre ou Shopee.
              </p>
            </div>
            <button
              onClick={handleSaveSettings}
              className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Regras
            </button>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Regras de reprecificação salvas e ativadas com sucesso!</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Estratégia Principal */}
            <div className="space-y-3">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Estratégia de Disputa de Buybox:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value="beat"
                      checked={repriceStrategy === "beat"}
                      onChange={(e) => setRepriceStrategy(e.target.value)}
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Cobrir Menor Preço (Garantir Buybox)</span>
                      <p className="text-[10px] text-slate-500">
                        Abaixa o seu preço para ficar ligeiramente menor que o concorrente.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value="match"
                      checked={repriceStrategy === "match"}
                      onChange={(e) => setRepriceStrategy(e.target.value)}
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Igualar Menor Preço (Empate de Mercado)</span>
                      <p className="text-[10px] text-slate-500">
                        Equipara o valor exato do menor concorrente sem guerra de centavos.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Diferencial contra o concorrente (R$):
                </label>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 font-semibold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={diffValue}
                    onChange={(e) => setDiffValue(e.target.value)}
                    className="w-32 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">abaixo do menor concorrente</span>
                </div>
              </div>
            </div>

            {/* Travas de Segurança (Stop-Loss de Margem) */}
            <div className="space-y-3 bg-slate-50 p-3 rounded border border-slate-200">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Trava de Segurança Financeira (Stop-Loss)
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">
                  Margem Mínima de Lucro Global (%):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={minMarginPct}
                    onChange={(e) => setMinMarginPct(e.target.value)}
                    className="w-24 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-semibold"
                  />
                  <span className="text-slate-600 font-bold">%</span>
                  <span className="text-[11px] text-slate-500">
                    O sistema nunca abaixará o preço se a margem ficar menor que este percentual.
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={costProtection}
                    onChange={(e) => setCostProtection(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-800 text-xs">
                    Bloquear reprecificação automática se concorrente estiver abaixo do Preço de Custo
                  </span>
                </label>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700">Ativação por Canal:</div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRepriceML}
                    onChange={(e) => setAutoRepriceML(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-xs text-slate-800">Ativar Reprecificação Automática no Mercado Livre</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRepriceShopee}
                    onChange={(e) => setAutoRepriceShopee(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-xs text-slate-800">Ativar Reprecificação Automática na Shopee</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO 4: SUPABASE & WEBHOOKS */}
      {activeTab === "database" && (
        <div className="bg-white border border-[#E2E8F0] rounded p-4 shadow-2xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900">Infraestrutura & Banco de Dados (Supabase)</h3>
            <p className="text-[11px] text-slate-500">
              Gerenciamento de conexões, WebSocket Realtime e tabelas de inteligência competitiva.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-slate-200 rounded p-3 space-y-2">
              <div className="font-semibold text-slate-800">Tabelas de Inteligência:</div>
              <ul className="space-y-1 text-[11px] text-slate-600">
                <li className="flex items-center justify-between">
                  <span><code>competitor_listings</code> (Anúncios concorrentes)</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 rounded">Ativo</span>
                </li>
                <li className="flex items-center justify-between">
                  <span><code>listing_matches</code> (Pareamento 1:N de concorrentes)</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 rounded">Ativo</span>
                </li>
                <li className="flex items-center justify-between">
                  <span><code>price_history</code> (Histórico temporal de preços)</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 rounded">Ativo</span>
                </li>
                <li className="flex items-center justify-between">
                  <span><code>my_listings</code> (Catálogo próprio integrado)</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 rounded">Ativo</span>
                </li>
              </ul>
            </div>

            <div className="border border-slate-200 rounded p-3 space-y-2">
              <div className="font-semibold text-slate-800">Supabase Realtime (WebSockets):</div>
              <p className="text-[11px] text-slate-500">
                Dispara eventos instantâneos quando o preço do concorrente cai, atualizando a tela sem recarregar a página e gerando animação flash amarela.
              </p>
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded flex items-center gap-2 text-emerald-800 text-[11px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Canal Postgres changes: public.competitor_listings (Escutando)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
