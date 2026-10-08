"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/validators/auth";
import { updatePassword } from "@/lib/services/auth";

export default function RedefinirSenhaPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = evaluatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("A nova senha deve possuir pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("As senhas digitadas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      await updatePassword(password);
      setSuccess(true);
    } catch (err: any) {
      setErrorMessage(
        err.message || "Erro ao atualizar a senha. O link pode ter expirado."
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
            Criar Nova Senha
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Defina uma nova senha segura para sua Conta Mestra
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {success ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-5">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Senha Alterada com Sucesso!</h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Sua credencial de acesso foi atualizada com sucesso. Agora você pode acessar o painel do ERP com sua nova senha.
              </p>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
              >
                <span>Ir para o Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div>
              {errorMessage && (
                <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nova Senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nova Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
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

                  {/* Medidor de Força */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Força da nova senha:</span>
                        <span className="font-semibold text-slate-200">
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1 rounded-full transition-all ${
                              passwordStrength.score >= level
                                ? passwordStrength.color
                                : "bg-slate-800"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirmar Nova Senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirmar Nova Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Botão de Envio */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Atualizando senha...</span>
                      </>
                    ) : (
                      <>
                        <span>Salvar Nova Senha</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Informações de Segurança */}
        <div className="mt-6 flex items-center justify-center space-x-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Políticas de segurança criptográfica aplicadas</span>
        </div>
      </div>
    </div>
  );
}
