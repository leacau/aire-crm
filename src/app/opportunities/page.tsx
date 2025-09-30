
'use client';

import { Header } from '@/components/layout/header';
import { KanbanBoard } from '@/components/opportunities/kanban-board';
import { useAuth } from '@/hooks/use-auth';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllUsers } from '@/lib/firebase-service';
import type { User } from '@/lib/types';


export default function OpportunitiesPage() {
  const { isBoss } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');

  useEffect(() => {
    if(isBoss) {
      getAllUsers('Asesor').then(setAdvisors);
    }
  }, [isBoss]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Oportunidades">
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
      <main className="flex-1 overflow-auto">
        <KanbanBoard dateRange={dateRange} selectedAdvisor={selectedAdvisor} />
      </main>
    </div>
  );
}
