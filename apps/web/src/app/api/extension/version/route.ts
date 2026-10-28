import { NextResponse } from "next/server";
import {
  EXTENSION_FILENAME,
  EXTENSION_UPDATED_AT,
  EXTENSION_UPDATED_AT_ISO,
  EXTENSION_VERSION,
} from "@/lib/extension/version";

export const dynamic = "force-dynamic";

/**
 * Retorna os metadados da versão atual da extensão disponível no ERP.
 * Permite que a extensão e a interface verifiquem se há novas atualizações.
 */
export async function GET() {
  return NextResponse.json(
    {
      version: EXTENSION_VERSION,
      updatedAt: EXTENSION_UPDATED_AT,
      updatedAtIso: EXTENSION_UPDATED_AT_ISO,
      filename: EXTENSION_FILENAME,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

