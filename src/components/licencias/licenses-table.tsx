
'use client';

import React, { useMemo } from 'react';
import type { VacationRequest } from '@/lib/types';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MoreHorizontal, Trash2, Edit, Check, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


interface LicensesTableProps {
  requests: VacationRequest[];
  currentUserId: string;
  canManage: boolean;
  onUpdateRequestStatus: (requestId: string, newStatus: 'Aprobado' | 'Rechazado') => void;
  onEditRequest: (request: VacationRequest) => void;
  onDeleteRequest: (request: VacationRequest) => void;
}

const getStatusBadge = (status: VacationRequest['status']) => {
  const styles: Record<typeof status, string> = {
    'Pendiente': 'bg-yellow-100 text-yellow-800',
    'Aprobado': 'bg-green-100 text-green-800',
    'Rechazado': 'bg-red-100 text-red-800',
  };
  return <Badge variant="outline" className={cn('capitalize', styles[status])}>{status}</Badge>;
};

export function LicensesTable({ requests, currentUserId, canManage, onUpdateRequestStatus, onEditRequest, onDeleteRequest }: LicensesTableProps) {
  
  const columns = useMemo<ColumnDef<VacationRequest>[]>(() => {
    let cols: ColumnDef<VacationRequest>[] = [];

    if (canManage) {
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
        cell: ({ row }) => format(parseISO(row.original.startDate), 'P', { locale: es })
      },
      {
        accessorKey: 'endDate',
        header: 'Hasta',
        cell: ({ row }) => format(parseISO(row.original.endDate), 'P', { locale: es })
      },
      {
        accessorKey: 'daysRequested',
        header: 'Días Pedidos',
      },
      {
        accessorKey: 'returnDate',
        header: 'Reincorporación',
         cell: ({ row }) => format(parseISO(row.original.returnDate), 'P', { locale: es })
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => getStatusBadge(row.original.status)
      },
      {
        id: 'actions',
        cell: ({ row }) => {
            const request = row.original;
            const isOwner = request.userId === currentUserId;
            const canEdit = isOwner || canManage;
            const canDelete = isOwner || canManage;

            if (!canEdit && !canManage) return null;

            return (
              <div className="flex items-center justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canManage && request.status === 'Pendiente' && (
                        <>
                          <DropdownMenuItem onClick={() => onUpdateRequestStatus(request.id, 'Aprobado')}>
                              <Check className="mr-2 h-4 w-4" /> Aprobar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateRequestStatus(request.id, 'Rechazado')}>
                              <X className="mr-2 h-4 w-4" /> Rechazar
                          </DropdownMenuItem>
                        </>
                    )}
                    {canEdit && (
                       <DropdownMenuItem onClick={() => onEditRequest(request)}>
                          <Edit className="mr-2 h-4 w-4" /> Editar
                       </DropdownMenuItem>
                    )}
                     {canDelete && (
                       <DropdownMenuItem className="text-destructive" onClick={() => onDeleteRequest(request)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                       </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
        }
      }
    ]);

    return cols;
  }, [canManage, onUpdateRequestStatus, onEditRequest, onDeleteRequest, currentUserId]);

  return (
    <ResizableDataTable
      columns={columns}
      data={requests}
      emptyStateMessage="No hay solicitudes de licencia para mostrar."
      enableRowResizing={false}
    />
  );
}
