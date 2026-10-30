"use client";

import React, { useState } from "react";
import { X, Save, ExternalLink, Bookmark, CheckCircle2, AlertCircle } from "lucide-react";
import type { CompetitorStore } from "@crm/types";

interface EditCompetitorModalProps {
  store: CompetitorStore | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const COMMON_SEGMENTS = [
  "Acessórios Automotivos",
  "Películas & Proteção",
  "Tuning & Estética",
  "Ferramentas & Construção",
  "Eletrônicos & Áudio",
  "Casa & Decoração",
  "Informática & Celulares",
  "Moda & Vestuário",
  "Esportes & Lazer",
  "Geral",
];

export function EditCompetitorModal({
  store,
  isOpen,
  onClose,
  onSuccess,
}: EditCompetitorModalProps) {
  if (!isOpen || !store) return null;

  const [segment, setSegment] = useState(store.segment || "Acessórios Automotivos");
  const [isFollowing, setIsFollowing] = useState(store.is_following);
  const [storeName, setStoreName] = useState(store.store_name);
  const [notes, setNotes] = useState(store.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/competitors/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: segment.trim(),
          is_following: isFollowing,
          store_name: storeName.trim(),
          notes: notes.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        onSuccess(`✅ Concorrente "${storeName}" atualizado com sucesso!`);
        onClose();
      } else {
        setErrorMsg(json.error || "Não foi possível salvar as alterações.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Erro de conexão ao salvar.");
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
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Editar Concorrente & Seguimento
              </h3>
              <p className="text-xs text-slate-500">
                Ajuste o nicho de mercado e status de monitoramento no ERP.
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

          {/* Nome da Loja */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nome da Loja Concorrente
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-semibold"
              required
            />
          </div>

          {/* Seguimento / Nicho */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Seguimento / Nicho de Atuação
            </label>
            <input
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="Ex: Acessórios Automotivos, Películas, Moda..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 mb-2"
              required
            />
            {/* Sugestões rápidas de nichos */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_SEGMENTS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSegment(s)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                    segment.toLowerCase() === s.toLowerCase()
                      ? "bg-indigo-600 text-white font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Status de Seguir */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-800">Seguir este Concorrente</div>
              <div className="text-[11px] text-slate-500">
                Concorrentes seguidos recebem prioridade nas análises e varreduras do ERP.
              </div>
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

          {/* Link Salvo da Loja no ERP */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Link Salvo da Loja no ERP
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={store.store_url}
                className="w-full text-xs font-mono text-slate-600 bg-slate-100 px-3 py-2 border border-slate-200 rounded-xl select-all"
              />
              <a
                href={store.store_url}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl transition-colors shrink-0"
                title="Abrir loja no Mercado Livre"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Notas Pessoais */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Anotações e Estratégia
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Ponto forte em anúncios FULL com preços agressivos em kits..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Ações */}
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
              <Save className="w-4 h-4" />
              <span>{submitting ? "Salvando..." : "Salvar Alterações"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

