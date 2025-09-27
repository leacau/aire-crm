
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth.tsx';
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
  const id = params.id;

  const client = clients.find((c) => c.id === id);
  
  // Determine access rights after auth has loaded.
  const hasAccess = !authLoading && userInfo && client && (userInfo.role === 'Jefe' || userInfo.role === 'Administracion' || (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

  useEffect(() => {
    // Redirect if auth has loaded and user is not found, client not found, or no access.
    if (!authLoading && (!userInfo || !client || !hasAccess)) {
      router.push('/clients');
    }
  }, [authLoading, userInfo, client, hasAccess, router]);

  if (authLoading || !userInfo || !client || !hasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

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
