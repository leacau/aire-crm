export function CarpetaTable({ clientName }: { clientId: string; clientName: string }) {
  return (
    <div className="rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground">
      La carpeta de carga manual de facturas fue retirada para {clientName}. La facturacion vigente se consulta desde
      Tango.
    </div>
  );
}
