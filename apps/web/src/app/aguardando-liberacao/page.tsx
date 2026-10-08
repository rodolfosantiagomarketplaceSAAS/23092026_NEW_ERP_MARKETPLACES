"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Clock,
  ShieldCheck,
  CheckCircle,
  MessageCircle,
  LogOut,
  RefreshCw,
  CreditCard,
  Building2,
  Lock,
} from "lucide-react";
import { getCurrentUserProfileAndOrg, signOutUser } from "@/lib/services/auth";

export default function AguardandoLiberacaoPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getCurrentUserProfileAndOrg().then((res) => {
      setProfile(res.user);
      setOrg(res.organization);
    });
  }, []);

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const res = await getCurrentUserProfileAndOrg();
      if (
        res.user?.role === "master_admin" &&
        res.user?.email === "rodolfo.mecatronica@gmail.com"
      ) {
        router.push("/inteligencia");
        return;
      }
      if (res.user?.status === "active") {
        router.push("/inteligencia");
        return;
      }
    } finally {
      setTimeout(() => setChecking(false), 800);
    }
  };

  const whatsappMessage = encodeURIComponent(
    `Olá Rodolfo! Acabei de me cadastrar no ERP Marketplaces com o email "${profile?.email || ""}" (Empresa: "${org?.trade_name || ""}") e gostaria de confirmar o pagamento da mensalidade para liberar meu acesso.`
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-100 selection:bg-sky-500 selection:text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-lg relative z-10">
        {/* Topo: Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-amber-500/20 mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Acesso Pendente de Liberação
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Plataforma ERP com Controle Estrito de Assinantes
          </p>
        </div>

        {/* Card Principal */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl backdrop-blur-sm space-y-6">
          {/* Alerta de Status */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3.5">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <h4 className="font-semibold text-amber-300">
                Aguardando Confirmação da Mensalidade
              </h4>
              <p className="text-slate-300 leading-relaxed">
                O acesso às ferramentas de Gestão de Catálogo, Concorrência e Inteligência do ERP é liberado exclusivamente após a confirmação do pagamento pelo Administrador Geral.
              </p>
            </div>
          </div>

          {/* Dados da Conta Cadastrada */}
          {profile && org && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Código da Conta:</span>
                <span className="font-mono font-bold text-sky-400">{org.code}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Empresa / Loja:</span>
                <span className="font-medium text-white">{org.trade_name}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Titular Cadastrado:</span>
                <span className="text-slate-200">{profile.full_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">E-mail de Login:</span>
                <span className="text-slate-200">{profile.email}</span>
              </div>
            </div>
          )}

          {/* Instruções para Liberação */}
          <div className="space-y-3 pt-1">
            <h5 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span>Como liberar seu acesso agora:</span>
            </h5>
            <p className="text-xs text-slate-400 leading-relaxed">
              Entre em contato direto com o Administrador Geral (**Rodolfo Santiago**) para informar o pagamento da mensalidade e solicitar a ativação imediata da sua conta.
            </p>

            <a
              href={`https://wa.me/?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Falar com o Administrador para Liberar</span>
            </a>
          </div>

          {/* Botões de Ação */}
          <div className="pt-2 flex items-center space-x-3 border-t border-slate-800/80">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin text-sky-400" : ""}`} />
              <span>{checking ? "Verificando..." : "Já paguei, verificar acesso"}</span>
            </button>

            <button
              onClick={() => signOutUser()}
              className="py-2.5 px-3 rounded-xl bg-slate-850 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 text-xs font-medium transition-all flex items-center space-x-1.5"
              title="Encerrar sessão"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Rodapé de Segurança */}
        <div className="mt-6 flex items-center justify-center space-x-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Isolamento seguro de dados ativo no ERP</span>
        </div>
      </div>
    </div>
  );
}
