import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo de imagem foi enviado." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Formato não suportado. Use JPG, PNG, WEBP ou GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Imagem excede o limite de 5MB." },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const tenantPrefix = ctx.organizationId || ctx.userId;
    const filePath = `${tenantPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from("erp-product-images")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          success: false,
          error: `Falha no upload para o Supabase Storage (verifique se a migração do bucket erp-product-images foi rodada): ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = admin.storage
      .from("erp-product-images")
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      photo: {
        url: publicUrlData.publicUrl,
        path: filePath,
        alt: file.name,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar upload da imagem.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
