'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { deleteUserAndReassignEntities, getAllOpportunities, getAllUsers, getClients, updateUserProfile, getInvoices, getProspects, getObjectiveVisibilityConfig, updateObjectiveVisibilityConfig } from '@/lib/firebase-service';
import type { Opportunity, User, Client, UserRole, Invoice, Prospect, AreaType, ObjectiveVisibilityConfig } from '@/lib/types';
import { userRoles } from '@/lib/types';
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
import { addMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths } from 'date-fns';
import { MonthlyClosureDialog } from './monthly-closure-dialog';
import { getObjectiveForDate, monthKey } from '@/lib/objective-utils';
import { format } from 'date-fns';


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

const areaTypes: AreaType[] = ['Comercial', 'Administración', 'Recursos Humanos', 'Pautado', 'Programación', 'Redacción'];

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
  const [editedValues, setEditedValues] = useState<Record<string, { monthlyObjective?: number | string; managerId?: string }>>({});
  const [isClosureDialogOpen, setIsClosureDialogOpen] = useState(false);
  const [objectiveVisibility, setObjectiveVisibility] = useState<ObjectiveVisibilityConfig | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityMonth, setVisibilityMonth] = useState('');
  const [visibilityDeadline, setVisibilityDeadline] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allUsers, allClients, allProspects, visibilityConfig] = await Promise.all([
          getAllOpportunities(),
          getAllUsers(),
          getClients(),
          getProspects(),
          getObjectiveVisibilityConfig(),
      ]);
      setOpportunities(allOpps);
      setUsers(allUsers);
      setClients(allClients);
      setProspects(allProspects);
      setObjectiveVisibility(visibilityConfig);
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

  useEffect(() => {
    if (!objectiveVisibility) return;
    setVisibilityMonth(objectiveVisibility.activeMonthKey ?? '');
    setVisibilityDeadline(objectiveVisibility.visibleUntil ?? '');
  }, [objectiveVisibility]);

  const handleUpdateUser = async (userId: string, data: Partial<User>) => {
     try {
        await updateUserProfile(userId, data);
        toast({ title: 'Usuario actualizado'});
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
        setEditedValues(prev => {
            const newEdited = { ...prev };
            delete newEdited[userId];
            return newEdited;
        });
    } catch (error) {
        console.error("Error updating user:", error);
        toast({ title: 'Error al actualizar usuario', variant: 'destructive' });
    }
  };

  const handleSaveObjectiveVisibility = async () => {
    if (!userInfo || (!visibilityMonth && !visibilityDeadline)) return;

    setSavingVisibility(true);
    try {
      const payload: ObjectiveVisibilityConfig = {
        activeMonthKey: visibilityMonth || undefined,
        visibleUntil: visibilityDeadline || undefined,
      };
      await updateObjectiveVisibilityConfig(payload, userInfo.id, userInfo.name);
      setObjectiveVisibility(payload);
      toast({ title: 'Visibilidad de objetivos actualizada' });
    } catch (error) {
      console.error('Error saving visibility config', error);
      toast({ title: 'No se pudo guardar la visibilidad', variant: 'destructive' });
    } finally {
      setSavingVisibility(false);
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
      id: 'manager',
      header: 'Jefe directo',
      cell: ({ row }) => {
        const { user } = row.original;

        return (
          <Select
            value={user.managerId ?? ''}
            onValueChange={(newManagerId) =>
              handleUpdateUser(user.id, { managerId: newManagerId || undefined })
            }
            disabled={!isBoss}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Asignar jefe..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin jefe asignado</SelectItem>
              {managers.map(manager => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: 'monthlyObjective',
      header: () => <div className="text-right">Objetivo Mensual</div>,
      cell: ({ row }) => {
        const { user } = row.original;
        if (user.role !== 'Asesor') return <div className="text-right">-</div>;

        const isEdited = editedValues[user.id]?.monthlyObjective !== undefined;
        const { value: activeObjective } = getObjectiveForDate(user, new Date());
        const currentValue = isEdited ? editedValues[user.id]?.monthlyObjective : activeObjective;

        return (
          <div className="flex items-center gap-1 justify-end">
            <Input
              type="number"
              className="w-28 text-right"
              placeholder="0"
              value={currentValue ?? ''}
              onChange={(e) => setEditedValues(p => ({...p, [user.id]: { ...p[user.id], monthlyObjective: e.target.value }}))}
              disabled={!isBoss}
            />
            {isEdited && (
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  const today = new Date();
                  const month = monthKey(today);
                  const newObjective = Number(editedValues[user.id]?.monthlyObjective);
                  const updatedHistory = { ...(user.monthlyObjectives ?? {}) };

                  const { value: activeObjective, sourceMonth } = getObjectiveForDate(user, today);
                  const previousMonthKey = monthKey(addMonths(today, -1));

                  if (!sourceMonth && activeObjective && !updatedHistory[previousMonthKey]) {
                    updatedHistory[previousMonthKey] = activeObjective;
                  }

                  updatedHistory[month] = newObjective;
                  handleUpdateUser(user.id, {
                    monthlyObjective: newObjective,
                    monthlyObjectives: updatedHistory,
                  });
                }}
              >
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
  ], [isBoss, userInfo, managers, editedValues]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
      {isBoss && (
        <div className="mb-4 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Extender visibilidad de objetivos</h3>
              <p className="text-sm text-muted-foreground">
                Permití que los objetivos del mes sigan visibles hasta que cierre definitivamente la facturación.
              </p>
              {objectiveVisibility?.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Última actualización: {format(parseISO(objectiveVisibility.updatedAt), 'dd/MM/yyyy HH:mm')}
                  {objectiveVisibility.updatedByName ? ` por ${objectiveVisibility.updatedByName}` : ''}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="visibility-month">Mes a mostrar</label>
                <Input
                  id="visibility-month"
                  type="month"
                  value={visibilityMonth}
                  onChange={(e) => setVisibilityMonth(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="visibility-deadline">Mostrar hasta</label>
                <Input
                  id="visibility-deadline"
                  type="date"
                  value={visibilityDeadline}
                  onChange={(e) => setVisibilityDeadline(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={handleSaveObjectiveVisibility} disabled={savingVisibility}>
                {savingVisibility ? <Spinner size="small" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
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
