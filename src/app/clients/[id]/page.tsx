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
  const { userInfo, loading: authLoading } = useAuth();

  const client = clients.find((c) => c.id === id);

  const [hasAccess, setHasAccess] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (authLoading) return;

    if (!userInfo || !client) {
      if (!client) {
        notFound();
      }
      return;
    }

    const isOwner = client.ownerId === userInfo.id;
    const isAdmin = userInfo.role === 'Administracion';
    const isJefe = userInfo.role === 'Jefe';

    if (isOwner || isAdmin || isJefe) {
      setHasAccess(true);
    } else {
      setHasAccess(false);
      router.push('/clients');
    }
  }, [userInfo, authLoading, client, router, id]);

  if (hasAccess === null || authLoading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }
  
  if (hasAccess === false) {
    // We are redirecting, so we can show a spinner or null
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }
  
  if (!client) {
    // This will likely not be hit due to the check above, but it's good practice
    return notFound();
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
