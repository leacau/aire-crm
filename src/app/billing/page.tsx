'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers, getInvoices } from '@/lib/firebase-service';
import type { Opportunity, Client, User, Invoice } from '@/lib/types';
import Link from 'next/link';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { isWithinInterval } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const BillingTable = ({ invoices, onRowClick, opportunitiesMap, clientsMap }: { invoices: Invoice[], onRowClick: (opp: Opportunity) => void, opportunitiesMap: Record<string, Opportunity>, clientsMap: Record<string, Client> }) => {
  const total = invoices.reduce((acc, inv) => acc + inv.amount, 0);

  type InvoiceRow = Invoice & { opportunity?: Opportunity; client?: Client };

  const tableData: InvoiceRow[] = invoices.map(inv => ({
    ...inv,
    opportunity: opportunitiesMap[inv.opportunityId],
    client: opportunitiesMap[inv.opportunityId] ? clientsMap[opportunitiesMap[inv.opportunityId].clientId] : undefined
  }));

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
    {
      accessorKey: 'opportunity.title',
      header: 'Oportunidad',
      cell: ({ row }) => (
        <div 
          className="font-medium text-primary hover:underline cursor-pointer"
          onClick={() => row.original.opportunity && onRowClick(row.original.opportunity)}
        >
            {row.original.opportunity?.title}
        </div>),
    },
    {
      accessorKey: 'client.denominacion',
      header: 'Cliente',
      cell: ({ row }) => (
        row.original.client ?
        <Link href={`/clients/${row.original.client.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.client.denominacion}
        </Link>
        : '-'
      ),
    },
    {
      accessorKey: 'amount',
      header: () => <div className="text-right">Monto Factura</div>,
      cell: ({ row }) => {
        return <div className="text-right">${row.original.amount.toLocaleString('es-AR')}</div>;
      },
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'Factura Nº',
      cell: ({ row }) => row.original.invoiceNumber || '-',
    }
  ], [onRowClick]);

  const footerContent = (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={2} className="font-bold">Total</TableCell>
        <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
        <TableCell></TableCell>
      </TableRow>
    </TableFooter>
  );

  return (
      <ResizableDataTable
        columns={columns}
        data={tableData}
        emptyStateMessage="No hay facturas en esta sección."
        footerContent={footerContent}
        enableRowResizing={false}
      />
  );
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
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

  const filteredInvoices = useMemo(() => {
    if (!userInfo) return [];
    
    let userClientIds: Set<string> | null = null;
    if (isBoss) {
      if (selectedAdvisor !== 'all') {
        userClientIds = new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
      }
    } else {
      userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    }
    
    let advisorFilteredInvoices = invoices;
    if (userClientIds) {
        const oppsForUser = new Set(opportunities.filter(opp => userClientIds!.has(opp.clientId)).map(opp => opp.id));
        advisorFilteredInvoices = invoices.filter(inv => oppsForUser.has(inv.opportunityId));
    }
    
    return advisorFilteredInvoices.filter(inv => {
        if (!dateRange?.from || !dateRange?.to) return true;
        const generationDate = new Date(inv.dateGenerated);
        return isWithinInterval(generationDate, { start: dateRange.from, end: dateRange.to });
    });

  }, [invoices, opportunities, clients, selectedAdvisor, isBoss, userInfo, dateRange]);


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
  
  const toInvoiceInvoices = filteredInvoices.filter(inv => inv.status === 'Generada');
  const toCollectInvoices = filteredInvoices.filter(inv => inv.status === 'Enviada a Cobrar');
  const paidInvoices = filteredInvoices.filter(inv => inv.status === 'Pagada');

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
            <BillingTable invoices={toInvoiceInvoices} onRowClick={handleRowClick} opportunitiesMap={opportunitiesMap} clientsMap={clientsMap} />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable invoices={toCollectInvoices} onRowClick={handleRowClick} opportunitiesMap={opportunitiesMap} clientsMap={clientsMap} />
          </TabsContent>
           <TabsContent value="paid">
            <BillingTable invoices={paidInvoices} onRowClick={handleRowClick} opportunitiesMap={opportunitiesMap} clientsMap={clientsMap} />
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
