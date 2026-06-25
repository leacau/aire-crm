'use client';

import React, { useEffect, useState } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Receipt } from 'lucide-react';
import { auth } from '@/lib/firebase';

export function TangoBillingSummary() {
  const [totalFacturado, setTotalFacturado] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchTotalMes = async () => {
      setLoading(true);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;

        // Definimos el rango del mes actual
        const today = new Date();
        const fromDate = format(startOfMonth(today), 'yyyy-MM-dd');
        const toDate = format(endOfMonth(today), 'yyyy-MM-dd');

        const requestOptions = {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store' as RequestCache,
        };

        // Función para ir a buscar las facturas de una compañía en ese rango de fechas
        const fetchInvoicesByCompany = async (companyId: string) => {
          const params = new URLSearchParams({ company: companyId, fromDate, toDate });
          try {
            const res = await fetch(`/api/tango/invoices?${params.toString()}`, requestOptions);
            if (!res.ok) return [];
            const payload = await res.json();
            return payload.list || [];
          } catch (error) {
            console.error(`Error obteniendo facturas de la empresa ${companyId}:`, error);
            return [];
          }
        };

        // Peticiones en paralelo para Avión (4), SRL (5) y SAS (6)
        const [aireInvoices, srlInvoices, sasInvoices] = await Promise.all([
          fetchInvoicesByCompany('4'),
          fetchInvoicesByCompany('5'),
          fetchInvoicesByCompany('6'),
        ]);

        const allInvoices = [...aireInvoices, ...srlInvoices, ...sasInvoices];

        // Lógica de suma y exclusión
        const sum = allInvoices.reduce((acc, invoice) => {
          const tipo = (invoice.TIPO_COMPROBANTE || '').toUpperCase();
          const vendedor = (invoice.NOMBRE_VENDEDOR || '').toUpperCase();
          const codVendedor = (invoice.COD_VENDEDOR || '').toUpperCase();

          // 1. Solo Facturas ("FAC")
          const isFac = tipo === 'FAC';

          // 2. Excluir a Corporativo / Mario Altamirano
          // (Verificamos tanto el nombre como los posibles códigos que vimos que usa)
          const isCorporativo = 
            vendedor.includes('CORPORATIVO') || 
            vendedor.includes('ALTAMIRANO') || 
            vendedor.includes('MARIO') ||
            codVendedor === '020' || 
            codVendedor === '021' || 
            codVendedor === '022';

          if (isFac && !isCorporativo) {
            const numTotal = Number(invoice.TOTAL);
            if (!Number.isNaN(numTotal)) {
              return acc + numTotal;
            }
          }
          return acc;
        }, 0);

        if (isMounted) setTotalFacturado(sum);
      } catch (error) {
        console.error('Error calculando sumatoria de Tango:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTotalMes();

    return () => { isMounted = false; };
  }, []);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">
          Facturado en Tango (Mes en curso)
        </CardTitle>
        <Receipt className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 mt-1 text-slate-400">
            <Spinner size="small" />
            <span className="text-xs">Calculando...</span>
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-800">
              {new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
                maximumFractionDigits: 2,
              }).format(totalFacturado)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 uppercase">
              Asesores (Aire, SRL, SAS) · Solo &quot;FAC&quot; · Sin Corporativo
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
