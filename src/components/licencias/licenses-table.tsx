
'use client';

import React, { useMemo } from 'react';
import type { VacationRequest } from '@/lib/types';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

interface LicensesTableProps {
  requests: VacationRequest[];
  isManagerView: boolean;
  onUpdateRequest: (userId: string, requestId: string, newStatus: 'Aprobado' | 'Rechazado') => void;
}

const getStatusBadge = (status: VacationRequest['status']) => {
  const styles: Record<typeof status, string> = {
    'Pendiente': 'bg-yellow-100 text-yellow-800',
    'Aprobado': 'bg-green-100 text-green-800',
    'Rechazado': 'bg-red-100 text-red-800',
  };
  return <Badge className={cn('capitalize', styles[status])}>{status}</Badge>;
};

export function LicensesTable({ requests, isManagerView, onUpdateRequest }: LicensesTableProps) {
  
  const columns = useMemo<ColumnDef<VacationRequest>[]>(() => {
    let cols: ColumnDef<VacationRequest>[] = [];

    if (isManagerView) {
      cols.push({
        accessorKey: 'userName',
        header: 'Asesor',
        cell: ({ row }) => <div className="font-medium">{row.original.userName}</div>
      });
    }

    cols = cols.concat([
      {
        accessorKey: 'startDate',
        header: 'Desde',
        cell: ({ row }) => format(new Date(row.original.startDate), 'P', { locale: es })
      },
      {
        accessorKey: 'endDate',
        header: 'Hasta',
        cell: ({ row }) => format(new Date(row.original.endDate), 'P', { locale: es })
      },
      {
        accessorKey: 'daysRequested',
        header: 'Días Pedidos',
      },
      {
        accessorKey: 'returnDate',
        header: 'Reincorporación',
         cell: ({ row }) => format(new Date(row.original.returnDate), 'P', { locale: es })
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => getStatusBadge(row.original.status)
      },
    ]);
    
    if (isManagerView) {
        cols.push({
            id: 'actions',
            cell: ({ row }) => {
                const request = row.original;
                if (request.status !== 'Pendiente') return null;

                return (
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => onUpdateRequest(request.userId, request.id, 'Rechazado')}>Rechazar</Button>
                        <Button size="sm" onClick={() => onUpdateRequest(request.userId, request.id, 'Aprobado')}>Aprobar</Button>
                    </div>
                )
            }
        })
    }


    return cols;
  }, [isManagerView, onUpdateRequest]);

  return (
    <ResizableDataTable
      columns={columns}
      data={requests}
      emptyStateMessage="No hay solicitudes de licencia para mostrar."
      enableRowResizing={false}
    />
  );
}
