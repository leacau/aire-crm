
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
import { isWithinInterval, startOfMonth, endOfMonth, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const BillingTable = ({ 
  items, 
  type,
  onRowClick, 
  clientsMap, 
  usersMap,
  opportunitiesMap
}: { 
  items: (Opportunity | Invoice)[];
  type: 'opportunities' | 'invoices';
  onRowClick: (opp: Opportunity) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
  opportunitiesMap: Record<string, Opportunity>;
}) => {

  const columns = useMemo<ColumnDef<Opportunity | Invoice>[]>(() => {
    let cols: ColumnDef<any>[] = [
      {
        accessorKey: 'opportunityTitle',
        header: 'Oportunidad',
        cell: ({ row }) => {
          const isOpp = type === 'opportunities';
          const opp = isOpp ? row.original : opportunitiesMap[row.original.opportunityId];
          if (!opp) return '-';
          return (
            <div 
              className="font-medium text-primary hover:underline cursor-pointer"
              onClick={() => onRowClick(opp)}
            >
                {opp.title}
            </div>
          );
        },
      },
      {
        accessorKey: 'clientName',
        header: 'Cliente',
        cell: ({ row }) => {
            const isOpp = type === 'opportunities';
            const opp = isOpp ? row.original : opportunitiesMap[row.original.opportunityId];
            if (!opp) return '-';
            const client = clientsMap[opp.clientId];
            if (!client) return opp.clientName;
            
            return (
                <Link href={`/clients/${client.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                {client.denominacion}
                </Link>
            );
        },
      },
    ];

    if (type === 'opportunities') {
        cols.push({
            accessorKey: 'value',
            header: () => <div className="text-right">Monto Oportunidad</div>,
            cell: ({ row }) => <div className="text-right">${row.original.value.toLocaleString('es-AR')}</div>,
        });
    }

    if (type === 'invoices') {
        cols.push({
            accessorKey: 'date',
            header: 'Fecha Factura',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return invoice.date ? format(new Date(invoice.date), 'P', { locale: es }) : '-';
            },
        });
        cols.push({
            accessorKey: 'amount',
            header: () => <div className="text-right">Monto Factura</div>,
            cell: ({ row }) => <div className="text-right">${row.original.amount.toLocaleString('es-AR')}</div>,
        });
        cols.push({
            accessorKey: 'invoiceNumber',
            header: 'Factura Nº',
            cell: ({ row }) => row.original.invoiceNumber || '-',
        });
    }

    return cols;

  }, [type, onRowClick, clientsMap, opportunitiesMap]);

  const total = items.reduce((acc, item) => {
    if (type === 'invoices') return acc + (item as Invoice).amount;
    if (type === 'opportunities') return acc + (item as Opportunity).value;
    return acc;
  }, 0);


  const footerContent = (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={type === 'invoices' ? 3 : 2} className="font-bold">Total</TableCell>
        <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
        {type === 'invoices' && <TableCell></TableCell>}
      </TableRow>
    </TableFooter>
  );

  return (
      <ResizableDataTable
        columns={columns}
        data={items}
        emptyStateMessage="No hay items en esta sección."
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
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfMonth(today)
    };
  });

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
    if (!userInfo) return { toInvoiceOpps: [], toCollectInvoices: [], paidInvoices: [] };
    
    let userClientIds: Set<string> | null = null;
    if (isBoss) {
        if (selectedAdvisor !== 'all') {
            userClientIds = new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
        }
    } else {
        userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    }
    
    let advisorFilteredOpps = opportunities;
    if (userClientIds) {
        advisorFilteredOpps = opportunities.filter(opp => userClientIds!.has(opp.clientId));
    }
    
    const wonOppsInPeriod = advisorFilteredOpps.filter(opp => {
        if (opp.stage !== 'Cerrado - Ganado') return false;
        if (!dateRange?.from || !dateRange?.to) return true;
        
        // Use closeDate or updatedAt to determine if it was won in the period
        const closeDate = opp.closeDate ? parseISO(opp.closeDate) : null;
        const updatedAt = (opp as any).updatedAt ? new Date((opp as any).updatedAt.seconds * 1000) : null;
        
        const winDate = closeDate || updatedAt;
        if (!winDate) return false;

        return isWithinInterval(winDate, { start: dateRange.from, end: dateRange.to });
    });

    const invoicesByOppId = invoices.reduce((acc, inv) => {
        if (!acc[inv.opportunityId]) {
            acc[inv.opportunityId] = [];
        }
        acc[inv.opportunityId].push(inv);
        return acc;
    }, {} as Record<string, Invoice[]>);

    const toInvoiceOpps: Opportunity[] = [];
    const toCollectInvoices: Invoice[] = [];
    const paidInvoices: Invoice[] = [];
    
    wonOppsInPeriod.forEach(opp => {
        const oppInvoices = invoicesByOppId[opp.id] || [];
        
        if (oppInvoices.length === 0) {
            // Rule 1: A Facturar
            toInvoiceOpps.push(opp);
        } else {
            const hasPaidInvoice = oppInvoices.some(inv => inv.status === 'Pagada');
            if (hasPaidInvoice) {
                // Rule 3: Pagado
                paidInvoices.push(...oppInvoices.filter(inv => inv.status === 'Pagada'));
            } else {
                // Rule 2: A Cobrar
                toCollectInvoices.push(...oppInvoices);
            }
        }
    });

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
  
  return (
    <div className="flex flex-col h-full">
      <Header title="Estado de Cobranzas">
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
            <BillingTable items={toInvoiceOpps} type="opportunities" onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} opportunitiesMap={opportunitiesMap} />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable items={toCollectInvoices} type="invoices" onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} opportunitiesMap={opportunitiesMap} />
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

    
