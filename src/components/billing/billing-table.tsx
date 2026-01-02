
'use client';

import React, { useCallback, useMemo } from 'react';
import type { Opportunity, Client, User, Invoice } from '@/lib/types';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, ColumnOrderState, ColumnVisibilityState, RowSelectionState, SortingState } from '@tanstack/react-table';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AlertTriangle } from 'lucide-react';

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
  sorting,
  setSorting,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  isReady = true,
  selectedInvoiceIds,
  onToggleSelect,
  onToggleSelectAll,
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
  sorting?: SortingState;
  setSorting?: React.Dispatch<React.SetStateAction<SortingState>>;
  columnVisibility?: ColumnVisibilityState;
  setColumnVisibility?: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: React.Dispatch<React.SetStateAction<ColumnOrderState>>;
  isReady?: boolean;
  selectedInvoiceIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}) => {

  const isDeletionMarked = useCallback((item: Opportunity | Invoice) => {
    const invoice = item as Invoice;
    return Boolean(
      (invoice as any).deletionMarked ||
      invoice.deletionMarkedAt ||
      (invoice as any).markedForDeletion
    );
  }, []);

  const selectionEnabled = useMemo(
    () => type === 'invoices' && !!selectedInvoiceIds && !!onToggleSelect && !!onToggleSelectAll,
    [onToggleSelect, onToggleSelectAll, selectedInvoiceIds, type]
  );

  const displayedInvoiceIds = useMemo(() => {
    if (!selectionEnabled || !isReady) return [] as string[];

    return items
      .filter((item): item is Invoice => (item as Invoice).id !== undefined)
      .map((invoice) => invoice.id);
  }, [isReady, items, selectionEnabled]);

  const allSelected = useMemo(
    () => selectionEnabled && displayedInvoiceIds.length > 0 && displayedInvoiceIds.every((id) => selectedInvoiceIds?.has(id)),
    [displayedInvoiceIds, selectedInvoiceIds, selectionEnabled]
  );

  const someSelected = useMemo(
    () => selectionEnabled && displayedInvoiceIds.some((id) => selectedInvoiceIds?.has(id)),
    [displayedInvoiceIds, selectedInvoiceIds, selectionEnabled]
  );

  const columns = useMemo<ColumnDef<Opportunity | Invoice>[]>(() => {
    let cols: ColumnDef<any>[] = [];

    if (type === 'invoices' && selectionEnabled) {
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={(value) => onToggleSelectAll?.(value === true)}
            aria-label="Seleccionar todas las facturas visibles"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => {
          const invoice = row.original as Invoice;
          return (
            <Checkbox
              checked={selectedInvoiceIds?.has(invoice.id) ?? false}
              onCheckedChange={() => onToggleSelect?.(invoice.id)}
              aria-label={`Seleccionar factura ${invoice.invoiceNumber || invoice.id}`}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
        size: 48,
        enableResizing: false,
      });
    }

    cols.push(
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
    );

    if (type === 'invoices') {
        cols.push({
          id: 'deletion-mark',
          accessorFn: (row) => (row as Invoice).deletionMarkedAt || null,
          header: 'Estado',
          size: 140,
          cell: ({ row }) => {
            const invoice = row.original as Invoice;
            const marked = isDeletionMarked(invoice);
            if (!marked) return <span className="text-muted-foreground">—</span>;

            const markerName = (invoice as any).deletionMarkedByName as string | undefined;
            const markedAtRaw = invoice.deletionMarkedAt as string | undefined | null;
            const formattedDate = markedAtRaw
              ? (() => {
                  try {
                    return format(parseISO(markedAtRaw), 'Pp', { locale: es });
                  } catch (error) {
                    return markedAtRaw;
                  }
                })()
              : null;

            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Marcada</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-medium leading-none">Marcada para eliminar</p>
                      {markerName ? (
                        <p className="text-xs text-muted-foreground">Por {markerName}</p>
                      ) : null}
                      {formattedDate ? (
                        <p className="text-xs text-muted-foreground">El {formattedDate}</p>
                      ) : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          },
        });
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
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`delete-${invoice.id}`}>Eliminar</Label>
                    {invoice.markedForDeletion && (
                      <span className="text-[11px] text-muted-foreground">
                        {invoice.deletionMarkedByName || 'Solicitada'} {invoice.deletionMarkedAt ? `· ${format(parseISO(invoice.deletionMarkedAt), 'P', { locale: es })}` : ''}
                      </span>
                    )}
                  </div>
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

  }, [
    allSelected,
    clientsMap,
    isDeletionMarked,
    onMarkAsPaid,
    onRowClick,
    onToggleCreditNote,
    onToggleSelect,
    onToggleSelectAll,
    opportunitiesMap,
    selectedInvoiceIds,
    selectionEnabled,
    showCreditNoteDate,
    type,
    someSelected,
    usersMap,
  ]);

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
        data={isReady ? items : []}
        sorting={sorting}
        setSorting={setSorting}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        onRowClick={onRowClick}
        rowSelection={selectionEnabled ? rowSelection : undefined}
        setRowSelection={selectionEnabled ? handleRowSelectionChange : undefined}
        getRowId={(row) => (type === 'invoices' ? (row as Invoice).id : (row as Opportunity).id)}
        emptyStateMessage="No hay items en esta sección."
        footerContent={footerContent}
        enableRowResizing={false}
        rowClassName={(row) =>
          isDeletionMarked(row.original)
            ? 'bg-red-100/80 dark:bg-red-950/40 border-l-4 border-red-400 dark:border-red-700'
            : undefined
        }
      />
  );
};
