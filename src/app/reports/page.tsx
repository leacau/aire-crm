

'use client';

import React, { useState, Suspense, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllUsers } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { ActiveClientsReport } from '@/components/reports/active-clients-report';
import { ProspectsPerformanceReport } from '@/components/reports/prospects-performance-report';
import { startOfMonth, endOfMonth } from 'date-fns';


const OpportunitiesByStageChart = dynamic(() => import('@/components/reports/opportunities-by-stage-chart').then(mod => mod.OpportunitiesByStageChart), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>,
});


export default function ReportsPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfMonth(today),
    };
  });


  useEffect(() => {
    if (!loading && !isBoss) {
      router.push('/');
    }
     if (isBoss) {
      getAllUsers('Asesor').then(setAdvisors);
    }
  }, [userInfo, loading, router, isBoss]);
  
  if (loading || !isBoss) {
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
         {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
        <ProspectsPerformanceReport selectedAdvisor={selectedAdvisor} />
        <ActiveClientsReport selectedAdvisor={selectedAdvisor} />
        <Card>
            <CardHeader>
                <CardTitle>Estado de Oportunidades por Asesor</CardTitle>
                <CardDescription>
                    Cantidad de oportunidades por etapa para cada asesor en el período seleccionado.
                </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] w-full">
                <OpportunitiesByStageChart dateRange={dateRange} selectedAdvisor={selectedAdvisor}/>
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
