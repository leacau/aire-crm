'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { Client, Opportunity } from '@/lib/types';
import { getClients, getAllOpportunities, createInvoice } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from 'next/navigation';

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  date: string;
  amount: number;
  clientId: string;
  opportunityId: string;
};

export default function InvoiceUploadPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoadingData(true);
    try {
      const [allClients, allOpportunities] = await Promise.all([
        getClients(),
        getAllOpportunities()
      ]);

      if (isBoss) {
        setClients(allClients);
        setOpportunities(allOpportunities);
      } else {
        const userClients = allClients.filter(c => c.ownerId === userInfo.id);
        const userClientIds = new Set(userClients.map(c => c.id));
        const userOpportunities = allOpportunities.filter(o => userClientIds.has(o.clientId));
        setClients(userClients);
        setOpportunities(userOpportunities);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar datos", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [userInfo, isBoss, toast]);

  useEffect(() => {
    if (userInfo) {
      fetchData();
    }
  }, [userInfo, fetchData]);

  const addRow = () => {
    setInvoiceRows(prev => [
      ...prev,
      {
        id: Date.now(),
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        clientId: '',
        opportunityId: '',
      }
    ]);
  };

  const removeRow = (id: number) => {
    setInvoiceRows(prev => prev.filter(row => row.id !== id));
  };

  const handleRowChange = (id: number, field: keyof Omit<InvoiceRow, 'id'>, value: string | number) => {
    setInvoiceRows(prev =>
      prev.map(row => {
        if (row.id === id) {
          const updatedRow = { ...row, [field]: value };
          // Reset opportunity if client changes
          if (field === 'clientId') {
            updatedRow.opportunityId = '';
          }
          return updatedRow;
        }
        return row;
      })
    );
  };
  
  const handleSaveAll = async () => {
    if (!userInfo) return;

    const validRows = invoiceRows.filter(
      row => row.invoiceNumber && row.amount > 0 && row.clientId && row.opportunityId
    );

    if (validRows.length === 0) {
      toast({ title: "No hay facturas válidas para guardar", description: "Completa todos los campos de al menos una fila.", variant: "destructive" });
      return;
    }
    
    if (validRows.length < invoiceRows.length) {
       toast({ title: "Algunas filas están incompletas", description: "Solo se guardarán las filas con todos los campos completos.", variant: "default" });
    }

    setIsSaving(true);
    let successCount = 0;
    
    for (const row of validRows) {
        try {
            const client = clients.find(c => c.id === row.clientId);
            if (!client) throw new Error(`Cliente no encontrado para la fila con factura ${row.invoiceNumber}`);

            await createInvoice(
                {
                    opportunityId: row.opportunityId,
                    invoiceNumber: row.invoiceNumber,
                    amount: row.amount,
                    date: row.date,
                    status: 'Generada',
                    dateGenerated: new Date().toISOString(),
                },
                userInfo.id,
                userInfo.name,
                client.ownerName
            );
            successCount++;
        } catch (error) {
            console.error(`Error guardando factura ${row.invoiceNumber}:`, error);
            toast({
                title: `Error al guardar factura ${row.invoiceNumber}`,
                description: (error as Error).message,
                variant: "destructive"
            });
        }
    }

    setIsSaving(false);
    toast({
      title: "Proceso finalizado",
      description: `${successCount} de ${validRows.length} facturas se guardaron exitosamente.`,
    });

    if (successCount > 0) {
        setInvoiceRows([]); // Clear the form
    }
  };

  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Carga de Facturas">
        <Button onClick={addRow} size="sm">
          <PlusCircle className="mr-2 h-4 w-4" />
          Añadir Fila
        </Button>
        <Button onClick={handleSaveAll} size="sm" disabled={isSaving || invoiceRows.length === 0}>
            {isSaving ? <Spinner size="small" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar Facturas
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Nº Factura</TableHead>
                <TableHead className="w-[180px]">Fecha</TableHead>
                <TableHead className="w-[150px]">Monto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Oportunidad</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceRows.length > 0 ? (
                invoiceRows.map(row => {
                  const clientOpportunities = opportunities.filter(
                    opp => opp.clientId === row.clientId && opp.stage === 'Cerrado - Ganado'
                  );
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Input
                          placeholder="Ej: 0001-00012345"
                          value={row.invoiceNumber}
                          onChange={e => handleRowChange(row.id, 'invoiceNumber', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={row.date}
                          onChange={e => handleRowChange(row.id, 'date', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={row.amount}
                          onChange={e => handleRowChange(row.id, 'amount', Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.clientId}
                          onValueChange={value => handleRowChange(row.id, 'clientId', value)}
                        >
                          <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                          <SelectContent>
                            {clients.map(client => (
                              <SelectItem key={client.id} value={client.id}>{client.denominacion}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.opportunityId}
                          onValueChange={value => handleRowChange(row.id, 'opportunityId', value)}
                          disabled={!row.clientId}
                        >
                          <SelectTrigger><SelectValue placeholder="Seleccionar oportunidad..." /></SelectTrigger>
                          <SelectContent>
                            {clientOpportunities.map(opp => (
                              <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Añade una fila para comenzar a cargar facturas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
