'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { PaymentEntry, PaymentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parse, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

type Props = {
  entries: PaymentEntry[];
  onUpdate: (
    entry: PaymentEntry,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt'>>,
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
  const [reminderDate, setReminderDate] = useState(entry.nextContactAt?.substring(0, 10) || '');
  const daysLate = useMemo(() => entry.daysLate ?? getDaysLate(entry), [entry]);
  const [localNotes, setLocalNotes] = useState(entry.notes || '');
  const [explanationNote, setExplanationNote] = useState('');
  const rowColor = useMemo(() => resolveRowColor(daysLate), [daysLate]);

  useEffect(() => {
    setLocalNotes(entry.notes || '');
    setReminderDate(entry.nextContactAt?.substring(0, 10) || '');
    setExplanationNote('');
  }, [entry.notes, entry.nextContactAt]);

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
      <TableCell>{formatCurrency(entry.pendingAmount)}</TableCell>
      {isBossView && <TableCell>{entry.advisorName}</TableCell>}
      {!isBossView && <TableCell>{formatDate(entry.dueDate)}</TableCell>}
      <TableCell>{typeof daysLate === 'number' ? daysLate : '—'}</TableCell>
      <TableCell>
        <Select
          value={entry.status}
          onValueChange={(value) => onUpdate(entry, { status: value as PaymentStatus }, { reason: 'status' })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paymentStatuses.map((status) => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="max-w-xs">
        <div className="space-y-1">
          <Input
            value={localNotes}
            placeholder="Agregar detalle"
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => onUpdate(entry, { notes: localNotes }, { reason: 'notes' })}
          />
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
            {(entry.explanationRequestNote || entry.lastExplanationRequestAt) && (
              <>Último pedido: {formatDate(entry.lastExplanationRequestAt)} — {entry.explanationRequestNote || 'Sin detalle'}</>
            )}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Recordatorio</p>
            <Input
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
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
              <p className="text-xs text-muted-foreground">Pedir nueva aclaración</p>
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
            </div>
          )}
          {!isBossView && allowDelete && (
            <div className="flex justify-end border-t pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm('¿Eliminar este pago?')) onDelete([entry.id]);
                }}
              >
                Eliminar pago
              </Button>
            </div>
          )}
        </div>
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
