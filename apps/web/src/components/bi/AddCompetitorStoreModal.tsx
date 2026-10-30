"use client";

import React, { useState } from "react";
import { X, PlusCircle, Store, AlertCircle } from "lucide-react";

interface AddCompetitorStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function AddCompetitorStoreModal({
  isOpen,
  onClose,
  onSuccess,
}: AddCompetitorStoreModalProps) {
  if (!isOpen) return null;

  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [segment, setSegment] = useState("Acessórios Automotivos");
  const [isFollowing, setIsFollowing] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!storeName.trim()) {
      setErrorMsg("O nome da loja concorrente é obrigatório.");
      return;
    }

    if (!storeUrl.trim()) {
      setErrorMsg("A URL da loja do Mercado Livre é obrigatória.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/competitors/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: storeName.trim(),
          store_url: storeUrl.trim(),
          segment: segment.trim() || "Geral",
          is_following: isFollowing,
          notes: notes.trim() || null,
          platform: "mercadolivre",
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        onSuccess(`✅ Concorrente "${storeName}" cadastrado com sucesso!`);
        onClose();
        setStoreName("");
        setStoreUrl("");
        setNotes("");
      } else {
        setErrorMsg(json.error || "Não foi possível cadastrar o concorrente.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Erro de conexão ao cadastrar concorrente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Cadastrar Loja de Concorrente
              </h3>
              <p className="text-xs text-slate-500">
                Salve o link e seguimento para rastreamento contínuo no ERP.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nome da Loja / Vendedor
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Ex: AutoPeças Silva Oficial, Loja Tech..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-semibold"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Link da Loja no Mercado Livre (URL)
            </label>
            <input
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https://www.mercadolivre.com.br/pagina/..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700"
              required
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              💡 Você também pode capturar automaticamente usando o botão flutuante da extensão na página da loja!
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Seguimento / Nicho de Atuação
            </label>
            <input
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="Ex: Acessórios Automotivos, Moda, Eletrônicos..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              required
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-800">Seguir Concorrente</div>
              <div className="text-[11px] text-slate-500">Ativa o monitoramento prioritário deste seller.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isFollowing}
                onChange={(e) => setIsFollowing(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observações Estratégicas (Opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Concorrente com frete grátis e foco em kits..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{submitting ? "Cadastrando..." : "Cadastrar Loja"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

