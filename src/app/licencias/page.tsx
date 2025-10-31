'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { User, VacationRequest } from '@/lib/types';
import { getAllUsers, getVacationRequests, createVacationRequest, updateVacationRequest, deleteVacationRequest, updateUserProfile } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle } from 'lucide-react';
import { LicensesTable } from '@/components/licencias/licenses-table';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function LicensesPage() {
  const { userInfo, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<VacationRequest | null>(null);
  const [requestOwner, setRequestOwner] = useState<User | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<VacationRequest | null>(null);

  const managers = useMemo(() => users.filter(u => u.role === 'Jefe' || u.role === 'Gerencia'), [users]);
  const userManager = useMemo(() => managers.find(m => m.id === userInfo?.managerId), [managers, userInfo]);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedUsers, fetchedRequests] = await Promise.all([
        getAllUsers(),
        getVacationRequests(),
      ]);
      setUsers(fetchedUsers);

      // App-level filtering based on role
      if (userInfo.role === 'Jefe' || userInfo.role === 'Gerencia' || userInfo.role === 'Admin') {
          setRequests(fetchedRequests);
      } else {
          setRequests(fetchedRequests.filter(r => r.userId === userInfo.id));
      }
    } catch (error) {
      console.error("Error fetching license data:", error);
      toast({ title: 'Error al cargar solicitudes', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [userInfo, toast]);

  useEffect(() => {
    if (userInfo) {
      fetchData();
    }
  }, [userInfo, fetchData]);
  
  const handleOpenForm = (request: VacationRequest | null = null) => {
    setEditingRequest(request);
    if (request) {
      const owner = users.find(u => u.id === request.userId);
      setRequestOwner(owner || null);
    } else {
      setRequestOwner(null);
    }
    setIsFormOpen(true);
  };
  
  const handleSaveRequest = async (requestData: Omit<VacationRequest, 'id' | 'status'>, isEditing: boolean) => {
    if (!userInfo) return false;
    
    // Find the manager to notify. If editing, it's the manager of the request owner. If creating, it's the current user's manager.
    const ownerOfRequest = users.find(u => u.id === requestData.userId);
    const managerToNotify = managers.find(m => m.id === ownerOfRequest?.managerId);

    if (!managerToNotify?.email) {
      toast({ title: 'Falta información', description: 'No se pudo encontrar el email del jefe directo para notificar. Contacta a un administrador.', variant: 'destructive' });
      return false;
    }

    try {
      const accessToken = await getGoogleAccessToken();
      if (!accessToken) throw new Error("No se pudo obtener el token de acceso.");
      
      if (isEditing && editingRequest) {
        await updateVacationRequest(editingRequest.id, requestData, userInfo.id, managerToNotify.email, accessToken);
        toast({ title: 'Solicitud Actualizada' });
      } else {
        await createVacationRequest(requestData, userInfo.id, userInfo.name, managerToNotify.email, accessToken);
        toast({ title: 'Solicitud Enviada', description: 'Tu jefe directo ha sido notificado.' });
      }
      fetchData();
      return true;
    } catch (error) {
      console.error("Error saving license request:", error);
      toast({ title: 'Error al guardar la solicitud', variant: 'destructive', description: (error as Error).message });
      return false;
    }
  };

  const handleUpdateRequest = async (request: VacationRequest, newStatus: 'Aprobado' | 'Rechazado') => {
    if (!userInfo || !isBoss) return;
    
    const applicant = users.find(u => u.id === request.userId);
    if (!applicant?.email) {
      toast({ title: 'Error', description: 'No se pudo encontrar el email del solicitante.', variant: 'destructive' });
      return;
    }
    
    try {
      const accessToken = await getGoogleAccessToken();
      if (!accessToken) throw new Error("No se pudo obtener el token de acceso.");

      await updateVacationRequest(request.id, { status: newStatus }, userInfo.id, applicant.email, accessToken);
      
      if (newStatus === 'Aprobado') {
        const remainingDays = (applicant.vacationDays || 0) - request.daysRequested;
        await updateUserProfile(applicant.id, { vacationDays: remainingDays });
      }
      
      toast({ title: `Solicitud ${newStatus}` });
      fetchData();
    } catch (error) {
       console.error("Error updating request status:", error);
      toast({ title: 'Error al actualizar', variant: 'destructive', description: (error as Error).message });
    }
  };
  
  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    try {
      await deleteVacationRequest(requestToDelete.id, userInfo!.id, userInfo!.name);
      toast({ title: 'Solicitud Eliminada' });
      fetchData();
    } catch(error) {
      console.error("Error deleting request:", error);
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setRequestToDelete(null);
    }
  };


  if (loading || !userInfo) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Gestión de Licencias">
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nueva Solicitud
          </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <LicensesTable
              requests={requests}
              isManagerView={isBoss}
              onEdit={handleOpenForm}
              onDelete={setRequestToDelete}
              onUpdateRequest={handleUpdateRequest}
              currentUserId={userInfo.id}
            />
        </main>
      </div>

      <LicenseRequestFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveRequest}
        request={editingRequest}
        currentUser={userInfo}
        requestOwner={requestOwner}
      />
      
      <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro de eliminar esta solicitud?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción no se puede deshacer.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteRequest} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
