
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

export default function ClientPage({ params }: { params: { id: string } }) {
  const { userInfo, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const { id } = use(params);
  const client = clients.find((c) => c.id === id);

  useEffect(() => {
    // This effect runs only when auth loading is complete.
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

      // If the user does not have access, redirect.
      if (!userHasAccess) {
        router.push('/clients');
      }
    }
  }, [authLoading, userInfo, client, router]); // Key dependencies

  // 1. Show Spinner while authentication is in progress.
  if (authLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // 2. After loading, determine if the user has access.
  // We re-check here to decide what to render. The useEffect above handles the redirect.
  const userHasAccess =
    userInfo &&
    client &&
    (userInfo.role === 'Jefe' ||
      userInfo.role === 'Administracion' ||
      (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

  // 3. If there's no client or no access, the useEffect will redirect.
  // In the meantime, we show a spinner to prevent content flashing.
  if (!client || !userHasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // 4. If everything is fine, show the client details.
  const clientOpportunities = allOpportunities.filter(o => o.clientId === client.id);
  const clientActivities = allActivities.filter(a => a.clientId === client.id);
  const clientPeople = allPeople.filter(p => p.clientIds.includes(client.id));

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
        />
      </main>
    </div>
  );
}
