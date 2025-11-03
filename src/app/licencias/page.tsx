
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { User, VacationRequest } from '@/lib/types';
import { getAllUsers, getVacationRequests, createVacationRequest, deleteVacationRequest, approveVacationRequest, updateVacationRequest } from '@/lib/firebase-service';
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
      
      if (isBoss) {
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
  }, [userInfo, toast, isBoss]);

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
      // When creating, the owner is the current user.
      setRequestOwner(userInfo);
    }
    setIsFormOpen(true);
  };
  
  const handleSaveRequest = async (requestData: Omit<VacationRequest, 'id' | 'status'>, isEditing: boolean) => {
    if (!userInfo) return false;
    
    // Find the manager to notify. If editing, it's the manager of the request owner. If creating, it's the current user's manager.
    const ownerOfRequest = users.find(u => u.id === requestData.userId);
    const managerToNotify = managers.find(m => m.id === ownerOfRequest?.managerId);

    if (!isEditing && !managerToNotify?.email) {
      toast({ title: 'Falta información del Jefe Directo', description: 'No se pudo encontrar el email de tu jefe directo para notificar. Pide a un gerente que lo asigne en la sección "Equipo".', variant: 'destructive' });
      return false;
    }

    try {
      if (isEditing && editingRequest) {
        await updateVacationRequest(editingRequest.id, requestData);
        toast({ title: 'Solicitud Actualizada' });
      } else {
        const accessToken = await getGoogleAccessToken();
        await createVacationRequest(requestData, managerToNotify!.email, accessToken);
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
      await approveVacationRequest(request.id, newStatus, userInfo.id, applicant.email, accessToken);
      
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
      await deleteVacationRequest(requestToDelete.id);
      toast({ title: 'Solicitud Eliminada' });
      fetchData();
    } catch(error) {
      console.error("Error deleting request:", error);
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setRequestToDelete(null);
    }
  };

  const requestsForCurrentUser = useMemo(() => {
    if (!requestOwner) return [];
    return requests.filter(r => r.userId === requestOwner.id);
  }, [requests, requestOwner]);


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
        allUserRequests={requestsForCurrentUser}
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
