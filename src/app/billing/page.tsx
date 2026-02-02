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
import { isWithinInterval, startOfMonth, endOfMonth, parseISO, addMonths, isSameMonth, differenceInCalendarDays, format, parse } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingTable } from '@/components/billing/billing-table';
import { ToInvoiceTable } from '@/components/billing/to-invoice-table';
import { getNormalizedInvoiceNumber, sanitizeInvoiceNumber } from '@/lib/invoice-utils';
import { PaymentsTable } from '@/components/billing/payments-table';
import { PaymentsSummary, type PaymentSummaryRow } from '@/components/billing/payments-summary';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { es } from 'date-fns/locale';
import { logActivity } from '@/lib/activity-logger';
import { hasManagementPrivileges } from '@/lib/role-utils';

const getPeriodDurationInMonths = (period: string): number => {
    switch (period) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 0;
    }
};

const PAYMENT_DATE_FORMATS = [
  'yyyy-MM-dd',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'dd/MM/yy',
  'd/M/yy',
  'dd-MM-yy',
  'd-M-yy',
];

const parseFlexibleDate = (raw?: string | null) => {
  if (!raw) return null;
  const value = raw.toString().trim();

  const tryParse = (parser: () => Date) => {
    try {
      const parsed = parser();
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch (error) {
      return null;
    }
    return null;
  };

  return (
    tryParse(() => parseISO(value)) ??
    PAYMENT_DATE_FORMATS.reduce<Date | null>((acc, formatString) => acc ?? tryParse(() => parse(value, formatString, new Date())), null)
  );
};

const normalizeDate = (raw?: string) => {
  const parsed = parseFlexibleDate(raw);
  if (parsed) return parsed.toISOString();
  return raw ? raw.trim() : undefined;
};

const computeDaysLate = (dueDate?: string) => {
  const parsedDate = parseFlexibleDate(dueDate);
  if (!parsedDate) return null;
  const diff = differenceInCalendarDays(new Date(), parsedDate);
  return diff > 0 ? diff : 0;
};

  const parsePastedPayments = (
    raw: string,
  ): Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[] => {
    const parseAmount = (value?: string) => {
      if (!value) return undefined;
      const cleaned = String(value).replace(/[^0-9.,-]/g, '');
      // Remove thousand separators "." and use "," as decimal separator
      const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
      const numeric = parseFloat(normalized);
      return Number.isFinite(numeric) ? numeric : undefined;
    };

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cols) => cols.length >= 7)
    .map((cols) => {
      const [company, , comprobante, razonSocial, pendingRaw, issueDateRaw, dueDateRaw] = cols;
      const pendingAmount = parseAmount(pendingRaw);
      const dueDate = normalizeDate(dueDateRaw);
      const issueDate = normalizeDate(issueDateRaw);

      return {
        company: company || '—',
        comprobanteNumber: comprobante || undefined,
        razonSocial: razonSocial || undefined,
        pendingAmount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        // Importe pendiente es la única cifra provista; la usamos como total de referencia
        amount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        issueDate,
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
  key: string;
  label: string; // "Factura #XXX"
  invoices: Invoice[];
  hasCreditNote: boolean;
  type: 'exact' | 'number'; // Exact: coinciden Num, Cliente, Fecha, Monto. Number: solo Num.
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
  const [activeDuplicateTab, setActiveDuplicateTab] = useState('exact');
  const [invoiceSelection, setInvoiceSelection] = useState<Record<string, boolean>>({});
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgressState>(EMPTY_DELETE_PROGRESS);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(() => new Set());
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const canManageBillingDeletion = Boolean(
    isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Admin',
  );

  // NUEVO: Definir permisos específicos para ver/eliminar duplicados (Jefe, Gerente, Admin)
  const canManageDuplicates = Boolean(
    isBoss || 
    userInfo?.role === 'Administracion' || 
    userInfo?.role === 'Admin' || 
    userInfo?.role === 'Gerencia'
  );

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const canManageBillingDeletion = useMemo(
    () => hasManagementPrivileges(userInfo) || userInfo?.role === 'Administracion',
    [userInfo],
  );
  
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

  const { exactDuplicateGroups, numberDuplicateGroups } = useMemo(() => {
    const invoiceData = invoices.map(inv => {
        const raw = sanitizeInvoiceNumber(inv.invoiceNumber || '');
        const sig = raw.replace(/^0+/, ''); 
        return {
            inv,
            id: inv.id,
            raw,
            sig,
        };
    });

    const parent: Record<string, string> = {};
    invoiceData.forEach(d => parent[d.id] = d.id);
    
    const find = (i: string): string => {
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    };
    const union = (i: string, j: string) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    const bySig: Record<string, string[]> = {};
    invoiceData.forEach(d => {
        if (!d.sig) return; 
        if (!bySig[d.sig]) bySig[d.sig] = [];
        bySig[d.sig].push(d.id);
    });

    Object.values(bySig).forEach(ids => {
        for(let i=1; i<ids.length; i++) union(ids[0], ids[i]);
    });

    const uniqueSigs = Object.keys(bySig);
    const shortSigs = uniqueSigs.filter(s => s.length >= 4 && s.length <= 6);

    for (const short of shortSigs) {
        for (const other of uniqueSigs) {
            if (short === other) continue; 
            
            if (other.length > short.length && other.endsWith(short)) {
                const shortIds = bySig[short];
                const otherIds = bySig[other];
                if (shortIds?.length && otherIds?.length) {
                    union(shortIds[0], otherIds[0]);
                }
            }
        }
    }

    const groupsMap: Record<string, Invoice[]> = {};
    invoiceData.forEach(d => {
        const root = find(d.id);
        if (!groupsMap[root]) groupsMap[root] = [];
        groupsMap[root].push(d.inv);
    });

    const exactGroups: DuplicateInvoiceGroup[] = [];
    const numberGroups: DuplicateInvoiceGroup[] = [];

    Object.values(groupsMap).forEach(groupInvoices => {
        if (groupInvoices.length < 2) return;

        const getIdentity = (inv: Invoice) => {
             const opp = opportunitiesMap[inv.opportunityId];
             const clientId = opp?.clientId || 'unknown';
             const date = inv.date ? inv.date.split('T')[0] : 'nodate';
             const amount = Math.abs(inv.amount).toFixed(2);
             return `${clientId}|${date}|${amount}`;
        };

        const firstIdentity = getIdentity(groupInvoices[0]);
        const allIdentical = groupInvoices.every(inv => getIdentity(inv) === firstIdentity);

        groupInvoices.sort((a, b) => (b.invoiceNumber || '').length - (a.invoiceNumber || '').length);

        const groupObj: DuplicateInvoiceGroup = {
            key: groupInvoices[0].id,
            label: `Factura ${groupInvoices[0].invoiceNumber}`, 
            invoices: groupInvoices,
            hasCreditNote: groupInvoices.some(isCreditNoteRelated),
            type: allIdentical ? 'exact' : 'number'
        };

        if (allIdentical) exactGroups.push(groupObj);
        else numberGroups.push(groupObj);
    });

    exactGroups.sort((a, b) => a.label.localeCompare(b.label));
    numberGroups.sort((a, b) => a.label.localeCompare(b.label));

    return { exactDuplicateGroups: exactGroups, numberDuplicateGroups: numberGroups };

  }, [invoices, opportunitiesMap, isCreditNoteRelated]);

  const totalDuplicateInvoices = useMemo(
    () => exactDuplicateGroups.length + numberDuplicateGroups.length,
    [exactDuplicateGroups, numberDuplicateGroups],
  );

  const totalSelectedDuplicateInvoices = useMemo(
    () => {
      const allDuplicates = [...exactDuplicateGroups, ...numberDuplicateGroups].flatMap(g => g.invoices);
      const uniqueIds = new Set(allDuplicates.map(inv => inv.id));
      return Array.from(uniqueIds).filter(id => invoiceSelection[id]).length;
    },
    [exactDuplicateGroups, numberDuplicateGroups, invoiceSelection],
  );

  useEffect(() => {
    if (isDuplicateModalOpen) {
      setInvoiceSelection(prev => {
        const next: Record<string, boolean> = {};
        
        exactDuplicateGroups.forEach(group => {
            const sorted = [...group.invoices].sort((a, b) => (a.dateGenerated || '').localeCompare(b.dateGenerated || ''));
            sorted.forEach((inv, index) => {
                if (index > 0 && !isCreditNoteRelated(inv)) {
                    next[inv.id] = true;
                } else {
                    next[inv.id] = false;
                }
            });
        });

        numberDuplicateGroups.forEach(group => {
            group.invoices.forEach(inv => {
                next[inv.id] = false;
            });
        });

        return next;
      });
    } else {
        setDeleteProgress(EMPTY_DELETE_PROGRESS);
        setIsDeletingDuplicates(false);
        setIsRetryingFailed(false);
    }
  }, [isDuplicateModalOpen, exactDuplicateGroups, numberDuplicateGroups, isCreditNoteRelated]);

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

    let advisorClientIds: Set<string> | null = null;
    
    if (isBoss && selectedAdvisor !== 'all') {
        if (selectedAdvisor === 'corporativo') {
             advisorClientIds = new Set(
                clients
                  // AQUÍ AGREGAMOS LA CONDICIÓN PARA "Mario Altamirano"
                  .filter(c => !c.ownerId || c.ownerName?.toUpperCase() === 'CORPORATIVO' || c.ownerName === 'Mario Altamirano')
                  .map(c => c.id)
             );
        } else {
            advisorClientIds = new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
        }
    }

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

        if (durationMonths > 0) { 
            for (let i = 0; i < durationMonths; i++) {
                const monthDate = addMonths(creationDate, i);

                if (isDateInRange(monthDate)) {
                    const hasInvoiceForMonth = (invoicesByOppId[opp.id] || []).some(inv =>
                        inv.date && !inv.isCreditNote && isSameMonth(parseISO(inv.date), monthDate)
                    );

                    if (!hasInvoiceForMonth) {
                        const virtualOpp = {
                            ...opp,
                            id: `${opp.id}_${monthDate.toISOString()}`,
                            closeDate: monthDate.toISOString(),
                        };
                        toInvoiceOpps.push(virtualOpp);
                    }
                }
            }
        } else { 
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

    let baseList: PaymentEntry[] = [];
    
    if (isBoss) {
        if (selectedAdvisor === 'all') {
            baseList = payments;
        } else if (selectedAdvisor === 'corporativo') {
            // AQUÍ AGREGAMOS LA CONDICIÓN PARA "Mario Altamirano" en la pestaña Mora
            baseList = payments.filter(p => !p.advisorId || p.advisorName?.toUpperCase() === 'CORPORATIVO' || p.advisorName === 'Mario Altamirano');
        } else {
            baseList = payments.filter((p) => p.advisorId === selectedAdvisor);
        }
    } else {
        baseList = payments.filter((p) => p.advisorId === userInfo.id);
    }

    const parseIssueDate = (value?: string | null) => parseFlexibleDate(value);

    const parseDueDate = (value?: string | null) => parseFlexibleDate(value);

    return [...baseList]
      .map((entry) => ({
        ...entry,
        daysLate: computeDaysLate(entry.dueDate || undefined) ?? entry.daysLate,
      }))
      .sort((a, b) => {
        const aDate = parseDueDate(a.dueDate) ?? parseIssueDate(a.issueDate) ?? parseIssueDate(a.createdAt) ?? new Date(0);
        const bDate = parseDueDate(b.dueDate) ?? parseIssueDate(b.issueDate) ?? parseIssueDate(b.createdAt) ?? new Date(0);
        return aDate.getTime() - bDate.getTime();
      });
  }, [isBoss, payments, selectedAdvisor, userInfo]);

  const paymentsSummary = useMemo<PaymentSummaryRow[]>(() => {
    const buckets: Record<string, PaymentSummaryRow> = {};

    const getBucket = (daysLate: number) => {
      if (daysLate > 90) return '90+' as const;
      if (daysLate > 60) return '61-90' as const;
      if (daysLate > 30) return '31-60' as const;
      return '1-30' as const;
    };

    filteredPayments.forEach((entry) => {
      const daysLate = entry.daysLate ?? computeDaysLate(entry.dueDate || undefined);
      if (daysLate == null || daysLate <= 0) return;
      if (entry.status === 'Pagado') return;

      const amount =
        typeof entry.pendingAmount === 'number'
          ? entry.pendingAmount
          : typeof entry.amount === 'number'
            ? entry.amount
            : 0;

      if (!amount || Number.isNaN(amount)) return;

      const bucketKey = getBucket(daysLate);
      
      let advisorId = entry.advisorId;
      let advisorName = entry.advisorName || 'Sin asesor';

      // AQUÍ AGRUPAMOS "Mario Altamirano" bajo Corporativo en el resumen
      if (!advisorId || advisorName.toUpperCase() === 'CORPORATIVO' || advisorName === 'Mario Altamirano') {
          advisorId = 'corporativo';
          advisorName = 'Corporativo';
      } else if (!advisorId) {
          advisorId = 'sin-asesor';
      }

      if (!buckets[advisorId]) {
        buckets[advisorId] = {
          advisorId,
          advisorName: advisorName,
          ranges: { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
          total: 0,
        };
      }

      buckets[advisorId].ranges[bucketKey] += amount;
      buckets[advisorId].total += amount;
    });

    return Object.values(buckets).sort((a, b) => a.advisorName.localeCompare(b.advisorName, 'es'));
  }, [filteredPayments]);

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

    const inputRaw = sanitizeInvoiceNumber(String(invoiceDetails.invoiceNumber));
    
    if (!inputRaw) {
      toast({ title: 'Número de factura inválido', description: 'Solo se permiten dígitos en el número de factura.', variant: 'destructive' });
      return;
    }

    const getSignificant = (s: string) => s.replace(/^0+/, '');
    const inputSignificant = getSignificant(inputRaw);
    const isInputShort = inputSignificant.length >= 4 && inputSignificant.length <= 6;

    const hasDuplicate = invoices.some(inv => {
        const existingRaw = sanitizeInvoiceNumber(inv.invoiceNumber || '');
        const existingSignificant = getSignificant(existingRaw);
        const isExistingShort = existingSignificant.length >= 4 && existingSignificant.length <= 6;

        if (inputRaw === existingRaw) return true;
        
        if (isInputShort && existingRaw.length > inputRaw.length) {
             if (existingRaw.endsWith(inputRaw) || existingRaw.endsWith(inputSignificant)) return true;
        }
        
        if (isExistingShort && inputRaw.length > existingRaw.length) {
             if (inputRaw.endsWith(existingRaw) || inputRaw.endsWith(existingSignificant)) return true;
        }
        return false;
    });

    if (hasDuplicate) {
        toast({ title: `Factura duplicada #${invoiceDetails.invoiceNumber}`, description: 'El número coincide con una factura existente en el sistema (posiblemente de otro cliente).', variant: 'destructive' });
        return;
    }

    try {
        const newInvoice: Omit<Invoice, 'id'> = {
            opportunityId: realOppId,
            invoiceNumber: inputRaw,
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

  const handleSelectSuggestedDuplicates = (group: DuplicateInvoiceGroup) => {
    setInvoiceSelection(prev => {
        const next = { ...prev };
        // Sort by date/ID to keep the oldest one
        const sorted = [...group.invoices].sort((a, b) => (a.dateGenerated || '').localeCompare(b.dateGenerated || ''));
        // Select all except the first one (oldest)
        sorted.forEach((inv, index) => {
            if (index > 0 && !isCreditNoteRelated(inv)) {
                next[inv.id] = true;
            } else {
                next[inv.id] = false;
            }
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

  const ensureCanManageBillingDeletion = useCallback(
    async ({ action, invoice }: { action: string; invoice?: Invoice }) => {
      if (canManageBillingDeletion) return true;

      toast({
        title: 'Acceso denegado',
        description: 'No tenés permisos para modificar o eliminar facturas.',
        variant: 'destructive',
      });

      if (userInfo) {
        const ownerName = invoice ? resolveOwnerNameForInvoice(invoice.id) : 'Cliente';
        const invoiceName = invoice?.invoiceNumber
          ? `Factura #${invoice.invoiceNumber}`
          : invoice
            ? `Factura ${invoice.id}`
            : 'Factura';
        await logActivity({
          userId: userInfo.id,
          userName: userInfo.name,
          ownerName,
          type: 'comment',
          entityType: 'invoice',
          entityId: invoice?.id || 'sin-id',
          entityName: invoiceName,
          details: `${userInfo.name} intentó ${action} sin permisos.`,
        });
      }

      return false;
    },
    [canManageBillingDeletion, resolveOwnerNameForInvoice, toast, userInfo],
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

    // Filter selections from ALL groups to support batch deletion across tabs if necessary.
    // Crucial fix: Ensure we don't pass duplicate IDs if an invoice appears in both groupings.
    const allGroups = [...exactDuplicateGroups, ...numberDuplicateGroups];
    const rawSelectedInvoices = idsToDelete
      ? invoices.filter((inv) => idsToDelete.includes(inv.id))
      : allGroups.flatMap((group) => group.invoices.filter((inv) => invoiceSelection[inv.id]));
    
    // Filter out credit notes and ensure unique IDs
    const uniqueIds = Array.from(new Set(rawSelectedInvoices.map(inv => inv.id)))
        .filter(id => {
            const inv = invoices.find(i => i.id === id);
            return inv && !isCreditNoteRelated(inv);
        });

    if (uniqueIds.length === 0) return;

    const canProceed = await ensureCanManageBillingDeletion({
      action: 'eliminar facturas duplicadas',
      invoice: selectedInvoices[0],
    });
    if (!canProceed) return;

    setIsRetryingFailed(Boolean(idsToDelete));

    try {
      const result = await runBatchInvoiceDeletion(uniqueIds);

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
        // Only close if we cleared everything we selected
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

    const canProceed = await ensureCanManageBillingDeletion({
      action: 'marcar la factura como pagada',
      invoice: invoiceToUpdate,
    });
    if (!canProceed) return;
    
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

    const canProceed = await ensureCanManageBillingDeletion({
      action: `marcar la factura ${nextValue ? 'con' : 'sin'} nota de crédito`,
      invoice: invoiceToUpdate,
    });
    if (!canProceed) return;

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

  const hasInvoiceSelection = selectedInvoiceIds.size > 0;

  const prefsLoader = (
    <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed bg-muted/40">
      <Spinner size="small" />
    </div>
  );

  const renderWithPrefs = (content: React.ReactNode) => (prefsReady ? content : prefsLoader);

  // Helper to render duplicate rows
  const renderDuplicateGroupList = (groups: DuplicateInvoiceGroup[]) => {
    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
                <p>¡Todo limpio! No se encontraron duplicados en esta categoría.</p>
            </div>
        );
    }

    return (
        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-2">
            {groups.map((group) => {
                const selectedCount = group.invoices.filter((inv) => invoiceSelection[inv.id]).length;
                return (
                <div key={group.key} className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-semibold">{group.label}</p>
                        <div className="flex items-center gap-2">
                            {group.type === 'exact' && <Badge variant="secondary" className="text-xs">Idénticos</Badge>}
                            <p className="text-xs text-muted-foreground">
                            {selectedCount} de {group.invoices.length} seleccionadas
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleSelectSuggestedDuplicates(group)}>
                            Seleccionar sugeridos
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleGroupSelection(group, true)}>
                        Todo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleGroupSelection(group, false)}>
                        Nada
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
                        <div key={invoice.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between bg-card">
                            <div className="flex gap-3 w-full">
                            <Checkbox
                                id={`invoice-${invoice.id}`}
                                checked={!!invoiceSelection[invoice.id]}
                                disabled={invoice.isCreditNote || Boolean(invoice.creditNoteMarkedAt)}
                                onCheckedChange={(value) => handleToggleDuplicateInvoiceSelection(invoice.id, value === true)}
                                className="mt-1"
                            />
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 w-full">
                                <div className="flex flex-col">
                                <Label className="text-xs text-muted-foreground">Cliente</Label>
                                <span className="font-medium text-sm truncate" title={clientName}>{clientName}</span>
                                </div>
                                <div className="flex flex-col">
                                <Label className="text-xs text-muted-foreground">Oportunidad</Label>
                                <span className="text-sm truncate" title={opportunityTitle}>{opportunityTitle}</span>
                                </div>
                                <div className="flex flex-col">
                                <Label className="text-xs text-muted-foreground">Monto</Label>
                                <span className="font-medium text-sm">${Number(invoice.amount || 0).toLocaleString('es-AR')}</span>
                                </div>
                                <div className="flex flex-col">
                                <Label className="text-xs text-muted-foreground">Estado / Fecha</Label>
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{invoice.status || '—'}</span>
                                    <span className="text-xs text-muted-foreground">{invoiceDate}</span>
                                </div>
                                </div>
                            </div>
                            </div>
                            {invoice.isCreditNote || invoice.creditNoteMarkedAt ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 shrink-0">
                                NC
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
    )
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
                <SelectItem value="corporativo">Corporativo</SelectItem>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManageDuplicates && (
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
                <>Eliminar duplicados {totalDuplicateInvoices > 0 ? `(${totalDuplicateInvoices})` : ''}</>
                )}
            </Button>
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
                <div className="grid gap-4">
                  <PaymentsSummary rows={paymentsSummary} />
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
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isDuplicateModalOpen} onOpenChange={setIsDuplicateModalOpen}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Eliminar facturas duplicadas</DialogTitle>
            <DialogDescription>
              Gestión de facturas repetidas. Revisa las pestañas para ver duplicados exactos o colisiones de numeración.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeDuplicateTab} onValueChange={setActiveDuplicateTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="exact">
                    Duplicados Idénticos
                    <Badge variant="secondary" className="ml-2">{exactDuplicateGroups.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="number">
                    Conflictos de Numeración
                    <Badge variant="secondary" className="ml-2">{numberDuplicateGroups.length}</Badge>
                </TabsTrigger>
            </TabsList>

            <div className="py-2 space-y-4 flex-1 flex flex-col min-h-0">
                {hasCreditNotesInDuplicates ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shrink-0">
                    <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Atención: Notas de crédito detectadas
                    </div>
                    <p className="text-muted-foreground ml-6">
                    Las facturas marcadas como NC o vinculadas a una se excluyen de la selección automática.
                    </p>
                </div>
                ) : null}

                <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-2 shrink-0">
                <div>
                    Seleccionadas <strong>{totalSelectedDuplicateInvoices}</strong> de {totalDuplicateInvoices} facturas totales para eliminar.
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
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shrink-0">
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

                <TabsContent value="exact" className="flex-1 overflow-auto min-h-0">
                    <div className="mb-2 text-sm text-muted-foreground px-1">
                        Estas facturas coinciden en <strong>Número, Cliente, Fecha y Monto</strong>. Se han pre-seleccionado las copias más recientes para dejar solo una original (la más antigua).
                    </div>
                    {renderDuplicateGroupList(exactDuplicateGroups)}
                </TabsContent>
                
                <TabsContent value="number" className="flex-1 overflow-auto min-h-0">
                    <div className="mb-2 text-sm text-muted-foreground px-1">
                        Estas facturas comparten el <strong>mismo número</strong> pero difieren en cliente, monto o fecha. Revísalas cuidadosamente antes de eliminar. Puedes usar "Seleccionar sugeridos" para marcar las más recientes automáticamente.
                    </div>
                    {renderDuplicateGroupList(numberDuplicateGroups)}
                </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="flex flex-wrap gap-2 shrink-0 pt-2 border-t">
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
                `Eliminar seleccionadas (${totalSelectedDuplicateInvoices})`
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
