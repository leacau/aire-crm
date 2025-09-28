
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

  // Correctly unwrap the id from params as per Next.js 13+ app router guidelines
  const { id } = use(params);

  const client = clients.find((c) => c.id === id);

  useEffect(() => {
    // This effect will run ONLY when the loading state changes from true to false.
    if (!authLoading) {
      const userHasAccess =
        userInfo &&
        client &&
        (userInfo.role === 'Jefe' ||
          userInfo.role === 'Administracion' ||
          (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

      if (!client || !userHasAccess) {
        router.push('/clients');
      }
    }
  }, [authLoading, userInfo, client, router, id]); // Dependencies ensure this runs when auth state is resolved.


  // Render a loading spinner as long as authentication is in progress.
  // This is the primary guard against premature rendering or logic execution.
  if (authLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // Once loading is false, we can determine if the user has access.
  // The useEffect above will handle redirection if they don't.
  const userHasAccess =
    userInfo &&
    client &&
    (userInfo.role === 'Jefe' ||
      userInfo.role === 'Administracion' ||
      (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

  // If there's no client or no access, render a spinner while the redirection from useEffect happens.
  // This prevents flashing content.
  if (!client || !userHasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  // If we reach here, it means auth is loaded, the client exists, and the user has access.
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
