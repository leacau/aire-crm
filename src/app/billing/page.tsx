
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getOpportunitiesForUser, getAllOpportunities, getClients } from '@/lib/firebase-service';
import type { Opportunity, Client } from '@/lib/types';
import Link from 'next/link';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { isWithinInterval } from 'date-fns';

const BillingTable = ({ opportunities, onRowClick }: { opportunities: Opportunity[], onRowClick: (opp: Opportunity) => void }) => (
  <div className="border rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead className="hidden md:table-cell">Cliente</TableHead>
          <TableHead>Valor Cerrado</TableHead>
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
              <TableCell>${(opp.valorCerrado || opp.value).toLocaleString('es-AR')}</TableCell>
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
    </Table>
  </div>
);

function BillingPageComponent() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'to-invoice';

  const fetchOpportunities = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      let userOpps: Opportunity[];
      if (userInfo.role === 'Jefe' || userInfo.role === 'Administracion') {
        userOpps = await getAllOpportunities();
      } else {
        userOpps = await getOpportunitiesForUser(userInfo.id);
      }
      setOpportunities(userOpps);
      
      const allClients = await getClients();
      setClients(allClients);

    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo) {
      fetchOpportunities();
    }
  }, [userInfo]);

  const handleUpdateOpportunity = async (updatedData: Partial<Opportunity>) => {
    if (!selectedOpportunity || !userInfo) return;
    try {
      const client = clients.find(c => c.id === selectedOpportunity.clientId);
      if (!client) throw new Error("Client not found for the opportunity");

      await updateOpportunity(selectedOpportunity.id, updatedData, userInfo.id, userInfo.name, client.ownerName);
      // Refresca la lista después de la actualización
      fetchOpportunities();
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
  
  const filteredOpportunities = opportunities.filter(opp => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const closeDate = new Date(opp.closeDate);
    return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
  });
  
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

// Need to wrap the component in a Suspense boundary because useSearchParams() is a Client Component hook
// that suspends.
export default function BillingPage() {
  return (
    <React.Suspense fallback={
        <div className="flex h-full w-full items-center justify-center">
            <Spinner size="large" />
        </div>
    }>
      <BillingPageComponent />
    </React.Suspense>
  );
}
