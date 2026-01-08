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
    
    // Conjunto para evitar duplicados dentro del mismo lote de carga actual
    const batchNumbers = new Set<string>();

    for (const row of validRows) {
        try {
            const client = clients.find(c => c.id === row.clientId);
            if (!client) throw new Error(`Cliente no encontrado para la fila con factura ${row.invoiceNumber}`);

            const inputRaw = sanitizeInvoiceNumber(row.invoiceNumber); // Solo dígitos
            
            if (!inputRaw) {
                toast({
                    title: 'Número de factura inválido',
                    description: 'Solo se permiten dígitos en el número de factura.',
                    variant: 'destructive'
                });
                continue;
            }

            // --- LÓGICA DE DUPLICADOS MEJORADA ---
            let duplicateType: 'none' | 'identical' | 'conflict' = 'none';
            let conflictDetails = '';

            // Obtiene los números significativos (sin ceros a la izquierda) para determinar longitud real
            const getSignificant = (s: string) => s.replace(/^0+/, '');

            const inputSignificant = getSignificant(inputRaw);
            // AHORA INCLUYE 4, 5 Y 6 DÍGITOS
            const isInputShort = inputSignificant.length >= 4 && inputSignificant.length <= 6;

            for (const existing of existingInvoices) {
                const existingRaw = sanitizeInvoiceNumber(existing.invoiceNumber);
                const existingSignificant = getSignificant(existingRaw);
                // AHORA INCLUYE 4, 5 Y 6 DÍGITOS
                const isExistingShort = existingSignificant.length >= 4 && existingSignificant.length <= 6;
                
                let numberMatch = false;

                // 1. Coincidencia exacta (todo el string de dígitos igual)
                if (inputRaw === existingRaw) {
                    numberMatch = true;
                }
                // 2. Si el INPUT es corto (4-6 dígitos) y el existente es más largo, chequear si existente TERMINA con inputRaw (o inputSignificant)
                // Ejemplo: Input "8313", Existente "000100008313" o "100008313"
                else if (isInputShort && existingRaw.length > inputRaw.length) {
                    if (existingRaw.endsWith(inputRaw) || existingRaw.endsWith(inputSignificant)) {
                        numberMatch = true;
                    }
                }
                // 3. Si el EXISTENTE es corto (4-6 dígitos) y el input es más largo, chequear si input TERMINA con existingRaw
                // Ejemplo: Input "000100008313", Existente "8313"
                else if (isExistingShort && inputRaw.length > existingRaw.length) {
                    if (inputRaw.endsWith(existingRaw) || inputRaw.endsWith(existingSignificant)) {
                        numberMatch = true;
                    }
                }

                if (numberMatch) {
                     const existingOpp = opportunities.find(o => o.id === existing.opportunityId);
                     const existingClientId = existingOpp?.clientId;

                     const clientMatch = existingClientId === row.clientId;
                     const dateMatch = existing.date === row.date;
                     // Comparación de monto con pequeña tolerancia por decimales
                     const amountMatch = Math.abs(existing.amount - row.amount) < 0.1;

                     if (clientMatch && dateMatch && amountMatch) {
                         duplicateType = 'identical';
                         break; // Es el caso más grave, bloqueamos y salimos.
                     } else {
                         duplicateType = 'conflict';
                         conflictDetails = `Coincide con FC existente #${existing.invoiceNumber} (Cliente: ${existingOpp?.clientName || 'Desconocido'}, Monto: $${existing.amount})`;
                         // No hacemos break por si más adelante encontramos un duplicado IDÉNTICO que tiene prioridad.
                     }
                }
            }
            
            // Verificación dentro del mismo lote (batch) para evitar subir dos veces el mismo número ahora mismo
            if (duplicateType === 'none' && batchNumbers.has(inputRaw)) {
                duplicateType = 'conflict';
                conflictDetails = 'El número se repite dentro de este mismo lote de carga.';
            }

            if (duplicateType === 'identical') {
                 toast({
                    title: `Duplicado Idéntico: #${row.invoiceNumber}`,
                    description: 'Esta factura ya existe con el mismo cliente, fecha y monto.',
                    variant: 'destructive'
                });
                continue; // Saltamos esta fila
            }

            if (duplicateType === 'conflict') {
                toast({
                   title: `Conflicto de Numeración: #${row.invoiceNumber}`,
                   description: conflictDetails || 'El número coincide con los dígitos finales de otra factura existente.',
                   variant: 'destructive' 
               });
               continue; // Saltamos esta fila
           }

            // --- FIN VERIFICACIONES ---

            batchNumbers.add(inputRaw);

            await createInvoice(
                {
                    opportunityId: row.opportunityId,
                    invoiceNumber: inputRaw,
                    amount: row.amount,
                    date: row.date,
                    status: 'Generada',
                    dateGenerated: new Date().toISOString(),
                },
                userInfo.id,
                userInfo.name,
                client.ownerName
            );
            
            setExistingInvoices(prev => [
              ...prev,
              {
                id: `temp-${Date.now()}-${Math.random()}`,
                opportunityId: row.opportunityId,
                invoiceNumber: inputRaw,
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
