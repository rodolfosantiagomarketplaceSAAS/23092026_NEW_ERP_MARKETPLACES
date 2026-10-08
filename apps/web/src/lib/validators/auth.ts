import { z } from "zod";

/**
 * Validação algorítmica rigorosa de CPF brasileiro (Módulo 11)
 * Idêntico ao padrão utilizado no Bling e Tiny ERP para titulares pessoa física
 */
export function validateCPF(cpfRaw: string): boolean {
  if (!cpfRaw) return false;
  const cpf = cpfRaw.replace(/\D/g, "");

  if (cpf.length !== 11) return false;
  // Rejeita sequências de dígitos idênticos (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  let d1 = rev >= 10 ? 0 : rev;
  if (d1 !== parseInt(cpf.charAt(9), 10)) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  let d2 = rev >= 10 ? 0 : rev;
  return d2 === parseInt(cpf.charAt(10), 10);
}

/**
 * Validação algorítmica rigorosa de CNPJ brasileiro (Módulo 11)
 * Idêntico ao padrão utilizado no Bling e Tiny ERP para empresas / pessoas jurídicas
 */
export function validateCNPJ(cnpjRaw: string): boolean {
  if (!cnpjRaw) return false;
  const cnpj = cnpjRaw.replace(/\D/g, "");

  if (cnpj.length !== 14) return false;
  // Rejeita sequências de dígitos idênticos (ex: 000.000.000/0000-00)
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += parseInt(cnpj.charAt(i), 10) * weights1[i];
  }
  let rest1 = sum1 % 11;
  let d1 = rest1 < 2 ? 0 : 11 - rest1;
  if (d1 !== parseInt(cnpj.charAt(12), 10)) return false;

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += parseInt(cnpj.charAt(i), 10) * weights2[i];
  }
  let rest2 = sum2 % 11;
  let d2 = rest2 < 2 ? 0 : 11 - rest2;
  return d2 === parseInt(cnpj.charAt(13), 10);
}

/**
 * Remove qualquer caractere que não seja número (sanitização de segurança)
 */
export function sanitizeDocument(doc: string): string {
  if (!doc) return "";
  return doc.replace(/\D/g, "");
}

/**
 * Formata CPF ou CNPJ com máscara dinâmica
 */
