'use client';

import React, { useMemo, useState } from 'react';
import type { PaymentEntry, PaymentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parse, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

type Props = {
  entries: PaymentEntry[];
  onUpdate: (id: string, updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt'>>) => void;
  onDelete: (ids: string[]) => void;
  selectedIds: string[];
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  allowDelete?: boolean;
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

const PaymentRow = ({ entry, onUpdate, onDelete, onToggleSelected, selected, allowDelete }: {
  entry: PaymentEntry;
  onUpdate: Props['onUpdate'];
  onDelete: Props['onDelete'];
  onToggleSelected: Props['onToggleSelected'];
  selected: boolean;
  allowDelete?: boolean;
}) => {
  const [reminderDate, setReminderDate] = useState(entry.nextContactAt?.substring(0, 10) || '');
  const daysLate = useMemo(() => entry.daysLate ?? getDaysLate(entry), [entry]);

  return (
    <TableRow key={entry.id}>
      <TableCell>
        {allowDelete && (
          <Checkbox
            aria-label="Seleccionar pago"
            checked={selected}
            onCheckedChange={(checked) => onToggleSelected(entry.id, Boolean(checked))}
          />
        )}
      </TableCell>
      <TableCell className="font-medium">{entry.company}</TableCell>
      <TableCell>{entry.comprobanteNumber || '—'}</TableCell>
      <TableCell>{entry.razonSocial || '—'}</TableCell>
      <TableCell>{formatCurrency(entry.pendingAmount)}</TableCell>
      <TableCell>{formatDate(entry.issueDate)}</TableCell>
      <TableCell>{formatDate(entry.dueDate)}</TableCell>
      <TableCell>{typeof daysLate === 'number' ? daysLate : '—'}</TableCell>
      <TableCell>
        <Select
          value={entry.status}
          onValueChange={(value) => onUpdate(entry.id, { status: value as PaymentStatus })}
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
      <TableCell>
        <Input
          defaultValue={entry.notes || ''}
          placeholder="Agregar detalle"
          onBlur={(e) => onUpdate(entry.id, { notes: e.target.value })}
        />
      </TableCell>
      <TableCell>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir acciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 space-y-2 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Recordatorio</p>
              <p className="text-xs text-muted-foreground">Seleccioná una fecha para volver a contactar.</p>
            </div>
            <Input
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReminderDate('');
                  onUpdate(entry.id, { nextContactAt: null });
                }}
              >
                Quitar
              </Button>
              <Button
                size="sm"
                onClick={() => onUpdate(entry.id, { nextContactAt: reminderDate || null })}
              >
                Guardar
              </Button>
            </div>
            {allowDelete && (
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
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

export function PaymentsTable({ entries, onUpdate, onDelete, selectedIds, onToggleSelected, onToggleSelectAll, allowDelete }: Props) {
  const allSelected = allowDelete && entries.length > 0 && selectedIds.length === entries.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Pagos asignados</CardTitle>
        {allowDelete && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {allowDelete && (
                  <Checkbox
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onCheckedChange={(checked) => onToggleSelectAll(Boolean(checked))}
                    indeterminate={allowDelete && selectedIds.length > 0 && selectedIds.length < entries.length}
                  />
                )}
              </TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Nro. comprobante</TableHead>
              <TableHead>Razón Social</TableHead>
              <TableHead>Importe pendiente</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Días de atraso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Explicación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
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
              />
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
                  No hay pagos cargados para este vendedor.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
