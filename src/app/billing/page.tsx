'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { PaymentsSummary, type PaymentSummaryRow } from '@/components/billing/payments-summary';
import { PaymentsTable } from '@/components/billing/payments-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  deletePaymentEntries,
  getAllUsers,
  getPaymentEntries,
  replacePaymentEntriesForAdvisor,
  updatePaymentEntry,
} from '@/lib/firebase-service';
import type { PaymentEntry, User } from '@/lib/types';

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

function parseFlexibleDate(raw?: string | null) {
  if (!raw) return null;
  const value = raw.toString().trim();

  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;

  for (const formatString of PAYMENT_DATE_FORMATS) {
    const separator = formatString.includes('/') ? '/' : '-';
    const parts = value.split(separator).map(part => Number(part));
    if (parts.length !== 3 || parts.some(Number.isNaN)) continue;

    const [day, month, year] = parts;
    const fullYear = year < 100 ? 2000 + year : year;
    const parsed = formatString.startsWith('yyyy')
      ? new Date(day, month - 1, fullYear)
      : new Date(fullYear, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function normalizeDate(raw?: string) {
  const parsed = parseFlexibleDate(raw);
  if (parsed) return parsed.toISOString();
  return raw ? raw.trim() : undefined;
}

function computeDaysLate(dueDate?: string) {
  const parsedDate = parseFlexibleDate(dueDate);
  if (!parsedDate) return null;
  const today = new Date();
  const diff = Math.floor((today.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function parsePastedPayments(
  raw: string,
): Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[] {
  const parseAmount = (value?: string) => {
    if (!value) return undefined;
    const cleaned = String(value).replace(/[^0-9.,-]/g, '');
    const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    const numeric = parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  return raw
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\t|;/).map(cell => cell.trim()))
    .filter(cols => cols.length >= 7)
    .map(cols => {
      const [company, , comprobante, razonSocial, pendingRaw, issueDateRaw, dueDateRaw] = cols;
      const pendingAmount = parseAmount(pendingRaw);
      const dueDate = normalizeDate(dueDateRaw);
      const issueDate = normalizeDate(issueDateRaw);

      return {
        company: company || '—',
        comprobanteNumber: comprobante || undefined,
        razonSocial: razonSocial || undefined,
        pendingAmount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        amount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        issueDate,
        dueDate,
        daysLate: computeDaysLate(dueDate || undefined) ?? undefined,
        notes: '',
        nextContactAt: null,
      };
    });
}

export default function BillingPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState('all');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pastedPayments, setPastedPayments] = useState('');
  const [loading, setLoading] = useState(true);
  const [isImportingPayments, setIsImportingPayments] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [paymentRows, advisorRows] = await Promise.all([
        getPaymentEntries(),
        isBoss ? getAllUsers('Asesor') : Promise.resolve([]),
      ]);
      setPayments(paymentRows);
      setAdvisors(advisorRows);
    } catch (error) {
      console.error('Error fetching late payments:', error);
      toast({ title: 'Error al cargar mora', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isBoss, toast, userInfo]);

  useEffect(() => {
    if (userInfo) void fetchData();
  }, [fetchData, userInfo]);

  const filteredPayments = useMemo(() => {
    if (!userInfo) return [] as PaymentEntry[];

    let baseList: PaymentEntry[];
    if (isBoss) {
      if (selectedAdvisor === 'all') {
        baseList = payments;
      } else if (selectedAdvisor === 'corporativo') {
        baseList = payments.filter(payment =>
          !payment.advisorId
          || payment.advisorName?.toUpperCase() === 'CORPORATIVO'
          || payment.advisorName === 'Mario Altamirano',
        );
      } else {
        baseList = payments.filter(payment => payment.advisorId === selectedAdvisor);
      }
    } else {
      baseList = payments.filter(payment => payment.advisorId === userInfo.id);
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...baseList]
      .map(entry => ({
        ...entry,
        daysLate: computeDaysLate(entry.dueDate || undefined) ?? entry.daysLate,
      }))
      .filter(entry => {
        if (!normalizedSearch) return true;
        return [
          entry.company,
          entry.comprobanteNumber,
          entry.razonSocial,
          entry.advisorName,
          entry.notes,
        ].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => {
        const leftDate = parseFlexibleDate(left.dueDate) ?? parseFlexibleDate(left.issueDate) ?? parseFlexibleDate(left.createdAt) ?? new Date(0);
        const rightDate = parseFlexibleDate(right.dueDate) ?? parseFlexibleDate(right.issueDate) ?? parseFlexibleDate(right.createdAt) ?? new Date(0);
        return leftDate.getTime() - rightDate.getTime();
      });
  }, [isBoss, payments, searchTerm, selectedAdvisor, userInfo]);

  const paymentsSummary = useMemo<PaymentSummaryRow[]>(() => {
    const buckets: Record<string, PaymentSummaryRow> = {};

    const getBucket = (daysLate: number) => {
      if (daysLate > 90) return '90+' as const;
      if (daysLate > 60) return '61-90' as const;
      if (daysLate > 30) return '31-60' as const;
      return '1-30' as const;
    };

    filteredPayments.forEach(entry => {
      const daysLate = entry.daysLate ?? computeDaysLate(entry.dueDate || undefined);
      if (daysLate == null || daysLate <= 0) return;
      if (entry.status === 'Pagado') return;

      const amount = typeof entry.pendingAmount === 'number'
        ? entry.pendingAmount
        : typeof entry.amount === 'number'
          ? entry.amount
          : 0;
      if (!amount || Number.isNaN(amount)) return;

      const bucketKey = getBucket(daysLate);
      let advisorId = entry.advisorId;
      let advisorName = entry.advisorName || 'Sin asesor';

      if (!advisorId || advisorName.toUpperCase() === 'CORPORATIVO' || advisorName === 'Mario Altamirano') {
        advisorId = 'corporativo';
        advisorName = 'Corporativo';
      }

      if (!buckets[advisorId]) {
        buckets[advisorId] = {
          advisorId,
          advisorName,
          ranges: { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
          total: 0,
        };
      }

      buckets[advisorId].ranges[bucketKey] += amount;
      buckets[advisorId].total += amount;
    });

    return Object.values(buckets).sort((left, right) => left.advisorName.localeCompare(right.advisorName, 'es'));
  }, [filteredPayments]);

  useEffect(() => {
    setSelectedPaymentIds(prev => prev.filter(id => filteredPayments.some(entry => entry.id === id)));
  }, [filteredPayments]);

  const handleImportPayments = async () => {
    if (!userInfo || !isBoss) return;
    if (!selectedAdvisor || selectedAdvisor === 'all' || selectedAdvisor === 'corporativo') {
      toast({ title: 'Seleccioná un asesor', description: 'Elegí un asesor antes de pegar la lista de pagos.', variant: 'destructive' });
      return;
    }

    const advisor = advisors.find(item => item.id === selectedAdvisor);
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
      toast({ title: 'Mora actualizada' });
      setPastedPayments('');
      await fetchData();
    } catch (error) {
      console.error('Error importing late payments:', error);
      toast({ title: 'Error al cargar mora', variant: 'destructive' });
    } finally {
      setIsImportingPayments(false);
    }
  };

  const handleUpdatePaymentEntry = async (
    entry: PaymentEntry,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
    options?: { reason?: string },
  ) => {
    setPayments(prev => prev.map(payment => (payment.id === entry.id ? { ...payment, ...updates } : payment)));
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
      console.error('Error updating late payment:', error);
      toast({ title: 'No se pudo actualizar la mora', variant: 'destructive' });
      await fetchData();
    }
  };

  const handleDeletePayments = async (ids: string[]) => {
    if (!isBoss || ids.length === 0) return;
    const remaining = new Set(ids);
    setPayments(prev => prev.filter(payment => !remaining.has(payment.id)));
    setSelectedPaymentIds(prev => prev.filter(id => !remaining.has(id)));
    try {
      await deletePaymentEntries(ids);
      toast({ title: ids.length === 1 ? 'Registro eliminado' : 'Registros eliminados' });
    } catch (error) {
      console.error('Error deleting late payments:', error);
      toast({ title: 'No se pudieron eliminar los registros', variant: 'destructive' });
      await fetchData();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Mora">
        <div className="flex w-full flex-col items-center gap-4 sm:flex-row md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar comprobante, cliente o asesor..."
              className="pl-8"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
            />
          </div>
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
              <SelectTrigger className="w-full sm:w-[220px]">
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
        </div>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-4">
          {isBoss && (
            <div className="grid gap-3 rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Pegá las filas que recibís por mail, separadas por tabulaciones o punto y coma, y reemplazaremos la lista de mora del asesor seleccionado.
              </p>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={pastedPayments}
                onChange={event => setPastedPayments(event.target.value)}
                placeholder="Empresa&#9;Tipo&#9;Nro comprobante&#9;Razón social&#9;Importe pendiente&#9;Fecha emisión&#9;Fecha vencimiento&#9;Días de atraso"
              />
              <div className="flex justify-end gap-2">
                <Button onClick={handleImportPayments} disabled={isImportingPayments}>
                  {isImportingPayments ? <Spinner size="small" /> : 'Reemplazar lista de mora'}
                </Button>
              </div>
            </div>
          )}

          <PaymentsSummary rows={paymentsSummary} />
          <PaymentsTable
            entries={filteredPayments}
            onUpdate={handleUpdatePaymentEntry}
            onDelete={handleDeletePayments}
            selectedIds={selectedPaymentIds}
            onToggleSelected={(id, checked) =>
              setSelectedPaymentIds(prev => (checked ? [...prev, id] : prev.filter(item => item !== id)))
            }
            onToggleSelectAll={checked => setSelectedPaymentIds(checked ? filteredPayments.map(entry => entry.id) : [])}
            allowDelete={isBoss}
            isBossView={isBoss}
          />
        </div>
      </main>
    </div>
  );
}
