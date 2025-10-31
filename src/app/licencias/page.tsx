
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { createVacationRequest, updateVacationRequest, getAllUsers, getVacationRequests } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { LicensesTable } from '@/components/licencias/licenses-table';

export default function LicenciasPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      // Pass user info to respect security rules
      const fetchedRequests = await getVacationRequests(userInfo.id, userInfo.role);
      setRequests(fetchedRequests);
    } catch (error) {
      console.error("Error fetching license data:", error);
      toast({ title: "Error al cargar las solicitudes", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo]);

  useEffect(() => {
    if (userInfo) {
      fetchData();
    }
  }, [userInfo, fetchData]);

  const handleCreateRequest = async (requestData: Omit<VacationRequest, 'id' | 'userId' | 'userName' | 'status' | 'requestDate'>) => {
    if (!userInfo) return;

    try {
      const fullRequestData: Omit<VacationRequest, 'id'> = {
        ...requestData,
        userId: userInfo.id,
        userName: userInfo.name,
        status: 'Pendiente' as const,
        requestDate: new Date().toISOString(),
      };
      await createVacationRequest(fullRequestData);
      toast({ title: "Solicitud de licencia enviada" });

      fetchData();
    } catch (error) {
      console.error("Error creating license request:", error);
      toast({ title: "Error al enviar la solicitud", description: (error as Error).message, variant: "destructive" });
    }
  };
  
  const handleUpdateRequest = async (requestId: string, newStatus: 'Aprobado' | 'Rechazado') => {
    if (!userInfo || !isBoss) return;
    
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    try {
        await updateVacationRequest(requestId, { status: newStatus }, request.daysRequested);
        toast({ title: `Solicitud ${newStatus === 'Aprobado' ? 'aprobada' : 'rechazada'}` });
        
        fetchData();
    } catch (error) {
        console.error("Error updating license request:", error);
        toast({ title: 'Error al actualizar la solicitud', description: (error as Error).message, variant: 'destructive'});
    }
  };


  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Gestión de Licencias">
            {!isBoss && (
              <Button onClick={() => setIsFormOpen(true)}>
                <PlusCircle className="mr-2" />
                Solicitar Licencia
              </Button>
            )}
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <LicensesTable 
                requests={requests}
                isManagerView={isBoss}
                onUpdateRequest={handleUpdateRequest}
            />
        </main>
      </div>

      {userInfo && !isBoss && (
        <LicenseRequestFormDialog
            isOpen={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleCreateRequest}
            vacationDaysAvailable={userInfo.vacationDays || 0}
        />
      )}
    </>
  );
}
