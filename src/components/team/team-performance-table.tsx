
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { deleteUserAndReassignEntities, getAllOpportunities, getAllUsers, getClients, updateUserProfile, getInvoices, getProspects } from '@/lib/firebase-service';
import type { Opportunity, User, Client, UserRole, Invoice, Prospect } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/hooks/use-auth';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface UserStats {
  user: User;
  wonOpps: number;
  totalRevenue: number;
  activeOpps: number;
  pipelineValue: number;
  prospectsCount: number;
}

const userRoles: UserRole[] = ['Asesor', 'Administracion', 'Jefe', 'Gerencia'];

export function TeamPerformanceTable() {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allUsers, allClients, allInvoices, allProspects] = await Promise.all([
          getAllOpportunities(),
          getAllUsers(),
          getClients(),
          getInvoices(),
          getProspects(),
      ]);
      setOpportunities(allOpps);
      setUsers(allUsers);
      setClients(allClients);
      setInvoices(allInvoices);
      setProspects(allProspects);
    } catch (error) {
      console.error("Error fetching team data:", error);
      toast({ title: 'Error al cargar los datos del equipo', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const originalUsers = users;
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    
    try {
        await updateUserProfile(userId, { role: newRole });
        toast({ title: 'Rol actualizado', description: `El rol del usuario ha sido cambiado a ${newRole}.` });
    } catch (error) {
        setUsers(originalUsers); // Revert on error
        console.error("Error updating user role:", error);
        toast({ title: 'Error al actualizar el rol', variant: 'destructive' });
    }
  }

  const handleDeleteUser = async () => {
    if (!userToDelete || !userInfo) return;

    setIsDeleting(true);
    try {
        await deleteUserAndReassignEntities(userToDelete.id, userInfo.id, userInfo.name);
        toast({ title: "Usuario Eliminado", description: `${userToDelete.name} ha sido eliminado y sus clientes han sido desasignados.` });
        fetchData(); // Refresh all data
    } catch (error) {
        console.error("Error deleting user:", error);
        toast({ title: 'Error al eliminar el usuario', variant: 'destructive', description: (error as Error).message });
    } finally {
        setIsDeleting(false);
        setUserToDelete(null);
    }
  };


  const userStats = useMemo<UserStats[]>(() => {
    return users.map(user => {
        const isAdvisor = user.role === 'Asesor';
        
        const advisorClientIds = isAdvisor ? new Set(clients.filter(c => c.ownerId === user.id).map(c => c.id)) : new Set();
        const userOpps = isAdvisor ? opportunities.filter(opp => advisorClientIds.has(opp.clientId)) : [];
        const userProspects = isAdvisor ? prospects.filter(p => p.ownerId === user.id && p.status !== 'Convertido') : [];
        
        const wonOpps = userOpps.filter(opp => opp.stage === 'Cerrado - Ganado');
        const wonOppIds = new Set(wonOpps.map(opp => opp.id));

        const totalRevenue = invoices.filter(inv => wonOppIds.has(inv.opportunityId) && inv.status === 'Pagada').reduce((sum, inv) => sum + inv.amount, 0);

        const activeOpps = userOpps.filter(opp => !['Cerrado - Ganado', 'Cerrado - Perdido', 'Cerrado - No Definido'].includes(opp.stage));
        const pipelineValue = activeOpps.reduce((sum, opp) => sum + opp.value, 0);

        return {
            user,
            wonOpps: wonOpps.length,
            totalRevenue,
            activeOpps: activeOpps.length,
            pipelineValue,
            prospectsCount: userProspects.length
        };
    }).sort((a,b) => b.totalRevenue - a.totalRevenue); // Sort by revenue
  }, [users, opportunities, clients, invoices, prospects]);
  
  const columns = useMemo<ColumnDef<UserStats>[]>(() => [
    {
      accessorKey: 'user',
      header: 'Usuario',
      cell: ({ row }) => {
        const { user } = row.original;
        const initials = user.name?.substring(0, 2).toUpperCase() || 'U';
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.photoURL} alt={user.name} data-ai-hint="person face" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
        );
      },
      minSize: 250,
    },
    {
        accessorKey: 'role',
        header: 'Rol',
        cell: ({ row }) => {
            const { user } = row.original;
            return (
                <Select value={user.role} onValueChange={(newRole: UserRole) => handleRoleChange(user.id, newRole)} disabled={!isBoss}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                        {userRoles.map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }
    },
    {
      accessorKey: 'prospectsCount',
      header: () => <div className="text-right">Prospectos Activos</div>,
      cell: ({ row }) => <div className="text-right">{row.original.user.role === 'Asesor' ? row.original.prospectsCount : '-'}</div>,
    },
    {
      accessorKey: 'activeOpps',
      header: () => <div className="text-right">Opps Activas</div>,
      cell: ({ row }) => <div className="text-right">{row.original.user.role === 'Asesor' ? row.original.activeOpps : '-'}</div>,
    },
    {
      accessorKey: 'pipelineValue',
      header: () => <div className="text-right">Valor Pipeline</div>,
      cell: ({ row }) => <div className="text-right">{row.original.user.role === 'Asesor' ? `$${row.original.pipelineValue.toLocaleString('es-AR')}` : '-'}</div>,
    },
    {
      accessorKey: 'totalRevenue',
      header: () => <div className="text-right">Ingresos (Pagados)</div>,
      cell: ({ row }) => <div className="text-right font-semibold">{row.original.user.role === 'Asesor' ? `$${row.original.totalRevenue.toLocaleString('es-AR')}` : '-'}</div>,
    },
    {
        id: 'actions',
        cell: ({ row }) => {
            const { user } = row.original;
            if (!isBoss || user.id === userInfo?.id) return null;

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                         <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => setUserToDelete(user)}
                         >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar Usuario
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    }
  ], [isBoss, userInfo]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
        <ResizableDataTable
        columns={columns}
        data={userStats}
        emptyStateMessage="No se encontraron usuarios."
        />
        <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro de eliminar a {userToDelete?.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción es irreversible. Se eliminará permanentemente al usuario y todos sus clientes y prospectos quedarán sin asesor asignado.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteUser} variant="destructive" disabled={isDeleting}>
                        {isDeleting ? <Spinner size="small" /> : "Confirmar Eliminación"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
