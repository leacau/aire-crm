
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


const PipelineByAdvisorChart = dynamic(() => import('@/components/reports/pipeline-by-advisor-chart').then(mod => mod.PipelineByAdvisorChart), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>,
});


export default function ReportsPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');


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
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Card>
            <CardHeader>
                <CardTitle>Pipeline por Asesor</CardTitle>
                <CardDescription>
                    Valor total de oportunidades por etapa para cada asesor en el período seleccionado.
                </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] w-full">
                <PipelineByAdvisorChart dateRange={dateRange} selectedAdvisor={selectedAdvisor}/>
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
