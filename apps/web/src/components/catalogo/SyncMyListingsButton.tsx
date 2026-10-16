"use client";

import React, { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncMyListingsButton() {
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const router = useRouter();

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/my-listings/sync", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          msg: data.message || "Anúncios sincronizados com sucesso!",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          msg: data.error || "Falha ao sincronizar anúncios do Mercado Livre.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        msg: "Erro de comunicação ao sincronizar anúncios.",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      {feedback && (
        <span
          className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </span>
      )}

      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-1.5 text-xs font-semibold bg-[#FFE600] hover:bg-[#F0D800] text-slate-950 rounded flex items-center justify-center gap-1.5 shadow-2xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        title="Busca seus anúncios ativos diretamente da API oficial do Mercado Livre (somente leitura)"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        <span>{syncing ? "Sincronizando Anúncios..." : "Sincronizar Anúncios do ML"}</span>
      </button>
    </div>
  );
}
