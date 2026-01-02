

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { ColumnOrderState, ColumnVisibilityState, SortingState } from '@tanstack/react-table';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getClients, getAllUsers, getInvoices, updateInvoice, createInvoice, getPaymentEntries, replacePaymentEntriesForAdvisor, updatePaymentEntry, deletePaymentEntries, requestPaymentExplanation, getChatSpaces, deleteInvoicesInBatches } from '@/lib/firebase-service';
import type { Opportunity, Client, User, Invoice, PaymentEntry, ChatSpaceMapping } from '@/lib/types';
import { OpportunityDetailsDialog } from '@/components/opportunities/opportunity-details-dialog';
import { updateOpportunity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { isWithinInterval, startOfMonth, endOfMonth, parseISO, addMonths, isSameMonth, getYear, getMonth, set, parse, differenceInCalendarDays, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingTable } from '@/components/billing/billing-table';
import { ToInvoiceTable } from '@/components/billing/to-invoice-table';
import { getNormalizedInvoiceNumber, sanitizeInvoiceNumber } from '@/lib/invoice-utils';
import { PaymentsTable } from '@/components/billing/payments-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { es } from 'date-fns/locale';

const MARKED_ONLY_STORAGE_KEY = 'billing:markedOnly';
const TO_COLLECT_TABLE_STORAGE_KEY = 'billing:toCollect:tableState';
const PAID_TABLE_STORAGE_KEY = 'billing:paid:tableState';
const CREDIT_NOTES_TABLE_STORAGE_KEY = 'billing:creditNotes:tableState';

type TableStateSnapshot = {
  sorting: SortingState;
  columnVisibility: ColumnVisibilityState;
  columnOrder: ColumnOrderState;
};

const createDefaultTableState = (): TableStateSnapshot => ({
  sorting: [],
  columnVisibility: {},
  columnOrder: [],
});

const parseStoredTableState = (raw: string | null, defaults: TableStateSnapshot) => {
  if (!raw) {
    return {
      sorting: [...defaults.sorting],
      columnVisibility: { ...defaults.columnVisibility },
      columnOrder: [...defaults.columnOrder],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TableStateSnapshot>;
    return {
      sorting: Array.isArray(parsed.sorting) ? parsed.sorting : [...defaults.sorting],
      columnVisibility:
        parsed.columnVisibility && typeof parsed.columnVisibility === 'object'
          ? (parsed.columnVisibility as ColumnVisibilityState)
          : { ...defaults.columnVisibility },
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : [...defaults.columnOrder],
    };
  } catch (error) {
    console.error('Error parsing table state for billing:', error);
    return {
      sorting: [...defaults.sorting],
      columnVisibility: { ...defaults.columnVisibility },
      columnOrder: [...defaults.columnOrder],
    };
  }
};

const usePersistedTableState = (storageKey: string, defaults: TableStateSnapshot) => {
  const [tableState, setTableState] = useState<TableStateSnapshot>(() => {
    if (typeof window === 'undefined') return parseStoredTableState(null, defaults);
    const stored = localStorage.getItem(storageKey);
    return parseStoredTableState(stored, defaults);
  });

  const persist = useCallback(
    (snapshot: TableStateSnapshot) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch (error) {
        console.error('Error persisting billing table state:', error);
      }
    },
    [storageKey],
  );

  const setSorting = useCallback<React.Dispatch<React.SetStateAction<SortingState>>>(
    (updater) => {
      setTableState((prev) => {
        const nextSorting = typeof updater === 'function' ? updater(prev.sorting) : updater;
        const snapshot = { ...prev, sorting: nextSorting };
        persist(snapshot);
        return snapshot;
      });
    },
    [persist],
  );

  const setColumnVisibility = useCallback<React.Dispatch<React.SetStateAction<ColumnVisibilityState>>>(
    (updater) => {
      setTableState((prev) => {
        const nextVisibility = typeof updater === 'function' ? updater(prev.columnVisibility) : updater;
        const snapshot = { ...prev, columnVisibility: nextVisibility };
        persist(snapshot);
        return snapshot;
      });
    },
    [persist],
  );

  const setColumnOrder = useCallback<React.Dispatch<React.SetStateAction<ColumnOrderState>>>(
    (updater) => {
      setTableState((prev) => {
        const nextOrder = typeof updater === 'function' ? updater(prev.columnOrder) : updater;
        const snapshot = { ...prev, columnOrder: nextOrder };
        persist(snapshot);
        return snapshot;
      });
    },
    [persist],
  );

  return {
    sorting: tableState.sorting,
    columnVisibility: tableState.columnVisibility,
    columnOrder: tableState.columnOrder,
    setSorting,
    setColumnVisibility,
    setColumnOrder,
  };
};

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

type DuplicateInvoiceGroup = {
  invoiceNumber: string;
  invoices: Invoice[];
  hasCreditNote: boolean;
};

type DeleteProgressState = {
  total: number;
  processed: number;
  deleted: string[];
  failed: { id: string; error: string }[];
  chunk?: string[];
};

const EMPTY_DELETE_PROGRESS: DeleteProgressState = {
  total: 0,
  processed: 0,
  deleted: [],
  failed: [],
  chunk: [],
};


function BillingPageComponent({ initialTab }: { initialTab: string }) {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const canManageDeletionMarks = useMemo(
    () => isBoss || userInfo?.role === 'Administracion',
    [isBoss, userInfo?.role],
  );
  const isCreditNoteRelated = useCallback(
    (invoice: Invoice) => invoice.isCreditNote || Boolean(invoice.creditNoteMarkedAt),
    [],
  );
  const isDeletionMarked = useCallback(
    (invoice: Invoice) =>
      Boolean(
        (invoice as any).deletionMarked ||
        invoice.deletionMarkedAt ||
        (invoice as any).markedForDeletion,
      ),
    [],
  );
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
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [invoiceSelection, setInvoiceSelection] = useState<Record<string, boolean>>({});
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgressState>(EMPTY_DELETE_PROGRESS);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(() => new Set());
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const canManageBillingDeletion = Boolean(
    isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Admin',
  );

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [markedOnly, setMarkedOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(MARKED_ONLY_STORAGE_KEY);
    return stored === 'true';
  });
  const [prefsReady, setPrefsReady] = useState(() => typeof window === 'undefined');
  const tableDefaults = useMemo(createDefaultTableState, []);
  const toCollectTableState = usePersistedTableState(TO_COLLECT_TABLE_STORAGE_KEY, tableDefaults);
  const paidTableState = usePersistedTableState(PAID_TABLE_STORAGE_KEY, tableDefaults);
  const creditNotesTableState = usePersistedTableState(CREDIT_NOTES_TABLE_STORAGE_KEY, tableDefaults);
  
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

  const loadMarkedOnlyPreference = useCallback(() => {
    if (typeof window === 'undefined') {
      setPrefsReady(true);
      return;
    }

    try {
      const stored = localStorage.getItem(MARKED_ONLY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMarkedOnly(parsed === true);
      } else {
        setMarkedOnly(false);
      }
    } catch (error) {
      console.error('No se pudieron leer las preferencias de facturación, usando valores por defecto', error);
      localStorage.removeItem(MARKED_ONLY_STORAGE_KEY);
      setMarkedOnly(false);
    } finally {
      setPrefsReady(true);
    }
  }, []);

  const findDuplicateInvoiceGroups = useMemo(
    () =>
      (items: Invoice[]): DuplicateInvoiceGroup[] => {
        const grouped = items.reduce((acc, invoice) => {
          const normalized = getNormalizedInvoiceNumber(invoice);
          if (!normalized) return acc;
          if (!acc[normalized]) acc[normalized] = [];
          acc[normalized].push(invoice);
          return acc;
        }, {} as Record<string, Invoice[]>);

        return Object.entries(grouped)
          .map(([invoiceNumber, groupedInvoices]) => ({
            invoiceNumber,
            invoices: groupedInvoices,
            hasCreditNote: groupedInvoices.some(isCreditNoteRelated),
          }))
          .filter((group) => group.invoices.length > 1);
      },
    [isCreditNoteRelated],
  );

  const duplicateInvoiceGroups = useMemo(
    () => findDuplicateInvoiceGroups(invoices),
    [findDuplicateInvoiceGroups, invoices],
  );

  const totalDuplicateInvoices = useMemo(
    () => duplicateInvoiceGroups.reduce((acc, group) => acc + group.invoices.length, 0),
    [duplicateInvoiceGroups],
  );

  const totalSelectedDuplicateInvoices = useMemo(
    () =>
      duplicateInvoiceGroups.reduce(
        (acc, group) =>
          acc +
          group.invoices.filter(
            (inv) => invoiceSelection[inv.id] && !isCreditNoteRelated(inv),
          ).length,
        0,
      ),
    [duplicateInvoiceGroups, invoiceSelection, isCreditNoteRelated],
  );

  useEffect(() => {
    setInvoiceSelection((prev) => {
      const next: Record<string, boolean> = {};
      duplicateInvoiceGroups.forEach((group) => {
        group.invoices.forEach((inv) => {
          next[inv.id] = isCreditNoteRelated(inv) ? false : prev[inv.id] ?? true;
        });
      });
      return next;
    });
  }, [duplicateInvoiceGroups, isCreditNoteRelated]);

  useEffect(() => {
    if (!isDuplicateModalOpen) {
      setDeleteProgress(EMPTY_DELETE_PROGRESS);
      setIsDeletingDuplicates(false);
      setIsRetryingFailed(false);
    }
  }, [isDuplicateModalOpen]);

  useEffect(() => {
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady || typeof window === 'undefined') return;
    try {
      localStorage.setItem(MARKED_ONLY_STORAGE_KEY, JSON.stringify(markedOnly));
    } catch (error) {
      console.error('No se pudieron guardar las preferencias de facturación', error);
    }
  }, [markedOnly, prefsReady]);


  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
    }
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) {
        fetchData();
    }
  }, [userInfo, fetchData]);

  const { toInvoiceOpps, toCollectInvoices, paidInvoices, creditNoteInvoices } = useMemo(() => {
    if (!userInfo || !userInfo.id || !prefsReady) {
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
    
    const visibleInvoices = markedOnly ? userFilteredInvoices.filter(isDeletionMarked) : userFilteredInvoices;

    const toCollectInvoices = visibleInvoices.filter(inv =>
        inv.date && isDateInRange(parseISO(inv.date)) && inv.status !== 'Pagada' && !inv.isCreditNote
    );
    const paidInvoices = visibleInvoices.filter(inv =>
        inv.datePaid && isDateInRange(parseISO(inv.datePaid)) && inv.status === 'Pagada'
    );

    const creditNoteInvoices = visibleInvoices.filter(inv => {
        if (!inv.isCreditNote) return false;
        if (!inv.creditNoteMarkedAt) return false;
        try {
            return isDateInRange(parseISO(inv.creditNoteMarkedAt));
        } catch (error) {
            return false;
        }
    });

    return { toInvoiceOpps, toCollectInvoices, paidInvoices, creditNoteInvoices };

  }, [opportunities, invoices, clients, selectedAdvisor, isBoss, userInfo, dateRange, markedOnly, isDeletionMarked, prefsReady]);
  const visibleInvoiceIds = useMemo(
    () => new Set([...toCollectInvoices, ...paidInvoices, ...creditNoteInvoices].map((inv) => inv.id)),
    [toCollectInvoices, paidInvoices, creditNoteInvoices],
  );

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

  useEffect(() => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleInvoiceIds.has(id)) {
          next.add(id);
        }
      });

      if (next.size === prev.size) {
        let unchanged = true;
        prev.forEach((id) => {
          if (!next.has(id)) {
            unchanged = false;
          }
        });
        if (unchanged) return prev;
      }

      return next;
    });
  }, [visibleInvoiceIds]);

  const handleToggleMarkedOnly = useCallback((checked: boolean) => {
    setMarkedOnly(checked);
  }, []);

  const handleInvoiceSelectionChange = useCallback((nextSelection: Set<string>) => {
    setSelectedInvoiceIds(new Set(nextSelection));
  }, []);


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
    const normalizedNumber = getNormalizedInvoiceNumber({ invoiceNumber: sanitizedNumber });
    if (!sanitizedNumber || !normalizedNumber) {
      toast({ title: 'Número de factura inválido', description: 'Solo se permiten dígitos en el número de factura.', variant: 'destructive' });
      return;
    }

    const existingNumbers = new Set(invoices.map(inv => getNormalizedInvoiceNumber(inv)));
    if (existingNumbers.has(normalizedNumber)) {
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

  const handleToggleDuplicateInvoiceSelection = (invoiceId: string, checked: boolean) => {
    setInvoiceSelection((prev) => ({ ...prev, [invoiceId]: checked }));
  };

  const handleToggleInvoiceSelection = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  }, []);

  const handleToggleAllInvoiceSelection = useCallback((checked: boolean, list: Invoice[]) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      const ids = list.map((inv) => inv.id);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }, []);

  const handleToggleGroupSelection = (group: DuplicateInvoiceGroup, checked: boolean) => {
    setInvoiceSelection((prev) => {
      const next = { ...prev };
      group.invoices.forEach((inv) => {
        next[inv.id] = isCreditNoteRelated(inv) ? false : checked;
      });
      return next;
    });
  };

  const resolveOwnerNameForInvoice = useCallback(
    (invoiceId: string) => {
      const invoice = invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) return 'Cliente';
      const opportunity = opportunitiesMap[invoice.opportunityId];
      const client = opportunity ? clientsMap[opportunity.clientId] : undefined;
      return client?.ownerName || opportunity?.clientName || 'Cliente';
    },
    [clientsMap, invoices, opportunitiesMap],
  );

  const hasCreditNotesInDuplicates = useMemo(
    () => duplicateInvoiceGroups.some((group) => group.hasCreditNote),
    [duplicateInvoiceGroups],
  );

  const runBatchInvoiceDeletion = useCallback(
    async (invoiceIds: string[]) => {
      if (!userInfo) {
        return {
          deleted: [],
          failed: invoiceIds.map((id) => ({ id, error: 'Usuario no autenticado' })),
        };
      }

      setIsDeletingDuplicates(true);
      setDeleteProgress({
        total: invoiceIds.length,
        processed: 0,
        deleted: [],
        failed: [],
      });

      try {
        const result = await deleteInvoicesInBatches(invoiceIds, userInfo.id, userInfo.name, {
          batchSize: 25,
          resolveOwnerName: resolveOwnerNameForInvoice,
          onProgress: (progress) => {
            setDeleteProgress(progress);
            fetchData({ silent: true });
          },
        });
        return result;
      } catch (error) {
        console.error('Error deleting duplicate invoices', error);
        return {
          deleted: [],
          failed: invoiceIds.map((id) => ({
            id,
            error: error instanceof Error ? error.message : 'Error desconocido al eliminar facturas',
          })),
        };
      } finally {
        setIsDeletingDuplicates(false);
      }
    },
    [fetchData, resolveOwnerNameForInvoice, userInfo],
  );

  const handleDeleteDuplicateInvoices = async (idsToDelete?: string[]) => {
    if (!userInfo) return;

    const selectedInvoices = (idsToDelete
      ? invoices.filter((inv) => idsToDelete.includes(inv.id))
      : duplicateInvoiceGroups.flatMap((group) => group.invoices.filter((inv) => invoiceSelection[inv.id]))).filter(
      (inv) => !isCreditNoteRelated(inv),
    );

    if (selectedInvoices.length === 0) return;

    setIsRetryingFailed(Boolean(idsToDelete));

    try {
      const result = await runBatchInvoiceDeletion(selectedInvoices.map((inv) => inv.id));

      if (result.deleted.length > 0) {
        setInvoices((prev) => prev.filter((inv) => !result.deleted.includes(inv.id)));
        toast({
          title: result.deleted.length === 1 ? 'Factura eliminada' : 'Facturas eliminadas',
          description: `${result.deleted.length} factura${result.deleted.length === 1 ? '' : 's'} duplicada${result.deleted.length === 1 ? '' : 's'} eliminada${result.deleted.length === 1 ? '' : 's'}.`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Eliminación parcial',
          description: `No se pudieron eliminar ${result.failed.length} factura${result.failed.length === 1 ? '' : 's'}. Reintentá las fallidas.`,
          variant: 'destructive',
        });
      }

      setInvoiceSelection((prev) => {
        const next = { ...prev };
        result.deleted.forEach((id) => delete next[id]);
        result.failed.forEach(({ id }) => {
          next[id] = true;
        });
        return next;
      });

      fetchData({ silent: true });

      if (result.failed.length === 0) {
        setIsDuplicateModalOpen(false);
        setDeleteProgress(EMPTY_DELETE_PROGRESS);
        setInvoiceSelection({});
      }
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleMarkInvoicesForDeletion = useCallback(
    (invoiceIds: string[]) => {
      if (invoiceIds.length === 0) return;
      // Implemented in the following task.
    },
    [],
  );

  const handleRestoreDeletionMarks = useCallback(
    (invoiceIds: string[]) => {
      if (invoiceIds.length === 0) return;
      // Implemented in the following task.
    },
    [],
  );

  const handleMarkSelectedInvoicesForDeletion = useCallback(() => {
    if (selectedInvoiceIds.size === 0) return;
    handleMarkInvoicesForDeletion(Array.from(selectedInvoiceIds));
  }, [handleMarkInvoicesForDeletion, selectedInvoiceIds]);

  const handleRestoreSelectedDeletionMarks = useCallback(() => {
    if (selectedInvoiceIds.size === 0) return;
    handleRestoreDeletionMarks(Array.from(selectedInvoiceIds));
  }, [handleRestoreDeletionMarks, selectedInvoiceIds]);

  const renderDeletionMarkActions = useCallback(
    (items: Invoice[]) => {
      if (!canManageDeletionMarks || items.length === 0) return null;
      return null;
    },
    [canManageDeletionMarks],
  );


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

  const handleOpenDuplicateDialog = () => {
    const duplicates = findDuplicateInvoiceGroups();
    if (duplicates.length === 0) {
      toast({ title: 'No se encontraron facturas duplicadas en A Cobrar' });
      return;
    }
    const initialSelected = new Set<string>();
    duplicates.forEach((group) => {
      group.slice(1).forEach((inv) => initialSelected.add(inv.id));
    });
    setSelectedDuplicateIds(initialSelected);
    setDuplicateGroups(duplicates);
    setIsDuplicateDialogOpen(true);
  };

  const handleConfirmDeleteDuplicates = async () => {
    if (!userInfo || !canManageBillingDeletion) return;
    const duplicates = findDuplicateInvoiceGroups();
    setDuplicateGroups(duplicates);

    const invoicesToDelete = duplicates.flatMap((group) =>
      group.slice(1).filter((inv) => selectedDuplicateIds.has(inv.id)),
    );
    if (invoicesToDelete.length === 0) {
      toast({ title: 'No se encontraron facturas duplicadas en A Cobrar' });
      setIsDuplicateDialogOpen(false);
      return;
    }

    const idsToDelete = new Set(invoicesToDelete.map((inv) => inv.id));
    setInvoices((prev) => prev.filter((inv) => !idsToDelete.has(inv.id)));
    setIsDeletingDuplicates(true);
    setIsDuplicateDialogOpen(false);

    try {
      for (const invoice of invoicesToDelete) {
        const opp = opportunitiesMap[invoice.opportunityId];
        const client = opp ? clientsMap[opp.clientId] : undefined;
        await deleteInvoice(invoice.id, userInfo.id, userInfo.name, client?.ownerName || '');
      }
      toast({
        title: invoicesToDelete.length === 1 ? 'Factura duplicada eliminada' : 'Facturas duplicadas eliminadas',
      });
      setTimeout(fetchData, 300);
    } catch (error) {
      console.error('Error deleting duplicate invoices:', error);
      toast({ title: 'No se pudieron eliminar los duplicados', variant: 'destructive' });
      fetchData();
    } finally {
      setIsDeletingDuplicates(false);
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

  const hasInvoiceSelection = selectedInvoiceIds.size > 0;

  const prefsLoader = (
    <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed bg-muted/40">
      <Spinner size="small" />
    </div>
  );

  const renderWithPrefs = (content: React.ReactNode) => (prefsReady ? content : prefsLoader);

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
          <Button
            variant="outline"
            onClick={() => setIsDuplicateModalOpen(true)}
            disabled={totalDuplicateInvoices === 0 || isDeletingDuplicates}
          >
            {isDeletingDuplicates ? (
              <>
                <Spinner size="small" className="mr-2" />
                Eliminando duplicados...
              </>
            ) : (
              <>Eliminar facturas duplicadas {totalDuplicateInvoices > 0 ? `(${totalDuplicateInvoices})` : ''}</>
            )}
          </Button>
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="marked-only"
                checked={markedOnly}
                onCheckedChange={(value) => handleToggleMarkedOnly(value === true)}
              />
              <Label htmlFor="marked-only" className="text-sm text-muted-foreground">
                Solo marcadas
              </Label>
            </div>
            {canManageDeletionMarks ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!hasInvoiceSelection}
                  onClick={handleRestoreSelectedDeletionMarks}
                >
                  Quitar marca
                </Button>
                <Button
                  variant="destructive"
                  disabled={!hasInvoiceSelection}
                  onClick={handleMarkSelectedInvoicesForDeletion}
                >
                  Marcar para eliminar
                </Button>
              </div>
            ) : null}
          </div>
          <TabsContent value="to-invoice">
            {renderWithPrefs(
              <ToInvoiceTable 
                  items={toInvoiceOpps}
                  clientsMap={clientsMap}
                  onCreateInvoice={handleCreateInvoice}
                  onRowClick={handleRowClick}
              />
            )}
          </TabsContent>
          <TabsContent value="to-collect">
            {renderDeletionMarkActions(toCollectInvoices)}
            <BillingTable
              items={toCollectInvoices}
              type="invoices"
              onRowClick={handleRowClick}
              clientsMap={clientsMap}
              usersMap={usersMap}
              opportunitiesMap={opportunitiesMap}
              onMarkAsPaid={handleMarkAsPaid}
              onToggleCreditNote={handleToggleCreditNote}
              sorting={toCollectTableState.sorting}
              setSorting={toCollectTableState.setSorting}
              columnVisibility={toCollectTableState.columnVisibility}
              setColumnVisibility={toCollectTableState.setColumnVisibility}
              columnOrder={toCollectTableState.columnOrder}
              setColumnOrder={toCollectTableState.setColumnOrder}
              isReady={prefsReady}
              selectedInvoiceIds={selectedInvoiceIds}
              onSelectedInvoicesChange={handleInvoiceSelectionChange}
            />
          </TabsContent>
           <TabsContent value="paid">
            {renderDeletionMarkActions(paidInvoices)}
            <BillingTable
              items={paidInvoices}
              type="invoices"
              onRowClick={handleRowClick}
              clientsMap={clientsMap}
              usersMap={usersMap}
              opportunitiesMap={opportunitiesMap}
              sorting={paidTableState.sorting}
              setSorting={paidTableState.setSorting}
              columnVisibility={paidTableState.columnVisibility}
              setColumnVisibility={paidTableState.setColumnVisibility}
              columnOrder={paidTableState.columnOrder}
              setColumnOrder={paidTableState.setColumnOrder}
              isReady={prefsReady}
              selectedInvoiceIds={selectedInvoiceIds}
              onSelectedInvoicesChange={handleInvoiceSelectionChange}
            />
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
              sorting={creditNotesTableState.sorting}
              setSorting={creditNotesTableState.setSorting}
              columnVisibility={creditNotesTableState.columnVisibility}
              setColumnVisibility={creditNotesTableState.setColumnVisibility}
              columnOrder={creditNotesTableState.columnOrder}
              setColumnOrder={creditNotesTableState.setColumnOrder}
              isReady={prefsReady}
              selectedInvoiceIds={selectedInvoiceIds}
              onSelectedInvoicesChange={handleInvoiceSelectionChange}
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

              {renderWithPrefs(
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
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isDuplicateModalOpen} onOpenChange={setIsDuplicateModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Eliminar facturas duplicadas</DialogTitle>
            <DialogDescription>
              Se detectaron {totalDuplicateInvoices} factura{totalDuplicateInvoices === 1 ? '' : 's'} duplicada{totalDuplicateInvoices === 1 ? '' : 's'} en{' '}
              {duplicateInvoiceGroups.length} grupo{duplicateInvoiceGroups.length === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {hasCreditNotesInDuplicates ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Atención: hay notas de crédito en los grupos detectados.</p>
                <p className="text-muted-foreground">
                  Las facturas marcadas como NC o vinculadas a una NC se excluyen del borrado automático. Revísalas antes de continuar.
                </p>
              </div>
            ) : null}

            <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-2">
              <div>
                Seleccionadas <strong>{totalSelectedDuplicateInvoices}</strong> de {totalDuplicateInvoices} facturas para eliminar.
              </div>
              {deleteProgress.total > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isDeletingDuplicates ? <Spinner size="small" /> : null}
                  <span>
                    Progreso: {deleteProgress.processed}/{deleteProgress.total} procesadas · {deleteProgress.deleted.length} eliminadas · {deleteProgress.failed.length} con error
                  </span>
                </div>
              )}
            </div>

            {deleteProgress.failed.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">
                  No se pudieron eliminar {deleteProgress.failed.length} factura{deleteProgress.failed.length === 1 ? '' : 's'}.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                  {deleteProgress.failed.slice(0, 3).map((failure) => (
                    <li key={failure.id}>
                      {failure.id}: {failure.error}
                    </li>
                  ))}
                  {deleteProgress.failed.length > 3 && (
                    <li>y {deleteProgress.failed.length - 3} más...</li>
                  )}
                </ul>
              </div>
            )}

            {duplicateInvoiceGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se encontraron facturas duplicadas.</p>
            ) : (
              <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-2">
                {duplicateInvoiceGroups.map((group) => {
                  const selectedCount = group.invoices.filter((inv) => invoiceSelection[inv.id]).length;
                  return (
                    <div key={group.invoiceNumber} className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">Factura #{group.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedCount} de {group.invoices.length} seleccionadas
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleToggleGroupSelection(group, true)}>
                            Seleccionar todo
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleToggleGroupSelection(group, false)}>
                            Deseleccionar todo
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.invoices.map((invoice) => {
                          const opportunity = opportunitiesMap[invoice.opportunityId];
                          const client = opportunity ? clientsMap[opportunity.clientId] : undefined;
                          const clientName = client?.denominacion || opportunity?.clientName || 'Cliente desconocido';
                          const opportunityTitle = opportunity?.title || 'Oportunidad sin título';
                          const invoiceDate = (() => {
                            if (!invoice.date) return '—';
                            try {
                              return format(parseISO(invoice.date), 'P', { locale: es });
                            } catch (error) {
                              return invoice.date;
                            }
                          })();

                          return (
                            <div key={invoice.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex gap-3">
                                <Checkbox
                                  id={`invoice-${invoice.id}`}
                                  checked={!!invoiceSelection[invoice.id]}
                                  disabled={invoice.isCreditNote || Boolean(invoice.creditNoteMarkedAt)}
                                  onCheckedChange={(value) => handleToggleDuplicateInvoiceSelection(invoice.id, value === true)}
                                />
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  <div className="flex flex-col">
                                    <Label className="text-xs text-muted-foreground">Cliente / Oportunidad</Label>
                                    <span className="font-medium">{clientName}</span>
                                    <span className="text-sm text-muted-foreground">{opportunityTitle}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <Label className="text-xs text-muted-foreground">Monto</Label>
                                    <span className="font-medium">${Number(invoice.amount || 0).toLocaleString('es-AR')}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <Label className="text-xs text-muted-foreground">Estado / Fecha</Label>
                                    <span className="font-medium">{invoice.status || '—'}</span>
                                    <span className="text-sm text-muted-foreground">{invoiceDate}</span>
                                  </div>
                                </div>
                              </div>
                              {invoice.isCreditNote || invoice.creditNoteMarkedAt ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                                  Factura con NC: no se elimina automáticamente
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsDuplicateModalOpen(false)} disabled={isDeletingDuplicates}>
              Cancelar
            </Button>
            {deleteProgress.failed.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => handleDeleteDuplicateInvoices(deleteProgress.failed.map((f) => f.id))}
                disabled={isDeletingDuplicates}
              >
                {isRetryingFailed ? <Spinner size="small" className="mr-2" /> : null}
                Reintentar fallidos
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => handleDeleteDuplicateInvoices()}
              disabled={totalSelectedDuplicateInvoices === 0 || isDeletingDuplicates}
            >
              {isDeletingDuplicates ? (
                <>
                  <Spinner size="small" className="mr-2" />
                  Eliminando... {deleteProgress.processed}/{deleteProgress.total || totalSelectedDuplicateInvoices}
                </>
              ) : (
                'Eliminar seleccionadas'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
