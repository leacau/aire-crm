
'use client';

import React, { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { clients, opportunities as allOpportunities, activities as allActivities, people as allPeople } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Client } from '@/lib/types';


export default function ClientPage({ params }: { params: { id: string } }) {
  const { userInfo, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const { id } = use(params);
  
  const [client, setClient] = React.useState<Client | undefined>(() => clients.find((c) => c.id === id));

  useEffect(() => {
    if (!authLoading) {
      if (!client) {
        router.push('/clients');
        return;
      }
      
      const userHasAccess =
        userInfo &&
        (userInfo.role === 'Jefe' ||
          userInfo.role === 'Administracion' ||
          (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

      if (!userHasAccess) {
        router.push('/clients');
      }
    }
  }, [authLoading, userInfo, client, router]);


  if (authLoading || !client) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const userHasAccess =
    userInfo &&
    (userInfo.role === 'Jefe' ||
      userInfo.role === 'Administracion' ||
      (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

  if (!userHasAccess) {
      return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const clientOpportunities = allOpportunities.filter(o => o.clientId === client.id);
  const clientActivities = allActivities.filter(a => a.clientId === client.id);
  const clientPeople = allPeople.filter(p => p.clientIds.includes(client.id));

  const handleUpdateClient = (updatedClient: Client) => {
    setClient(updatedClient);
    // Also update the main clients array for consistency across the app
    const clientIndex = clients.findIndex(c => c.id === updatedClient.id);
    if (clientIndex !== -1) {
      clients[clientIndex] = updatedClient;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title={client.company}>
        <Button asChild variant="outline">
          <Link href="/clients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Clientes
          </Link>
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <ClientDetails
          client={client}
          opportunities={clientOpportunities}
          activities={clientActivities}
          people={clientPeople}
          onUpdate={handleUpdateClient}
        />
      </main>
    </div>
  );
}
