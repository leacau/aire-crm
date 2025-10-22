
'use client';

import React, { useMemo } from 'react';
import type { Opportunity, Client, User, Invoice } from '@/lib/types';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '../ui/label';

export const BillingTable = ({ 
  items, 
  type,
  onRowClick, 
  clientsMap, 
  usersMap,
  opportunitiesMap,
  onMarkAsPaid,
}: { 
  items: (Opportunity | Invoice)[];
  type: 'opportunities' | 'invoices';
  onRowClick: (opp: Opportunity) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
  opportunitiesMap: Record<string, Opportunity>;
  onMarkAsPaid?: (invoiceId: string) => void;
}) => {

  const columns = useMemo<ColumnDef<Opportunity | Invoice>[]>(() => {
    let cols: ColumnDef<any>[] = [
      {
        accessorKey: 'opportunityTitle',
        header: 'Oportunidad',
        cell: ({ row }) => {
          const isOpp = type === 'opportunities';
          const opp = isOpp ? row.original : opportunitiesMap[row.original.opportunityId];
          if (!opp) return '-';
          return (
            <div 
              className="font-medium text-primary hover:underline cursor-pointer"
              onClick={() => onRowClick(opp)}
            >
                {opp.title}
            </div>
          );
        },
      },
      {
        accessorKey: 'clientName',
        header: 'Cliente',
        cell: ({ row }) => {
            const isOpp = type === 'opportunities';
            const opp = isOpp ? row.original : opportunitiesMap[row.original.opportunityId];
            if (!opp) return '-';
            const client = clientsMap[opp.clientId];
            if (!client) return opp.clientName;
            
            return (
                <div className="flex flex-col">
                    <Link href={`/clients/${client.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {client.denominacion}
                    </Link>
                    <span className="text-xs text-muted-foreground">{client.ownerName}</span>
                </div>
            );
        },
      },
    ];

    if (type === 'opportunities') {
        cols.push({
            accessorKey: 'value',
            header: () => <div className="text-right">Monto Oportunidad</div>,
            cell: ({ row }) => <div className="text-right">${row.original.value.toLocaleString('es-AR')}</div>,
        });
    }

    if (type === 'invoices') {
        cols.push({
            accessorKey: 'date',
            header: 'Fecha Factura',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return invoice.date ? format(new Date(invoice.date), 'P', { locale: es }) : '-';
            },
        });
        cols.push({
            accessorKey: 'amount',
            header: () => <div className="text-right">Monto Factura</div>,
            cell: ({ row }) => <div className="text-right">${row.original.amount.toLocaleString('es-AR')}</div>,
        });
        cols.push({
            accessorKey: 'invoiceNumber',
            header: 'Factura Nº',
            cell: ({ row }) => row.original.invoiceNumber || '-',
        });

        if (onMarkAsPaid) {
          cols.push({
            id: 'mark-as-paid',
            header: 'Marcar Pagado',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return (
                <div className="flex items-center justify-center space-x-2">
                    <Checkbox 
                        id={`paid-${invoice.id}`} 
                        onCheckedChange={() => onMarkAsPaid(invoice.id)}
                    />
                    <Label htmlFor={`paid-${invoice.id}`} className="sr-only">Marcar Pagado</Label>
                </div>
              )
            }
          })
        }
    }

    return cols;

  }, [type, onRowClick, clientsMap, opportunitiesMap, onMarkAsPaid]);

  const total = items.reduce((acc, item) => {
    if (type === 'invoices') return acc + (item as Invoice).amount;
    if (type === 'opportunities') return acc + (item as Opportunity).value;
    return acc;
  }, 0);


  const footerContent = (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={type === 'invoices' ? 3 : 2} className="font-bold">Total</TableCell>
        <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
        {type === 'invoices' && <TableCell colSpan={onMarkAsPaid ? 2 : 1}></TableCell>}
      </TableRow>
    </TableFooter>
  );

  return (
      <ResizableDataTable
        columns={columns}
        data={items}
        emptyStateMessage="No hay items en esta sección."
        footerContent={footerContent}
        enableRowResizing={false}
      />
  );
};

    