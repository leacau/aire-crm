
'use client';

import React from 'react';
import type { VacationRequest } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface LicensesTableProps {
  requests: VacationRequest[];
  isManagerView: boolean;
  currentUserId: string;
  onEdit: (request: VacationRequest) => void;
  onDelete: (request: VacationRequest) => void;
  onUpdateRequest: (request: VacationRequest, newStatus: 'Aprobado' | 'Rechazado') => void;
}

const getStatusBadge = (status: VacationRequest['status']) => {
  const variants = {
    Pendiente: 'bg-yellow-100 text-yellow-800',
    Aprobado: 'bg-green-100 text-green-800',
    Rechazado: 'bg-red-100 text-red-800',
  };
  return <Badge className={cn(variants[status], 'capitalize')}>{status}</Badge>;
};

export function LicensesTable({ requests, isManagerView, currentUserId, onEdit, onDelete, onUpdateRequest }: LicensesTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {isManagerView && <TableHead>Asesor</TableHead>}
            <TableHead>Desde</TableHead>
            <TableHead>Hasta</TableHead>
            <TableHead>Días</TableHead>
            <TableHead>Reincorpora</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-[100px] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length > 0 ? (
            requests.map(req => {
              const canModify = isManagerView || req.userId === currentUserId;
              const isOwner = req.userId === currentUserId;
              
              const canEditRequest = isManagerView || (isOwner && req.status === 'Pendiente');
              const startDate = parseISO(req.startDate);
              const endDate = parseISO(req.endDate);

              return (
                <TableRow key={req.id}>
                  {isManagerView && <TableCell className="font-medium">{req.userName}</TableCell>}
                  <TableCell>
                      <div>{format(startDate, 'P', { locale: es })}</div>
                      {isManagerView && <div className="text-xs text-muted-foreground capitalize">{format(startDate, 'eeee', { locale: es })}</div>}
                  </TableCell>
                  <TableCell>
                      <div>{format(endDate, 'P', { locale: es })}</div>
                      {isManagerView && <div className="text-xs text-muted-foreground capitalize">{format(endDate, 'eeee', { locale: es })}</div>}
                  </TableCell>
                  <TableCell>{req.daysRequested}</TableCell>
                  <TableCell>{format(parseISO(req.returnDate), 'P', { locale: es })}</TableCell>
                  <TableCell>{getStatusBadge(req.status)}</TableCell>
                  <TableCell className="text-right">
                    {canModify && (
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditRequest && <DropdownMenuItem onClick={() => onEdit(req)}>Editar</DropdownMenuItem>}
                          {isManagerView && req.status === 'Pendiente' && (
                            <>
                              <DropdownMenuItem onClick={() => onUpdateRequest(req, 'Aprobado')}>Aprobar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onUpdateRequest(req, 'Rechazado')}>Rechazar</DropdownMenuItem>
                            </>
                          )}
                          { (isManagerView || (isOwner && req.status === 'Pendiente')) && 
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(req)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          }
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={isManagerView ? 7 : 6} className="h-24 text-center">No se encontraron solicitudes.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
