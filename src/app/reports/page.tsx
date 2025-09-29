
'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { SalesByAdvisorChart } from '@/components/reports/sales-by-advisor-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ReportsPage() {
  const { userInfo, loading } = useAuth();
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);


  useEffect(() => {
    if (!loading && userInfo?.role !== 'Jefe') {
      router.push('/');
    }
  }, [userInfo, loading, router]);
  
  if (loading || !userInfo || userInfo.role !== 'Jefe') {
    return (
       <div className="flex h-full w-full items-center justify-center">
          <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Reportes">
        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Card>
            <CardHeader>
                <CardTitle>Ventas por Asesor</CardTitle>
                <CardDescription>
                    Total de ingresos generados por cada asesor en el período seleccionado.
                </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] w-full">
                <SalesByAdvisorChart dateRange={dateRange} />
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
