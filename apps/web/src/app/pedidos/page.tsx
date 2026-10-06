import React from "react";
import { Header } from "@/components/layout/Header";
import { ShoppingCart, CheckCircle, Clock, Truck } from "lucide-react";

export default function PedidosPage() {
  const orders = [
    {
      id: "PED-98124",
      customer: "Marcos Vinicius Silva",
      channel: "Mercado Livre FULL",
      items: "1x Teclado Mecânico Gamer Led RGB",
      value: 199.90,
      status: "Pronto para Envio",
      date: "Hoje, 14:32",
    },
    {
      id: "PED-98123",
      customer: "Camila Ribeiro Santos",
      channel: "Mercado Livre FLEX",
      items: "1x Fone de Ouvido Bluetooth 5.3",
      value: 139.90,
      status: "Entregue",
      date: "Hoje, 11:15",
    },
    {
      id: "PED-98122",
      customer: "Lucas Andrade Costa",
      channel: "Shopee Xpress",
      items: "2x Mouse Gamer Óptico 12000 DPI",
      value: 179.80,
      status: "Em Separação",
      date: "Hoje, 09:40",
    },
  ];

  return (
    <>
      <Header platformName="Gestão de Pedidos e Vendas" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Vendas & Pedidos dos Marketplaces</h1>
              <p className="text-xs text-slate-500">
                Acompanhamento em tempo real dos pedidos sincronizados.
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Pedido</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Canal</th>
                  <th className="py-2.5 px-3">Itens</th>
                  <th className="py-2.5 px-3 text-right">Valor Total</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{o.id}</td>
                    <td className="py-2.5 px-3 text-slate-700">{o.customer}</td>
                    <td className="py-2.5 px-3 text-slate-600">{o.channel}</td>
                    <td className="py-2.5 px-3 text-slate-800">{o.items}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">R$ {o.value.toFixed(2)}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{o.date}</td>
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
