"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  Building2,
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  TrendingUp,
  ShoppingBag,
  Layers,
} from "lucide-react";
import {
  formatDocument,
  formatPhone,
  sanitizeDocument,
  validateCPF,
  validateCNPJ,
  evaluatePasswordStrength,
} from "@/lib/validators/auth";
import { registerMasterAccount, signInWithEmail } from "@/lib/services/auth";

export default function CadastroMasterPage() {
  const router = useRouter();

  // Etapa atual do formulário (1: Titular, 2: Empresa)
  const [step, setStep] = useState<1 | 2>(1);

  // Estados dos Campos - Passo 1 (Titular Mestre)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Estados dos Campos - Passo 2 (Empresa / Tenant)
  const [documentType, setDocumentType] = useState<"cnpj" | "cpf">("cnpj");
  const [documentNumber, setDocumentNumber] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [corporateName, setCorporateName] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [isStateRegistrationExempt, setIsStateRegistrationExempt] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(true);

  // Estados de Controle & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    accountCode: string;
    tradeName: string;
    email: string;
  } | null>(null);

  // Medidor de Força da Senha
  const passwordStrength = evaluatePasswordStrength(password);

  // Validação dinâmica do documento
  const cleanDoc = sanitizeDocument(documentNumber);
  const isDocumentValid =
    documentType === "cnpj" ? validateCNPJ(cleanDoc) : validateCPF(cleanDoc);

  // Validação para avançar do Passo 1 para o Passo 2
  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (fullName.trim().length < 3) {
      setErrorMessage("Por favor, informe seu nome completo (mínimo 3 caracteres).");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      setErrorMessage("Informe um endereço de e-mail corporativo válido.");
      return;
    }
    if (sanitizeDocument(phone).length < 10) {
      setErrorMessage("Informe um número de telefone com DDD válido.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("As senhas digitadas não conferem.");
      return;
    }

    setStep(2);
  };

  // Submissão Final do Cadastro
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isDocumentValid) {
      setErrorMessage(
        documentType === "cnpj"
          ? "CNPJ informado é inválido. Verifique os dígitos digitados."
          : "CPF informado é inválido. Verifique os dígitos digitados."
      );
      return;
    }

    if (tradeName.trim().length < 2) {
      setErrorMessage("Informe o Nome Fantasia da sua empresa ou loja.");
      return;
    }

    if (!termsAccepted) {
      setErrorMessage("É necessário aceitar os Termos de Uso e Política de Privacidade.");
      return;
    }

    setLoading(true);

    try {
      const response = await registerMasterAccount({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        confirm_password: confirmPassword,
        document_type: documentType,
        document_number: cleanDoc,
        trade_name: tradeName.trim(),
        corporate_name: corporateName.trim() || tradeName.trim(),
        state_registration: isStateRegistrationExempt ? "ISENTO" : stateRegistration.trim(),
        terms_accepted: termsAccepted,
      });

      // Tenta login automático para redirecionamento fluido
      try {
        await signInWithEmail(email.trim().toLowerCase(), password);
      } catch (authErr) {
        // Ignora caso requira login explícito
      }

      setSuccessData({
        accountCode: response.data?.organization.code || "EMP-MASTER",
        tradeName: tradeName.trim(),
        email: email.trim().toLowerCase(),
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Ocorreu um erro ao processar o cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Coluna Esquerda: Apresentação Corporativa (Padrão Tiny & Bling) */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 border-r border-slate-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Elemento de iluminação estética */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Topo: Logo & Badge */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">ERP MARKETPLACES</span>
              <span className="block text-xs text-sky-400 font-medium tracking-wide uppercase">
                Padrão Tiny & Bling Enterprise
              </span>
            </div>
          </div>

          <div className="mt-12 space-y-4">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Experimente grátis por 30 dias sem cartão de crédito</span>
            </div>

            <h1 className="text-3xl font-extrabold text-white leading-tight">
              A Conta Mestra para acelerar sua operação multicanal.
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Estrutura empresarial com controle multi-tenant, isolamento de dados bancário, catálogo
              centralizado e sincronização de Mercado Livre e Shopee.
            </p>
          </div>
        </div>

        {/* Destaques do ERP (Inspirado no Tiny e Bling) */}
        <div className="relative z-10 space-y-4 my-8">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 backdrop-blur-sm flex items-start space-x-3.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Monitoramento de Buybox & Concorrentes</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Rastreamento em tempo real de preços, reputação e pareamentos para vencer na Buybox.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 backdrop-blur-sm flex items-start space-x-3.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Integração Mercado Livre & Shopee</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralize anúncios e pedidos em um único painel inteligente sem redundâncias.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 backdrop-blur-sm flex items-start space-x-3.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Segurança & Isolamento de Dados</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Arquitetura multi-tenant com Row-Level Security e conformidade integral com a LGPD.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="relative z-10 pt-6 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>© 2026 ERP Marketplaces SAAS</span>
          <span>Ambiente Seguro SSL 256-Bit</span>
        </div>
      </div>

      {/* Coluna Direita: Formulário de Cadastro da Conta Mestra */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-xl">
          {/* Logo Mobile */}
          <div className="lg:hidden flex items-center space-x-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <span className="font-bold text-lg text-white">ERP MARKETPLACES</span>
          </div>

          {/* Card de Sucesso (Exibido após cadastro concluído) */}
          {successData ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Conta Mestra Criada com Sucesso!</h2>
              <p className="text-slate-400 text-sm mb-6">
                Sua empresa foi provisionada com 30 dias de avaliação gratuita completa no ERP.
              </p>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 mb-8 text-left space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-700/40 pb-2">
                  <span className="text-slate-400">Código da Conta (ID da Empresa):</span>
                  <span className="font-mono font-bold text-sky-400 text-sm">
                    {successData.accountCode}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-slate-700/40 pb-2">
                  <span className="text-slate-400">Empresa / Loja:</span>
                  <span className="font-semibold text-white">{successData.tradeName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">E-mail do Titular:</span>
                  <span className="text-slate-300">{successData.email}</span>
                </div>
              </div>

              <button
                onClick={() => router.push("/inteligencia")}
                className="w-full py-3.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all shadow-lg shadow-sky-600/25 flex items-center justify-center space-x-2"
              >
                <span>Acessar o Painel do ERP</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
              {/* Cabeçalho do Formulário */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">Criar Conta Mestra</h2>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-medium">
                    Passo {step} de 2
                  </span>
                </div>

                {/* Stepper visual (Passo 1 e Passo 2) */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={`h-1.5 rounded-full transition-all ${
                      step >= 1 ? "bg-sky-500" : "bg-slate-800"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1 && fullName && email && password) setStep(2);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      step >= 2 ? "bg-sky-500" : "bg-slate-800"
                    }`}
                  />
                </div>

                <p className="text-slate-400 text-xs">
                  {step === 1
                    ? "Passo 1: Identificação do Titular e Administrador da Conta Mestra."
                    : "Passo 2: Informações da Empresa (Tenant) e Dados Tributários."}
                </p>
              </div>

              {/* Mensagem de Erro */}
              {errorMessage && (
                <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* ============================================================== */}
              {/* ETAPA 1: DADOS DO TITULAR MESTRE */}
              {/* ============================================================== */}
              {step === 1 && (
                <form onSubmit={handleNextStep} className="space-y-4">
                  {/* Nome Completo */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nome Completo do Titular *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ex: João da Silva"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* E-mail Corporativo */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      E-mail de Acesso Corporativo *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.nome@empresa.com.br"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* WhatsApp / Celular */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      WhatsApp / Celular com DDD *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        placeholder="(11) 98765-4321"
                        maxLength={15}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Senha de Acesso Mestre *
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

                    {/* Medidor de Força da Senha */}
                    {password.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Segurança da senha:</span>
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
                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-2 pt-0.5">
                          <span className={passwordStrength.hasMinLength ? "text-emerald-400" : ""}>
                            • Mín. 8 dígitos
                          </span>
                          <span className={passwordStrength.hasUpperCase ? "text-emerald-400" : ""}>
                            • 1 Maiúscula
                          </span>
                          <span className={passwordStrength.hasNumber ? "text-emerald-400" : ""}>
                            • 1 Número
                          </span>
                          <span className={passwordStrength.hasSpecialChar ? "text-emerald-400" : ""}>
                            • 1 Símbolo
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirmação de Senha */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha digitada"
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

                  {/* Botão de Avançar */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
                    >
                      <span>Avançar para Dados da Empresa</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}

              {/* ============================================================== */}
              {/* ETAPA 2: DADOS DA EMPRESA (TENANT ERP) */}
              {/* ============================================================== */}
              {step === 2 && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Tipo de Documento: CNPJ ou CPF */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Tipo de Pessoa *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentType("cnpj");
                          setDocumentNumber("");
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                          documentType === "cnpj"
                            ? "bg-sky-600/20 border-sky-500 text-sky-400"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        Pessoa Jurídica (CNPJ)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentType("cpf");
                          setDocumentNumber("");
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                          documentType === "cpf"
                            ? "bg-sky-600/20 border-sky-500 text-sky-400"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        Pessoa Física (CPF)
                      </button>
                    </div>
                  </div>

                  {/* Número do Documento */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {documentType === "cnpj" ? "CNPJ da Empresa *" : "CPF do Titular *"}
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={documentNumber}
                        onChange={(e) =>
                          setDocumentNumber(formatDocument(e.target.value, documentType))
                        }
                        placeholder={
                          documentType === "cnpj" ? "00.000.000/0001-00" : "000.000.000-00"
                        }
                        maxLength={documentType === "cnpj" ? 18 : 14}
                        className={`w-full bg-slate-950 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all ${
                          cleanDoc.length >= (documentType === "cnpj" ? 14 : 11)
                            ? isDocumentValid
                              ? "border-emerald-500 focus:ring-emerald-500"
                              : "border-rose-500 focus:ring-rose-500"
                            : "border-slate-800 focus:border-sky-500 focus:ring-sky-500"
                        }`}
                      />
                    </div>
                    {cleanDoc.length >= (documentType === "cnpj" ? 14 : 11) && !isDocumentValid && (
                      <span className="text-[10px] text-rose-400 mt-1 block">
                        Dígito verificador do {documentType.toUpperCase()} inválido.
                      </span>
                    )}
                  </div>

                  {/* Nome Fantasia / Loja */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nome Fantasia / Nome da Loja *
                    </label>
                    <input
                      type="text"
                      required
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      placeholder="Ex: Minha Loja Marketplaces"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                    />
                  </div>

                  {/* Razão Social (Opcional ou para PJ) */}
                  {documentType === "cnpj" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Razão Social Oficial (Opcional)
                      </label>
                      <input
                        type="text"
                        value={corporateName}
                        onChange={(e) => setCorporateName(e.target.value)}
                        placeholder="Ex: Minha Loja Comércio Eletrônico Ltda"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                  )}

                  {/* Inscrição Estadual (Padrão Tiny e Bling) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        Inscrição Estadual (IE)
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={isStateRegistrationExempt}
                          onChange={(e) => setIsStateRegistrationExempt(e.target.checked)}
                          className="rounded border-slate-800 text-sky-500 focus:ring-0"
                        />
                        <span>Isento</span>
                      </label>
                    </div>
                    {!isStateRegistrationExempt && (
                      <input
                        type="text"
                        value={stateRegistration}
                        onChange={(e) => setStateRegistration(e.target.value)}
                        placeholder="Número da Inscrição Estadual"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    )}
                  </div>

                  {/* Termos de Uso e LGPD */}
                  <div className="pt-2">
                    <label className="flex items-start space-x-2.5 cursor-pointer text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-slate-800 text-sky-500 focus:ring-0"
                      />
                      <span className="leading-relaxed">
                        Li e concordo com os{" "}
                        <span className="text-sky-400 hover:underline">Termos de Uso</span> e a{" "}
                        <span className="text-sky-400 hover:underline">
                          Política de Privacidade (LGPD)
                        </span>
                        .
                      </span>
                    </label>
                  </div>

                  {/* Botões Voltar e Finalizar */}
                  <div className="pt-3 flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all flex items-center space-x-1.5"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Voltar</span>
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Provisionando Conta Mestra...</span>
                        </>
                      ) : (
                        <>
                          <span>Concluir Cadastro & Começar Grátis</span>
                          <CheckCircle2 className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Rodapé: Link para Login */}
              <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
                <span>Já possui uma conta no ERP? </span>
                <Link
                  href="/login"
                  className="font-semibold text-sky-400 hover:text-sky-300 hover:underline"
                >
                  Fazer login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
