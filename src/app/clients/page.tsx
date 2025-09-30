
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileDown, MoreHorizontal, PlusCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import type { Client, Opportunity } from '@/lib/types';
import { createClient, getClients, getAllOpportunities } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

export default function ClientsPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedClients, fetchedOpps] = await Promise.all([
          getClients(),
          getAllOpportunities()
      ]);
      setClients(fetchedClients);
      setOpportunities(fetchedOpps);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron cargar los datos de clientes y oportunidades.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  const filteredClients = useMemo(() => {
    if (searchTerm.length < 3) {
      return clients;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return clients.filter(client =>
      client.denominacion.toLowerCase().includes(lowercasedFilter) ||
      client.razonSocial.toLowerCase().includes(lowercasedFilter)
    );
  }, [clients, searchTerm]);


  const handleSaveClient = async (clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>) => {
    if (!userInfo) {
        toast({
            title: "Error",
            description: "Debes iniciar sesión para crear un cliente.",
            variant: "destructive",
        });
        return;
    }

    try {
      await createClient(clientData, userInfo.id, userInfo.name);
      toast({
        title: "Cliente Creado",
        description: `${clientData.denominacion} ha sido añadido a la lista.`,
      });
      fetchData(); // Refresh the list
    } catch (error) {
        console.error("Error creating client:", error);
        toast({
            title: "Error al crear cliente",
            description: "No se pudo guardar el cliente.",
            variant: "destructive",
        });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Clientes">
         <div className="relative ml-auto flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar..."
                className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[330px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <Button variant="outline" className="hidden sm:flex">
          <FileDown className="mr-2" />
          Exportar
        </Button>
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2" />
          Nuevo
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Denominación</TableHead>
                <TableHead className="hidden sm:table-cell">Razón Social</TableHead>
                <TableHead className="hidden lg:table-cell">Negocios Abiertos</TableHead>
                <TableHead className="hidden lg:table-cell">Valor Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => {
                const clientOpps = opportunities.filter(
                  (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
                );
                const totalValue = clientOpps.reduce(
                  (acc, opp) => acc + opp.value,
                  0
                );

                const canViewDetails = userInfo && (
                    userInfo.role === 'Jefe' || 
                    userInfo.role === 'Administracion' || 
                    (userInfo.role === 'Asesor' && client.ownerId === userInfo.id)
                );

                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      {canViewDetails ? (
                         <Link
                          href={`/clients/${client.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {client.denominacion}
                        </Link>
                      ) : (
                        <span className="font-medium">{client.denominacion}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div>
                        <div className="font-medium">{client.razonSocial}</div>
                        <div className="text-sm text-muted-foreground">
                          {client.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? clientOpps.length : '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? `$${totalValue.toLocaleString('es-AR')}` : '-'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
      <ClientFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveClient}
      />
    </div>
  );
}
