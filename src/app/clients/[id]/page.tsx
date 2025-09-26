'use client';
import { Header } from '@/components/layout/header';
import { notFound, useRouter } from 'next/navigation';
import { clients, opportunities, activities, users, people } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import React, { use, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { userInfo, loading: authLoading } = useAuth();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const client = clients.find((c) => c.id === id);

  useEffect(() => {
    // No hacer nada hasta que la autenticación haya terminado de cargar
    if (authLoading) {
      return;
    }

    // Si después de cargar no hay userInfo, el hook useAuth ya se encargará de redirigir a /login
    if (!userInfo) {
      return;
    }
    
    if (!client) {
      notFound();
      return;
    }

    const isOwner = client.ownerId === userInfo.id;
    const isAdmin = userInfo.role === 'Administracion';
    const isJefe = userInfo.role === 'Jefe';
    
    if (isOwner || isAdmin || isJefe) {
      setHasAccess(true);
    } else {
      setHasAccess(false);
      // Si el usuario está logueado pero no tiene permisos, lo mandamos a la lista de clientes.
      router.push('/clients');
    }
  }, [id, authLoading, userInfo, client, router]);


  if (authLoading || hasAccess === null) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  if (!client || !hasAccess) {
    // Muestra un spinner mientras redirige o si no se encontró el cliente.
    // Esto previene mostrar contenido brevemente antes de redirigir.
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
