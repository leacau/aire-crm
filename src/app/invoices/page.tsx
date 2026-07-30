'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Spinner } from '@/components/ui/spinner';
import { TangoInvoicesTab } from '@/components/invoices/tango-invoices-tab';
import { getClients } from '@/lib/api/clients';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/lib/types';

export default function InvoicesPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;

    setLoadingData(true);
    try {
      setClients(await getClients());
    } catch (error) {
      console.error('Error loading clients for Tango invoices:', error);
      toast({ title: 'Error al cargar clientes', variant: 'destructive' });
    } finally {
      setLoadingData(false);
    }
  }, [toast, userInfo]);

  useEffect(() => {
    if (userInfo) fetchData();
  }, [fetchData, userInfo]);

  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Facturas" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <TangoInvoicesTab clients={clients} />
      </main>
    </div>
  );
}
