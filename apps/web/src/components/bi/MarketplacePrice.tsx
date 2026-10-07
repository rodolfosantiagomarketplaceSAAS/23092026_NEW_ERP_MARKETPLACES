import React from "react";

interface MarketplacePriceProps {
  currentPrice: number;
  originalPrice?: number | null;
  showInstallments?: boolean;
  align?: "left" | "right" | "center";
  size?: "sm" | "md" | "lg";
}

/**
 * Renderiza preço no estilo oficial dos Marketplaces (Mercado Livre / Shopee):
 * - Preço original riscado (quando houver desconto)
 * - Preço promocional em destaque com centavos sobrescritos
 * - Selo de desconto verde (Ex: "12% OFF")
 * - Linha de parcelamento em até 12x
 */
export function MarketplacePrice({
  currentPrice,
  originalPrice,
  showInstallments = true,
  align = "right",
  size = "md",
}: MarketplacePriceProps) {
  const price = Number(currentPrice) || 0;
  const original = originalPrice ? Number(originalPrice) : null;
  const hasDiscount = !!(original && original > price);

  const discountPct = hasDiscount
    ? Math.round(((original - price) / original) * 100)
    : 0;

  // Separação de inteiros e centavos
  const integerPart = Math.floor(price).toLocaleString("pt-BR");
  const cents = Math.round((price % 1) * 100)
    .toString()
    .padStart(2, "0");

  // Parcelamento simulado (até 12x sem juros)
  const installments = price >= 60 ? 12 : price >= 30 ? 6 : 3;
  const installmentValue = (price / installments).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const alignClasses = {
    left: "text-left items-start",
    right: "text-right items-end ml-auto",
    center: "text-center items-center mx-auto",
  }[align];

  const sizeClasses = {
    sm: {
      orig: "text-[10px]",
      price: "text-xs font-bold",
      cents: "text-[9px] -top-0.5",
      badge: "text-[9px] px-1 py-0.2",
      install: "text-[9.5px]",
    },
    md: {
      orig: "text-[11px]",
      price: "text-sm sm:text-base font-bold",
      cents: "text-[10px] sm:text-[11px] font-bold -top-1",
      badge: "text-[10px] px-1.5 py-0.5",
      install: "text-[10px]",
    },
    lg: {
      orig: "text-xs",
      price: "text-lg font-black",
      cents: "text-xs font-bold -top-1.5",
      badge: "text-[11px] px-2 py-0.5",
      install: "text-[11px]",
    },
  }[size];

  return (
    <div className={`flex flex-col ${alignClasses} select-none leading-none`}>
      {/* 1. Preço Original Riscado */}
      {hasDiscount && (
        <span
          className={`${sizeClasses.orig} text-slate-400 line-through font-normal block leading-tight mb-0.5`}
          title={`Preço original sem desconto: R$ ${original.toFixed(2)}`}
        >
          R${" "}
          {original.toLocaleString("pt-BR", {
            minimumFractionDigits: original % 1 !== 0 ? 2 : 0,
            maximumFractionDigits: 2,
          })}
        </span>
      )}

      {/* 2. Preço Promocional em Destaque + Badge % OFF */}
      <div
        className={`flex items-baseline gap-1.5 ${
          align === "right"
            ? "justify-end"
            : align === "center"
            ? "justify-center"
            : "justify-start"
        }`}
      >
        <span
          className={`text-slate-900 tracking-tight leading-none ${sizeClasses.price}`}
        >
          R$ {integerPart}
          <sup className={`font-semibold ml-0.5 relative ${sizeClasses.cents}`}>
            {cents}
          </sup>
        </span>

        {hasDiscount && discountPct > 0 && (
          <span
            className={`inline-flex items-center font-extrabold bg-[#00A650] text-white rounded tracking-tight leading-none uppercase shrink-0 shadow-2xs ${sizeClasses.badge}`}
            title={`Desconto de ${discountPct}% aplicado`}
          >
            {discountPct}% OFF
          </span>
        )}
      </div>

      {/* 3. Parcelamento (12x R$ ...) */}
      {showInstallments && price >= 20 && (
        <div
          className={`${sizeClasses.install} text-slate-500 font-normal mt-0.5 leading-tight`}
        >
          {installments}x R$ {installmentValue}
        </div>
      )}
    </div>
  );
}
