

'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers } from '@/lib/firebase-service';
import type { Opportunity, Client, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ApprovalsTable } from '@/components/approvals/approvals-table';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useRouter } from 'next/navigation';

function ApprovalsPageComponent() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';

  useEffect(() => {
    if (!authLoading && !isBoss) {
      router.push('/');
    }
  }, [userInfo, authLoading, router, isBoss]);

  const fetchData = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [allOpps, allClients, allUsers] = await Promise.all([
        getAllOpportunities(),
        getClients(),
        getAllUsers(),
      ]);
      setOpportunities(allOpps.filter(opp => opp.bonificacionEstado));
      setClients(allClients);
      setUsers(allUsers);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error al cargar las solicitudes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isBoss) {
      fetchData();
    }
  }, [userInfo, isBoss]);

  const handleUpdateOpportunity = async (updatedData: Partial<Opportunity>) => {
    if (!selectedOpportunity || !userInfo) return;
    try {
      const client = clients.find(c => c.id === selectedOpportunity.clientId);
      if (!client) throw new Error("Client not found for opportunity");

      const accessToken = await getGoogleAccessToken();
      await updateOpportunity(selectedOpportunity.id, updatedData, userInfo.id, userInfo.name, client.ownerName, accessToken);
      fetchData(); // Refresca la lista después de la actualización
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

  if (authLoading || loading || !isBoss) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  const pendingOpps = opportunities.filter((opp) => opp.bonificacionEstado === 'Pendiente');
  const approvedOpps = opportunities.filter((opp) => opp.bonificacionEstado === 'Autorizado');
  const rejectedOpps = opportunities.filter((opp) => opp.bonificacionEstado === 'Rechazado');

  const clientsMap = clients.reduce((acc, client) => {
    acc[client.id] = client;
    return acc;
  }, {} as Record<string, Client>);
  
  const usersMap = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {} as Record<string, User>);


  return (
    <div className="flex flex-col h-full">
      <Header title="Aprobaciones de Bonificación" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">Para Resolver</TabsTrigger>
            <TabsTrigger value="approved">Aceptadas</TabsTrigger>
            <TabsTrigger value="rejected">Rechazadas</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <ApprovalsTable opportunities={pendingOpps} onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} />
          </TabsContent>
          <TabsContent value="approved">
            <ApprovalsTable opportunities={approvedOpps} onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} />
          </TabsContent>
           <TabsContent value="rejected">
            <ApprovalsTable opportunities={rejectedOpps} onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} />
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

export default function ApprovalsPage() {
  return (
    <React.Suspense fallback={
        <div className="flex h-full w-full items-center justify-center">
            <Spinner size="large" />
        </div>
    }>
      <ApprovalsPageComponent />
    </React.Suspense>
  );
}
