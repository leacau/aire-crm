'use client';

import React from 'react';
import type { PaymentEntry, PaymentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

type Props = {
  entries: PaymentEntry[];
  onUpdate: (id: string, updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt'>>) => void;
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

export function PaymentsTable({ entries, onUpdate }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos asignados</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Razón Social</TableHead>
              <TableHead>Importe</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Días atraso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Explicación</TableHead>
              <TableHead>Recordatorio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.company}</TableCell>
                <TableCell>{entry.razonSocial || '—'}</TableCell>
                <TableCell>{entry.amount ? `$${entry.amount.toLocaleString('es-AR')}` : '—'}</TableCell>
                <TableCell>{formatDate(entry.issueDate)}</TableCell>
                <TableCell>{formatDate(entry.dueDate)}</TableCell>
                <TableCell>{typeof entry.daysLate === 'number' ? entry.daysLate : '—'}</TableCell>
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
                  <Input
                    type="date"
                    defaultValue={entry.nextContactAt ? entry.nextContactAt.substring(0, 10) : ''}
                    onChange={(e) => onUpdate(entry.id, { nextContactAt: e.target.value || null })}
                  />
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
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
