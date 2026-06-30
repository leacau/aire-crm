'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { TangoInvoicesTab } from '@/components/invoices/tango-invoices-tab';
import { getClients } from '@/modules/clients/client';
import type { Client } from '@/lib/types';

export default function InvoicesPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      setLoading(true);
      try {
        const result = await getClients({ forceServer: true, preferFirestore: true });
        if (isMounted) {
          setClients(result as Client[]);
          setClientsError(null);
        }
      } catch (error) {
        console.error('Error loading clients for Tango invoices:', error);
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los clientes del CRM.';
        if (isMounted) {
          setClients([]);
          setClientsError(message);
        }
        toast({
          title: 'No se pudo cargar el mapeo de clientes',
          description: 'Podés consultar Tango igual, pero no se mostrará la relación con clientes CRM.',
          variant: 'destructive',
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadClients();

    return () => { isMounted = false; };
  }, [toast]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Facturas de Tango" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="large" />
          </div>
        ) : (
          <TangoInvoicesTab clients={clients} mappingWarning={clientsError} />
        )}
      </main>
    </div>
  );
}
