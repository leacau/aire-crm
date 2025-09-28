
'use client';

import React, { useState, useEffect } from 'react';
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
import { getOpportunitiesForUser } from '@/lib/firebase-service';
import type { Opportunity } from '@/lib/types';
import Link from 'next/link';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';

const BillingTable = ({ opportunities, onRowClick }: { opportunities: Opportunity[], onRowClick: (opp: Opportunity) => void }) => (
  <div className="border rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Valor Cerrado</TableHead>
          <TableHead>Factura Nº</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.length > 0 ? (
          opportunities.map((opp) => (
            <TableRow key={opp.id} onClick={() => onRowClick(opp)} className="cursor-pointer">
              <TableCell className="font-medium">{opp.title}</TableCell>
              <TableCell>
                <Link href={`/clients/${opp.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                  {opp.clientName}
                </Link>
              </TableCell>
              <TableCell>${(opp.valorCerrado || opp.value).toLocaleString()}</TableCell>
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

export default function BillingPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchOpportunities = async (userId: string) => {
    setLoading(true);
    try {
      const userOpps = await getOpportunitiesForUser(userId);
      setOpportunities(userOpps);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo?.id) {
      fetchOpportunities(userInfo.id);
    }
  }, [userInfo]);

  const handleUpdateOpportunity = async (updatedData: Partial<Opportunity>) => {
    if (!selectedOpportunity) return;
    try {
      await updateOpportunity(selectedOpportunity.id, updatedData);
      // Refresca la lista después de la actualización
      if(userInfo?.id) fetchOpportunities(userInfo.id);
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

  const toInvoiceOpps = opportunities.filter(
    (opp) => opp.stage === 'Cerrado - Ganado' && !opp.facturaNo
  );

  const toCollectOpps = opportunities.filter(
    (opp) => opp.stage === 'Cerrado - Ganado' && opp.facturaNo && !opp.pagado
  );

  return (
    <div className="flex flex-col h-full">
      <Header title="Facturación" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Tabs defaultValue="to-invoice">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="to-invoice">A Facturar</TabsTrigger>
            <TabsTrigger value="to-collect">A Cobrar</TabsTrigger>
          </TabsList>
          <TabsContent value="to-invoice">
            <BillingTable opportunities={toInvoiceOpps} onRowClick={handleRowClick} />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable opportunities={toCollectOpps} onRowClick={handleRowClick} />
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
