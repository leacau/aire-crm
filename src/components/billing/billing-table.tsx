
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

export const BillingTable = ({
  items,
  type,
  onRowClick,
  clientsMap,
  usersMap,
  opportunitiesMap,
  onMarkAsPaid,
  onToggleCreditNote,
  showCreditNoteDate,
  onToggleDeletionMark,
}: {
  items: (Opportunity | Invoice)[];
  type: 'opportunities' | 'invoices';
  onRowClick: (item: Opportunity | Invoice) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
  opportunitiesMap: Record<string, Opportunity>;
  onMarkAsPaid?: (invoiceId: string) => void;
  onToggleCreditNote?: (invoiceId: string, nextValue: boolean) => void;
  showCreditNoteDate?: boolean;
  onToggleDeletionMark?: (invoiceId: string, nextValue: boolean) => void;
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

    if (type === 'invoices') {
        cols.push({
            accessorKey: 'date',
            header: 'Fecha Factura',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return invoice.date ? format(parseISO(invoice.date), 'P', { locale: es }) : '-';
            },
        });
        if (showCreditNoteDate) {
          cols.push({
            accessorKey: 'creditNoteMarkedAt',
            header: 'Fecha NC',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              if (!invoice.creditNoteMarkedAt) return '-';
              try {
                return format(parseISO(invoice.creditNoteMarkedAt), 'P', { locale: es });
              } catch (error) {
                return '-';
              }
            }
          });
        }
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
        if (onToggleDeletionMark) {
          cols.push({
            id: 'mark-for-deletion',
            header: 'Eliminar',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return (
                <div className="flex items-center justify-center space-x-2">
                  <Checkbox
                    id={`delete-${invoice.id}`}
                    checked={!!invoice.markedForDeletion}
                    onCheckedChange={(value) => {
                      const nextValue = value === true;
                      onToggleDeletionMark(invoice.id, nextValue);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Label htmlFor={`delete-${invoice.id}`}>Eliminar</Label>
                </div>
              );
            }
          });
        }
        if (onToggleCreditNote) {
          cols.push({
            id: 'mark-credit-note',
            header: 'NC',
            cell: ({ row }) => {
              const invoice = row.original as Invoice;
              return (
                <div className="flex items-center justify-center space-x-2">
                  <Checkbox
                    id={`credit-note-${invoice.id}`}
                    checked={!!invoice.isCreditNote}
                    onCheckedChange={(value) => {
                      const nextValue = value === true;
                      onToggleCreditNote(invoice.id, nextValue);
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                  <Label htmlFor={`credit-note-${invoice.id}`}>NC</Label>
                </div>
              );
            }
          })
        }
    }

    return cols;

  }, [type, onRowClick, clientsMap, opportunitiesMap, onMarkAsPaid, usersMap, onToggleCreditNote, showCreditNoteDate, onToggleDeletionMark]);

  const total = items.reduce((acc, item) => {
    if (type === 'invoices') return acc + Number((item as Invoice).amount || 0);
    if (type === 'opportunities') return acc + Number((item as Opportunity).value || 0);
    return acc;
  }, 0);


  const footerContent = (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={columns.length} className="text-right font-bold">
          Total: ${total.toLocaleString('es-AR')}
        </TableCell>
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
