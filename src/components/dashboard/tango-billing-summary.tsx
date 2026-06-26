'use client';

import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  formatTangoCurrency,
  getCurrentMonthTangoBillingSummary,
  type TangoBillingSummary as TangoBillingSummaryData,
} from '@/modules/billing/client';

export function TangoBillingSummary() {
  const [summary, setSummary] = useState<TangoBillingSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchTotalMes = async () => {
      setLoading(true);
      try {
        const result = await getCurrentMonthTangoBillingSummary();
        if (isMounted) setSummary(result);
      } catch (error) {
        console.error('Error calculando sumatoria de Tango:', error);
        if (isMounted) setSummary(null);
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
              {formatTangoCurrency(summary?.total ?? 0)}
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
