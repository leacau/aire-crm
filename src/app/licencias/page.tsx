
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { createVacationRequest, getVacationRequests } from '@/lib/firebase-service';
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
      const accessToken = await getGoogleAccessToken();
      if (!accessToken) {
        toast({ title: 'Error de autenticación', description: 'No se pudo obtener el token para enviar el correo. Por favor, inicia sesión de nuevo.', variant: 'destructive' });
        return;
      }
      
      const fullRequestData: Omit<VacationRequest, 'id'> = {
        ...requestData,
        userId: userInfo.id,
        userName: userInfo.name,
        status: 'Pendiente' as const,
        requestDate: new Date().toISOString(),
      };

      await createVacationRequest(fullRequestData, accessToken);
      
      toast({ title: "Solicitud de licencia enviada por correo", description: "Tu solicitud ha sido enviada para su gestión." });
      
      // We don't refetch because the user doesn't create the document directly
      // onOpenChange(false);

    } catch (error) {
      console.error("Error creating license request:", error);
      toast({ title: "Error al enviar la solicitud", description: (error as Error).message, variant: "destructive" });
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
                onUpdateRequest={() => {}} // Management is now on Team page
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
