'use client';
import { Header } from '@/components/layout/header';
import { notFound, useRouter } from 'next/navigation';
import { clients, opportunities, activities, users, people } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Spinner } from '@/components/ui/spinner';

export default function ClientPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const currentUser = users.find(u => u.email === user?.email);

  const client = clients.find((c) => c.id === params.id);
  
  React.useEffect(() => {
    if (currentUser && client) {
      const isOwner = client.ownerId === currentUser.id;
      const isAdmin = currentUser.role === 'Administracion';
      const isJefe = currentUser.role === 'Jefe';

      if (!isOwner && !isAdmin && !isJefe) {
        router.push('/clients');
      }
    }
  }, [currentUser, client, router]);


  if (!client) {
    return notFound();
  }

  // Show a loading state or nothing while the effect runs
  if (!currentUser || (currentUser.role === 'Asesor' && client.ownerId !== currentUser.id)) {
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
