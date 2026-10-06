import React from "react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import { Boxes, ExternalLink, Plus, Search, Tag, Zap } from "lucide-react";

export default function CatalogoPage() {
  const items = [
    {
      sku: "TECL-MECA-RGB",
      title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
      price: 199.90,
      cost: 120.00,
      mlb: "MLB3492817263",
      stock: 45,
      channel: "Mercado Livre (FULL)",
    },
    {
      sku: "FONE-BT-ANC",
      title: "Fone de Ouvido Bluetooth 5.3 Microfone Bateria 30h Top",
      price: 139.90,
      cost: 85.00,
      mlb: "MLB2819201948",
      stock: 120,
      channel: "Mercado Livre (Coleta)",
    },
    {
      sku: "MOUSE-GAMER-12K",
      title: "Mouse Gamer Óptico 12000 DPI 6 Botões Programáveis",
      price: 89.90,
      cost: 45.00,
      mlb: "MLB9876543210",
      stock: 78,
      channel: "Mercado Livre (FULL)",
    },
  ];

  return (
    <>
      <Header platformName="Catálogo de Anúncios Próprios" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Anúncios & Catálogo de Produtos</h1>
              <p className="text-xs text-slate-500">
                Seus anúncios vinculados aos marketplaces integrados.
              </p>
            </div>
            <Link
              href="/inteligencia"
              className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Ver Análise de Concorrentes no BI
            </Link>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar anúncio ou SKU..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-hidden"
                />
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3">SKU / Produto</th>
                  <th className="py-2.5 px-3">Canal & Logística</th>
                  <th className="py-2.5 px-3 text-right">Estoque</th>
                  <th className="py-2.5 px-3 text-right">Preço de Custo</th>
                  <th className="py-2.5 px-3 text-right">Preço de Venda</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.sku} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="text-[11px] text-slate-500">SKU: <code>{item.sku}</code> • ID: {item.mlb}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.channel}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800">{item.stock} un.</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">R$ {item.cost.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">R$ {item.price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Link
                        href="/inteligencia"
                        className="text-sky-600 hover:text-sky-800 text-[11px] font-semibold"
                      >
                        Monitorar Buybox →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
