"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Users,
  Search,
  CheckCircle,
  Ban,
  Clock,
  Building2,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface AdminUserItem {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  is_master: boolean;
  status: "active" | "pending_confirmation" | "suspended";
  created_at: string;
  organization?: {
    id: string;
    code: string;
    trade_name: string;
    corporate_name?: string;
    document_type: string;
    document_number: string;
    plan_status: string;
    plan_tier: string;
    created_at: string;
  };
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "active" | "suspended">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      } else {
        setToastMessage({ type: "error", text: data.error || "Erro ao carregar usuários." });
      }
    } catch {
      setToastMessage({ type: "error", text: "Falha na comunicação com o servidor." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAction = async (userId: string, action: "approve" | "suspend") => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();

      if (data.success) {
        setToastMessage({
          type: "success",
          text:
            action === "approve"
              ? "Acesso liberado com sucesso! Usuário agora pode entrar no ERP."
              : "Acesso bloqueado com sucesso.",
        });
        await fetchUsers();
      } else {
        setToastMessage({ type: "error", text: data.error || "Erro ao processar ação." });
      }
    } catch {
      setToastMessage({ type: "error", text: "Erro ao processar a solicitação." });
    } finally {
      setActionLoading(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(filterText.toLowerCase()) ||
      u.email?.toLowerCase().includes(filterText.toLowerCase()) ||
      u.organization?.trade_name?.toLowerCase().includes(filterText.toLowerCase()) ||
      u.organization?.code?.toLowerCase().includes(filterText.toLowerCase()) ||
      u.organization?.document_number?.includes(filterText);

    if (!matchesSearch) return false;

    if (statusFilter === "pending") return u.status === "pending_confirmation";
    if (statusFilter === "active") return u.status === "active";
    if (statusFilter === "suspended") return u.status === "suspended";

    return true;
  });

  const pendingCount = users.filter((u) => u.status === "pending_confirmation").length;
  const activeCount = users.filter((u) => u.status === "active").length;
  const suspendedCount = users.filter((u) => u.status === "suspended").length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* Topo: Título & Botão Atualizar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Painel Geral: Liberação de Assinantes
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Controle mestre de contas, liberação de acesso após confirmação de pagamento da mensalidade.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center space-x-2 py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-400" : ""}`} />
          <span>Atualizar Lista</span>
        </button>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2.5 animate-in fade-in ${
            toastMessage.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Total de Cadastros</span>
          <span className="text-2xl font-extrabold text-white">{users.length}</span>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-xs text-amber-400 block mb-1 font-medium">Aguardando Pagamento</span>
          <span className="text-2xl font-extrabold text-amber-300">{pendingCount}</span>
        </div>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-xs text-emerald-400 block mb-1 font-medium">Acessos Liberados</span>
          <span className="text-2xl font-extrabold text-emerald-300">{activeCount}</span>
        </div>
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <span className="text-xs text-rose-400 block mb-1 font-medium">Bloqueados / Suspensos</span>
          <span className="text-2xl font-extrabold text-rose-300">{suspendedCount}</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        {/* Campo de Busca */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar por nome, email, empresa, CNPJ ou código EMP..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
          />
        </div>

        {/* Abas de Status */}
        <div className="flex items-center space-x-1 text-xs">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === "all" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Todos ({users.length})
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === "pending"
                ? "bg-amber-600 text-white"
                : "text-amber-400/80 hover:text-amber-300"
            }`}
          >
            Aguardando ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white"
                : "text-emerald-400/80 hover:text-emerald-300"
            }`}
          >
            Ativos ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter("suspended")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === "suspended"
                ? "bg-rose-600 text-white"
                : "text-rose-400/80 hover:text-rose-300"
            }`}
          >
            Bloqueados ({suspendedCount})
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Empresa (Tenant)</th>
                <th className="py-3 px-4">Titular Mestre</th>
                <th className="py-3 px-4">Documento</th>
                <th className="py-3 px-4">Data Cadastro</th>
                <th className="py-3 px-4">Status Acesso</th>
                <th className="py-3 px-4 text-right">Ação do Administrador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhum cliente encontrado para este filtro.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item) => {
                  const isPending = item.status === "pending_confirmation";
                  const isActive = item.status === "active";
                  const isSuspended = item.status === "suspended";
                  const isCurrentAction = actionLoading === item.id;
                  const isSuperAdminAccount = item.email === "rodolfo.mecatronica@gmail.com";

                  return (
                    <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                      {/* Empresa */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start space-x-2.5">
                          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-white block">
                              {item.organization?.trade_name || "Sem Empresa"}
                            </span>
                            <span className="text-[10px] font-mono text-sky-400">
                              {item.organization?.code || "EMP-N/A"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Titular */}
                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-medium text-slate-200 block">
                            {item.full_name}
                          </span>
                          <span className="text-[11px] text-slate-400 block">{item.email}</span>
                          {item.phone && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />
                              {item.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Documento */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {item.organization?.document_number || "—"}
                      </td>

                      {/* Data Cadastro */}
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(item.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                            <Clock className="w-3 h-3" />
                            Aguardando Pagamento
                          </span>
                        )}
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                            <CheckCircle className="w-3 h-3" />
                            Liberado / Ativo
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-semibold">
                            <Ban className="w-3 h-3" />
                            Bloqueado
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        {isSuperAdminAccount ? (
                          <span className="text-[10px] text-sky-400 font-bold px-2 py-1 bg-sky-500/10 rounded-md border border-sky-500/20">
                            Super Administrador
                          </span>
                        ) : (
                          <div className="inline-flex items-center space-x-2">
                            {!isActive && (
                              <button
                                onClick={() => handleAction(item.id, "approve")}
                                disabled={isCurrentAction}
                                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-sm flex items-center space-x-1.5"
                                title="Confirmar pagamento e liberar acesso imediato"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>{isCurrentAction ? "Liberando..." : "Liberar Acesso (Pago)"}</span>
                              </button>
                            )}

                            {!isSuspended && (
                              <button
                                onClick={() => handleAction(item.id, "suspend")}
                                disabled={isCurrentAction}
                                className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 font-medium text-xs transition-all"
                                title="Bloquear acesso deste usuário ao ERP"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Bloquear</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
