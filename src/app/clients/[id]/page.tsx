'use client';
import { Header } from '@/components/layout/header';
import { notFound, useRouter } from 'next/navigation';
import { clients, opportunities, activities, users, people } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import React, { use, useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { userInfo, loading: authLoading } = useAuth();

  const client = clients.find((c) => c.id === id);

  if (authLoading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  if (!userInfo) {
    // This case should be handled by the AuthProvider, but as a fallback:
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  if (!client) {
    notFound();
    return null;
  }

  const isOwner = client.ownerId === userInfo.id;
  const isAdmin = userInfo.role === 'Administracion';
  const isJefe = userInfo.role === 'Jefe';
  const hasAccess = isOwner || isAdmin || isJefe;

  if (!hasAccess) {
     // We use useEffect to redirect on the client side after the initial render.
     // This prevents errors and ensures navigation happens correctly.
    useEffect(() => {
        router.push('/clients');
    }, [router]);

    // Render a loading state while redirecting
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  const clientOpportunities = opportunities.filter(
    (o) => o.clientId === client.id
  );
  const clientActivities = activities.filter((a) => a.clientId === client.id);
  const clientPeople = people.filter(p => client.personIds.includes(p.id));

  return (
    <div className="flex flex-col h-full">
       <Header title={client.name}>
        <Button asChild variant="outline">
            <Link href="/clients">
                <ArrowLeft className="mr-2 h-4 w-4"/>
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
          users={users}
        />
      </main>
    </div>
  );
}
