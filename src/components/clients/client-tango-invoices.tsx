'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Receipt } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Client } from '@/lib/types';
import { formatTangoCurrency, getClientTangoInvoices, type TangoInvoice } from '@/modules/billing/client';

export function ClientTangoInvoices({ client }: { client: Client }) {
  const [invoices, setInvoices] = useState<TangoInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchInvoices = async () => {
      setLoading(true);
      setError(null);

      try {
        const allInvoices = await getClientTangoInvoices({
          aireClientId: client.idAire,
          srlClientId: client.idAireSrl,
          sasClientId: client.idAireDigital,
        });
        if (isMounted) setInvoices(allInvoices);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al buscar facturas de Tango');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInvoices();

    return () => { isMounted = false; };
  }, [client.idAire, client.idAireDigital, client.idAireSrl]);

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
          No se encontraron facturas emitidas en Tango para este cliente.<br />
          <span className="text-xs">
            Asegúrate de que el cliente esté correctamente vinculado desde la sección Mapeo Tango.
          </span>
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
              {invoices.map((invoice, index) => (
                <TableRow key={`${invoice._companyId}-${invoice.NRO_COMPROBANTE || index}`}>
                  <TableCell>
                    {invoice.FECHA_DE_EMISION ? format(new Date(invoice.FECHA_DE_EMISION), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      invoice._companyId === '4' ? 'bg-red-50 text-red-700 border-red-200'
                        : invoice._companyId === '5' ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-orange-50 text-orange-700 border-orange-200'
                    }>
                      {invoice._company}
                    </Badge>
                  </TableCell>
                  <TableCell>{invoice.TIPO_COMPROBANTE || '-'}</TableCell>
                  <TableCell className="font-medium">{invoice.NRO_COMPROBANTE || '-'}</TableCell>
                  <TableCell>
                    <div className="text-sm">{invoice.NOMBRE_VENDEDOR || 'S/D'}</div>
                    <div className="text-[10px] text-slate-500">Código: {invoice.COD_VENDEDOR || 'S/D'}</div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-700">
                    {formatTangoCurrency(invoice.TOTAL)}
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
