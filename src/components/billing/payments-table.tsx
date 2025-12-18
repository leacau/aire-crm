'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentEntry, PaymentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parse, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getPaymentActivities } from '@/lib/firebase-service';

type Props = {
  entries: PaymentEntry[];
  onUpdate: (
    entry: PaymentEntry,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
    options?: { reason?: string },
  ) => void;
  onDelete: (ids: string[]) => void;
  selectedIds: string[];
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  allowDelete?: boolean;
  isBossView?: boolean;
  onRequestExplanation?: (entry: PaymentEntry, note?: string) => void;
};

const paymentStatuses: PaymentStatus[] = ['Pendiente', 'Reclamado', 'Pagado', 'Incobrable'];

const formatDate = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(parseISO(value), 'P', { locale: es });
  } catch (error) {
    return value;
  }
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  try {
    const iso = parseISO(value);
    if (!Number.isNaN(iso.getTime())) return iso;
  } catch (error) {
    try {
      const parsed = parse(value, 'dd/MM/yyyy', new Date());
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch (err) {
      return null;
    }
  }
  return null;
};

const getDaysLate = (entry: PaymentEntry) => {
  if (!entry.dueDate) return null;
  const parsed = parseDate(entry.dueDate);
  if (!parsed) return null;
  const diff = differenceInCalendarDays(new Date(), parsed);
  return diff > 0 ? diff : 0;
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString('es-AR')}`;
};

const resolveRowColor = (daysLate: number | null | undefined) => {
  if (typeof daysLate !== 'number') return undefined;
  if (daysLate > 90) return '#ff7878';
  if (daysLate >= 60) return '#ffd966';
  if (daysLate >= 30) return '#92d14f';
  if (daysLate >= 15) return '#c5e0b4';
  if (daysLate >= 1) return '#e3f0da';
  return '#bbd5ed';
};

const PaymentDetailDialog = ({
  entry,
  open,
  onOpenChange,
  isBossView,
  onUpdate,
  onRequestExplanation,
}: {
  entry: PaymentEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBossView?: boolean;
  onUpdate: Props['onUpdate'];
  onRequestExplanation?: Props['onRequestExplanation'];
}) => {
  const [reminderDate, setReminderDate] = useState(entry.nextContactAt?.substring(0, 10) || '');
  const [localNotes, setLocalNotes] = useState(entry.notes || '');
  const [explanationNote, setExplanationNote] = useState('');
  const [history, setHistory] = useState<{ id: string; description: string; when: string; author: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    setReminderDate(entry.nextContactAt?.substring(0, 10) || '');
    setLocalNotes(entry.notes || '');
    setExplanationNote('');
  }, [entry]);

  useEffect(() => {
    const loadHistory = async () => {
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const logs = await getPaymentActivities(entry.id, 100);
        setHistory(
          logs.map((log) => ({
            id: log.id,
            description: log.details,
            when: log.timestamp,
            author: log.userName,
          })),
        );
      } catch (error) {
        console.error('No se pudo cargar el historial de mora', error);
        setHistoryError('No se pudo cargar el historial de anotaciones.');
      } finally {
        setLoadingHistory(false);
      }
    };

    if (open) {
      loadHistory();
    }
  }, [entry.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Comprobante {entry.comprobanteNumber || 'sin número'}</DialogTitle>
          <DialogDescription>
            {entry.razonSocial || entry.company || 'Sin razón social'} — Asesor: {entry.advisorName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Estado</Label>
            {isBossView ? (
              <p className="rounded-md border bg-muted px-3 py-2 text-sm">{entry.status}</p>
            ) : (
              <Select
                value={entry.status}
                onValueChange={(value) => onUpdate(entry, { status: value as PaymentStatus }, { reason: 'status' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Importe pendiente</Label>
            <p className="rounded-md border bg-muted px-3 py-2 text-sm">{formatCurrency(entry.pendingAmount)}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Nota/Aclaración del asesor</Label>
            {isBossView ? (
              <p className="min-h-[48px] rounded-md border bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                {entry.notes?.trim() || '—'}
              </p>
            ) : (
              <Input
                value={localNotes}
                placeholder="Agregar detalle"
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={() => onUpdate(entry, { notes: localNotes }, { reason: 'notes' })}
              />
            )}
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Recordatorio</Label>
              <Input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} />
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReminderDate('');
                    onUpdate(entry, { nextContactAt: null }, { reason: 'reminder-clear' });
                  }}
                >
                  Quitar
                </Button>
                <Button
                  size="sm"
                  onClick={() => onUpdate(entry, { nextContactAt: reminderDate || null }, { reason: 'reminder' })}
                >
                  Guardar
                </Button>
              </div>
            </div>
            {isBossView && onRequestExplanation && (
              <div className="space-y-2 border-t pt-2">
                <Label>Nuevo pedido de aclaración</Label>
                <Input
                  placeholder="Motivo o detalle"
                  value={explanationNote}
                  onChange={(e) => setExplanationNote(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onRequestExplanation(entry, explanationNote.trim() || undefined);
                    setExplanationNote('');
                  }}
                >
                  Enviar pedido
                </Button>
                {(entry.explanationRequestNote || entry.lastExplanationRequestAt) && (
                  <p className="text-[12px] text-muted-foreground">
                    Último pedido: {formatDate(entry.lastExplanationRequestAt)} —{' '}
                    {entry.explanationRequestNote || 'Sin detalle'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Fechas</Label>
            <p className="text-sm text-muted-foreground">
              Emisión: {formatDate(entry.issueDate)}
              <br />
              Vencimiento: {formatDate(entry.dueDate)}
              <br />
              Creado: {formatDate(entry.createdAt)}
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Historial de anotaciones y pedidos</Label>
            <div className="max-h-60 overflow-y-auto rounded-md border p-3 text-sm">
              {loadingHistory && <p className="text-muted-foreground">Cargando historial...</p>}
              {historyError && <p className="text-destructive">{historyError}</p>}
              {!loadingHistory && !historyError && history.length === 0 && (
                <p className="text-muted-foreground">No hay actividad registrada para este comprobante.</p>
              )}
              {!loadingHistory &&
                !historyError &&
                history.map((item) => (
                  <div key={item.id} className="border-b py-2 last:border-0">
                    <p className="font-medium">{item.author}</p>
                    <p className="whitespace-pre-wrap">{item.description}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(item.when)}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PaymentRow = ({
  entry,
  onUpdate,
  onDelete,
  onToggleSelected,
  selected,
  allowDelete,
  isBossView,
  onRequestExplanation,
}: {
  entry: PaymentEntry;
  onUpdate: Props['onUpdate'];
  onDelete: Props['onDelete'];
  onToggleSelected: Props['onToggleSelected'];
  selected: boolean;
  allowDelete?: boolean;
  isBossView?: boolean;
  onRequestExplanation?: Props['onRequestExplanation'];
}) => {
  const [pendingAmount, setPendingAmount] = useState(
    typeof entry.pendingAmount === 'number' ? entry.pendingAmount.toString() : '',
  );
  const [localNote, setLocalNote] = useState(entry.notes || '');
  const daysLate = useMemo(() => entry.daysLate ?? getDaysLate(entry), [entry]);
  const rowColor = useMemo(() => resolveRowColor(daysLate), [daysLate]);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setPendingAmount(typeof entry.pendingAmount === 'number' ? entry.pendingAmount.toString() : '');
    setLocalNote(entry.notes || '');
  }, [entry.notes, entry.pendingAmount]);

  const persistPendingAmount = () => {
    const parsed = pendingAmount === '' ? null : Number(pendingAmount);
    if (pendingAmount !== '' && Number.isNaN(parsed)) return;
    if (parsed === entry.pendingAmount || (parsed === null && entry.pendingAmount == null)) return;
    onUpdate(entry, { pendingAmount: parsed ?? undefined }, { reason: 'pendingAmount' });
  };

  return (
    <TableRow key={entry.id} style={rowColor ? { backgroundColor: rowColor } : undefined}>
      {allowDelete && (
        <TableCell>
          <Checkbox
            aria-label="Seleccionar pago"
            checked={selected}
            onCheckedChange={(checked) => onToggleSelected(entry.id, Boolean(checked))}
          />
        </TableCell>
      )}
      {!isBossView && <TableCell className="font-medium">{entry.company}</TableCell>}
      <TableCell>{entry.comprobanteNumber || '—'}</TableCell>
      <TableCell>{entry.razonSocial || '—'}</TableCell>
      <TableCell>
        {isBossView ? (
          <Input
            type="number"
            value={pendingAmount}
            onChange={(e) => setPendingAmount(e.target.value)}
            onBlur={persistPendingAmount}
            className="w-28"
          />
        ) : (
          formatCurrency(entry.pendingAmount)
        )}
      </TableCell>
      {isBossView && <TableCell>{entry.advisorName}</TableCell>}
      {!isBossView && <TableCell>{formatDate(entry.dueDate)}</TableCell>}
      <TableCell>{typeof daysLate === 'number' ? daysLate : '—'}</TableCell>
      <TableCell>
        {isBossView ? (
          <span className="text-sm font-medium">{entry.status}</span>
        ) : (
          <Select
            value={entry.status}
            onValueChange={(value) => onUpdate(entry, { status: value as PaymentStatus }, { reason: 'status' })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>
      <TableCell className="max-w-xs">
        {isBossView ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.notes?.trim() || '—'}</p>
        ) : (
          <Input
            value={localNote}
            placeholder="Agregar detalle"
            onChange={(e) => setLocalNote(e.target.value)}
            onBlur={() => onUpdate(entry, { notes: localNote }, { reason: 'notes' })}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
            Ver detalle
          </Button>
          {!isBossView && allowDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('¿Eliminar este pago?')) onDelete([entry.id]);
              }}
            >
              Eliminar
            </Button>
          )}
        </div>
        <PaymentDetailDialog
          entry={entry}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          isBossView={isBossView}
          onUpdate={onUpdate}
          onRequestExplanation={onRequestExplanation}
        />
      </TableCell>
    </TableRow>
  );
};

export function PaymentsTable({
  entries,
  onUpdate,
  onDelete,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  allowDelete,
  isBossView,
  onRequestExplanation,
}: Props) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const allSelected = allowDelete && entries.length > 0 && selectedIds.length === entries.length;
  const columnCount =
    (allowDelete ? 1 : 0) +
    (isBossView ? 0 : 1) +
    1 +
    1 +
    1 +
    (isBossView ? 1 : 0) +
    (isBossView ? 0 : 1) +
    1 +
    1 +
    1 +
    1;

  const exportRows = useMemo(() => {
    return entries.map((entry) => {
      const daysLate = typeof entry.daysLate === 'number' ? entry.daysLate : getDaysLate(entry);
      return {
        comprobante: entry.comprobanteNumber || '—',
        razonSocial: entry.razonSocial || entry.company || '—',
        pendingAmount: typeof entry.pendingAmount === 'number' ? entry.pendingAmount : entry.amount ?? null,
        advisor: entry.advisorName || '—',
        daysLate: typeof daysLate === 'number' ? daysLate : '—',
        status: entry.status,
        notes: entry.notes?.trim() || '—',
      };
    });
  }, [entries]);

  const exportAdvisorLabel = exportRows[0]?.advisor || 'asesor';
  const exportFileLabel = exportAdvisorLabel.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'asesor';

  const handleExportExcel = () => {
    if (exportRows.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(
      exportRows.map((row) => ({
        'Nro. comprobante': row.comprobante,
        'Razón Social': row.razonSocial,
        'Importe pendiente': row.pendingAmount ?? '—',
        'Asesor responsable': row.advisor,
        'Días de atraso': row.daysLate,
        Estado: row.status,
        'Nota/Aclaración': row.notes,
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mora');
    XLSX.writeFile(workbook, `mora-${exportFileLabel || 'asesor'}.xlsx`);
  };

  const handleExportPdf = () => {
    if (exportRows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const marginLeft = 12;
    const marginTop = 18;
    const marginBottom = 14;
    const columns = [
      { key: 'comprobante', label: 'Nro.', width: 32 },
      { key: 'razonSocial', label: 'Razón Social', width: 60 },
      { key: 'pendingAmount', label: 'Importe pendiente', width: 40 },
      { key: 'advisor', label: 'Asesor', width: 40 },
      { key: 'daysLate', label: 'Días atraso', width: 28 },
      { key: 'status', label: 'Estado', width: 28 },
      { key: 'notes', label: 'Nota/Aclaración', width: 80 },
    ];

    doc.setFontSize(12);
    doc.text(`Mora - ${exportAdvisorLabel}`, marginLeft, 12);
    doc.setFontSize(10);

    let y = marginTop;
    const pageHeight = doc.internal.pageSize.getHeight();

    const columnPositions: number[] = [];
    columns.reduce((offset, column) => {
      columnPositions.push(offset);
      return offset + column.width;
    }, marginLeft);

    exportRows.forEach((row) => {
      const values = columns.map((col) => {
        if (col.key === 'pendingAmount') return formatCurrency(row.pendingAmount as number | undefined);
        return String((row as Record<string, unknown>)[col.key] ?? '—');
      });

      const wrapped = values.map((text, idx) => doc.splitTextToSize(text, columns[idx].width));
      const rowHeight = Math.max(...wrapped.map((lines) => (Array.isArray(lines) ? lines.length : 1))) * 6 + 2;

      if (y + rowHeight > pageHeight - marginBottom) {
        doc.addPage();
        doc.setFontSize(10);
        y = marginTop;
      }

      wrapped.forEach((text, idx) => {
        doc.text(text as string[], columnPositions[idx], y);
      });

      y += rowHeight;
    });

    doc.save(`mora-${exportFileLabel || 'asesor'}.pdf`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Pagos asignados</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {isBossView && (
            <>
              <Button variant="outline" size="sm" disabled={entries.length === 0} onClick={handleExportExcel}>
                Exportar Excel
              </Button>
              <Button variant="outline" size="sm" disabled={entries.length === 0} onClick={handleExportPdf}>
                Exportar PDF
              </Button>
            </>
          )}
          {allowDelete && (
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => {
                if (selectedIds.length === 0) return;
                if (confirm(`¿Eliminar ${selectedIds.length} pago(s)?`)) onDelete(selectedIds);
              }}
            >
              Eliminar seleccionados
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto" ref={tableContainerRef}>
          <Table>
            <TableHeader>
              <TableRow>
                {allowDelete && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onCheckedChange={(checked) => onToggleSelectAll(Boolean(checked))}
                    indeterminate={allowDelete && selectedIds.length > 0 && selectedIds.length < entries.length}
                  />
                </TableHead>
              )}
              {!isBossView && <TableHead>Empresa</TableHead>}
              <TableHead>Nro. comprobante</TableHead>
              <TableHead>Razón Social</TableHead>
              <TableHead>Importe pendiente</TableHead>
              {isBossView && <TableHead>Asesor responsable</TableHead>}
              {!isBossView && <TableHead>Vencimiento</TableHead>}
              <TableHead>Días de atraso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Nota/Aclaración</TableHead>
              <TableHead>Seguimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <PaymentRow
                key={entry.id}
                entry={entry}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onToggleSelected={onToggleSelected}
                selected={selectedIds.includes(entry.id)}
                allowDelete={allowDelete}
                isBossView={isBossView}
                onRequestExplanation={onRequestExplanation}
              />
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
                  No hay pagos cargados para este vendedor.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
