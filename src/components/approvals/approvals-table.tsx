
'use client';

import type { Opportunity } from '@/lib/types';
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

export const ApprovalsTable = ({ opportunities, onRowClick }: ApprovalsTableProps) => (
  <div className="border rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Asesor</TableHead>
          <TableHead className="text-right">Valor Cerrado</TableHead>
          <TableHead className="text-center">Bonificación</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Decisión</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.length > 0 ? (
          opportunities.map((opp) => (
            <TableRow key={opp.id} onClick={() => onRowClick(opp)} className="cursor-pointer">
              <TableCell className="font-medium">{opp.title}</TableCell>
              <TableCell>
                <Link href={`/clients/${opp.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                  {opp.clientName}
                </Link>
              </TableCell>
              <TableCell>{opp.ownerName}</TableCell>
              <TableCell className="text-right">${(opp.valorCerrado || opp.value).toLocaleString()}</TableCell>
              <TableCell className="text-center font-bold">{opp.bonificacionPorcentaje}%</TableCell>
              <TableCell>
                  {getBonusStatusPill(opp.bonificacionEstado)}
              </TableCell>
               <TableCell>
                 {opp.bonificacionAutorizadoPorNombre && (
                    <div className="text-xs">
                        <p className="font-medium">{opp.bonificacionAutorizadoPorNombre}</p>
                        <p className="text-muted-foreground">
                            {opp.bonificacionFechaAutorizacion ? format(new Date(opp.bonificacionFechaAutorizacion), "P", { locale: es }) : ''}
                        </p>
                    </div>
                 )}
              </TableCell>
            </TableRow>
          ))
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
