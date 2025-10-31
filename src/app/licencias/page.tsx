
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { getVacationRequests, createVacationRequest, updateVacationRequest, getAllUsers } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { LicensesTable } from '@/components/licencias/licenses-table';
import { sendEmail } from '@/lib/google-gmail-service';

export default function LicenciasPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedRequests, fetchedUsers] = await Promise.all([
        getVacationRequests(),
        getAllUsers(),
      ]);
      setRequests(fetchedRequests);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching license data:", error);
      toast({ title: "Error al cargar las solicitudes", variant: "destructive" });
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
        userId: userInfo.id,
        userName: userInfo.name,
        status: 'Pendiente' as const,
      };
      await createVacationRequest(fullRequestData);
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
      toast({ title: "Error al enviar la solicitud", variant: "destructive" });
    }
  };
  
  const handleUpdateRequest = async (requestId: string, newStatus: 'Aprobado' | 'Rechazado') => {
    if (!userInfo || !isBoss) return;
    
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    try {
        await updateVacationRequest(requestId, { status: newStatus }, request.daysRequested);
        toast({ title: `Solicitud ${newStatus === 'Aprobado' ? 'aprobada' : 'rechazada'}` });
        
        const advisor = users.find(u => u.id === request.userId);
        if (newStatus === 'Aprobado' && advisor?.email) {
             const accessToken = await getGoogleAccessToken();
             if (accessToken) {
                 await sendEmail({
                    accessToken,
                    to: advisor.email,
                    subject: 'Tu solicitud de licencia ha sido aprobada',
                    body: `
                        <p>Hola ${advisor.name},</p>
                        <p>Tu solicitud de licencia para el período del <strong>${request.startDate}</strong> al <strong>${request.endDate}</strong> ha sido aprobada.</p>
                        <p>¡Que las disfrutes!</p>
                    `,
                 });
             }
        }
        
        fetchData();
    } catch (error) {
        console.error("Error updating license request:", error);
        toast({ title: 'Error al actualizar la solicitud', variant: 'destructive'});
    }
  };


  const userRequests = useMemo(() => {
    if (!userInfo) return [];
    if (isBoss) return requests;
    return requests.filter(r => r.userId === userInfo.id);
  }, [requests, userInfo, isBoss]);


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
                requests={userRequests}
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

