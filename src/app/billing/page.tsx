

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers, getInvoices, updateInvoice, createInvoice, getPaymentEntries, replacePaymentEntriesForAdvisor, updatePaymentEntry, deletePaymentEntries, requestPaymentExplanation, getChatSpaces } from '@/lib/firebase-service';
import type { Opportunity, Client, User, Invoice, PaymentEntry, ChatSpaceMapping } from '@/lib/types';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { isWithinInterval, startOfMonth, endOfMonth, parseISO, addMonths, isSameMonth, getYear, getMonth, set, parse, differenceInCalendarDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingTable } from '@/components/billing/billing-table';
import { ToInvoiceTable } from '@/components/billing/to-invoice-table';
import { getNormalizedInvoiceNumber, sanitizeInvoiceNumber } from '@/lib/invoice-utils';
import { PaymentsTable } from '@/components/billing/payments-table';

const getPeriodDurationInMonths = (period: string): number => {
    switch (period) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 0;
    }
};

const normalizeDate = (raw?: string) => {
  if (!raw) return undefined;
  const value = raw.trim();
  const tryParse = (parser: () => Date) => {
    try {
      const parsed = parser();
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch (error) {
      return undefined;
    }
    return undefined;
  };

  return (
    tryParse(() => parseISO(value)) ??
    tryParse(() => parse(value, 'dd/MM/yyyy', new Date())) ??
    value
  );
};

const computeDaysLate = (dueDate?: string) => {
  if (!dueDate) return null;
  const parsedISO = normalizeDate(dueDate);
  if (!parsedISO) return null;
  try {
    const parsedDate = parseISO(parsedISO);
    if (Number.isNaN(parsedDate.getTime())) return null;
    const diff = differenceInCalendarDays(new Date(), parsedDate);
    return diff > 0 ? diff : 0;
  } catch (error) {
    return null;
  }
};

const parsePastedPayments = (
  raw: string,
): Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[] => {
  const parseAmount = (value?: string) => {
    if (!value) return undefined;
    const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const numeric = parseFloat(cleaned);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cols) => cols.length >= 7)
    .map((cols) => {
      const [company, , comprobante, razonSocial, pendingRaw, , dueDateRaw] = cols;
      const pendingAmount = parseAmount(pendingRaw);
      const dueDate = normalizeDate(dueDateRaw);

      return {
        company: company || '—',
        comprobanteNumber: comprobante || undefined,
        razonSocial: razonSocial || undefined,
        pendingAmount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        // Importe pendiente es la única cifra provista; la usamos como total de referencia
        amount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        dueDate,
        daysLate: computeDaysLate(dueDate || undefined) ?? undefined,
        notes: '',
        nextContactAt: null,
      };
    });
};

export type NewInvoiceData = {
    invoiceNumber: string;
    date: string;
    amount: number | string;
};


