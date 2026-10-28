import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EXTENSION_FILENAME,
  EXTENSION_VERSION,
  EXTENSION_UPDATED_AT,
  EXTENSION_ZIP_BASE64,
} from "@/lib/extension/packageBinary";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Download da Extensão Chrome do ERP.
 * REQUISITO MANDATÓRIO: Apenas usuários autenticados via sessão (após login no ERP)
 * têm permissão para baixar o pacote compactado (.zip) da extensão.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Acesso restrito. Faça login no ERP para baixar a extensão.",
          authenticated: false,
        },
        { status: 401 }
      );
    }

    const fileBuffer = Buffer.from(EXTENSION_ZIP_BASE64, "base64");

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${EXTENSION_FILENAME}"`,
        "Content-Length": fileBuffer.length.toString(),
        "X-Extension-Version": EXTENSION_VERSION,
        "X-Extension-Updated-At": EXTENSION_UPDATED_AT,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("[Extension Download] Erro ao processar download:", error);
    return NextResponse.json(
      { error: "Erro interno ao disponibilizar download da extensão." },
      { status: 500 }
    );
  }
}

