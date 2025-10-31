
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { createVacationRequest, updateVacationRequest, getAllUsers } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { LicensesTable } from '@/components/licencias/licenses-table';
import { sendEmail } from '@/lib/google-gmail-service';

export default function LicenciasPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [usersWithRequests, setUsersWithRequests] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsersWithRequests(fetchedUsers);
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

  const handleCreateRequest = async (requestData: Omit<VacationRequest, 'id' | 'userId' | 'userName' | 'status'>) => {
    if (!userInfo) return;

    try {
      const fullRequestData = {
        ...requestData,
        id: `vac_${Date.now()}`, // Generate a unique ID
        userId: userInfo.id,
        userName: userInfo.name,
        status: 'Pendiente' as const,
      };
      await createVacationRequest(userInfo.id, fullRequestData);
      toast({ title: "Solicitud de licencia enviada" });

      const accessToken = await getGoogleAccessToken();
      if (accessToken) {
         await sendEmail({
            accessToken,
            to: 'lchena@airedesantafe.com.ar',
            subject: `Nueva Solicitud de Licencia: ${userInfo.name}`,
            body: `
                <p>El asesor <strong>${userInfo.name}</strong> ha solicitado una licencia.</p>
                <p><strong>Período:</strong> ${requestData.startDate} al ${requestData.endDate}</p>
                <p><strong>Días solicitados:</strong> ${requestData.daysRequested}</p>
                <p>Puedes revisar la solicitud en el CRM.</p>
            `,
         });
      }

      fetchData();
    } catch (error) {
      console.error("Error creating license request:", error);
      toast({ title: "Error al enviar la solicitud", description: (error as Error).message, variant: "destructive" });
    }
  };
  
  const handleUpdateRequest = async (userId: string, requestId: string, newStatus: 'Aprobado' | 'Rechazado') => {
    if (!userInfo || !isBoss) return;
    
    const userToUpdate = usersWithRequests.find(u => u.id === userId);
    const request = userToUpdate?.vacationRequests?.find(r => r.id === requestId);
    if (!request) return;

    try {
        await updateVacationRequest(userId, requestId, { status: newStatus });
        toast({ title: `Solicitud ${newStatus === 'Aprobado' ? 'aprobada' : 'rechazada'}` });
        
        if (newStatus === 'Aprobado' && userToUpdate?.email) {
             const accessToken = await getGoogleAccessToken();
             if (accessToken) {
                 await sendEmail({
                    accessToken,
                    to: userToUpdate.email,
                    subject: 'Tu solicitud de licencia ha sido aprobada',
                    body: `
                        <p>Hola ${userToUpdate.name},</p>
                        <p>Tu solicitud de licencia para el período del <strong>${request.startDate}</strong> al <strong>${request.endDate}</strong> ha sido aprobada.</p>
                        <p>¡Que las disfrutes!</p>
                    `,
                 });
             }
        }
        
        fetchData();
    } catch (error) {
        console.error("Error updating license request:", error);
        toast({ title: 'Error al actualizar la solicitud', description: (error as Error).message, variant: 'destructive'});
    }
  };

  const allRequests = useMemo(() => {
    if (isBoss) {
      return usersWithRequests.flatMap(user => user.vacationRequests || []);
    }
    return userInfo?.vacationRequests || [];
  }, [usersWithRequests, userInfo, isBoss]);


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
                requests={allRequests}
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
