import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "ERP Marketplaces - Gestão & Inteligência Competitiva",
  description: "Plataforma de alta densidade para monitoramento de Buybox no Mercado Livre e Shopee",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="flex h-screen overflow-hidden bg-[#F4F6F8]">
        {/* Sidebar Lateral Corporativa */}
        <Sidebar />

        {/* Área Central com Scroll Vertical */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
