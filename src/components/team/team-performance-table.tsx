

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { deleteUserAndReassignEntities, getAllOpportunities, getAllUsers, getClients, updateUserProfile, getInvoices, getProspects } from '@/lib/firebase-service';
import type { Opportunity, User, Client, UserRole, Invoice, Prospect, AreaType } from '@/lib/types';
import { userRoles, areaTypes } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/hooks/use-auth';
import { MoreHorizontal, Trash2, Save, BarChartHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths } from 'date-fns';
import { MonthlyClosureDialog } from './monthly-closure-dialog';


interface UserStats {
  user: User;
  wonOpps: number;
  totalRevenue: number;
  activeOpps: number;
  pipelineValue: number;
  prospectsCount: number;
  currentMonthBilling: number;
  previousMonthBilling: number | null;
}

export function TeamPerformanceTable() {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editedVacationDays, setEditedVacationDays] = useState<Record<string, number | string>>({});
  const [editedManager, setEditedManager] = useState<Record<string, string | undefined>>({});
  const [isClosureDialogOpen, setIsClosureDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allUsers, allClients, allProspects] = await Promise.all([
          getAllOpportunities(),
          getAllUsers(),
          getClients(),
          getProspects(),
      ]);
      setOpportunities(allOpps);
      setUsers(allUsers);
      setClients(allClients);
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

  const handleUpdateUser = async (userId: string, data: Partial<User>) => {
     try {
        await updateUserProfile(userId, data);
        toast({ title: 'Usuario actualizado'});
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
    } catch (error) {
        console.error("Error updating user:", error);
        toast({ title: 'Error al actualizar usuario', variant: 'destructive' });
    }
  };


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
    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const prevMonthDate = subMonths(today, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    return users.map(user => {
        const isAdvisor = user.role === 'Asesor';
        const advisorClientIds = isAdvisor ? new Set(clients.filter(c => c.ownerId === user.id).map(c => c.id)) : new Set();
        const userOpps = isAdvisor ? opportunities.filter(opp => advisorClientIds.has(opp.clientId)) : [];
        const userProspects = isAdvisor ? prospects.filter(p => p.ownerId === user.id && p.status !== 'Convertido') : [];
        
        const wonOpps = userOpps.filter(opp => opp.stage === 'Cerrado - Ganado');
        
        const currentMonthOpps = wonOpps.filter(opp => {
          if (!opp.closeDate) return false;
          const closeDate = parseISO(opp.closeDate);
          return isWithinInterval(closeDate, { start: currentMonthStart, end: currentMonthEnd });
        });
        
        const currentMonthBilling = currentMonthOpps.reduce((sum, opp) => sum + Number(opp.value), 0);
        
        const previousMonthBilling = user.monthlyClosures?.[prevMonthKey] ?? null;

        const activeOpps = userOpps.filter(opp => !['Cerrado - Ganado', 'Cerrado - Perdido', 'Cerrado - No Definido'].includes(opp.stage));
        const pipelineValue = activeOpps.reduce((sum, opp) => sum + Number(opp.value), 0);

        return {
            user,
            wonOpps: wonOpps.length,
            totalRevenue: 0, // This seems deprecated by monthly billing
            activeOpps: activeOpps.length,
            pipelineValue,
            prospectsCount: userProspects.length,
            currentMonthBilling,
            previousMonthBilling
        };
    }).sort((a,b) => (b.currentMonthBilling) - (a.currentMonthBilling));
  }, [users, opportunities, clients, prospects]);
  
  const managers = useMemo(() => users.filter(u => u.role === 'Jefe' || u.role === 'Gerencia'), [users]);
  const advisors = useMemo(() => users.filter(u => u.role === 'Asesor'), [users]);


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
                <Select value={user.role} onValueChange={(newRole: UserRole) => handleUpdateUser(user.id, { role: newRole })} disabled={!isBoss}>
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
      accessorKey: 'area',
      header: 'Área',
      cell: ({ row }) => {
        const { user } = row.original;
        return (
          <Select value={user.area} onValueChange={(newArea) => handleUpdateUser(user.id, { area: newArea as AreaType })} disabled={!isBoss}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Asignar área..." />
            </SelectTrigger>
            <SelectContent>
              {areaTypes.map(area => (
                <SelectItem key={area} value={area}>{area}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
     {
      accessorKey: 'managerId',
      header: 'Jefe Directo',
      cell: ({ row }) => {
        const { user } = row.original;
        const isManagerEdited = editedManager[user.id] !== undefined;

        return (
          <div className="flex items-center gap-1 w-[200px]">
             <Select 
                value={isManagerEdited ? editedManager[user.id] : user.managerId || 'none'} 
                onValueChange={(value) => setEditedManager(p => ({...p, [user.id]: value}))}
                disabled={!isBoss}
            >
              <SelectTrigger>
                <SelectValue placeholder="Asignar jefe..." />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="none">Ninguno</SelectItem>
                {managers.filter(m => m.id !== user.id).map(manager => (
                  <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isManagerEdited && (
              <Button size="icon" className="h-9 w-9" onClick={() => {
                const managerIdToSave = editedManager[user.id] === 'none' ? undefined : editedManager[user.id];
                handleUpdateUser(user.id, { managerId: managerIdToSave });
                setEditedManager(p => {
                    const newP = {...p};
                    delete newP[user.id];
                    return newP;
                });
              }}>
                <Save className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'previousMonthBilling',
      header: () => <div className="text-right">Facturación Mes Anterior</div>,
      cell: ({ row }) => <div className="text-right">{row.original.user.role === 'Asesor' ? (row.original.previousMonthBilling !== null ? `$${row.original.previousMonthBilling.toLocaleString('es-AR')}` : '-') : '-'}</div>,
    },
    {
      accessorKey: 'currentMonthBilling',
      header: () => <div className="text-right">Facturación Mes Actual</div>,
      cell: ({ row }) => <div className="text-right font-semibold">{row.original.user.role === 'Asesor' ? `$${row.original.currentMonthBilling.toLocaleString('es-AR')}` : '-'}</div>,
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
  ], [isBoss, userInfo, managers, editedManager]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
      <div className='flex justify-end mb-4'>
        {isBoss && (
          <Button onClick={() => setIsClosureDialogOpen(true)}>
            <BarChartHorizontal className="mr-2 h-4 w-4"/>
            Gestionar Cierres Mensuales
          </Button>
        )}
      </div>
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
      <MonthlyClosureDialog
        isOpen={isClosureDialogOpen}
        onOpenChange={setIsClosureDialogOpen}
        advisors={advisors}
        onSaveSuccess={fetchData}
      />
    </>
  );
}
