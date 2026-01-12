'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAllUsers } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { CoachingView } from '@/components/team/coaching-view';
import { Header } from '@/components/layout/header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function CoachingPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const init = async () => {
      setLoading(true);
      if (isBoss) {
        // Si es jefe, cargar lista de asesores
        try {
          const users = await getAllUsers('Asesor');
          setAdvisors(users);
          if (users.length > 0) {
            setSelectedAdvisorId(users[0].id);
          }
        } catch (error) {
          console.error('Error fetching advisors', error);
        }
      } else if (userInfo) {
        // Si es asesor, seleccionarse a sí mismo
        setSelectedAdvisorId(userInfo.id);
      }
      setLoading(false);
    };

    init();
  }, [userInfo, isBoss, authLoading]);

  const selectedAdvisor = isBoss 
    ? advisors.find(u => u.id === selectedAdvisorId) 
    : userInfo;

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // Componente interno Spinner personalizado si no existe
  function Spinner({ size }: { size?: string }) {
      return <Loader2 className={`animate-spin text-primary ${size === 'large' ? 'h-8 w-8' : 'h-4 w-4'}`} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Seguimiento Semanal">
        {isBoss && advisors.length > 0 && (
          <div className="w-[250px]">
            <Select value={selectedAdvisorId} onValueChange={setSelectedAdvisorId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar asesor..." />
              </SelectTrigger>
              <SelectContent>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Header>
      
      <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
        {selectedAdvisor ? (
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
