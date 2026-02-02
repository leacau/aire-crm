

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
  Row,
  ColumnVisibilityState,
  ColumnOrderState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface DataTablePaginationProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
}

function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2 py-2">
      <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} de{' '}
        {table.getFilteredRowModel().rows.length} fila(s) seleccionadas.
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Filas por página</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Página {table.getState().pagination.pageIndex + 1} de{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Ir a la primera página</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Ir a la página anterior</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Ir a la siguiente página</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Ir a la última página</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}


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
  columnVisibility?: ColumnVisibilityState;
  setColumnVisibility?: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: React.Dispatch<React.SetStateAction<ColumnOrderState>>;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  rowClassName?: (row: Row<TData>) => string;
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
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  getRowId,
  rowClassName,
}: ResizableDataTableProps<TData, TValue>) {
  const isSortingEnabled = !!sorting && !!setSorting;
  const isRowSelectionEnabled = !!rowSelection && !!setRowSelection;
  const isColumnVisibilityControlled = typeof columnVisibility !== 'undefined' && !!setColumnVisibility;
  const isColumnOrderControlled = typeof columnOrder !== 'undefined' && !!setColumnOrder;

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    ...(getRowId && { getRowId }),
    ...(isSortingEnabled && {
      onSortingChange: setSorting,
      getSortedRowModel: getSortedRowModel(),
    }),
     ...(isRowSelectionEnabled && {
      onRowSelectionChange: setRowSelection,
      enableRowSelection: true,
    }),
    ...(isColumnVisibilityControlled && {
      onColumnVisibilityChange: setColumnVisibility,
    }),
    ...(isColumnOrderControlled && {
      onColumnOrderChange: setColumnOrder,
    }),
    state: {
        ...(isSortingEnabled && { sorting }),
        ...(isRowSelectionEnabled && { rowSelection }),
        ...(isColumnVisibilityControlled && { columnVisibility }),
        ...(isColumnOrderControlled && { columnOrder }),
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-auto w-full">
        <Table className="w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canResize = enableRowResizing && header.column.getCanResize() && header.column.columnDef.size;
                  const canSort = isSortingEnabled && header.column.getCanSort();
                  
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{ 
                        width: canResize ? header.getSize() : (header.column.columnDef.size ? header.column.columnDef.size : 'auto'),
                      }}
                      className={cn("relative", canSort && "cursor-pointer select-none")}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-2">
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
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} style={{ width: enableRowResizing && cell.column.columnDef.size ? cell.column.getSize() : 'auto' }}>
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
      <DataTablePagination table={table} />
    </div>
  );
}
