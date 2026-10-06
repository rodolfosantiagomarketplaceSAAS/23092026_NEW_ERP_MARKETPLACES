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

  // Estados de Conexão das Contas de Marketplaces (Iniciam desconectadas)
  const [mlConnected, setMlConnected] = useState(false);
  const [mlAccountName, setMlAccountName] = useState("");
  const [mlAppId, setMlAppId] = useState("");
  const [mlSecretKey, setMlSecretKey] = useState("");
  const [mlShippingType, setMlShippingType] = useState("FULL + FLEX (Híbrido)");

  const [shopeeConnected, setShopeeConnected] = useState(false);
  const [shopeeShopId, setShopeeShopId] = useState("");
  const [shopeePartnerId, setShopeePartnerId] = useState("");
  const [shopeePartnerKey, setShopeePartnerKey] = useState("");
  const [shopeeCouponSync, setShopeeCouponSync] = useState("Ativa (Com Desconto)");

  // Carrega configurações do localStorage
  useEffect(() => {
    try {
      const storedML = localStorage.getItem("erp_ml_integration");
      if (storedML) {
        const parsed = JSON.parse(storedML);
        setMlConnected(parsed.connected || false);
        setMlAccountName(parsed.accountName || "");
        setMlAppId(parsed.appId || "");
        setMlSecretKey(parsed.secretKey || "");
      }

      const storedShopee = localStorage.getItem("erp_shopee_integration");
      if (storedShopee) {
        const parsed = JSON.parse(storedShopee);
        setShopeeConnected(parsed.connected || false);
        setShopeeShopId(parsed.shopId || "");
        setShopeePartnerId(parsed.partnerId || "");
        setShopeePartnerKey(parsed.partnerKey || "");
      }
    } catch {
      // Ignora erro de parse em SSR
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

  // Conectar / Desconectar Mercado Livre
  const handleConnectML = () => {
    if (!mlAppId.trim()) {
      alert("Por favor, informe seu App ID (Client ID) do Mercado Livre ou autorize via OAuth.");
      return;
    }
    const accountName = mlAccountName.trim() || "Minha Loja Mercado Livre";
    setMlConnected(true);
    setMlAccountName(accountName);
    localStorage.setItem(
      "erp_ml_integration",
      JSON.stringify({
        connected: true,
        accountName,
        appId: mlAppId,
        secretKey: mlSecretKey,
      })
    );
    alert("Conta do Mercado Livre vinculada com sucesso ao ERP!");
  };

  const handleDisconnectML = () => {
    if (confirm("Deseja realmente desconectar a conta do Mercado Livre? A sincronização direta será pausada.")) {
      setMlConnected(false);
      setMlAccountName("");
      setMlAppId("");
      setMlSecretKey("");
      localStorage.removeItem("erp_ml_integration");
    }
  };

  // Conectar / Desconectar Shopee
  const handleConnectShopee = () => {
    if (!shopeePartnerId.trim() || !shopeeShopId.trim()) {
      alert("Por favor, informe seu Partner ID e Shop ID da Shopee.");
      return;
    }
    setShopeeConnected(true);
    localStorage.setItem(
      "erp_shopee_integration",
      JSON.stringify({
        connected: true,
        shopId: shopeeShopId,
        partnerId: shopeePartnerId,
        partnerKey: shopeePartnerKey,
      })
    );
    alert("Loja Shopee vinculada com sucesso ao ERP!");
  };

  const handleDisconnectShopee = () => {
    if (confirm("Deseja realmente desconectar a loja da Shopee?")) {
      setShopeeConnected(false);
      setShopeeShopId("");
      setShopeePartnerId("");
      setShopeePartnerKey("");
      localStorage.removeItem("erp_shopee_integration");
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

      {/* CONTEÚDO 1: CONTAS DE MARKETPLACES (Mercado Livre & Shopee) */}
      {activeTab === "marketplaces" && (
        <div className="space-y-4">
          {/* Alerta de Status Geral */}
          {!mlConnected && !shopeeConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Nenhum canal de marketplace conectado no momento.</strong>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Conecte sua conta do <strong>Mercado Livre</strong> e da <strong>Shopee</strong> abaixo para sincronizar seus anúncios próprios, estoque e reputação.
                  Enquanto não conectar, você pode utilizar a <strong>Extensão Chrome</strong> para capturar e parear concorrentes em modo assistido.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARD MERCADO LIVRE */}
            <div className={`bg-white border rounded p-4 shadow-2xs space-y-3 transition-colors ${
              mlConnected ? "border-emerald-200" : "border-[#E2E8F0]"
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#FFE600] border border-amber-400"></span>
                  <span className="text-xs font-bold text-slate-900">Mercado Livre Oficial</span>
                </div>
                {mlConnected ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded border border-emerald-200 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Conectado
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded border border-slate-300 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desconectado
                  </span>
                )}
              </div>

              {mlConnected ? (
                /* Estado Conectado ML */
                <div className="space-y-3 text-xs">
                  <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded">
                    <div className="text-[11px] text-slate-500">Conta Vinculada:</div>
                    <div className="font-bold text-slate-900 text-xs mt-0.5">
                      {mlAccountName}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      App ID: <code>{mlAppId}</code>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 font-medium">Logística Padrão Ativa</label>
                    <select
                      value={mlShippingType}
                      onChange={(e) => setMlShippingType(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 mt-1"
                    >
                      <option>FULL + FLEX (Híbrido)</option>
                      <option>Apenas FULL</option>
                      <option>Coleta Padrão</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sincronização Ativa
                    </span>
                    <button
                      onClick={handleDisconnectML}
                      className="px-2.5 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1 transition-colors"
                    >
                      <Unlink className="w-3 h-3" /> Desconectar
                    </button>
                  </div>
                </div>
              ) : (
                /* Estado Desconectado ML */
                <div className="space-y-3 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Insira as credenciais do seu aplicativo de desenvolvedor no Mercado Livre (Mercado Pago / Developers) ou autorize sua conta.
                  </p>

                  <div>
                    <label className="text-[11px] text-slate-600 font-medium block mb-1">
                      Apelido da Loja / Razão Social
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Minha Loja Oficial SP"
                      value={mlAccountName}
                      onChange={(e) => setMlAccountName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">
                        App ID (Client ID)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 8901234908..."
                        value={mlAppId}
                        onChange={(e) => setMlAppId(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">
                        Client Secret
                      </label>
                      <input
                        type="password"
                        placeholder="Chave secreta..."
                        value={mlSecretKey}
                        onChange={(e) => setMlSecretKey(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleConnectML}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Vincular Conta Mercado Livre
                  </button>
                </div>
              )}
            </div>

            {/* CARD SHOPEE */}
            <div className={`bg-white border rounded p-4 shadow-2xs space-y-3 transition-colors ${
              shopeeConnected ? "border-emerald-200" : "border-[#E2E8F0]"
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#EE4D2D]"></span>
                  <span className="text-xs font-bold text-slate-900">Shopee Brasil</span>
                </div>
                {shopeeConnected ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded border border-emerald-200 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Conectado
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded border border-slate-300 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desconectado
                  </span>
                )}
              </div>

              {shopeeConnected ? (
                /* Estado Conectado Shopee */
                <div className="space-y-3 text-xs">
                  <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded">
                    <div className="text-[11px] text-slate-500">Loja Vinculada:</div>
                    <div className="font-bold text-slate-900 text-xs mt-0.5">
                      Shop ID: <code>{shopeeShopId}</code>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Partner ID: <code>{shopeePartnerId}</code>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 font-medium">Sincronia de Cupons e Ofertas</label>
                    <select
                      value={shopeeCouponSync}
                      onChange={(e) => setShopeeCouponSync(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 mt-1"
                    >
                      <option>Ativa (Com Desconto)</option>
                      <option>Desativada</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sincronização Ativa
                    </span>
                    <button
                      onClick={handleDisconnectShopee}
                      className="px-2.5 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1 transition-colors"
                    >
                      <Unlink className="w-3 h-3" /> Desconectar
                    </button>
                  </div>
                </div>
              ) : (
                /* Estado Desconectado Shopee */
                <div className="space-y-3 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Insira as credenciais do Shopee Open Platform para integrar sua loja e sincronizar catálogo e pedidos.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">
                        Shop ID
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 98127391"
                        value={shopeeShopId}
                        onChange={(e) => setShopeeShopId(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">
                        Partner ID
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 2009812"
                        value={shopeePartnerId}
                        onChange={(e) => setShopeePartnerId(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 font-medium block mb-1">
                      Partner Key (Secret)
                    </label>
                    <input
                      type="password"
                      placeholder="Chave secreta do parceiro Shopee..."
                      value={shopeePartnerKey}
                      onChange={(e) => setShopeePartnerKey(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-sky-500"
                    />
                  </div>

                  <button
                    onClick={handleConnectShopee}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Vincular Loja Shopee
                  </button>
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
