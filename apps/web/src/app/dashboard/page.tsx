import React from "react";
import { Header } from "@/components/layout/Header";
import { ExecutiveDashboardClient } from "@/components/dashboard/ExecutiveDashboardClient";

export default function DashboardPage() {
  return (
    <>
      <Header platformName="Dashboard Geral" />
      <main className="p-4 flex-1">
        <ExecutiveDashboardClient />
      </main>
    </>
  );
}
