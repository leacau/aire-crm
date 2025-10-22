
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
import { startOfMonth, endOfMonth } from 'date-fns';


export default function OpportunitiesPage() {
  const { isBoss } = useAuth();
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [clientList, setClientList] = useState<{ id: string; name: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('all');
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfMonth(today),
    };
  });

  useEffect(() => {
    if(isBoss) {
      getAllUsers('Asesor').then(setAdvisors);
    }
  }, [isBoss]);
  
  useEffect(() => {
    // Reset client filter when advisor changes
    setSelectedClient('all');
  }, [selectedAdvisor, dateRange]);


  return (
    <div className="flex flex-col h-full">
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
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clientList.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
      </Header>
      <main className="flex-1 overflow-x-auto">
        <KanbanBoard 
          dateRange={dateRange} 
          selectedAdvisor={selectedAdvisor}
          selectedClient={selectedClient}
          onClientListChange={setClientList}
        />
      </main>
    </div>
  );
}