function BillingPageComponent({ initialTab }: { initialTab: string }) {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pastedPayments, setPastedPayments] = useState('');
  const [isImportingPayments, setIsImportingPayments] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  
  const opportunitiesMap = useMemo(() => 
    opportunities.reduce((acc, opp) => {
        acc[opp.id] = opp;
        return acc;
    }, {} as Record<string, Opportunity>),
  [opportunities]);

  const clientsMap = useMemo(() =>
    clients.reduce((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {} as Record<string, Client>),
  [clients]);

  const usersMap = useMemo(() =>
    advisors.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, User>),
  [advisors]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allClients, allAdvisors, allInvoices, paymentRows, savedSpaces] = await Promise.all([
        getAllOpportunities(),
        getClients(),
        getAllUsers('Asesor'),
        getInvoices(),
        getPaymentEntries(),
        getChatSpaces(),
      ]);
      setOpportunities(allOpps);
      setClients(allClients);
      setAdvisors(allAdvisors);
      setInvoices(allInvoices);
      setPayments(paymentRows);
      setChatSpaces(savedSpaces);

    } catch (error) {
      console.error("Error fetching billing data:", error);
      toast({ title: 'Error al cargar datos de facturación', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) {
        fetchData();
    }
  }, [userInfo, fetchData]);

  const { toInvoiceOpps, toCollectInvoices, paidInvoices, creditNoteInvoices } = useMemo(() => {
    if (!userInfo || !userInfo.id) {
      return { toInvoiceOpps: [], toCollectInvoices: [], paidInvoices: [], creditNoteInvoices: [] };
    }

    const isDateInRange = (date: Date) => {
        if (!dateRange?.from || !dateRange?.to) return true;
        return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
    }

    const advisorClientIds = isBoss && selectedAdvisor !== 'all' 
        ? new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id))
        : null;

    let userWonOpps = opportunities.filter(opp => {
      if (opp.stage !== 'Cerrado - Ganado') return false;

      let isOwner = false;
      if (isBoss) {
        isOwner = advisorClientIds ? advisorClientIds.has(opp.clientId) : true;
      } else {
        const client = clients.find(c => c.id === opp.clientId);
        isOwner = client?.ownerId === userInfo.id;
      }
      return isOwner;
    });

    const toInvoiceOpps: Opportunity[] = [];
    const invoicesByOppId = invoices.reduce((acc, inv) => {
        if (!acc[inv.opportunityId]) acc[inv.opportunityId] = [];
        acc[inv.opportunityId].push(inv);
        return acc;
    }, {} as Record<string, Invoice[]>);

    userWonOpps.forEach(opp => {
        if (!opp.createdAt) return;

        const creationDate = parseISO(opp.createdAt);
        const maxPeriodicity = opp.periodicidad?.[0] || 'Ocasional';
        const durationMonths = getPeriodDurationInMonths(maxPeriodicity);

        if (durationMonths > 0) { // Handle periodic opportunities
            for (let i = 0; i < durationMonths; i++) {
                const monthDate = addMonths(creationDate, i);

                if (isDateInRange(monthDate)) {
                    const hasInvoiceForMonth = (invoicesByOppId[opp.id] || []).some(inv =>
                        inv.date && !inv.isCreditNote && isSameMonth(parseISO(inv.date), monthDate)
                    );

                    if (!hasInvoiceForMonth) {
                        // Create a virtual opportunity for this month's billing
                        const virtualOpp = {
                            ...opp,
                            // Add a stable unique ID for the table key and a reference date
                            id: `${opp.id}_${monthDate.toISOString()}`,
                            closeDate: monthDate.toISOString(),
                        };
                        toInvoiceOpps.push(virtualOpp);
                    }
                }
            }
        } else { // Handle one-time ("Ocasional") opportunities
            if (isDateInRange(creationDate)) {
                const hasInvoiceInMonth = (invoicesByOppId[opp.id] || []).some(inv =>
                    inv.date && !inv.isCreditNote && isSameMonth(parseISO(inv.date), creationDate)
                );

                if (!hasInvoiceInMonth) {
                    toInvoiceOpps.push({ ...opp, closeDate: creationDate.toISOString() });
                }
            }
        }
    });

    // A Cobrar y Pagado
    let userFilteredInvoices = invoices;
    if (isBoss) {
      if (selectedAdvisor !== 'all') {
        const advisorOppIds = new Set(opportunities.filter(o => advisorClientIds?.has(o.clientId)).map(o => o.id));
        userFilteredInvoices = invoices.filter(inv => advisorOppIds.has(inv.opportunityId));
      }
    } else {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      const userOppIds = new Set(opportunities.filter(o => userClientIds.has(o.clientId)).map(o => o.id));
      userFilteredInvoices = invoices.filter(inv => userOppIds.has(inv.opportunityId));
    }
    
    const toCollectInvoices = userFilteredInvoices.filter(inv =>
        inv.date && isDateInRange(parseISO(inv.date)) && inv.status !== 'Pagada' && !inv.isCreditNote
    );
    const paidInvoices = userFilteredInvoices.filter(inv =>
        inv.datePaid && isDateInRange(parseISO(inv.datePaid)) && inv.status === 'Pagada'
    );

    const creditNoteInvoices = userFilteredInvoices.filter(inv => {
        if (!inv.isCreditNote) return false;
        if (!inv.creditNoteMarkedAt) return false;
        try {
            return isDateInRange(parseISO(inv.creditNoteMarkedAt));
        } catch (error) {
            return false;
        }
    });

    return { toInvoiceOpps, toCollectInvoices, paidInvoices, creditNoteInvoices };

  }, [opportunities, invoices, clients, selectedAdvisor, isBoss, userInfo, dateRange]);

  const filteredPayments = useMemo(() => {
    if (!userInfo) return [] as PaymentEntry[];

    const baseList = isBoss
      ? selectedAdvisor === 'all'
        ? payments
        : payments.filter((p) => p.advisorId === selectedAdvisor)
      : payments.filter((p) => p.advisorId === userInfo.id);

    return [...baseList]
      .map((entry) => ({ ...entry, daysLate: computeDaysLate(entry.dueDate || undefined) ?? entry.daysLate }))
      .sort((a, b) => (b.daysLate ?? -Infinity) - (a.daysLate ?? -Infinity));
  }, [isBoss, payments, selectedAdvisor, userInfo]);

  useEffect(() => {
    setSelectedPaymentIds((prev) => prev.filter((id) => filteredPayments.some((entry) => entry.id === id)));
  }, [filteredPayments]);


  const handleUpdateOpportunity = async (updatedData: Partial<Opportunity>) => {
    if (!selectedOpportunity || !userInfo) return;
    try {
      const client = clients.find(c => c.id === selectedOpportunity.clientId);
      if (!client) throw new Error("Client not found for the opportunity");

      await updateOpportunity(selectedOpportunity.id, updatedData, userInfo.id, userInfo.name, client.ownerName);
      fetchData();
      toast({ title: "Oportunidad Actualizada" });
    } catch (error) {
      console.error("Error updating opportunity:", error);
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  const handleCreateInvoice = async (virtualOppId: string, invoiceDetails: NewInvoiceData) => {
    if (!userInfo) return;

    const realOppId = virtualOppId.split('_')[0];
    const opp = opportunitiesMap[realOppId];
    if (!opp) return;

    const client = clientsMap[opp.clientId];
    if (!client) return;

    const sanitizedNumber = sanitizeInvoiceNumber(String(invoiceDetails.invoiceNumber));
    if (!sanitizedNumber) {
      toast({ title: 'Número de factura inválido', description: 'Solo se permiten dígitos en el número de factura.', variant: 'destructive' });
      return;
    }

    const existingNumbers = new Set(invoices.map(inv => getNormalizedInvoiceNumber(inv)));
    if (existingNumbers.has(sanitizedNumber)) {
      toast({ title: `Factura duplicada #${invoiceDetails.invoiceNumber}`, description: 'Ya existe una factura con ese número.', variant: 'destructive' });
      return;
    }

    try {
        const newInvoice: Omit<Invoice, 'id'> = {
            opportunityId: realOppId,
            invoiceNumber: sanitizedNumber,
            amount: Number(invoiceDetails.amount),
            date: invoiceDetails.date,
            status: 'Generada',
            dateGenerated: new Date().toISOString(),
        };

        await createInvoice(newInvoice, userInfo.id, userInfo.name, client.ownerName);
        toast({ title: 'Factura Creada' });
        
        // Optimistically update UI before refetch
        setInvoices(prev => [...prev, { ...newInvoice, id: 'temp-' + Date.now() }]);
        
        // Refetch to get the real data and update the tables
        fetchData();
    } catch (error) {
        console.error("Error creating invoice:", error);
        toast({ title: "Error al crear la factura", variant: "destructive" });
    }
  };

  const handleImportPayments = async () => {
    if (!userInfo || !isBoss) return;
    if (!selectedAdvisor || selectedAdvisor === 'all') {
      toast({ title: 'Seleccioná un asesor', description: 'Elegí un asesor antes de pegar la lista de pagos.', variant: 'destructive' });
      return;
    }

    const advisor = advisors.find((a) => a.id === selectedAdvisor);
    if (!advisor) {
      toast({ title: 'Asesor no encontrado', variant: 'destructive' });
      return;
    }

    const rows = parsePastedPayments(pastedPayments);
    if (rows.length === 0) {
      toast({ title: 'No se pudo leer la lista', description: 'Pegá la tabla con las columnas en pestañas o separadas por ;', variant: 'destructive' });
      return;
    }

    setIsImportingPayments(true);
    try {
      await replacePaymentEntriesForAdvisor(advisor.id, advisor.name || advisor.email || 'Asesor', rows, userInfo.id, userInfo.name);
      toast({ title: 'Pagos actualizados' });
      setPastedPayments('');
      fetchData();
    } catch (error) {
      console.error('Error importing payments', error);
      toast({ title: 'Error al cargar pagos', variant: 'destructive' });
    } finally {
      setIsImportingPayments(false);
    }
  };

  const handleUpdatePaymentEntry = async (
    entry: PaymentEntry,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt'>>,
    options?: { reason?: string },
  ) => {
    setPayments((prev) => prev.map((p) => (p.id === entry.id ? { ...p, ...updates } : p)));
    try {
      const detailMap: Record<string, string> = {
        status: 'Estado de mora',
        notes: 'Nota de mora',
        reminder: 'Recordatorio de mora',
        'reminder-clear': 'Recordatorio de mora',
        pendingAmount: 'Importe pendiente',
      };

      await updatePaymentEntry(entry.id, updates, {
        userId: userInfo?.id,
        userName: userInfo?.name,
        ownerName: entry.advisorName,
        details: options?.reason ? `Actualizó ${detailMap[options.reason] || 'el registro de mora'}` : undefined,
      });
    } catch (error) {
      console.error('Error updating payment entry', error);
      toast({ title: 'No se pudo actualizar el pago', variant: 'destructive' });
      fetchData();
    }
  };

  const handleRequestPaymentExplanation = async (entry: PaymentEntry, note?: string) => {
    if (!userInfo) return;
    const advisor = usersMap[entry.advisorId];
    if (!advisor?.email) {
      toast({ title: 'No se encontró el email del asesor', variant: 'destructive' });
      return;
    }

    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || '';
    const moraLink = `${baseUrl}/billing?tab=payments`;
    const messageLines = [
      `Hola ${advisor.name || advisor.email}, se necesita una nueva aclaración sobre el comprobante ${entry.comprobanteNumber || 'sin número'}.`,
      note ? `Motivo: ${note}` : undefined,
      `Podés responder en ${moraLink}`,
    ].filter(Boolean);

    try {
      const text = messageLines.join('\n');
      const token = await getGoogleAccessToken({ silent: true });
      const mappedSpace = chatSpaces.find((space) => space.userId === entry.advisorId || space.userEmail === advisor.email);

      if (!token) {
        throw new Error('Necesitás iniciar sesión con permisos de Google Chat para avisar al asesor en su espacio directo.');
      }

      try {
        const apiResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text,
            targetSpace: mappedSpace?.spaceId,
            targetEmail: mappedSpace ? undefined : advisor.email,
            mode: 'api',
          }),
        });

        if (!apiResponse.ok) {
          const error = await apiResponse.text().catch(() => '');
          throw new Error(error || 'No se pudo enviar el mensaje directo.');
        }
      } catch (error) {
        console.error('Error enviando mensaje directo de mora', error);
        throw error instanceof Error ? error : new Error('No se pudo enviar el mensaje directo.');
      }

      await requestPaymentExplanation(entry.id, {
        advisorId: entry.advisorId,
        advisorName: entry.advisorName,
        requestedById: userInfo.id,
        requestedByName: userInfo.name,
        note,
        comprobanteNumber: entry.comprobanteNumber,
      });

      const now = new Date().toISOString();
      setPayments((prev) =>
        prev.map((p) =>
          p.id === entry.id
            ? {
                ...p,
                lastExplanationRequestAt: now,
                lastExplanationRequestById: userInfo.id,
                lastExplanationRequestByName: userInfo.name,
                explanationRequestNote: note,
              }
            : p,
        ),
      );

      toast({
        title: 'Pedido enviado',
        description: `Se notificó a ${advisor.name || advisor.email} por Google Chat.`,
      });
    } catch (error) {
      console.error('Error enviando pedido de aclaración', error);
      const message = error instanceof Error ? error.message : 'No se pudo enviar el pedido.';
      toast({ title: 'Chat no enviado', description: message, variant: 'destructive' });
    }
  };

  const handleTogglePaymentSelection = (paymentId: string, checked: boolean) => {
    setSelectedPaymentIds((prev) =>
      checked ? [...prev, paymentId] : prev.filter((id) => id !== paymentId)
    );
  };

  const handleSelectAllPayments = (checked: boolean) => {
    setSelectedPaymentIds(checked ? filteredPayments.map((p) => p.id) : []);
  };

  const handleDeletePayments = async (ids: string[]) => {
    if (!isBoss || ids.length === 0) return;
    const remaining = new Set(ids);
    setPayments((prev) => prev.filter((p) => !remaining.has(p.id)));
    setSelectedPaymentIds((prev) => prev.filter((id) => !remaining.has(id)));
    try {
      await deletePaymentEntries(ids);
      toast({ title: ids.length === 1 ? 'Pago eliminado' : 'Pagos eliminados' });
    } catch (error) {
      console.error('Error deleting payment entries', error);
      toast({ title: 'No se pudieron eliminar los pagos', variant: 'destructive' });
      fetchData();
    }
  };


  const handleMarkAsPaid = async (invoiceId: string) => {
    if (!userInfo) return;

    const invoiceToUpdate = invoices.find(inv => inv.id === invoiceId);
    if (!invoiceToUpdate) return;
    
    const opp = opportunities.find(o => o.id === invoiceToUpdate.opportunityId);
    if (!opp) return;
    
    const client = clients.find(c => c.id === opp.clientId);
    if (!client) return;
    
    try {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {...inv, status: 'Pagada'} : inv));
      
      await updateInvoice(invoiceId, { status: 'Pagada' }, userInfo.id, userInfo.name, client.ownerName);

      toast({ title: `Factura #${invoiceToUpdate.invoiceNumber} marcada como pagada.`});

      // Refetch data to ensure UI is fully consistent after the update
      setTimeout(fetchData, 300);

    } catch(error) {
        console.error("Error marking invoice as paid:", error);
        toast({ title: "Error al actualizar la factura", variant: "destructive"});
        fetchData(); // Revert optimistic update
    }
  }

  const handleToggleCreditNote = async (invoiceId: string, nextValue: boolean) => {
    if (!userInfo) return;

    const invoiceToUpdate = invoices.find(inv => inv.id === invoiceId);
    if (!invoiceToUpdate) return;

    const opp = opportunities.find(o => o.id === invoiceToUpdate.opportunityId);
    if (!opp) return;

    const client = clients.find(c => c.id === opp.clientId);
    if (!client) return;

    const updatePayload: Partial<Invoice> = {
      isCreditNote: nextValue,
      creditNoteMarkedAt: nextValue ? new Date().toISOString() : null,
    };

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, ...updatePayload } : inv));

    try {
      await updateInvoice(invoiceId, updatePayload, userInfo.id, userInfo.name, client.ownerName);
      toast({ title: `Factura #${invoiceToUpdate.invoiceNumber} ${nextValue ? 'marcada como NC' : 'sin NC'}` });
      setTimeout(fetchData, 300);
    } catch (error) {
      console.error('Error updating credit note state:', error);
      toast({ title: 'Error al actualizar la factura', variant: 'destructive' });
      fetchData();
    }
  };
  
  const handleRowClick = (item: Opportunity | Invoice) => {
      const oppId = 'clientId' in item ? item.id.split('_')[0] : (opportunitiesMap[item.opportunityId] ? item.opportunityId : null);
      if (!oppId) return;
      const opportunity = opportunities.find(o => o.id === oppId);

      if (opportunity) {
        setSelectedOpportunity(opportunity);
        setIsFormOpen(true);
      }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <Header title="Estado de Cobranzas">
         <MonthYearPicker date={selectedDate} onDateChange={setSelectedDate} />
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="to-invoice">A Facturar</TabsTrigger>
            <TabsTrigger value="to-collect">A Cobrar</TabsTrigger>
            <TabsTrigger value="paid">Pagado</TabsTrigger>
            <TabsTrigger value="credit-notes">NC</TabsTrigger>
            <TabsTrigger value="payments">Mora</TabsTrigger>
          </TabsList>
          <TabsContent value="to-invoice">
            <ToInvoiceTable 
                items={toInvoiceOpps}
                clientsMap={clientsMap}
                onCreateInvoice={handleCreateInvoice}
                onRowClick={handleRowClick}
            />
          </TabsContent>
          <TabsContent value="to-collect">
            <BillingTable
              items={toCollectInvoices}
              type="invoices"
              onRowClick={handleRowClick}
              clientsMap={clientsMap}
              usersMap={usersMap}
              opportunitiesMap={opportunitiesMap}
              onMarkAsPaid={handleMarkAsPaid}
              onToggleCreditNote={handleToggleCreditNote}
            />
          </TabsContent>
           <TabsContent value="paid">
            <BillingTable items={paidInvoices} type="invoices" onRowClick={handleRowClick} clientsMap={clientsMap} usersMap={usersMap} opportunitiesMap={opportunitiesMap} />
          </TabsContent>
          <TabsContent value="credit-notes">
            <BillingTable
              items={creditNoteInvoices}
              type="invoices"
              onRowClick={handleRowClick}
              clientsMap={clientsMap}
              usersMap={usersMap}
              opportunitiesMap={opportunitiesMap}
              onToggleCreditNote={handleToggleCreditNote}
              showCreditNoteDate
            />
          </TabsContent>
          <TabsContent value="payments">
            <div className="grid gap-4">
              {isBoss && (
                <div className="grid gap-3 rounded-lg border bg-card p-4">
                  <p className="text-sm text-muted-foreground">
                    Pegá las filas que recibís por mail (separadas por tabulaciones o punto y coma) y reemplazaremos la lista de ese asesor.
                  </p>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                    value={pastedPayments}
                    onChange={(e) => setPastedPayments(e.target.value)}
                    placeholder="Empresa\tTipo\tNro comprobante\tRazón social\tImporte pendiente\tFecha emisión\tFecha vencimiento\tDías de atraso"
                  />
                  <div className="flex justify-end gap-2">
                    <Button onClick={handleImportPayments} disabled={isImportingPayments}>
                      {isImportingPayments ? <Spinner size="small" /> : 'Reemplazar lista de pagos'}
                    </Button>
                  </div>
                </div>
              )}

              <PaymentsTable
                entries={filteredPayments}
                onUpdate={handleUpdatePaymentEntry}
                onDelete={handleDeletePayments}
                selectedIds={selectedPaymentIds}
                onToggleSelected={handleTogglePaymentSelection}
                onToggleSelectAll={handleSelectAllPayments}
                allowDelete={isBoss}
                isBossView={isBoss}
                onRequestExplanation={isBoss ? handleRequestPaymentExplanation : undefined}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
       {isFormOpen && (
        <OpportunityDetailsDialog
          opportunity={selectedOpportunity}
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onUpdate={handleUpdateOpportunity}
        />
      )}
    </div>
  );
}

function BillingPageWithSuspense() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'to-invoice';
  return <BillingPageComponent initialTab={initialTab} />;
}

export default function BillingPage() {
  return (
    <React.Suspense fallback={
        <div className="flex h-full w-full items-center justify-center">
            <Spinner size="large" />
        </div>
    }>
      <BillingPageWithSuspense />
    </React.Suspense>
  );
}
