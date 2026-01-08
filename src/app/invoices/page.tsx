'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { Client, Opportunity, Invoice } from '@/lib/types';
import { getClients, getAllOpportunities, createInvoice, createOpportunity, getInvoices } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from 'next/navigation';
import { QuickOpportunityFormDialog } from '@/components/invoices/quick-opportunity-form-dialog';
import { sanitizeInvoiceNumber } from '@/lib/invoice-utils';

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
  const [existingInvoices, setExistingInvoices] = useState<Invoice[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isQuickOppOpen, setIsQuickOppOpen] = useState(false);
  const [clientForNewOpp, setClientForNewOpp] = useState<{id: string, name: string, ownerName: string} | null>(null);
  const [activeRowId, setActiveRowId] = useState<number | null>(null);


  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoadingData(true);
    try {
      const [allClients, allOpportunities, allInvoices] = await Promise.all([
        getClients(),
        getAllOpportunities(),
        getInvoices()
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

      setExistingInvoices(allInvoices);
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
          const normalizedValue = field === 'invoiceNumber' && typeof value === 'string'
            ? sanitizeInvoiceNumber(value)
            : value;
          const updatedRow = { ...row, [field]: normalizedValue };
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
  
  const handleOpportunitySelection = (rowId: number, value: string) => {
    if (value === 'create_new') {
        const clientRow = invoiceRows.find(r => r.id === rowId);
        if (clientRow?.clientId) {
            const client = clients.find(c => c.id === clientRow.clientId);
            if (client) {
                setClientForNewOpp({ id: client.id, name: client.denominacion, ownerName: client.ownerName });
                setActiveRowId(rowId);
                setIsQuickOppOpen(true);
            }
        }
    } else {
        handleRowChange(rowId, 'opportunityId', value);
    }
  };

  const handleOpportunityCreated = async (newOpp: Omit<Opportunity, 'id'>) => {
    if (!userInfo || !clientForNewOpp || activeRowId === null) return;
    try {
        const newOppId = await createOpportunity(newOpp, userInfo.id, userInfo.name, clientForNewOpp.ownerName);
        
        // Add new opp to state to make it available immediately
        const fullNewOpp: Opportunity = { ...newOpp, id: newOppId };
        setOpportunities(prev => [...prev, fullNewOpp]);
        
        // Select the new opportunity in the active row
        handleRowChange(activeRowId, 'opportunityId', newOppId);

        toast({ title: 'Oportunidad creada y seleccionada.' });
        setIsQuickOppOpen(false);
    } catch (error) {
        console.error("Error creating quick opportunity", error);
        toast({ title: 'Error al crear la oportunidad', variant: 'destructive'});
    }
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
    
    // We maintain a set of sanitised numbers added IN THIS BATCH to avoid internal duplicates
    const batchNumbers = new Set<string>();

    for (const row of validRows) {
        try {
            const client = clients.find(c => c.id === row.clientId);
            if (!client) throw new Error(`Cliente no encontrado para la fila con factura ${row.invoiceNumber}`);

            const sanitizedNumber = sanitizeInvoiceNumber(row.invoiceNumber);
            
            if (!sanitizedNumber) {
                toast({
                    title: 'Número de factura inválido',
                    description: 'Solo se permiten dígitos en el número de factura.',
                    variant: 'destructive'
                });
                continue;
            }

            // --- CHECK FOR DUPLICATES / CONFLICTS ---
            let duplicateType: 'none' | 'identical' | 'conflict' = 'none';
            let conflictDetails = '';

            // Helper to check if a number is "short" (4 or 5 digits)
            const isShort = (num: string) => num.length >= 4 && num.length <= 5;

            // Check against existing invoices in DB
            for (const existing of existingInvoices) {
                const cleanExistingNumber = sanitizeInvoiceNumber(existing.invoiceNumber);
                
                let numberMatch = false;

                // BIDIRECTIONAL CHECK:
                // 1. Exact match
                if (cleanExistingNumber === sanitizedNumber) {
                    numberMatch = true;
                }
                // 2. Existing is long, Input is short (suffix match)
                // Ex: Input 8313 (4 digits) matches Existing 0000100008313
                else if (isShort(sanitizedNumber) && cleanExistingNumber.length > 5 && cleanExistingNumber.endsWith(sanitizedNumber)) {
                    numberMatch = true;
                }
                // 3. Existing is short, Input is long (suffix match)
                // Ex: Input 0000100008313 matches Existing 8313
                else if (isShort(cleanExistingNumber) && sanitizedNumber.length > 5 && sanitizedNumber.endsWith(cleanExistingNumber)) {
                    numberMatch = true;
                }

                if (numberMatch) {
                     // Retrieve existing client from opportunity map
                     const existingOpp = opportunities.find(o => o.id === existing.opportunityId);
                     const existingClientId = existingOpp?.clientId;

                     const clientMatch = existingClientId === row.clientId;
                     const dateMatch = existing.date === row.date;
                     // Float comparison with small epsilon
                     const amountMatch = Math.abs(existing.amount - row.amount) < 0.1;

                     if (clientMatch && dateMatch && amountMatch) {
                         duplicateType = 'identical';
                         // Identical is the strongest blocking condition, we can stop here.
                         break;
                     } else {
                         // Found a number match but data differs. Mark as conflict.
                         duplicateType = 'conflict';
                         conflictDetails = `Coincide con FC existente #${existing.invoiceNumber} (Cliente: ${existingOpp?.clientName || 'Desconocido'}, Monto: $${existing.amount})`;
                     }
                }
            }
            
            // Check against current batch (simple exact match to avoid submitting same number twice now)
            if (duplicateType === 'none' && batchNumbers.has(sanitizedNumber)) {
                duplicateType = 'conflict';
                conflictDetails = 'El número se repite dentro de este mismo lote de carga.';
            }

            if (duplicateType === 'identical') {
                 toast({
                    title: `Duplicado Idéntico: #${row.invoiceNumber}`,
                    description: 'Esta factura ya existe con el mismo cliente, fecha y monto (o es equivalente según regla de 4-5 dígitos).',
                    variant: 'destructive'
                });
                continue; // Skip this row
            }

            if (duplicateType === 'conflict') {
                toast({
                   title: `Conflicto de Numeración: #${row.invoiceNumber}`,
                   description: conflictDetails || 'El número coincide con otra factura existente pero los datos difieren.',
                   variant: 'destructive' 
               });
               continue; // Skip this row
           }

            // --- END CHECKS ---

            batchNumbers.add(sanitizedNumber);

            await createInvoice(
                {
                    opportunityId: row.opportunityId,
                    invoiceNumber: sanitizedNumber,
                    amount: row.amount,
                    date: row.date,
                    status: 'Generada',
                    dateGenerated: new Date().toISOString(),
                },
                userInfo.id,
                userInfo.name,
                client.ownerName
            );
            
            // Add to local state to reflect changes immediately
            setExistingInvoices(prev => [
              ...prev,
              {
                id: `temp-${Date.now()}-${Math.random()}`,
                opportunityId: row.opportunityId,
                invoiceNumber: sanitizedNumber,
                amount: row.amount,
                date: row.date,
                status: 'Generada',
                dateGenerated: new Date().toISOString(),
                isCreditNote: false,
              }
            ]);
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
        if (successCount === validRows.length) {
             setInvoiceRows([]); 
        }
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
    <>
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
                          onValueChange={(value) => handleOpportunitySelection(row.id, value)}
                          disabled={!row.clientId}
                        >
                          <SelectTrigger><SelectValue placeholder="Seleccionar oportunidad..." /></SelectTrigger>
                          <SelectContent>
                            {clientOpportunities.map(opp => (
                              <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>
                            ))}
                             <SelectItem value="create_new" className="font-bold text-primary">
                                <PlusCircle className="inline h-4 w-4 mr-2"/>
                                Crear nueva oportunidad...
                             </SelectItem>
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
    {clientForNewOpp && (
        <QuickOpportunityFormDialog
            isOpen={isQuickOppOpen}
            onOpenChange={setIsQuickOppOpen}
            client={clientForNewOpp}
            onSave={handleOpportunityCreated}
        />
    )}
    </>
  );
}
