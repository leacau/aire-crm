

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers, getInvoices, updateInvoice, createInvoice } from '@/lib/firebase-service';
import type { Opportunity, Client, User, Invoice } from '@/lib/types';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { isWithinInterval, startOfMonth, endOfMonth, parseISO, addMonths, isSameMonth, getYear, getMonth, set } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingTable } from '@/components/billing/billing-table';

const getPeriodDurationInMonths = (period: string): number => {
    switch (period) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 0;
    }
}

type NewInvoiceData = {
    invoiceNumber: string;
    date: string;
    amount: number | string;
};


function BillingPageComponent({ initialTab }: { initialTab: string }) {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newInvoiceData, setNewInvoiceData] = useState<Record<string, Partial<NewInvoiceData>>>({});

  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  
  const opportunitiesMap = useMemo(() => 
    opportunities.reduce((acc, opp) => {
        acc[opp.id] = opp;
        return acc;
    }, {} as Record<string, Opportunity>),
  [opportunities]);

  const clientsMap = useMemo(() =>
    clients.reduce((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {} as Record<string, Client>),
  [clients]);

  const usersMap = useMemo(() =>
    advisors.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, User>),
  [advisors]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allClients, allAdvisors, allInvoices] = await Promise.all([
        getAllOpportunities(),
        getClients(),
        getAllUsers('Asesor'),
        getInvoices()
      ]);
      setOpportunities(allOpps);
      setClients(allClients);
      setAdvisors(allAdvisors);
      setInvoices(allInvoices);

    } catch (error) {
      console.error("Error fetching billing data:", error);
      toast({ title: 'Error al cargar datos de facturación', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) {
        fetchData();
    }
  }, [userInfo, fetchData]);

  const { toInvoiceOpps, toCollectInvoices, paidInvoices } = useMemo(() => {
    if (!userInfo || !userInfo.id) {
      return { toInvoiceOpps: [], toCollectInvoices: [], paidInvoices: [] };
    }
    
    const isDateInRange = (date: Date) => {
        if (!dateRange?.from || !dateRange?.to) return true;
        return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
    }

    const advisorClientIds = isBoss && selectedAdvisor !== 'all' 
        ? new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id))
        : null;

    let userWonOpps = opportunities.filter(opp => {
      if (opp.stage !== 'Cerrado - Ganado') return false;

      let isOwner = false;
      if (isBoss) {
        isOwner = advisorClientIds ? advisorClientIds.has(opp.clientId) : true;
      } else {
        const client = clients.find(c => c.id === opp.clientId);
        isOwner = client?.ownerId === userInfo.id;
      }
      return isOwner;
    });

    const toInvoiceOpps: Opportunity[] = [];
    const invoicesByOppId = invoices.reduce((acc, inv) => {
        if (!acc[inv.opportunityId]) acc[inv.opportunityId] = [];
        acc[inv.opportunityId].push(inv);
        return acc;
    }, {} as Record<string, Invoice[]>);

    userWonOpps.forEach(opp => {
        if (!opp.closeDate) return;

        const maxPeriodicity = opp.periodicidad?.[0] || 'Ocasional';
        const durationMonths = getPeriodDurationInMonths(maxPeriodicity);

        if (durationMonths > 0) { // Handle periodic opportunities
            const startDate = parseISO(opp.closeDate);
            for (let i = 0; i < durationMonths; i++) {
                const monthDate = addMonths(startDate, i);
                
                if (isDateInRange(monthDate)) {
                    const hasInvoiceForMonth = (invoicesByOppId[opp.id] || []).some(inv => 
                        inv.date && isSameMonth(parseISO(inv.date), monthDate)
                    );
                    
                    if (!hasInvoiceForMonth) {
                        // Create a virtual opportunity for this month's billing
                        const virtualOpp = { 
                            ...opp, 
                            // Add a unique ID for the table key and a reference date
                            id: `${opp.id}_${i}`, 
                            closeDate: monthDate.toISOString(), 
                        };
                        toInvoiceOpps.push(virtualOpp);
                    }
                }
            }
        } else { // Handle one-time ("Ocasional") opportunities
            if (isDateInRange(parseISO(opp.closeDate)) && !invoicesByOppId[opp.id]) {
                toInvoiceOpps.push(opp);
            }
        }
    });

    // A Cobrar y Pagado
    let userFilteredInvoices = invoices;
    if (isBoss) {
      if (selectedAdvisor !== 'all') {
        const advisorOppIds = new Set(opportunities.filter(o => advisorClientIds?.has(o.clientId)).map(o => o.id));
        userFilteredInvoices = invoices.filter(inv => advisorOppIds.has(inv.opportunityId));
      }
    } else {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      const userOppIds = new Set(opportunities.filter(o => userClientIds.has(o.clientId)).map(o => o.id));
      userFilteredInvoices = invoices.filter(inv => userOppIds.has(inv.opportunityId));
    }
    
    const toCollectInvoices = userFilteredInvoices.filter(inv => 
        inv.date && isDateInRange(parseISO(inv.date)) && inv.status !== 'Pagada'
    );
    const paidInvoices = userFilteredInvoices.filter(inv => 
        inv.datePaid && isDateInRange(parseISO(inv.datePaid)) && inv.status === 'Pagada'
    );

    return { toInvoiceOpps, toCollectInvoices, paidInvoices };

  }, [opportunities, invoices, clients, selectedAdvisor, isBoss, userInfo, dateRange]);


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

  const handleCreateInvoice = async (virtualOppId: string) => {
    if (!userInfo) return;
    const invoiceDetails = newInvoiceData[virtualOppId];
    if (!invoiceDetails || !invoiceDetails.invoiceNumber || !invoiceDetails.amount || !invoiceDetails.date) {
        toast({ title: "Datos de factura incompletos", variant: "destructive" });
        return;
    }
    
    const realOppId = virtualOppId.split('_')[0];
    const opp = opportunitiesMap[realOppId];
    if (!opp) return;

    const client = clientsMap[opp.clientId];
    if (!client) return;

    try {
        const newInvoice: Omit<Invoice, 'id'> = {
            opportunityId: realOppId,
            invoiceNumber: invoiceDetails.invoiceNumber,
            amount: Number(invoiceDetails.amount),
            date: invoiceDetails.date,
            status: 'Generada',
            dateGenerated: new Date().toISOString(),
        };

        await createInvoice(newInvoice, userInfo.id, userInfo.name, client.ownerName);
        toast({ title: 'Factura Creada' });
        
        // Optimistically update UI before refetch
        setInvoices(prev => [...prev, { ...newInvoice, id: 'temp-' + Date.now() }]);
        setNewInvoiceData(prev => {
            const newState = { ...prev };
            delete newState[virtualOppId];
            return newState;
        });

        // Refetch to get the real data
        fetchData();
    } catch (error) {
        console.error("Error creating invoice:", error);
        toast({ title: "Error al crear la factura", variant: "destructive" });
    }
  };

  const handleInvoiceDataChange = (virtualOppId: string, field: keyof NewInvoiceData, value: string) => {
      setNewInvoiceData(prev => ({
        ...prev,
        [virtualOppId]: {
            ...prev[virtualOppId],
            [field]: field === 'amount' ? (value === '' ? '' : Number(value)) : value,
        }
    }));
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    if (!userInfo) return;

    const invoiceToUpdate = invoices.find(inv => inv.id === invoiceId);
    if (!invoiceToUpdate) return;
    
    const opp = opportunities.find(o => o.id === invoiceToUpdate.opportunityId);
    if (!opp) return;
    
    const client = clients.find(c => c.id === opp.clientId);
    if (!client) return;
    
    try {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {...inv, status: 'Pagada'} : inv));
      
      await updateInvoice(invoiceId, { status: 'Pagada' }, userInfo.id, userInfo.name, client.ownerName);

      toast({ title: `Factura #${invoiceToUpdate.invoiceNumber} marcada como pagada.`});

      // Refetch data to ensure UI is fully consistent after the update
      setTimeout(fetchData, 300);

    } catch(error) {
        console.error("Error marking invoice as paid:", error);
        toast({ title: "Error al actualizar la factura", variant: "destructive"});
        fetchData(); // Revert optimistic update
    }
  }
  
  const handleRowClick = (item: Opportunity | Invoice) => {
      const oppId = 'clientId' in item ? item.id.split('_')[0] : (opportunitiesMap[item.opportunityId] ? item.opportunityId : null);
      if (!oppId) return;
      const opportunity = opportunities.find(o => o.id === oppId);

      if (opportunity) {
        setSelectedOpportunity(opportunity);
        setIsFormOpen(true);
      }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <Header title="Estado de Cobranzas">
         <MonthYearPicker date={selectedDate} onDateChange={setSelectedDate} />
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
            <BillingTable 
                items={toInvoiceOpps} 
                type="opportunities" 
                onRowClick={handleRowClick} 
                clientsMap={clientsMap} 
                usersMap={usersMap} 
                opportunitiesMap={opportunitiesMap}
                newInvoiceData={newInvoiceData}
                onInvoiceDataChange={handleInvoiceDataChange}
                onCreateInvoice={handleCreateInvoice}
            />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable items={toCollectInvoices} type="invoices" onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} opportunitiesMap={opportunitiesMap} onMarkAsPaid={handleMarkAsPaid} />
          </TabsContent>
           <TabsContent value="paid">
            <BillingTable items={paidInvoices} type="invoices" onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} opportunitiesMap={opportunitiesMap} />
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
