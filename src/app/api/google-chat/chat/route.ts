export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    enabled: false,
    message:
      "Este endpoint no replica Google Chat. Se usa solo para evitar errores de UI. Usar el bot para notificaciones/aprobaciones.",
    items: [],
  });
}
