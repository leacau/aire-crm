

'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  RowSelectionState,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';

interface ResizableDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  renderSubComponent?: (row: TData) => React.ReactElement;
  emptyStateMessage?: string;
  footerContent?: React.ReactNode;
  enableRowResizing?: boolean;
  sorting?: SortingState;
  setSorting?: React.Dispatch<React.SetStateAction<SortingState>>;
  rowSelection?: RowSelectionState;
  setRowSelection?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

export function ResizableDataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  renderSubComponent,
  emptyStateMessage = "No hay resultados.",
  footerContent,
  enableRowResizing = true,
  sorting,
  setSorting,
  rowSelection,
  setRowSelection,
}: ResizableDataTableProps<TData, TValue>) {
  const isSortingEnabled = !!sorting && !!setSorting;
  const isRowSelectionEnabled = !!rowSelection && !!setRowSelection;

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    ...(isSortingEnabled && {
      onSortingChange: setSorting,
      getSortedRowModel: getSortedRowModel(),
    }),
     ...(isRowSelectionEnabled && {
      onRowSelectionChange: setRowSelection,
      enableRowSelection: true,
    }),
    state: {
        ...(isSortingEnabled && { sorting }),
        ...(isRowSelectionEnabled && { rowSelection }),
    },
  });

  return (
    <div className="rounded-md border overflow-auto w-full">
      <Table className="w-full">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canResize = enableRowResizing && header.column.getCanResize();
                const canSort = isSortingEnabled && header.column.getCanSort();
                
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{ 
                      width: canResize ? header.getSize() : header.column.columnDef.size,
                    }}
                    className="relative"
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className={cn("flex items-center gap-2", canSort && "cursor-pointer select-none")}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {canSort && header.column.getIsSorted() && (
                            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    {canResize && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-blue-400 opacity-0 transition-opacity hover:opacity-100',
                           header.column.getIsResizing() ? 'bg-blue-600 opacity-100' : ''
                        )}
                      />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={(e) => {
                    // Previene el click en la fila si el target fue dentro de un menu o un checkbox
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="menu"]') || target.closest('[role="menuitem"]') || target.closest('[role="checkbox"]')) {
                      return;
                    }
                    onRowClick?.(row.original)
                  }}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} style={{ width: enableRowResizing ? cell.column.getSize() : undefined }}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {renderSubComponent && row.getIsExpanded() && (
                  <TableRow>
                    <TableCell colSpan={columns.length}>
                      {renderSubComponent(row.original)}
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyStateMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {footerContent}
      </Table>
    </div>
  );
}
