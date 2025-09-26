'use client';
import { Header } from '@/components/layout/header';
import { notFound, useRouter } from 'next/navigation';
import { clients, opportunities, activities, users, people } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import React, { use } from 'react';
import { Spinner } from '@/components/ui/spinner';

function ClientPageContent({ id }: { id: string }) {
  const router = useRouter();
  const { user, userInfo } = useAuth();

  const client = clients.find((c) => c.id === id);
  
  React.useEffect(() => {
    if (userInfo && client) {
      const isOwner = client.ownerId === userInfo.id;
      const isAdmin = userInfo.role === 'Administracion';
      const isJefe = userInfo.role === 'Jefe';

      if (!isOwner && !isAdmin && !isJefe) {
        router.push('/clients');
      }
    }
  }, [userInfo, client, router]);


  if (!client) {
    return notFound();
  }

  // Show a loading state or nothing while the effect runs
  if (!userInfo || (userInfo.role === 'Asesor' && client.ownerId !== userInfo.id)) {
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


export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientPageContent id={id} />;
}
