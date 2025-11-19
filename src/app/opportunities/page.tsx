

'use client';

import { Header } from '@/components/layout/header';
import { KanbanBoard } from '@/components/opportunities/kanban-board';
import { useAuth } from '@/hooks/use-auth';
import type { DateRange } from 'react-day-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllUsers, getClients } from '@/lib/firebase-service';
import type { User, Client } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';


export default function OpportunitiesPage() {
  const { isBoss } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allAdvisors, setAllAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [clientList, setClientList] = useState<{ id: string; name: string }[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [pendingFocusOpportunityId, setPendingFocusOpportunityId] = useState<string | undefined>(undefined);
  
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  useEffect(() => {
    if(isBoss) {
      Promise.all([
        getAllUsers('Asesor'),
        getClients()
      ]).then(([advisors, clients]) => {
        setAllAdvisors(advisors);
        setAllClients(clients);
      });
    }
  }, [isBoss]);
  
  useEffect(() => {
    // Reset client filter when advisor changes
    setSelectedClient('all');
  }, [selectedAdvisor, dateRange]);

  useEffect(() => {
    const opportunityId = searchParams.get('opportunityId');
    setPendingFocusOpportunityId(opportunityId ?? undefined);
  }, [searchParams]);

  const handleOpportunityFocusConsumed = useCallback(() => {
    if (!pendingFocusOpportunityId) return;
    setPendingFocusOpportunityId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('opportunityId')) {
      params.delete('opportunityId');
      const query = params.toString();
      router.replace(query ? `/opportunities?${query}` : '/opportunities', { scroll: false });
    }
  }, [pendingFocusOpportunityId, router, searchParams]);

  const advisorsInList = useMemo(() => {
    if (!isBoss) return [];
    const clientIdsInList = new Set(clientList.map(c => c.id));
    const advisorIdsInList = new Set(
      allClients
        .filter(client => clientIdsInList.has(client.id))
        .map(client => client.ownerId)
    );
    return allAdvisors.filter(advisor => advisorIdsInList.has(advisor.id));
  }, [clientList, allClients, allAdvisors, isBoss]);


  return (
    <div className="flex flex-col h-full">
      <Header title="Oportunidades">
        <MonthYearPicker date={selectedDate} onDateChange={setSelectedDate} />
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {advisorsInList.map(advisor => (
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
          focusedOpportunityId={pendingFocusOpportunityId}
          onFocusedOpportunityHandled={handleOpportunityFocusConsumed}
        />
      </main>
    </div>
  );
}
