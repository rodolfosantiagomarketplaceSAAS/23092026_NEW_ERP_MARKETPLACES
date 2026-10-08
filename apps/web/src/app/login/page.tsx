"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { signInWithEmail } from "@/lib/services/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Por favor, preencha o e-mail e a senha.");
      return;
    }

    setLoading(true);

    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
      // Redireciona para o painel principal do ERP
      router.push("/inteligencia");
      router.refresh();
    } catch (err: any) {
      setErrorMessage(
        err.message || "E-mail ou senha incorretos. Verifique suas credenciais de acesso."
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
            Acessar ERP Marketplaces
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Plataforma Corporativa de Inteligência e Gestão de Canais
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Campo E-mail */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail de Acesso
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

            {/* Campo Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Senha
                </label>
                <Link
                  href="/esqueci-senha"
                  className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
                >
                  Esqueci a senha
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checkbox Lembrar de mim */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-800 text-sky-500 focus:ring-0"
                />
                <span>Lembrar meu usuário</span>
              </label>
            </div>

            {/* Botão de Login */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no ERP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Destaque para Criar Conta Mestra */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400 mb-3">Ainda não possui uma conta de acesso?</p>
            <Link
              href="/cadastro"
              className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 text-sky-400 hover:text-sky-300 font-semibold text-xs transition-all space-x-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cadastrar Conta Mestra (30 dias grátis)</span>
            </Link>
          </div>
        </div>

        {/* Informações de Segurança */}
        <div className="mt-6 flex items-center justify-center space-x-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Conexão criptografada de ponta a ponta (SSL 256-Bit)</span>
        </div>
      </div>
    </div>
  );
}
