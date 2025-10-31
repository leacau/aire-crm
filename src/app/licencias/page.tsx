
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { createVacationRequest, getVacationRequests, getAllUsers, deleteVacationRequest, updateVacationRequest } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { LicensesTable } from '@/components/licencias/licenses-table';
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

export default function LicenciasPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<VacationRequest | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<VacationRequest | null>(null);

  const canManage = isBoss || userInfo?.role === 'Administracion';

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedRequests, allUsers] = await Promise.all([
        getVacationRequests(userInfo),
        getAllUsers(),
      ]);
      setRequests(fetchedRequests);
      setUsers(allUsers);
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

  const handleSaveRequest = async (requestData: Omit<VacationRequest, 'id'>) => {
    if (!userInfo) return;

    try {
      const accessToken = await getGoogleAccessToken();
      const allUsers = await getAllUsers();
      const user = allUsers.find(u => u.id === requestData.userId);
      const manager = user?.managerId ? allUsers.find(u => u.id === user.managerId) : null;
      
      if (editingRequest) {
        // Update logic
        await updateVacationRequest(editingRequest.id, requestData, userInfo.id);
        toast({ title: "Solicitud de licencia actualizada" });
      } else {
        // Create logic
        if (!accessToken) throw new Error('No se pudo obtener el token para enviar el correo.');
        if (!manager?.email) throw new Error('El jefe asignado no tiene un email configurado.');

        await createVacationRequest(requestData, accessToken, manager.email);
        toast({ title: "Solicitud de licencia enviada", description: "Tu jefe ha sido notificado." });
      }
      
      fetchData();
      setIsFormOpen(false);
      setEditingRequest(null);

    } catch (error) {
      console.error("Error saving license request:", error);
      toast({ title: "Error al guardar la solicitud", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleUpdateRequestStatus = async (requestId: string, newStatus: 'Aprobado' | 'Rechazado') => {
      if (!userInfo || !canManage) return;

      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      try {
          const accessToken = await getGoogleAccessToken();
          if (!accessToken) throw new Error("No se pudo obtener el token para enviar el correo de aprobación.");
          
          await updateVacationRequest(requestId, { status: newStatus }, userInfo.id, accessToken);

          toast({ title: `Solicitud ${newStatus === 'Aprobado' ? 'aprobada' : 'rechazada'}` });
          fetchData();
      } catch (error) {
          console.error(`Error updating request to ${newStatus}:`, error);
          toast({ title: `Error al ${newStatus === 'Aprobado' ? 'aprobar' : 'rechazar'}`, description: (error as Error).message, variant: "destructive" });
      }
  };

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    try {
      await deleteVacationRequest(requestToDelete.id, userInfo!.id);
      toast({ title: 'Solicitud eliminada' });
      fetchData();
    } catch(error) {
       console.error("Error deleting request:", error);
       toast({ title: 'Error al eliminar', variant: 'destructive'});
    } finally {
        setRequestToDelete(null);
    }
  };
  
  const handleOpenForm = (req: VacationRequest | null = null) => {
    setEditingRequest(req);
    setIsFormOpen(true);
  };

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Gestión de Licencias">
              <Button onClick={() => handleOpenForm()}>
                <PlusCircle className="mr-2" />
                Solicitar Licencia
              </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <LicensesTable 
                requests={requests}
                currentUserId={userInfo!.id}
                canManage={canManage}
                onUpdateRequestStatus={handleUpdateRequestStatus}
                onEditRequest={handleOpenForm}
                onDeleteRequest={setRequestToDelete}
            />
        </main>
      </div>

      {userInfo && (
        <LicenseRequestFormDialog
            isOpen={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleSaveRequest}
            request={editingRequest}
            user={editingRequest ? users.find(u => u.id === editingRequest.userId) : userInfo}
            allUsers={users}
            canChangeUser={canManage}
        />
      )}
      
       <AlertDialog open={!!requestToDelete} onOpenChange={() => setRequestToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta solicitud?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción es irreversible y eliminará la solicitud de licencia de forma permanente.</AlertDialogDescription>
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
