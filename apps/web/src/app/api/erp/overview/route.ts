import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { loadErpWorkspaceData } from "@/lib/erp/erp-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const data = await loadErpWorkspaceData(ctx);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao carregar módulo ERP de produtos.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
