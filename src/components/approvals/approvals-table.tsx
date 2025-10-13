

'use client';

import React, { useMemo } from 'react';
import type { Opportunity, Client, User } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { LinkifiedText } from '../ui/linkified-text';

interface ApprovalsTableProps {
  opportunities: Opportunity[];
  onRowClick: (opp: Opportunity) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
}

const getBonusStatusPill = (status?: string) => {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'Pendiente': 'bg-yellow-100 text-yellow-800',
    'Autorizado': 'bg-green-100 text-green-800',
    'Rechazado': 'bg-red-100 text-red-800',
  };
  return <Badge variant="outline" className={cn(statusMap[status], 'capitalize')}>{status}</Badge>;
};

export const ApprovalsTable = ({ opportunities, onRowClick, clientsMap, usersMap }: ApprovalsTableProps) => {
  
  const columns = useMemo<ColumnDef<Opportunity>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Título',
      cell: ({ row }) => <div className="font-medium">{row.original.title}</div>
    },
    {
      accessorKey: 'clientName',
      header: 'Cliente',
      cell: ({ row }) => (
        <Link href={`/clients/${row.original.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.clientName}
        </Link>
      )
    },
    {
      id: 'advisor',
      header: 'Asesor',
      cell: ({ row }) => {
        const client = clientsMap[row.original.clientId];
        const ownerName = client ? usersMap[client.ownerId]?.name : 'N/A';
        return ownerName;
      }
    },
    {
      accessorKey: 'valorCerrado',
      header: () => <div className="text-right">Valor Cerrado</div>,
      cell: ({ row }) => {
        const amount = row.original.valorCerrado || row.original.value;
        return <div className="text-right">${amount.toLocaleString('es-AR')}</div>;
      }
    },
    {
      accessorKey: 'bonificacionDetalle',
      header: 'Bonificación',
      cell: ({ row }) => <div className="font-bold">{row.original.bonificacionDetalle}</div>
    },
    {
      accessorKey: 'bonificacionEstado',
      header: 'Estado',
      cell: ({ row }) => getBonusStatusPill(row.original.bonificacionEstado)
    },
    {
      accessorKey: 'bonificacionObservaciones',
      header: 'Observaciones',
      cell: ({ row }) => row.original.bonificacionObservaciones ? <LinkifiedText text={row.original.bonificacionObservaciones} /> : '-',
      size: 250,
    },
    {
      id: 'decision',
      header: 'Decisión',
      cell: ({ row }) => {
        const opp = row.original;
        const approverName = opp.bonificacionAutorizadoPorId ? usersMap[opp.bonificacionAutorizadoPorId]?.name : opp.bonificacionAutorizadoPorNombre;
        return (
          <>
            {approverName && (
              <div className="text-xs">
                <p className="font-medium">{approverName}</p>
                <p className="text-muted-foreground">
                  {opp.bonificacionFechaAutorizacion ? format(new Date(opp.bonificacionFechaAutorizacion), "P", { locale: es }) : ''}
                </p>
              </div>
            )}
          </>
        );
      }
    }
  ], [clientsMap, usersMap]);
  
  return (
      <ResizableDataTable
        columns={columns}
        data={opportunities}
        onRowClick={onRowClick}
        emptyStateMessage="No hay solicitudes en esta sección."
      />
  );
};
