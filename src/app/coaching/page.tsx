'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAllUsers, syncRegisteredUsersFromAuth } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { CoachingView } from '@/components/team/coaching-view';
import { Header } from '@/components/layout/header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const advisorRoles = new Set(['Asesor', 'Asesor Canjes']);

function Spinner({ size }: { size?: string }) {
  return <Loader2 className={`animate-spin text-primary ${size === 'large' ? 'h-8 w-8' : 'h-4 w-4'}`} />;
}

export default function CoachingPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canManageCoaching = isBoss || userInfo?.role === 'Admin' || userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia';

  const advisors = useMemo(() => {
    return users.filter(user => advisorRoles.has(user.role) && !user.deletedAt);
  }, [users]);

  const loadData = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setLoadError(null);
    try {
      if (canManageCoaching) {
        let allUsers = await getAllUsers();
        if (allUsers.length === 0) {
          await syncRegisteredUsersFromAuth();
          allUsers = await getAllUsers();
        }

        setUsers(allUsers);
        const selectableAdvisors = allUsers.filter(user => advisorRoles.has(user.role) && !user.deletedAt);
        setSelectedAdvisorId(current => {
          if (current && selectableAdvisors.some(advisor => advisor.id === current)) return current;
          return selectableAdvisors[0]?.id || '';
        });

        if (selectableAdvisors.length === 0) {
          setLoadError('No hay usuarios con rol Asesor o Asesor Canjes para mostrar seguimiento.');
        }
      } else if (userInfo) {
        setUsers([userInfo]);
        setSelectedAdvisorId(userInfo.id);
      }
    } catch (error) {
      console.error('Error fetching advisors', error);
      setLoadError('No se pudieron cargar los asesores.');
      toast({ title: 'Error al cargar asesores', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [authLoading, canManageCoaching, toast, userInfo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedAdvisor = canManageCoaching
    ? advisors.find(u => u.id === selectedAdvisorId)
    : userInfo;

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Seguimiento Semanal">
        {canManageCoaching && advisors.length > 0 && (
          <div className="w-[280px]">
            <Select value={selectedAdvisorId} onValueChange={setSelectedAdvisorId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar asesor..." />
              </SelectTrigger>
              <SelectContent>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>
                    {advisor.name || advisor.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Header>

      <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
        {loadError ? (
          <Card className="h-full border-dashed bg-muted/20">
            <CardContent className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-amber-600" />
              <p>{loadError}</p>
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : selectedAdvisor ? (
          <CoachingView advisor={selectedAdvisor} />
        ) : (
          <Card className="h-full flex items-center justify-center bg-muted/20 border-dashed">
            <CardContent className="text-muted-foreground">
              Seleccione un asesor para ver su seguimiento.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
