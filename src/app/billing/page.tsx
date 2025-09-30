
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers } from '@/lib/firebase-service';
import type { Opportunity, Client, User } from '@/lib/types';
import Link from 'next/link';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { isWithinInterval } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BillingTable = ({ opportunities, onRowClick }: { opportunities: Opportunity[], onRowClick: (opp: Opportunity) => void }) => {
  const total = opportunities.reduce((acc, opp) => acc + (opp.valorCerrado || opp.value), 0);

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead className="hidden md:table-cell">Cliente</TableHead>
            <TableHead className="text-right">Valor Cerrado</TableHead>
            <TableHead>Factura Nº</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {opportunities.length > 0 ? (
            opportunities.map((opp) => (
              <TableRow key={opp.id} onClick={() => onRowClick(opp)} className="cursor-pointer">
                <TableCell className="font-medium">{opp.title}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Link href={`/clients/${opp.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    {opp.clientName}
                  </Link>
                </TableCell>
                <TableCell className="text-right">${(opp.valorCerrado || opp.value).toLocaleString('es-AR')}</TableCell>
                <TableCell>{opp.facturaNo || '-'}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                No hay oportunidades en esta sección.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {opportunities.length > 0 && (
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
                    <TableCell></TableCell>
                </TableRow>
            </TableFooter>
        )}
      </Table>
    </div>
  );
}

function BillingPageComponent({ initialTab }: { initialTab: string }) {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  
  const advisorClientIds = useMemo(() => {
    if (selectedAdvisor === 'all') return null;
    return new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
  }, [clients, selectedAdvisor]);

  const filteredOpportunitiesByAdvisor = useMemo(() => {
    if (!userInfo) return [];
    
    if (isBoss) {
      if (selectedAdvisor === 'all') {
        return opportunities;
      }
      return opportunities.filter(opp => advisorClientIds?.has(opp.clientId));
    }
    // For non-boss users, only show their opportunities
    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    return opportunities.filter(opp => userClientIds.has(opp.clientId));
  }, [opportunities, clients, selectedAdvisor, isBoss, userInfo, advisorClientIds]);


  const filteredOpportunities = filteredOpportunitiesByAdvisor.filter(opp => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const closeDate = new Date(opp.closeDate);
    return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allOpps, allClients, allUsers, allAdvisors] = await Promise.all([
        getAllOpportunities(),
        getClients(),
        getAllUsers(),
        getAllUsers('Asesor'),
      ]);
      setOpportunities(allOpps);
      setClients(allClients);
      setUsers(allUsers);
      setAdvisors(allAdvisors);

    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo) {
        fetchData();
    }
  }, [userInfo]);

  const handleUpdateOpportunity = async (updatedData: Partial<Opportunity>) => {
    if (!selectedOpportunity || !userInfo) return;
    try {
      const client = clients.find(c => c.id === selectedOpportunity.clientId);
      if (!client) throw new Error("Client not found for the opportunity");

      await updateOpportunity(selectedOpportunity.id, updatedData, userInfo.id, userInfo.name, client.ownerName);
      fetchData();
      toast({ title: "Oportunidad Actualizada" });
    } catch (error) {
      console.error("Error updating opportunity:", error);
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };
  
  const handleRowClick = (opp: Opportunity) => {
      setSelectedOpportunity(opp);
      setIsFormOpen(true);
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  const closedWonOpps = filteredOpportunities.filter(
    (opp) => opp.stage === 'Cerrado - Ganado'
  );

  const toInvoiceOpps = closedWonOpps.filter((opp) => !opp.facturaNo);
  const toCollectOpps = closedWonOpps.filter((opp) => opp.facturaNo && !opp.pagado);
  const paidOpps = closedWonOpps.filter((opp) => opp.facturaNo && opp.pagado);

  return (
    <div className="flex flex-col h-full">
      <Header title="Facturación">
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
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="to-invoice">A Facturar</TabsTrigger>
            <TabsTrigger value="to-collect">A Cobrar</TabsTrigger>
            <TabsTrigger value="paid">Pagado</TabsTrigger>
          </TabsList>
          <TabsContent value="to-invoice">
            <BillingTable opportunities={toInvoiceOpps} onRowClick={handleRowClick} />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable opportunities={toCollectOpps} onRowClick={handleRowClick} />
          </TabsContent>
           <TabsContent value="paid">
            <BillingTable opportunities={paidOpps} onRowClick={handleRowClick} />
          </TabsContent>
        </Tabs>
      </main>
      
       {isFormOpen && (
        <OpportunityDetailsDialog
          opportunity={selectedOpportunity}
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onUpdate={handleUpdateOpportunity}
        />
      )}
    </div>
  );
}

function BillingPageWithSuspense() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'to-invoice';
  return <BillingPageComponent initialTab={initialTab} />;
}

export default function BillingPage() {
  return (
    <React.Suspense fallback={
        <div className="flex h-full w-full items-center justify-center">
            <Spinner size="large" />
        </div>
    }>
      <BillingPageWithSuspense />
    </React.Suspense>
  );
}