export function formatDocument(val: string, type: "cpf" | "cnpj"): string {
  const digits = sanitizeDocument(val);
  if (type === "cpf") {
    // 000.000.000-00
    const limited = digits.slice(0, 11);
    return limited
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // 00.000.000/0000-00
    const limited = digits.slice(0, 14);
    return limited
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
}

/**
 * Formata telefone brasileiro com DDD: (11) 98765-4321 ou (11) 3456-7890
 */
export function formatPhone(val: string): string {
  const digits = sanitizeDocument(val).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

/**
 * Avaliador de Força de Senha Corporativa (Padrão Tiny & Bling)
 */
export interface PasswordStrengthResult {
  score: number; // 0 a 4
  label: "Muito fraca" | "Fraca" | "Média" | "Forte" | "Excelente";
  color: string;
  hasMinLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const hasMinLength = (password || "").length >= 8;
  const hasUpperCase = /[A-Z]/.test(password || "");
  const hasLowerCase = /[a-z]/.test(password || "");
  const hasNumber = /[0-9]/.test(password || "");
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password || "");

  let score = 0;
  if (hasMinLength) score++;
  if (hasUpperCase && hasLowerCase) score++;
  if (hasNumber) score++;
  if (hasSpecialChar) score++;

  let label: PasswordStrengthResult["label"] = "Muito fraca";
  let color = "bg-rose-500";

  switch (score) {
    case 1:
      label = "Fraca";
      color = "bg-amber-500";
      break;
    case 2:
      label = "Média";
      color = "bg-yellow-500";
      break;
    case 3:
      label = "Forte";
      color = "bg-sky-500";
      break;
    case 4:
      label = "Excelente";
      color = "bg-emerald-500";
      break;
    default:
      label = "Muito fraca";
      color = "bg-rose-500";
  }

  return {
    score,
    label,
    color,
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar,
  };
}

/**
 * SCHEMA ZOD: Cadastro de Conta Mestra do ERP
 * Reúne dados do Titular + Dados da Empresa (Tenant)
 */
export const masterRegisterSchema = z
  .object({
    // Dados do Titular (Administrador Mestre)
    full_name: z
      .string({ required_error: "Nome completo é obrigatório" })
      .trim()
      .min(3, "O nome deve conter pelo menos 3 caracteres")
      .max(120, "O nome não pode exceder 120 caracteres"),
    email: z
      .string({ required_error: "E-mail corporativo é obrigatório" })
      .trim()
      .toLowerCase()
      .email("Informe um endereço de e-mail corporativo válido"),
    phone: z
      .string({ required_error: "Telefone ou WhatsApp é obrigatório" })
      .trim()
      .refine(
        (val) => sanitizeDocument(val).length >= 10,
        "Telefone inválido. Informe o DDD e pelo menos 8 dígitos"
      ),
    password: z
      .string({ required_error: "Senha é obrigatória" })
      .min(8, "A senha deve ter no mínimo 8 caracteres")
      .refine(
        (val) => /[A-Z]/.test(val) && /[a-z]/.test(val) && /[0-9]/.test(val),
        "A senha deve conter letras maiúsculas, minúsculas e números"
      ),
    confirm_password: z
      .string({ required_error: "Confirmação de senha é obrigatória" }),

    // Dados da Empresa (Tenant ERP)
    trade_name: z
      .string({ required_error: "Nome Fantasia ou Nome da Loja é obrigatório" })
      .trim()
      .min(2, "Nome da loja/fantasia deve ter pelo menos 2 caracteres"),
    corporate_name: z
      .string()
      .trim()
      .optional()
      .default(""),
    document_type: z.enum(["cnpj", "cpf"], {
      required_error: "Selecione o tipo de documento",
    }),
    document_number: z
      .string({ required_error: "Número do documento é obrigatório" })
      .trim(),
    state_registration: z
      .string()
      .trim()
      .optional()
      .default("ISENTO"),

    // Aceite de Termos e LGPD
    terms_accepted: z.boolean().refine((val) => val === true, {
      message: "Você deve aceitar os Termos de Uso e a Política de Privacidade",
    }),
  })
  .superRefine((data, ctx) => {
    // 1. Confirmação de senha idêntica
    if (data.password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "As senhas não coincidem",
      });
    }

    // 2. Validação matemática de CPF ou CNPJ conforme o tipo escolhido
    const cleanDoc = sanitizeDocument(data.document_number);
    if (data.document_type === "cnpj") {
      if (!validateCNPJ(cleanDoc)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["document_number"],
          message: "CNPJ inválido. Verifique os dígitos digitados",
        });
      }
    } else {
      if (!validateCPF(cleanDoc)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["document_number"],
          message: "CPF inválido. Verifique os dígitos digitados",
        });
      }
    }
  });

export type MasterRegisterInput = z.infer<typeof masterRegisterSchema>;

/**
 * SCHEMA ZOD: Login no ERP
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "E-mail é obrigatório" })
    .trim()
    .toLowerCase()
    .email("E-mail inválido"),
  password: z
    .string({ required_error: "Senha é obrigatória" })
    .min(1, "Digite sua senha"),
  remember_me: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * SCHEMA ZOD: Esqueci a Senha
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "E-mail é obrigatório" })
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido para recuperação"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * SCHEMA ZOD: Redefinição de Senha
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string({ required_error: "Nova senha é obrigatória" })
      .min(8, "A nova senha deve ter no mínimo 8 caracteres")
      .refine(
        (val) => /[A-Z]/.test(val) && /[a-z]/.test(val) && /[0-9]/.test(val),
        "A nova senha deve conter letras maiúsculas, minúsculas e números"
      ),
    confirm_password: z
      .string({ required_error: "Confirmação de senha é obrigatória" }),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "As senhas não coincidem",
      });
    }
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
