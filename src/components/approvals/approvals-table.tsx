

'use client';

import type { Opportunity, Client, User } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '../ui/badge';

interface ApprovalsTableProps {
  opportunities: Opportunity[];
  onRowClick: (opp: Opportunity) => void;
  clientsMap: Record<string, Client>;
  usersMap: Record<string, User>;
}

const getBonusStatusPill = (status?: string) => {
  if (!status) return null;
  const baseClasses = 'px-2 py-0.5 text-xs font-medium rounded-full capitalize';
  const statusMap: Record<string, string> = {
    'Pendiente': 'bg-yellow-100 text-yellow-800',
    'Autorizado': 'bg-green-100 text-green-800',
    'Rechazado': 'bg-red-100 text-red-800',
  };
  return <Badge variant="outline" className={cn(baseClasses, statusMap[status])}>{status}</Badge>;
};

export const ApprovalsTable = ({ opportunities, onRowClick, clientsMap, usersMap }: ApprovalsTableProps) => (
  <div className="border rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead className="hidden md:table-cell">Asesor</TableHead>
          <TableHead className="text-right">Valor Cerrado</TableHead>
          <TableHead>Bonificación</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="hidden lg:table-cell">Decisión</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.length > 0 ? (
          opportunities.map((opp) => {
            const client = clientsMap[opp.clientId];
            const ownerName = client ? usersMap[client.ownerId]?.name : 'N/A';
            const approverName = opp.bonificacionAutorizadoPorId ? usersMap[opp.bonificacionAutorizadoPorId]?.name : opp.bonificacionAutorizadoPorNombre;

            return (
              <TableRow key={opp.id} onClick={() => onRowClick(opp)} className="cursor-pointer">
                <TableCell className="font-medium">{opp.title}</TableCell>
                <TableCell>
                  <Link href={`/clients/${opp.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    {opp.clientName}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">{ownerName}</TableCell>
                <TableCell className="text-right">${(opp.valorCerrado || opp.value).toLocaleString('es-AR')}</TableCell>
                <TableCell className="font-bold">{opp.bonificacionDetalle}</TableCell>
                <TableCell>
                    {getBonusStatusPill(opp.bonificacionEstado)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {approverName && (
                      <div className="text-xs">
                          <p className="font-medium">{approverName}</p>
                          <p className="text-muted-foreground">
                              {opp.bonificacionFechaAutorizacion ? format(new Date(opp.bonificacionFechaAutorizacion), "P", { locale: es }) : ''}
                          </p>
                      </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              No hay solicitudes en esta sección.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
);
