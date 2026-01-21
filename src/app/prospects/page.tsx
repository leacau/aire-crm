'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle, UserPlus, MoreHorizontal, Trash2, FolderX, Search, Activity, Clock, Bell, Hand, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Prospect, User, Client, ClientActivity } from '@/lib/types';
import { 
    getProspects, 
    createProspect, 
    updateProspect, 
    deleteProspect, 
    getAllUsers, 
    getAllClientActivities, 
    getOpportunityAlertsConfig, 
    recordProspectNotifications,
    getCoachingSessions,
    createCoachingSession,
    addItemsToSession,
    // NUEVOS IMPORTS
    claimProspect, 
    approveProspectClaim, 
    rejectProspectClaim
} from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, differenceInDays, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendEmail } from '@/lib/google-gmail-service';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ProspectFormDialog } from '@/components/prospects/prospect-form-dialog';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ActivityFormDialog } from '@/components/clients/activity-form-dialog';
import { useRouter, useSearchParams } from 'next/navigation';


export default function ProspectsPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [prospectVisibilityDays, setProspectVisibilityDays] = useState<number>(0);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  
  const [isConverting, setIsConverting] = useState(false);
  const [prospectToConvert, setProspectToConvert] = useState<Prospect | null>(null);
  
  const [prospectToDelete, setProspectToDelete] = useState<Prospect | null>(null);
  const [prospectToArchive, setProspectToArchive] = useState<Prospect | null>(null);
  const [sorting, setSorting] = useState<SortingState>([ { id: 'lastActivity', desc: true } ]);
  const [activitySectionRef, setActivitySectionRef] = useState<React.RefObject<HTMLDivElement> | null>(null);

  const [selectedAdvisor, setSelectedAdvisor] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyMyProspects, setShowOnlyMyProspects] = useState(!isBoss);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  
  const [isActivityFormOpen, setIsActivityFormOpen] = useState(false);
  const [selectedProspectForActivity, setSelectedProspectForActivity] = useState<Prospect | null>(null);
  const hasConsumedProspectQuery = useRef(false);
  
  useEffect(() => {
    if (userInfo) {
      setShowOnlyMyProspects(!isBoss);
    }
  }, [isBoss, userInfo]);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const allowedOwnerRoles = ['Asesor', 'Jefe', 'Gerencia', 'Administracion'];
      const [fetchedProspects, fetchedUsers, allActivities, alertsConfig] = await Promise.all([
        getProspects(),
        getAllUsers(),
        getAllClientActivities(),
        getOpportunityAlertsConfig()
      ]);
      setProspects(fetchedProspects);
      setUsers(fetchedUsers.filter(u => allowedOwnerRoles.includes(u.role)));
      setActivities(allActivities.filter(a => a.prospectId));
      setProspectVisibilityDays(alertsConfig.prospectVisibilityDays ?? 0);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar los prospectos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo]);

  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchData();
    }
  }, [authLoading, userInfo, fetchData]);

  const handleOpenForm = useCallback((prospect: Prospect | null = null, scrollToActivities = false) => {
    setSelectedProspect(prospect);
    if(scrollToActivities) {
        const ref = React.createRef<HTMLDivElement>();
        setActivitySectionRef(ref);
    } else {
        setActivitySectionRef(null);
    }
    setIsFormOpen(true);
  }, []);

  useEffect(() => {
    if (hasConsumedProspectQuery.current) return;
    const prospectId = searchParams.get('prospectId');
    if (!prospectId) return;
    if (prospects.length === 0) return;
    const targetProspect = prospects.find(prospect => prospect.id === prospectId);
    if (!targetProspect) return;
    handleOpenForm(targetProspect);
    hasConsumedProspectQuery.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('prospectId');
    const query = params.toString();
    router.replace(query ? `/prospects?${query}` : '/prospects', { scroll: false });
  }, [prospects, searchParams, router, handleOpenForm]);

  const handleSaveProspect = async (
      prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>, 
      addToCoaching: boolean, 
      coachingNote: string
  ) => {
    if (!userInfo) return;
    try {
      let prospectId = selectedProspect?.id;
      let prospectName = prospectData.companyName;

      if (selectedProspect) {
        await updateProspect(selectedProspect.id, prospectData, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Actualizado" });
      } else {
        prospectId = await createProspect(prospectData, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Creado" });
      }

      if (addToCoaching && prospectId) {
          try {
              const sessions = await getCoachingSessions(userInfo.id);
              let openSession = sessions.find(s => s.status === 'Open');

              if (!openSession) {
                  const newSessionId = await createCoachingSession({
                      advisorId: userInfo.id,
                      advisorName: userInfo.name,
                      managerId: userInfo.managerId || userInfo.id, 
                      managerName: 'Jefatura', 
                      date: new Date().toISOString(),
                      items: [],
                      generalNotes: ''
                  }, userInfo.id, userInfo.name);
                  openSession = { id: newSessionId } as any;
              }

              if (openSession) {
                  await addItemsToSession(openSession.id, [{
                      id: '', 
                      taskId: '', 
                      originalCreatedAt: new Date().toISOString(),
                      entityType: 'prospect',
                      entityId: prospectId,
                      entityName: prospectName,
                      action: coachingNote || 'Ingreso de nuevo prospecto', 
                      status: 'Pendiente',
                      advisorNotes: '', 
                      origin: 'advisor' 
                  }]);
                  toast({ title: "Agregado al seguimiento", description: "El prospecto se sumó a tu hoja de ruta semanal." });
              }
          } catch (coachingError) {
              console.error("Error adding to coaching:", coachingError);
              toast({ title: "Error parcial", description: "Se guardó el prospecto pero falló al agregarlo al seguimiento.", variant: "destructive" });
          }
      }

      fetchData();
    } catch (error) {
      console.error("Error saving prospect:", error);
      toast({ title: "Error al guardar el prospecto", variant: "destructive" });
    }
  };

  const handleDeleteProspect = async () => {
    if (!prospectToDelete || !userInfo) return;
    try {
      await deleteProspect(prospectToDelete.id, userInfo.id, userInfo.name);
      toast({ title: "Prospecto Eliminado" });
      fetchData();
    } catch (error) {
      console.error("Error deleting prospect:", error);
      toast({ title: "Error al eliminar", variant: "destructive" });
    } finally {
      setProspectToDelete(null);
    }
  };

  const handleConvertProspect = (prospect: Prospect) => {
    setProspectToConvert(prospect);
    setIsConverting(true);
  };
  
  const handleClientCreatedFromProspect = async () => {
    if (prospectToConvert && userInfo) {
      try {
        await updateProspect(prospectToConvert.id, { status: 'Convertido', statusChangedAt: new Date().toISOString() }, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Convertido", description: `${prospectToConvert.companyName} ahora es un cliente.`});
        fetchData();
      } catch (error) {
        console.error("Error updating prospect status:", error);
        toast({ title: "Error al actualizar el estado del prospecto", variant: "destructive" });
      } finally {
        setIsConverting(false);
        setProspectToConvert(null);
      }
    }
  };

  const handleArchiveProspect = async () => {
    if (!prospectToArchive || !userInfo) return;
    try {
      await updateProspect(prospectToArchive.id, { status: 'No Próspero', statusChangedAt: new Date().toISOString() }, userInfo.id, userInfo.name);
      toast({ title: "Prospecto Archivado" });
      fetchData();
    } catch (error) {
      console.error("Error archiving prospect:", error);
      toast({ title: "Error al archivar", variant: "destructive" });
    } finally {
      setProspectToArchive(null);
    }
  };

  const handleClaim = async (prospect: Prospect) => {
      if (!userInfo) return;
      try {
          await claimProspect(prospect, userInfo.id, userInfo.name);
          toast({ title: "Reclamo enviado", description: "Un gerente deberá aprobar tu solicitud." });
          fetchData();
      } catch (error) {
          toast({ title: "No puedes reclamar aún", description: (error as Error).message, variant: "destructive" });
      }
  };

  const handleApproveClaim = async (prospect: Prospect) => {
      if (!userInfo) return;
      try {
          await approveProspectClaim(prospect, userInfo.id, userInfo.name);
          toast({ title: "Reclamo Aprobado", description: `Prospecto asignado a ${prospect.claimantName}` });
          fetchData();
      } catch (error) {
          console.error(error);
          toast({ title: "Error", variant: "destructive" });
      }
  };

  const handleRejectClaim = async (prospect: Prospect) => {
      if (!userInfo) return;
      try {
          await rejectProspectClaim(prospect, userInfo.id, userInfo.name);
          toast({ title: "Reclamo Rechazado" });
          fetchData();
      } catch (error) {
          console.error(error);
           toast({ title: "Error", variant: "destructive" });
      }
  };

   const handleOpenActivityForm = (prospect: Prospect) => {
    setSelectedProspectForActivity(prospect);
    setIsActivityFormOpen(true);
  };

  const advisorsWithProspects = useMemo(() => {
    if (!isBoss) return [];
    const advisorIdsWithProspects = new Set(prospects.map(p => p.ownerId));
    return users.filter(user => advisorIdsWithProspects.has(user.id));
  }, [prospects, users, isBoss]);
  
  const activitiesByProspectId = useMemo(() => {
    const grouped = activities.reduce((acc, activity) => {
      if (activity.prospectId) {
        if (!acc[activity.prospectId]) {
          acc[activity.prospectId] = [];
        }
        acc[activity.prospectId].push(activity);
      }
      return acc;
    }, {} as Record<string, ClientActivity[]>);

    Object.keys(grouped).forEach(prospectId => {
      grouped[prospectId].sort((a, b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime());
    });

    return grouped;
  }, [activities]);

  const lastActivityByProspectId = useMemo(() => {
    const result: Record<string, Date> = {};
    prospects.forEach(prospect => {
      const prospectActivities = activitiesByProspectId[prospect.id] || [];
      if (prospectActivities.length > 0) {
        result[prospect.id] = parseISO(prospectActivities[0].timestamp);
      } else {
        try {
          result[prospect.id] = parseISO(prospect.createdAt);
        } catch (error) {
        }
      }
    });
    return result;
  }, [prospects, activitiesByProspectId]);

  const isProspectHidden = useCallback((prospect: Prospect) => {
    if (!prospectVisibilityDays || prospectVisibilityDays <= 0) return false;
    if (prospect.status === 'Convertido' || prospect.status === 'No Próspero') return false;
    const lastActivityDate = lastActivityByProspectId[prospect.id];
    if (!lastActivityDate) return false;
    return differenceInDays(new Date(), lastActivityDate) >= prospectVisibilityDays;
  }, [lastActivityByProspectId, prospectVisibilityDays]);

  const usersById = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, User>);
  }, [users]);

  // --- FILTRADO DE PROSPECTOS ---
  const filteredProspects = useMemo(() => {
    if (!userInfo || !userInfo.id) {
      return { active: [], notProsperous: [], converted: [], hidden: [], unassigned: [], pendingClaims: [] };
    }

    // 1. "Bolsa" (Sin Asignar) - Visible para todos sin filtros de asesor
    const unassigned = prospects.filter(p => !p.ownerId && p.status !== 'Convertido' && p.status !== 'No Próspero');
    
    // 2. Pendientes de aprobación (Solo para jefes)
    const pendingClaims = unassigned.filter(p => p.claimStatus === 'Pendiente');

    // 3. Prospectos con dueño (Activos)
    let userProspects = prospects.filter(p => !!p.ownerId);

    if (showOnlyMyProspects) {
        userProspects = userProspects.filter(p => p.ownerId === userInfo.id);
    } else if (isBoss && selectedAdvisor !== 'all') {
        userProspects = userProspects.filter(p => p.ownerId === selectedAdvisor);
    }

    if (searchTerm.length >= 3) {
      const lowercasedFilter = searchTerm.toLowerCase();
      const textFilter = (p: Prospect) => 
        p.companyName.toLowerCase().includes(lowercasedFilter) ||
        p.contactName?.toLowerCase().includes(lowercasedFilter) ||
        p.contactPhone?.toLowerCase().includes(lowercasedFilter) ||
        p.contactEmail?.toLowerCase().includes(lowercasedFilter);
      
      userProspects = userProspects.filter(textFilter);
      // Opcional: filtrar también bolsa con buscador
      unassigned = unassigned.filter(textFilter);
    }

    const isActive = (p: Prospect) => p.status !== 'Convertido' && p.status !== 'No Próspero';
    const hidden = userProspects.filter(p => isActive(p) && isProspectHidden(p));

    return {
      active: userProspects.filter(p => isActive(p) && !isProspectHidden(p)),
      notProsperous: userProspects.filter(p => p.status === 'No Próspero'),
      converted: userProspects.filter(p => p.status === 'Convertido'),
      hidden,
      unassigned,
      pendingClaims
    };
  }, [prospects, userInfo, isBoss, selectedAdvisor, searchTerm, showOnlyMyProspects, isProspectHidden]);


  // --- COLUMNAS ---
  
  const columns = useMemo<ColumnDef<Prospect>[]>(() => [
    {
      accessorKey: 'companyName',
      header: 'Empresa',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.companyName}</div>
          <div className="text-xs text-muted-foreground">{row.original.ownerName}</div>
        </div>
      )
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      enableSorting: true,
      cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
    },
    {
      accessorKey: 'sector',
      header: 'Sector / Rubro',
      enableSorting: true,
      cell: ({ row }) => row.original.sector || '-',
    },
    {
      id: 'lastActivity',
      header: 'Última Actividad',
      accessorFn: (row) => {
        const prospectActivities = activitiesByProspectId[row.id] || [];
        return prospectActivities[0]?.timestamp ?? null;
      },
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue<string | null>(columnId);
        const b = rowB.getValue<string | null>(columnId);
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      },
      enableSorting: true,
      size: 150,
      cell: ({ row }) => {
        const prospectActivities = activitiesByProspectId[row.original.id] || [];
        if (prospectActivities.length === 0) {
          return <span className="text-xs text-muted-foreground">Sin actividad</span>;
        }
        const lastActivityDate = parseISO(prospectActivities[0].timestamp);
        const daysAgo = differenceInDays(new Date(), lastActivityDate);
        return (
          <div 
            className="flex items-center gap-1 cursor-pointer text-primary hover:underline"
            onClick={(e) => { e.stopPropagation(); handleOpenForm(row.original, true);}}
          >
            <Clock className="h-3 w-3" />
            <span className="text-sm font-medium">{daysAgo} día(s)</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Creado',
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue<string | null>(columnId);
        const b = rowB.getValue<string | null>(columnId);
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      },
      enableSorting: true,
      cell: ({ row }) => (
          <div>
            <div>{format(new Date(row.original.createdAt), 'P', { locale: es })}</div>
            {row.original.creatorName && (
                <div className="text-[10px] text-muted-foreground">Por: {row.original.creatorName}</div>
            )}
          </div>
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const prospect = row.original;
        const canEdit = isBoss || userInfo?.id === prospect.ownerId;
        if (!canEdit) return null;

        return (
          <div className="flex items-center justify-end gap-2">
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenActivityForm(prospect); }}>
                <Activity className="h-4 w-4" />
            </Button>
            {prospect.status !== 'Convertido' && (
               <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleConvertProspect(prospect); }}>
                <UserPlus className="mr-2 h-4 w-4" />
                Convertir
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {prospect.status !== 'Convertido' &&
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenForm(prospect); }}>
                    Editar
                  </DropdownMenuItem>
                }
                {prospect.status !== 'No Próspero' && prospect.status !== 'Convertido' &&
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setProspectToArchive(prospect); }}>
                        <FolderX className="mr-2 h-4 w-4" />
                        No Próspero
                    </DropdownMenuItem>
                }
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); setProspectToDelete(prospect); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [handleOpenForm, isBoss, userInfo, activitiesByProspectId]);


  const unassignedColumns = useMemo<ColumnDef<Prospect>[]>(() => [
    {
      accessorKey: 'companyName',
      header: 'Empresa',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.companyName}</div>
          {row.original.previousOwnerId && row.original.previousOwnerId === userInfo?.id && (
             <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                 <AlertTriangle className="h-3 w-3" /> Eras el dueño
             </span>
          )}
        </div>
      )
    },
    {
      accessorKey: 'sector',
      header: 'Rubro',
    },
    {
        id: 'status',
        header: 'Estado Reclamo',
        enableSorting: true,
        cell: ({ row }) => {
            const p = row.original;
            if (p.claimStatus === 'Pendiente') {
                return (
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        Pedido por {p.claimantId === userInfo?.id ? 'Ti' : p.claimantName}
                    </Badge>
                );
            }
            return <Badge variant="secondary">Disponible</Badge>;
        }
    },
    {
        id: 'actions',
        header: 'Acción',
        cell: ({ row }) => {
            const p = row.original;
            
            let isBlocked = false;
            let daysRemaining = 0;
            
            if (p.previousOwnerId === userInfo?.id && p.unassignedAt) {
                const unassignedDate = typeof p.unassignedAt === 'string' ? parseISO(p.unassignedAt) : new Date(p.unassignedAt as any);
                const daysPassed = differenceInCalendarDays(new Date(), unassignedDate);
                if (daysPassed < 3) {
                    isBlocked = true;
                    daysRemaining = 3 - daysPassed;
                }
            }

            if (p.claimStatus === 'Pendiente') {
                return <span className="text-xs text-muted-foreground">Esperando aprobación...</span>
            }

            return (
                <Button 
                    size="sm" 
                    variant={isBlocked ? "ghost" : "default"}
                    className={isBlocked ? "text-muted-foreground opacity-50" : ""}
                    disabled={isBlocked}
                    onClick={(e) => { e.stopPropagation(); handleClaim(p); }}
                >
                    <Hand className="mr-2 h-4 w-4" />
                    {isBlocked ? `Espera ${daysRemaining}d` : 'Reclamar'}
                </Button>
            );
        }
    }
  ], [userInfo, handleClaim]);


  const approvalsColumns = useMemo<ColumnDef<Prospect>[]>(() => [
      {
          accessorKey: 'companyName',
          header: 'Empresa',
          enableSorting: true,
      },
      {
          header: 'Solicitante',
          accessorKey: 'claimantName',
          enableSorting: true,
          cell: ({ row }) => <span className="font-semibold">{row.original.claimantName}</span>
      },
      {
          header: 'Acciones',
          id: 'actions',
          cell: ({ row }) => (
              <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveClaim(row.original)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleRejectClaim(row.original)}>
                      <XCircle className="h-4 w-4 mr-1" /> Rechazar
                  </Button>
              </div>
          )
      }
  ], []);


  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  const selectedProspectActivities = selectedProspect ? activitiesByProspectId[selectedProspect.id] || [] : [];

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Prospectos">
          <div className="relative ml-auto flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar prospectos..."
                className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[330px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor} disabled={showOnlyMyProspects}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {advisorsWithProspects.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center space-x-2">
            <Checkbox id="my-prospects" name="my-prospects" checked={showOnlyMyProspects} onCheckedChange={(checked) => setShowOnlyMyProspects(!!checked)} />
            <Label htmlFor="my-prospects" className="whitespace-nowrap text-sm font-medium">Solo mis prospectos</Label>
          </div>
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nuevo Prospecto
          </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <Tabs defaultValue="active" className="space-y-4">
                <TabsList className={`grid w-full ${isBoss ? 'grid-cols-6' : 'grid-cols-4'}`}>
                    <TabsTrigger value="active">Activos ({filteredProspects.active.length})</TabsTrigger>
                    
                    <TabsTrigger value="unassigned" className="relative">
                        Bolsa
                        {filteredProspects.unassigned.length > 0 && <Badge className="ml-2 h-5 w-5 p-0 flex justify-center items-center rounded-full">{filteredProspects.unassigned.length}</Badge>}
                    </TabsTrigger>
                    
                    {isBoss && (
                        <TabsTrigger value="approvals" className="relative text-orange-600 data-[state=active]:text-orange-700">
                            Solicitudes
                            {filteredProspects.pendingClaims.length > 0 && <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex justify-center items-center rounded-full animate-pulse">{filteredProspects.pendingClaims.length}</Badge>}
                        </TabsTrigger>
                    )}

                    <TabsTrigger value="not-prosperous">No Prósperos ({filteredProspects.notProsperous.length})</TabsTrigger>
                    <TabsTrigger value="converted">Convertidos ({filteredProspects.converted.length})</TabsTrigger>
                    {isBoss && (
                      <TabsTrigger value="hidden">Invisibles ({filteredProspects.hidden.length})</TabsTrigger>
                    )}
                </TabsList>
                
                <TabsContent value="active">
                    <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.active}
                        sorting={sorting}
                        setSorting={setSorting}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        getRowId={(row) => row.id}
                        enableRowResizing={true}
                        emptyStateMessage="No se encontraron prospectos activos."
                    />
                </TabsContent>
                
                <TabsContent value="unassigned">
                     <div className="p-4 bg-muted/20 rounded-md mb-4 border border-dashed">
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Hand className="h-4 w-4" />
                            Estos prospectos no tienen dueño. Puedes reclamarlos para tu cartera. Si fuiste el dueño anterior, debes esperar 3 días desde su liberación.
                        </p>
                     </div>
                     <ResizableDataTable
                        sorting={sorting}
                        setSorting={setSorting}
                        columns={unassignedColumns}
                        data={filteredProspects.unassigned}
                        getRowId={(row) => row.id}
                        emptyStateMessage="No hay prospectos disponibles en la bolsa."
                    />
                </TabsContent>

                {isBoss && (
                    <TabsContent value="approvals">
                         <div className="p-4 bg-orange-50 rounded-md mb-4 border border-orange-100">
                            <p className="text-sm text-orange-800 font-medium">
                                Asesores solicitando recuperar o tomar prospectos libres.
                            </p>
                         </div>
                         <ResizableDataTable
                            sorting={sorting}
                            setSorting={setSorting}
                            columns={approvalsColumns}
                            data={filteredProspects.pendingClaims}
                            getRowId={(row) => row.id}
                            emptyStateMessage="No hay solicitudes pendientes."
                        />
                    </TabsContent>
                )}

                <TabsContent value="not-prosperous">
                     <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.notProsperous}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        getRowId={(row) => row.id}
                        enableRowResizing={true}
                        emptyStateMessage="No hay prospectos en esta categoría."
                        sorting={sorting}
                        setSorting={setSorting}
                    />
                </TabsContent>
                 <TabsContent value="converted">
                     <ResizableDataTable
                        sorting={sorting}
                        setSorting={setSorting}
                        columns={columns}
                        data={filteredProspects.converted}
                        getRowId={(row) => row.id}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        enableRowResizing={true}
                        emptyStateMessage="No hay prospectos convertidos."
                    />
                </TabsContent>
                {isBoss && (
                  <TabsContent value="hidden">
                    <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.hidden}
                        sorting={sorting}
                        setSorting={setSorting}
                        onRowClick={handleOpenForm}
                        getRowId={(row) => row.id}
                        enableRowResizing={true}
                        emptyStateMessage="Sin prospectos invisibles." 
                    />
                  </TabsContent>
                )}
            </Tabs>
        </main>
      </div>

      <ProspectFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveProspect}
        prospect={selectedProspect}
        activities={selectedProspectActivities}
        activitySectionRef={activitySectionRef || undefined}
      />
      
      {prospectToConvert && (
         <ClientFormDialog
            isOpen={isConverting}
            onOpenChange={setIsConverting}
            onSaveSuccess={handleClientCreatedFromProspect}
            client={{
              denominacion: prospectToConvert.companyName,
              razonSocial: prospectToConvert.companyName,
              email: prospectToConvert.contactEmail || '',
              phone: prospectToConvert.contactPhone || '',
              observaciones: prospectToConvert.notes || '',
              ownerId: prospectToConvert.ownerId,
              ownerName: prospectToConvert.ownerName,
            } as Partial<Client>}
            onValidateCuit={async () => false} 
        />
      )}

      {selectedProspectForActivity && userInfo && (
        <ActivityFormDialog
            isOpen={isActivityFormOpen}
            onOpenChange={setIsActivityFormOpen}
            entity={{ id: selectedProspectForActivity.id, name: selectedProspectForActivity.companyName, type: 'prospect' }}
            userInfo={userInfo}
            getGoogleAccessToken={getGoogleAccessToken}
            entityOwner={usersById[selectedProspectForActivity.ownerId]}
            onActivitySaved={() => fetchData()}
        />
      )}

      <AlertDialog open={!!prospectToDelete} onOpenChange={(open) => !open && setProspectToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro de eliminar este prospecto?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente a "{prospectToDelete?.companyName}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProspect} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <AlertDialog open={!!prospectToArchive} onOpenChange={(open) => !open && setProspectToArchive(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Marcar como "No Próspero"?</AlertDialogTitle>
                <AlertDialogDescription>
                    Se moverá a "{prospectToArchive?.companyName}" a la pestaña de "No Prósperos". Podrás reactivarlo o convertirlo en cliente más adelante.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleArchiveProspect}>
                    Confirmar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
