

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { User, VacationRequest } from '@/lib/types';
import { getAllUsers, getVacationRequests, createVacationRequest, deleteVacationRequest, approveVacationRequest, addVacationDays } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle } from 'lucide-react';
import { LicensesTable } from '@/components/licencias/licenses-table';
import { LicenseRequestFormDialog } from '@/components/licencias/license-request-form-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { es } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { sendEmail } from '@/lib/google-gmail-service';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function LicensesPage() {
  const { userInfo, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysToAdd, setDaysToAdd] = useState<Record<string, string>>({});
  const [updatingDays, setUpdatingDays] = useState<Record<string, boolean>>({});

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<VacationRequest | null>(null);
  const [requestOwner, setRequestOwner] = useState<User | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<VacationRequest | null>(null);

  const managers = useMemo(() => users.filter(u => u.role === 'Jefe' || u.role === 'Gerencia'), [users]);
  const directReports = useMemo(() => users.filter(u => u.managerId === userInfo?.id), [users, userInfo?.id]);

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
      setRequestOwner(userInfo);
    }
    setIsFormOpen(true);
  };
  
  const handleSaveRequest = async (requestData: Omit<VacationRequest, 'id' | 'status'>, isEditing: boolean) => {
    if (!userInfo) return false;
    
    const ownerOfRequest = users.find(u => u.id === requestData.userId);
    const managerToNotify = managers.find(m => m.id === ownerOfRequest?.managerId);

    if (!isEditing && !managerToNotify?.email) {
      toast({ title: 'Falta información del Jefe Directo', description: 'No se pudo encontrar el email de tu jefe directo para notificar. Pide a un gerente que lo asigne en la sección "Equipo".', variant: 'destructive' });
      return false;
    }

    try {
      const { emailPayload } = await createVacationRequest(requestData, managerToNotify?.email || null);
      
      toast({ title: 'Solicitud Enviada', description: 'Tu jefe directo ha sido notificado.' });

      if (emailPayload) {
          getGoogleAccessToken().then(token => {
              if (token) {
                // Fire-and-forget email sending
                sendEmail({ ...emailPayload, accessToken: token }).catch(err => {
                    console.error("Failed to send creation email in background:", err);
                });
              }
          });
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
    if (!applicant) {
      toast({ title: 'Error', description: 'No se pudo encontrar al solicitante.', variant: 'destructive' });
      return;
    }
    
    try {
      const { emailPayload } = await approveVacationRequest(request.id, newStatus, userInfo.id, applicant.email);
      
      toast({ title: `Solicitud ${newStatus === 'Aprobado' ? 'aprobada' : 'rechazada'}` });
      
      if (emailPayload) {
          getGoogleAccessToken().then(token => {
              if (token) {
                 // Fire-and-forget email sending. If it fails, don't block the UI.
                 sendEmail({ ...emailPayload, accessToken: token }).catch(err => {
                       console.error("Failed to send approval email in background (non-critical):", err);
                 });
              }
          });
      }
      
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
    return requests.filter(r => r.userId === requestOwner.id && (r.status === 'Aprobado' || r.status === 'Pendiente'));
  }, [requests, requestOwner]);

  const handleAddVacationDays = async (userId: string) => {
    if (!userInfo) return;

    const value = Number(daysToAdd[userId]);
    if (Number.isNaN(value) || value <= 0) {
      toast({ title: 'Cantidad inválida', description: 'Ingresa un número mayor a cero para sumar días.', variant: 'destructive' });
      return;
    }

    setUpdatingDays(prev => ({ ...prev, [userId]: true }));
    try {
      await addVacationDays(userId, value, userInfo.id, userInfo.name);
      toast({ title: 'Días actualizados', description: `Se agregaron ${value} días de licencia.` });
      setDaysToAdd(prev => ({ ...prev, [userId]: '' }));
      fetchData();
    } catch (error) {
      console.error('Error al agregar días de licencia:', error);
      toast({ title: 'Error al agregar días', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setUpdatingDays(prev => ({ ...prev, [userId]: false }));
    }
  };

  const buildLicenseDocument = (
    request: VacationRequest,
    applicant: User | undefined,
    pendingDays: number | undefined,
    logoUrl: string
  ) => {
    const today = new Date();
    const todayFormatted = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
    const start = format(parseISO(request.startDate), 'P', { locale: es });
    console.log('requestday formated: ', format(parseISO(request.startDate), "dddd d 'de' MMMM 'de' yyyy", { locale: es }));
    const end = format(parseISO(request.endDate), 'P', { locale: es });
    const returnDate = format(parseISO(request.returnDate), 'P', { locale: es });
    const remaining = pendingDays ?? applicant?.vacationDays ?? 0;

    return `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 24px;">
        <div style="margin-top:32px; margin-bottom:32px; text-align:center;">
          <img src="${logoUrl}" alt="Aire de Santa Fe" style="max-width:340px; width:200px; height:auto;" />
        </div>
        <div style="text-align:right; margin-bottom:24px;">Santa Fé, ${todayFormatted}</div>
        <p>Estimado/a <strong>${request.userName}</strong></p>
        <p>Mediante la presente le informamos la autorización de la solicitud de <strong>${request.daysRequested}</strong> días de vacaciones.</p>
        <p>Del <strong>${start}</strong> al <strong>${end}</strong> de acuerdo con el período vacacional correspondiente al año actual.</p>
        <p>La fecha de reincorporación a la actividad laboral será el día <strong>${returnDate}</strong>.</p>
        <p>Quedarán <strong>${remaining}</strong> días pendientes de licencia ${today.getFullYear()}.</p>
        <p>Saludos cordiales.</p>
        <div style="display:flex; gap:64px; margin-top:48px; flex-wrap:wrap;">
          <span>Gte. de área</span>
          <span>Jefe de área</span>
          <span>Área de rrhh</span>
        </div>
        <p style="margin-top:48px;">Notificado: ____________________</p>
      </div>
    `;
  };

  const handlePrintDocument = (request: VacationRequest) => {
    const applicant = users.find((u) => u.id === request.userId);
    const pendingDays = applicant?.vacationDays;
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/aire-logo.svg` : '/aire-logo.svg';
    const html = buildLicenseDocument(request, applicant, pendingDays, logoUrl);
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (printWindow) {
      printWindow.document.write(`<!doctype html><html><head><title>Constancia de Licencia</title></head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
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
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
            {isBoss && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold">Días pendientes de tu equipo</h2>
                  <p className="text-sm text-muted-foreground">Visualiza y ajusta los saldos de licencias de tus subordinados directos.</p>
                </div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Días pendientes</TableHead>
                        <TableHead className="w-[260px]">Agregar días</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {directReports.length > 0 ? (
                        directReports.map(member => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">{member.name}</TableCell>
                            <TableCell>{member.role}</TableCell>
                            <TableCell>{member.vacationDays ?? 0}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={daysToAdd[member.id] ?? ''}
                                  onChange={(e) => setDaysToAdd(prev => ({ ...prev, [member.id]: e.target.value }))}
                                  placeholder="Cantidad"
                                  className="w-28"
                                />
                                <Button
                                  onClick={() => handleAddVacationDays(member.id)}
                                  disabled={updatingDays[member.id] === true}
                                  variant="outline"
                                >
                                  {updatingDays[member.id] ? 'Guardando...' : 'Sumar días'}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-16 text-center text-sm text-muted-foreground">
                            No tienes colaboradores directos asignados.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
            <section>
              <LicensesTable
                requests={requests}
                isManagerView={isBoss}
                onEdit={handleOpenForm}
                onDelete={setRequestToDelete}
                onUpdateRequest={handleUpdateRequest}
                onPrint={handlePrintDocument}
                currentUserId={userInfo.id}
              />
            </section>
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
