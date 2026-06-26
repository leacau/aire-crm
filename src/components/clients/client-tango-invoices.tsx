'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Receipt } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { Client } from '@/lib/types';

const formatCurrency = (value?: unknown) => {
  const numericValue = Number(value);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number.isNaN(numericValue) ? 0 : numericValue);
};

export function ClientTangoInvoices({ client }: { client: Client }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchInvoices = async () => {
      setLoading(true);
      setError(null);

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Sesión no válida');

        const requestOptions = {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store' as RequestCache,
        };

        // Función para consultar una compañía específica
        const fetchCompanyInvoices = async (companyId: string, companyLabel: string, crmIdField: string) => {
          const tangoClientId = (client as any)[crmIdField];
          if (!tangoClientId) return []; // Si no hay ID vinculado, no hace la consulta

          const params = new URLSearchParams({ company: companyId, client: tangoClientId });
          
          try {
            const response = await fetch(`/api/tango/invoices?${params.toString()}`, requestOptions);
            if (!response.ok) return [];
            
            const payload = await response.json();
            
            // Etiquetamos cada factura con la empresa para diferenciarla en la tabla general
            return (payload.list || []).map((inv: any) => ({ ...inv, _company: companyLabel }));
          } catch (e) {
            console.error(`Error cargando facturas para ${companyLabel}:`, e);
            return [];
          }
        };

        // Realizamos las consultas en paralelo
        const [aireInvoices, srlInvoices, sasInvoices] = await Promise.all([
          fetchCompanyInvoices('4', 'Aire (Avión)', 'idAire'),
          fetchCompanyInvoices('5', 'SRL', 'idAireSrl'),
          fetchCompanyInvoices('6', 'SAS', 'idAireDigital'),
        ]);

        const allInvoices = [...aireInvoices, ...srlInvoices, ...sasInvoices];

        // Ordenar todas las facturas consolidadas por fecha descendente (más nuevas primero)
        allInvoices.sort((a, b) => {
          const dateA = a.FECHA_DE_EMISION ? new Date(a.FECHA_DE_EMISION).getTime() : 0;
          const dateB = b.FECHA_DE_EMISION ? new Date(b.FECHA_DE_EMISION).getTime() : 0;
          return dateB - dateA;
        });

        if (isMounted) setInvoices(allInvoices);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error al buscar facturas de Tango');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInvoices();

    return () => { isMounted = false; };
  }, [client]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Spinner size="large" className="mb-4" />
        <p>Sincronizando historial desde Tango...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <Receipt className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-r-md border-l-4 border-emerald-600 bg-emerald-50 p-4 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-emerald-900">Historial de Facturación Oficial</h3>
        <p className="text-xs text-emerald-800">
          Mostrando comprobantes emitidos en Tango para los perfiles vinculados de este cliente.
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-slate-500 bg-white">
          <Receipt className="mx-auto h-8 w-8 mb-2 opacity-20" />
          No se encontraron facturas emitidas en Tango para este cliente.<br/>
          <span className="text-xs">Asegúrate de que el cliente esté correctamente vinculado desde la sección Mapeo Tango.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
          <Table className="min-w-[800px]">
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Vendedor Tango</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv, idx) => (
                <TableRow key={`${inv._company}-${inv.NRO_COMPROBANTE || idx}`}>
                  <TableCell>{inv.FECHA_DE_EMISION ? format(new Date(inv.FECHA_DE_EMISION), 'dd/MM/yyyy') : '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      inv._company === 'Aire (Avión)' ? 'bg-red-50 text-red-700 border-red-200' :
                      inv._company === 'SRL' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-orange-50 text-orange-700 border-orange-200'
                    }>
                      {inv._company}
                    </Badge>
                  </TableCell>
                  <TableCell>{inv.TIPO_COMPROBANTE}</TableCell>
                  <TableCell className="font-medium">{inv.NRO_COMPROBANTE}</TableCell>
                  <TableCell>
                     <div className="text-sm">{inv.NOMBRE_VENDEDOR || 'S/D'}</div>
                     <div className="text-[10px] text-slate-500">Código: {inv.COD_VENDEDOR || 'S/D'}</div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-700">
                    {formatCurrency(inv.TOTAL)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
