import { Header } from '@/components/layout/header';
import { notFound } from 'next/navigation';
import { clients, opportunities, activities, users } from '@/lib/data';
import { ClientDetails } from '@/components/clients/client-details';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ClientPage({ params }: { params: { id: string } }) {
  const client = clients.find((c) => c.id === params.id);
  if (!client) {
    notFound();
  }

  const clientOpportunities = opportunities.filter(
    (o) => o.clientId === client.id
  );
  const clientActivities = activities.filter((a) => a.clientId === client.id);

  return (
    <div className="flex flex-col h-full">
       <Header title={client.name}>
        <Button asChild variant="outline">
            <Link href="/clients">
                <ArrowLeft className="mr-2 h-4 w-4"/>
                Back to Clients
            </Link>
        </Button>
       </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <ClientDetails
          client={client}
          opportunities={clientOpportunities}
          activities={clientActivities}
          users={users}
        />
      </main>
    </div>
  );
}
