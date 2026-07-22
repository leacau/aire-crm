export function cleanCanjeCreatePayload(payload: Record<string, unknown>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => key !== 'id' && value !== undefined),
  );
  delete cleaned.fechaCreacion;
  return cleaned;
}
