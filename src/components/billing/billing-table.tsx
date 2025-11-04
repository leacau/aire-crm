
'use client';

import React, { useMemo } from 'react';
import type { Opportunity, Client, User, Invoice } from '@/lib/types';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Save } from 'lucide-react';


type NewInvoiceData = {
    invoiceNumber: string;
    date: string;
    amount: number | string;
};

export const BillingTable = ({ 
  items, 
  type,
  onRowClick, 
  clientsMap, 
  usersMap,
  opportunitiesMap,
  onMarkAsPaid,
  newInvoiceData,
  onInvoiceDataChange,
  onCreateInvoice,
}: { 
  items: (Opportunity | Invoice)[];
  type: 'opportunities' | 'invoices';
  onRowClick: (item: Opportunity | Invoice) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
  opportunitiesMap: Record<string, Opportunity>;
  onMarkAsPaid?: (invoiceId: string) => void;
  newInvoiceData?: Record<string, Partial<NewInvoiceData>>;
  onInvoiceDataChange?: (virtualOppId: string, field: keyof NewInvoiceData, value: string) => void;
  onCreateInvoice?: (virtualOppId: string) => void;
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
              onClick={() => onRowClick(row.original)}
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

    if (type === 'opportunities' && onInvoiceDataChange && onCreateInvoice) {
        cols.push({
            accessorKey: 'value',
            header: () => <div className="text-right">Monto Oportunidad</div>,
            cell: ({ row }) => {
                const opp = row.original as Opportunity;
                const value = opp.periodicidad?.[0] ? opp.value : opp.value;
                return <div className="text-right">${Number(value).toLocaleString('es-AR')}</div>;
            }
        });
        cols.push({
            id: 'invoiceNumber',
            header: 'Nº Factura',
            cell: ({ row }) => <Input placeholder="Ej: 0001-00123456" className="min-w-[150px]" value={newInvoiceData?.[row.original.id]?.invoiceNumber || ''} onChange={(e) => onInvoiceDataChange(row.original.id, 'invoiceNumber', e.target.value)} onClick={e => e.stopPropagation()} />,
        });
        cols.push({
            id: 'invoiceDate',
            header: 'Fecha Factura',
            cell: ({ row }) => <Input type="date" className="min-w-[140px]" value={newInvoiceData?.[row.original.id]?.date || new Date().toISOString().split('T')[0]} onChange={(e) => onInvoiceDataChange(row.original.id, 'date', e.target.value)} onClick={e => e.stopPropagation()} />,
        });
        cols.push({
            id: 'invoiceAmount',
            header: 'Monto Factura',
            cell: ({ row }) => <Input type="number" placeholder="0.00" className="min-w-[120px]" value={newInvoiceData?.[row.original.id]?.amount || ''} onChange={(e) => onInvoiceDataChange(row.original.id, 'amount', e.target.value)} onClick={e => e.stopPropagation()} />,
        });
        cols.push({
            id: 'actions',
            cell: ({ row }) => {
                const data = newInvoiceData?.[row.original.id];
                const canSave = data?.invoiceNumber && data?.amount;
                return (
                    <Button size="sm" disabled={!canSave} onClick={(e) => { e.stopPropagation(); onCreateInvoice(row.original.id); }}>
                        <Save className="h-4 w-4" />
                    </Button>
                )
            }
        });
    }

    if (type === 'invoices') {
        cols.push({
            accessorKey: 'date',
            header: 'Fecha Factura',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return invoice.date ? format(parseISO(invoice.date), 'P', { locale: es }) : '-';
            },
        });
        cols.push({
            accessorKey: 'amount',
            header: () => <div className="text-right">Monto Factura</div>,
            cell: ({ row }) => <div className="text-right">${Number(row.original.amount).toLocaleString('es-AR')}</div>,
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
                        onClick={e => e.stopPropagation()}
                    />
                    <Label htmlFor={`paid-${invoice.id}`} className="sr-only">Marcar Pagado</Label>
                </div>
              )
            }
          })
        }
    }

    return cols;

  }, [type, onRowClick, clientsMap, opportunitiesMap, onMarkAsPaid, newInvoiceData, onInvoiceDataChange, onCreateInvoice]);

  const total = items.reduce((acc, item) => {
    if (type === 'invoices') return acc + Number((item as Invoice).amount || 0);
    if (type === 'opportunities') return acc + Number((item as Opportunity).value || 0);
    return acc;
  }, 0);


  const footerContent = (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={2} className="font-bold">Total</TableCell>
        <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
        {type === 'opportunities' && <TableCell colSpan={4}></TableCell>}
        {type === 'invoices' && <TableCell colSpan={onMarkAsPaid ? 3 : 2}></TableCell>}
      </TableRow>
    </TableFooter>
  );

  return (
      <ResizableDataTable
        columns={columns}
        data={items}
        onRowClick={onRowClick}
        emptyStateMessage="No hay items en esta sección."
        footerContent={footerContent}
        enableRowResizing={false}
      />
  );
};
