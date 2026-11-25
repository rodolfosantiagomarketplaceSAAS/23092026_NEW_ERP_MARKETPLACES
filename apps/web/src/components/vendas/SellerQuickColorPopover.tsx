"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Palette, X } from "lucide-react";
import type { Seller } from "@/types/ml-sales";
import { SELLER_COLOR_SWATCHES } from "./formatters";

interface SellerQuickColorPopoverProps {
  seller: Pick<Seller, "id" | "name" | "color_hex">;
  sizeClassName?: string;
  onColorSaved: () => void;
}

/**
 * Botão indicador da cor do vendedor que, ao ser clicado, abre um Popover flutuante em Portal
 * permitindo trocar rapidamente a cor (paleta operacional ou cor personalizada Hex/RGB).
 */
export function SellerQuickColorPopover({
  seller,
  sizeClassName = "w-3 h-3",
  onColorSaved,
}: SellerQuickColorPopoverProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [hexValue, setHexValue] = useState(seller.color_hex || "#0284C7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setHexValue(seller.color_hex || "#0284C7");
  }, [seller.color_hex]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(ev: MouseEvent) {
      const target = ev.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function togglePopover(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const popWidth = 248;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - popWidth - 12)
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - 210);
    setCoords({ top, left });
    setError(null);
    setOpen(true);
  }

  async function saveColor(nextHex: string) {
    const normalized = nextHex.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      setError("Use formato #RRGGBB (ex: #059669)");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ml/sellers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: seller.id,
          color_hex: normalized,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Falha ao atualizar cor.");
      }
      setHexValue(normalized);
      setOpen(false);
      onColorSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={`Alterar cor do vendedor ${seller.name}`}
        title={`Clique para alterar a cor de ${seller.name}`}
        onClick={togglePopover}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setCoords({ top: rect.bottom + 8, left: rect.left });
            setOpen((prev) => !prev);
          }
        }}
        style={{ backgroundColor: seller.color_hex }}
        className={`${sizeClassName} inline-block rounded-xs shrink-0 ring-1 ring-black/20 hover:scale-125 hover:ring-2 hover:ring-slate-900 transition-transform cursor-pointer`}
      />

      {mounted &&
        open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[9999] w-64 bg-white border-2 border-slate-900 rounded shadow-2xl p-3 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                <Palette className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <span className="truncate">Cor: {seller.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 text-slate-400 hover:text-slate-800"
                aria-label="Fechar seletor de cor"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {SELLER_COLOR_SWATCHES.map((swatch) => {
                const isCurrent = hexValue.toUpperCase() === swatch.toUpperCase();
                return (
                  <button
                    key={swatch}
                    type="button"
                    disabled={saving}
                    onClick={() => saveColor(swatch)}
                    style={{ backgroundColor: swatch }}
                    className={`h-6 rounded-xs border flex items-center justify-center transition-transform hover:scale-105 ${
                      isCurrent
                        ? "ring-2 ring-offset-1 ring-slate-900 border-white"
                        : "border-black/15"
                    }`}
                    title={`Aplicar cor ${swatch}`}
                    aria-label={`Aplicar cor ${swatch}`}
                  >
                    {isCurrent && <Check className="w-3 h-3 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-1.5 border-t border-slate-100 space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Cor Personalizada (Hex)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  aria-label="Seletor visual de cor"
                  value={/^#[0-9A-Fa-f]{6}$/.test(hexValue) ? hexValue : "#0284C7"}
                  onChange={(e) => setHexValue(e.target.value.toUpperCase())}
                  className="w-7 h-7 p-0 border border-slate-300 rounded-xs cursor-pointer bg-white shrink-0"
                />
                <input
                  type="text"
                  maxLength={7}
                  value={hexValue}
                  onChange={(e) => setHexValue(e.target.value.toUpperCase())}
                  placeholder="#0284C7"
                  className="w-24 px-2 py-1 border border-slate-300 rounded-xs font-mono text-[11px] text-slate-900 focus:outline-none focus:border-slate-900"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveColor(hexValue)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xs bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-bold"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span>Salvar</span>
                  )}
                </button>
              </div>
              {error && <div className="text-[10px] text-rose-600 font-semibold">{error}</div>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
