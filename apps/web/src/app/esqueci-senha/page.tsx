"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { requestPasswordReset } from "@/lib/services/auth";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Por favor, informe um endereço de e-mail corporativo válido.");
      return;
    }

    setLoading(true);

    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(
        err.message || "Erro ao solicitar redefinição. Tente novamente mais tarde."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-100 selection:bg-sky-500 selection:text-white relative overflow-hidden">
      {/* Background glow visual */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Topo: Logo & Título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-xl shadow-sky-500/25 mb-4">
            <Zap className="w-6 h-6 fill-white text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Recuperação de Senha
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Redefina o acesso seguro da sua Conta Mestra do ERP
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-5">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">E-mail de Recuperação Enviado</h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Se o e-mail <span className="font-semibold text-slate-200">{email}</span> estiver cadastrado na base do ERP, você receberá um link com instruções para cadastrar uma nova senha.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-left text-xs text-slate-400 mb-6 space-y-1">
                <span className="font-semibold text-slate-300 block">Dica de Segurança:</span>
                <span>• Verifique também sua caixa de Spam ou Lixo Eletrônico.</span>
                <span>• O link de redefinição expira automaticamente após uso.</span>
              </div>
              <Link
                href="/login"
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para a tela de login</span>
              </Link>
            </div>
          ) : (
            <div>
              <div className="flex items-center space-x-3 mb-6 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs">
                <KeyRound className="w-5 h-5 shrink-0" />
                <span>
                  Informe o e-mail cadastrado na sua conta para receber as instruções de recuperação.
                </span>
              </div>

              {errorMessage && (
                <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    E-mail Cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@empresa.com.br"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Enviando instruções...</span>
                      </>
                    ) : (
                      <>
                        <span>Enviar Link de Recuperação</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-800 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para o Login</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Informações de Segurança */}
        <div className="mt-6 flex items-center justify-center space-x-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Proteção contra enumeração de contas e ataques de força bruta</span>
        </div>
      </div>
    </div>
  );
}
