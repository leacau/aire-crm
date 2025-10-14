'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients, updateUserProfile, getInvoices } from '@/lib/firebase-service';
import type { Opportunity, User, Client, UserRole, Invoice } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface UserStats {
  user: User;
  wonOpps: number;
  totalRevenue: number;
  activeOpps: number;
  pipelineValue: number;
}

const userRoles: UserRole[] = ['Asesor', 'Administracion', 'Jefe', 'Gerencia'];

export function TeamPerformanceTable() {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allUsers, allClients, allInvoices] = await Promise.all([
          getAllOpportunities(),
          getAllUsers(),
          getClients(),
          getInvoices(),
      ]);
      setOpportunities(allOpps);
      setUsers(allUsers);
      setClients(allClients);
      setInvoices(allInvoices);
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

  const userStats = useMemo<UserStats[]>(() => {
    return users.map(user => {
        const isAdvisor = user.role === 'Asesor';
        const advisorClientIds = isAdvisor ? new Set(clients.filter(c => c.ownerId === user.id).map(c => c.id)) : new Set();
        const userOpps = isAdvisor ? opportunities.filter(opp => advisorClientIds.has(opp.clientId)) : [];
        
        const wonOpps = userOpps.filter(opp => opp.stage === 'Cerrado - Ganado');
        const wonOppIds = new Set(wonOpps.map(opp => opp.id));

        const totalRevenue = invoices.filter(inv => wonOppIds.has(inv.opportunityId) && inv.status === 'Pagada').reduce((sum, inv) => sum + inv.amount, 0);

        const activeOpps = userOpps.filter(opp => opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido');
        const pipelineValue = activeOpps.reduce((sum, opp) => sum + opp.value, 0);

        return {
            user,
            wonOpps: wonOpps.length,
            totalRevenue,
            activeOpps: activeOpps.length,
            pipelineValue
        };
    }).sort((a,b) => b.totalRevenue - a.totalRevenue); // Sort by revenue
  }, [users, opportunities, clients, invoices]);
  
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
                <Select value={user.role} onValueChange={(newRole: UserRole) => handleRoleChange(user.id, newRole)}>
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
      accessorKey: 'wonOpps',
      header: () => <div className="text-right">Opps Ganadas</div>,
      cell: ({ row }) => <div className="text-right">{row.original.user.role === 'Asesor' ? row.original.wonOpps : '-'}</div>,
    },
    {
      accessorKey: 'totalRevenue',
      header: () => <div className="text-right">Ingresos (Pagados)</div>,
      cell: ({ row }) => <div className="text-right font-semibold">{row.original.user.role === 'Asesor' ? `$${row.original.totalRevenue.toLocaleString('es-AR')}` : '-'}</div>,
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
    }
  ], []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <ResizableDataTable
      columns={columns}
      data={userStats}
      emptyStateMessage="No se encontraron usuarios."
    />
  );
}
