'use client';

import {
  opportunityStages,
} from '@/lib/data';
import type { Opportunity, OpportunityStage, Client, User } from '@/lib/types';
import { MoreHorizontal, FileCheck2, TrendingUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { OpportunityDetailsDialog } from './opportunity-details-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getOpportunities, updateOpportunity, getClients, getUserProfile } from '@/lib/firebase-service'; // 🟢 Usamos la rápida
import { invalidateCache } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, addMonths, startOfMonth, parseISO, isSameMonth, endOfMonth, format } from 'date-fns';
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
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { es } from 'date-fns/locale';
import { Label } from '../ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

type KanbanStage = OpportunityStage | 'Negociación Alta' | 'Ganado (Recurrente)';

const HIGH_PROBABILITY_STAGE: KanbanStage = 'Negociación Alta';

const stageColors: Record<KanbanStage, string> = {
  'Nuevo': 'border-blue-500',
  'Propuesta': 'border-yellow-500',
  'Negociación': 'border-orange-500',
  'Negociación Alta': 'border-emerald-500',
  'Negociación a Aprobar': 'border-purple-500',
  'Cerrado - Ganado': 'border-green-500',
  'Ganado (Recurrente)': 'border-teal-500',
  'Cerrado - Perdido': 'border-red-500',
  'Cerrado - No Definido': 'border-gray-500',
};

const getPeriodDurationInMonths = (period: string): number => {
    switch (period) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 1;
    }
}

type ContractPeriod = {
  startDate: Date;
  endDate: Date;
};

const parseOpportunityDate = (value?: string): Date | null => {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getContractPeriods = (opportunity: Opportunity): ContractPeriod[] => {
  const rawPeriods = [
    ...(opportunity.startDate && opportunity.endDate
      ? [{ startDate: opportunity.startDate, endDate: opportunity.endDate }]
      : []),
    ...(opportunity.periodHistory || []),
  ];
  const finalizationDate = parseOpportunityDate(opportunity.finalizationDate);

  return rawPeriods.flatMap(period => {
    const startDate = parseOpportunityDate(period.startDate);
    const originalEndDate = parseOpportunityDate(period.endDate);
    if (!startDate || !originalEndDate || originalEndDate < startDate) return [];

    const endDate = finalizationDate && finalizationDate < originalEndDate
      ? finalizationDate
      : originalEndDate;

    return endDate >= startDate ? [{ startDate, endDate }] : [];
  });
};

const getContractPeriodForMonth = (opportunity: Opportunity, month: Date): ContractPeriod | null => {
  const filterMonth = startOfMonth(month);

  return getContractPeriods(opportunity).find(period => (
    filterMonth >= startOfMonth(period.startDate)
    && filterMonth <= startOfMonth(period.endDate)
  )) || null;
};

const getLegacyWonReferenceDate = (opportunity: Opportunity): Date | null => (
  parseOpportunityDate(opportunity.manualUpdateDate)
  || parseOpportunityDate(opportunity.closeDate)
);

interface KanbanBoardProps {
  dateRange?: DateRange;
  selectedAdvisor: string;
  selectedClient: string;
  onClientListChange: (clients: { id: string; name: string }[]) => void;
  focusedOpportunityId?: string;
  onFocusedOpportunityHandled?: () => void;
}

const KanbanColumn = ({
  stage,
  opportunities,
  onCardDrop,
  total,
  focusedOpportunityId,
  onFocusedOpportunityHandled,
}: {
  stage: KanbanStage;
  opportunities: Opportunity[];
  onCardDrop: (e: React.DragEvent<HTMLDivElement>, stage: OpportunityStage, highCloseProbability?: boolean) => void;
  total?: number;
  focusedOpportunityId?: string;
  onFocusedOpportunityHandled?: () => void;
}) => {
  const columnTotal = total ?? opportunities.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
  const roundedTotal = Math.round(columnTotal * 100) / 100;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if(stage === 'Ganado (Recurrente)') return;

    if (stage === HIGH_PROBABILITY_STAGE) {
        onCardDrop(e, 'Negociación', true);
    } else {
        onCardDrop(e, stage, false);
    }
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, oppId: string) => {
    e.dataTransfer.setData('opportunityId', oppId);
  };

  return (
    <div
      className="flex flex-col w-80 shrink-0"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between p-2 mb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{stage}</h2>
          <Badge variant="secondary">{opportunities.length}</Badge>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          ${roundedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div
        className={`flex-1 space-y-3 p-2 rounded-lg bg-secondary/50 border-t-4 ${stageColors[stage]}`}
      >
        {opportunities.map((opp) => (
          <KanbanCard
            key={opp.id}
            opportunity={opp}
            onDragStart={(e) => handleDragStart(e, opp.id)}
            focusedOpportunityId={focusedOpportunityId}
            onFocusedOpportunityHandled={onFocusedOpportunityHandled}
          />
        ))}
        {opportunities.length === 0 && (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                No hay oportunidades
            </div>
        )}
      </div>
    </div>
  );
};

const KanbanCard = ({
  opportunity,
  onDragStart,
  focusedOpportunityId,
  onFocusedOpportunityHandled,
}: {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  focusedOpportunityId?: string;
  onFocusedOpportunityHandled?: () => void;
}) => {
  const { userInfo } = useAuth();
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen] = React.useState(false);
  const { toast } = useToast();
  const [owner, setOwner] = useState<{name: string, avatarUrl: string, initials: string} | null>(null);
  const [clientInfo, setClientInfo] = useState<{id: string; name: string; ownerId?: string; ownerName?: string} | null>(null);

  useEffect(() => {
    const fetchOwner = async () => {
      const client = (await getClients()).find(c => c.id === opportunity.clientId);

      if (client) {
        setClientInfo({
          id: client.id,
          name: client.denominacion || opportunity.clientName,
          ownerId: client.ownerId,
          ownerName: client.ownerName,
        });
      }

      if (client?.ownerId) {
        const ownerProfile = await getUserProfile(client.ownerId);
        if (ownerProfile) {
          setOwner({
            name: ownerProfile.name,
            avatarUrl: `https://picsum.photos/seed/${client.ownerId}/40/40`,
            initials: ownerProfile.name.substring(0, 2).toUpperCase(),
          });
        }
      }
    };

    fetchOwner();
  }, [opportunity.clientId, opportunity.clientName]);

  const handleUpdate = async (updatedOpp: Partial<Opportunity>) => {
     if (!userInfo || !owner) return;
     try {
       await updateOpportunity(opportunity.id, updatedOpp, userInfo.id, userInfo.name, owner.name);
       window.dispatchEvent(new CustomEvent('opportunityUpdated', { detail: {id: opportunity.id, ...updatedOpp} }));
       if (isDetailsOpen) setIsDetailsOpen(false);
       if (isFinalizeOpen) setIsFinalizeOpen(false);
       toast({ title: "Oportunidad Actualizada" });
     } catch (error) {
       console.error("Error updating opportunity", error);
       toast({ title: "Error al actualizar", variant: "destructive" });
       throw error;
     }
  }
  
  const canDrag = userInfo?.role === 'Jefe' || userInfo?.role === 'Asesor' || userInfo?.role === 'Gerencia';

  const displayValue = Number(opportunity.value || 0);

  useEffect(() => {
    if (!focusedOpportunityId) return;
    if (focusedOpportunityId !== opportunity.id) return;
    if (isDetailsOpen) return;
    setIsDetailsOpen(true);
    onFocusedOpportunityHandled?.();
  }, [focusedOpportunityId, opportunity.id, isDetailsOpen, onFocusedOpportunityHandled]);

  return (
    <>
      <Card 
        draggable={canDrag}
        onDragStart={onDragStart}
        className="hover:shadow-md transition-shadow duration-200 group"
      >
        <div className="p-4">
            <div className="flex justify-between items-start">
                <div className="flex-1 cursor-pointer" onClick={() => setIsDetailsOpen(true)}>
                    <CardTitle className="text-base font-semibold leading-tight">
                    {opportunity.clientName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground pt-1">{opportunity.title}</p>
                </div>
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={e => e.stopPropagation()}>
                    {opportunity.stage === 'Cerrado - Ganado' && (
                        <DropdownMenuItem onSelect={() => setIsFinalizeOpen(true)}>
                        <FileCheck2 className="mr-2 h-4 w-4" />
                        Finalizar Propuesta
                        </DropdownMenuItem>
                    )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <CardContent className="p-0 pt-2">
            {opportunity.stage === 'Negociación' && opportunity.highCloseProbability && (
                <Badge variant="outline" className="mb-2 w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Alta probabilidad
                </Badge>
            )}
            {opportunity.stage === 'Cerrado - Ganado' && opportunity.startDate && opportunity.endDate && (
                <div className="mb-2 flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-800">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Vigencia: {format(parseISO(opportunity.startDate), 'dd/MM/yyyy')} al {format(parseISO(opportunity.endDate), 'dd/MM/yyyy')}
                    {(opportunity.periodHistory?.length || 0) > 0 && <Badge variant="outline" className="ml-auto h-5 bg-white">{opportunity.periodHistory?.length} renov.</Badge>}
                </div>
            )}
            <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-primary">
                    ${displayValue.toLocaleString('es-AR')}
                </span>
                {owner && (
                <TooltipProvider>
                    <Tooltip>
                    <TooltipTrigger>
                        <Avatar className="h-8 w-8">
                        <AvatarImage
                            src={owner.avatarUrl}
                            alt={owner.name}
                            data-ai-hint="person face"
                        />
                        <AvatarFallback>{owner.initials}</AvatarFallback>
                        </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{owner.name}</p>
                    </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                )}
            </div>
            </CardContent>
        </div>
      </Card>
      {isDetailsOpen && (
        <OpportunityDetailsDialog
          opportunity={opportunity}
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          onUpdate={handleUpdate}
          client={clientInfo ?? { id: opportunity.clientId, name: opportunity.clientName }}
        />
      )}
       <FinalizeOpportunityDialog
          isOpen={isFinalizeOpen}
          onOpenChange={setIsFinalizeOpen}
          onFinalize={handleUpdate}
        />
    </>
  );
};


function FinalizeOpportunityDialog({isOpen, onOpenChange, onFinalize}: {isOpen: boolean, onOpenChange: (open: boolean) => void, onFinalize: (update: Partial<Opportunity>) => void}) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  const handleConfirm = () => {
    if (date) {
      onFinalize({ finalizationDate: date.toISOString().split('T')[0] });
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalizar Propuesta Anticipadamente</AlertDialogTitle>
          <AlertDialogDescription>
            Selecciona la fecha de finalización efectiva de esta propuesta. La oportunidad dejará de aparecer en meses posteriores a esta fecha.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label>Fecha de Finalización</Label>
          <Popover>
              <PopoverTrigger asChild>
              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
              </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
          </Popover>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!date}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}



export function KanbanBoard({
  dateRange,
  selectedAdvisor,
  selectedClient,
  onClientListChange,
  focusedOpportunityId,
  onFocusedOpportunityHandled,
}: KanbanBoardProps) {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingWonOpportunity, setPendingWonOpportunity] = useState<Opportunity | null>(null);

  // 🟢 ACÁ SE USA LA VERSIÓN RÁPIDA
  const fetchOpportunities = useCallback(async (forceServer = false) => {
    setLoading(true);
    if (forceServer) {
      setRefreshing(true);
      invalidateCache();
    }
    try {
      const [allOpps, allClients] = await Promise.all([
        getOpportunities({ forceServer }),
        getClients({ forceServer }),
      ]);
      setOpportunities(allOpps);
      setClients(allClients);
      if (forceServer) {
        toast({ title: 'Datos actualizados', description: 'Se descartó el caché local y se volvieron a leer las oportunidades.' });
      }

    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const updatedOpportunity = (e as CustomEvent).detail;
      setOpportunities(prevOpps => 
          prevOpps.map(opp => opp.id === updatedOpportunity.id ? { ...opp, ...updatedOpportunity } : opp)
      );
    };

    window.addEventListener('opportunityUpdated', handleUpdate);
    return () => {
      window.removeEventListener('opportunityUpdated', handleUpdate);
    };
  }, []);

  const advisorClientIds = useMemo(() => {
    if (selectedAdvisor === 'all') return null;
    return new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
  }, [clients, selectedAdvisor]);

  const filteredOpportunities = useMemo(() => {
    if (!userInfo) return [];
    
    let opps = opportunities;

    opps = opps.filter(opp => opp.title !== 'Genérica para carga de facturas');

    if(isBoss) {
      if(selectedAdvisor !== 'all' && advisorClientIds) {
        opps = opps.filter(opp => advisorClientIds.has(opp.clientId));
      }
    } else {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      opps = opps.filter(opp => userClientIds.has(opp.clientId));
    }
    
    if (dateRange?.from) {
        const filterDate = startOfMonth(dateRange.from);
        const openStages: OpportunityStage[] = ['Nuevo', 'Propuesta', 'Negociación', 'Negociación a Aprobar'];

        opps = opps.filter(opp => {
            if (openStages.includes(opp.stage)) {
                return true;
            }

            if (opp.stage === 'Cerrado - Ganado') {
                const contractPeriods = getContractPeriods(opp);
                if (contractPeriods.length > 0) {
                    return getContractPeriodForMonth(opp, filterDate) !== null;
                }

                // Compatibilidad para oportunidades antiguas sin vigencia contractual cargada.
                const referenceDate = getLegacyWonReferenceDate(opp);
                if (!referenceDate) return false;
                if (opp.finalizationDate) {
                    const startDate = startOfMonth(referenceDate);
                    const finalizationDate = parseOpportunityDate(opp.finalizationDate);
                    if (!finalizationDate) return false;
                    const endDate = endOfMonth(finalizationDate);
                    return isWithinInterval(filterDate, { start: startDate, end: endDate });
                }
                
                const periodicity = Array.isArray(opp.periodicidad) ? opp.periodicidad[0] : (opp.periodicidad || 'Ocasional');
                const durationMonths = getPeriodDurationInMonths(periodicity);

                if (durationMonths > 1) {
                    const startDate = startOfMonth(referenceDate);
                    const endDate = addMonths(startDate, durationMonths -1);
                    return isWithinInterval(filterDate, { start: startDate, end: endDate });
                } else {
                    return isSameMonth(filterDate, referenceDate);
                }
            }
            
            if (opp.closeDate) {
                return isSameMonth(filterDate, parseISO(opp.closeDate));
            }
            return false;
        });
    }
    
    if (selectedClient !== 'all') {
      opps = opps.filter(opp => opp.clientId === selectedClient);
    }

    return opps;
  }, [opportunities, clients, userInfo, isBoss, selectedAdvisor, dateRange, advisorClientIds, selectedClient]);


  const groupedOpportunities = useMemo(() => {
    const groups: Record<KanbanStage, Opportunity[]> = {
      'Nuevo': [],
      'Propuesta': [],
      'Negociación': [],
      'Negociación Alta': [],
      'Negociación a Aprobar': [],
      'Cerrado - Ganado': [],
      'Ganado (Recurrente)': [],
      'Cerrado - No Definido': [],
      'Cerrado - Perdido': [],
    };

    filteredOpportunities.forEach(opp => {
      if (opp.stage === 'Cerrado - Ganado' && dateRange?.from) {
        const activeContractPeriod = getContractPeriodForMonth(opp, dateRange.from);
        const wonReferenceDate = activeContractPeriod?.startDate || getLegacyWonReferenceDate(opp);

        if (wonReferenceDate && isSameMonth(wonReferenceDate, dateRange.from)) {
          groups['Cerrado - Ganado'].push(opp);
        } else {
          groups['Ganado (Recurrente)'].push(opp);
        }
      } else if (opp.stage === 'Negociación' && opp.highCloseProbability) {
        groups[HIGH_PROBABILITY_STAGE].push(opp);
      } else if (groups[opp.stage]) {
        groups[opp.stage].push(opp);
      }
    });

    const recurringTotal = groups['Ganado (Recurrente)'].reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const newWinsTotal = groups['Cerrado - Ganado'].reduce((sum, opp) => sum + Number(opp.value || 0), 0);

    Object.values(groups).forEach(group => {
      group.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    });
    
    return { groups, recurringTotal, newWinsTotal };
  }, [filteredOpportunities, dateRange]);


  useEffect(() => {
    const uniqueClients = filteredOpportunities.reduce((acc, opp) => {
        if (!acc.some(client => client.id === opp.clientId)) {
            acc.push({ id: opp.clientId, name: opp.clientName });
        }
        return acc;
    }, [] as { id: string; name: string }[]).sort((a,b) => a.name.localeCompare(b.name));
    
    onClientListChange(uniqueClients);
}, [filteredOpportunities, onClientListChange]);


  const kanbanStages = useMemo<KanbanStage[]>(() => {
    return opportunityStages.flatMap((stage) => (
      stage === 'Negociación' ? [stage, HIGH_PROBABILITY_STAGE] : [stage]
    ));
  }, []);

  const handleCardDrop = async (e: React.DragEvent<HTMLDivElement>, newStage: OpportunityStage, highCloseProbability = false) => {
    const opportunityId = e.dataTransfer.getData('opportunityId');
    const oppToMove = opportunities.find(opp => opp.id === opportunityId);
    const nextHighCloseProbability = newStage === 'Negociación' ? highCloseProbability : false;

    if (oppToMove && (oppToMove.stage !== newStage || !!oppToMove.highCloseProbability !== nextHighCloseProbability)) {
      if (userInfo?.role === 'Administracion') {
        toast({ title: "Acción no permitida", description: "Los administradores no pueden modificar las etapas.", variant: "destructive" });
        return;
      }

      if (newStage === 'Cerrado - Ganado' && (!oppToMove.startDate || !oppToMove.endDate)) {
        setPendingWonOpportunity({ ...oppToMove, stage: 'Cerrado - Ganado', highCloseProbability: false });
        toast({
          title: 'Completá la vigencia del contrato',
          description: 'Antes de cerrar la oportunidad como ganada, indicá su fecha de inicio y fin.',
        });
        return;
      }
      
      const updatedOpportunity = { ...oppToMove, stage: newStage, highCloseProbability: nextHighCloseProbability };
      setOpportunities(prevOpps => 
          prevOpps.map(opp => opp.id === updatedOpportunity.id ? updatedOpportunity : opp)
      );

      try {
        if (!userInfo) throw new Error("User not authenticated");
        const client = clients.find(c => c.id === oppToMove.clientId);
        if (!client) throw new Error("Client not found for opportunity");

        await updateOpportunity(opportunityId, { stage: newStage, highCloseProbability: nextHighCloseProbability }, userInfo.id, userInfo.name, client.ownerName);
        toast({ title: "Etapa actualizada", description: `"${oppToMove.title}" se movió a ${newStage}.` });
      } catch (error) {
        console.error("Error updating opportunity stage:", error);
        toast({ title: "Error al actualizar", variant: "destructive" });
        setOpportunities(prevOpps => 
          prevOpps.map(opp => opp.id === opportunityId ? oppToMove : opp)
        );
      }
    }
  };

  const handlePendingWonUpdate = async (changes: Partial<Opportunity>) => {
    if (!pendingWonOpportunity || !userInfo) return;
    const client = clients.find(item => item.id === pendingWonOpportunity.clientId);
    try {
      const update = { ...changes, stage: 'Cerrado - Ganado' as OpportunityStage, highCloseProbability: false };
      await updateOpportunity(
        pendingWonOpportunity.id,
        update,
        userInfo.id,
        userInfo.name,
        client?.ownerName || pendingWonOpportunity.clientName,
      );
      setOpportunities(previous => previous.map(item => item.id === pendingWonOpportunity.id ? { ...item, ...update } : item));
      window.dispatchEvent(new CustomEvent('opportunityUpdated', { detail: { id: pendingWonOpportunity.id, ...update } }));
      setPendingWonOpportunity(null);
      toast({ title: 'Oportunidad cerrada como ganada', description: 'La vigencia quedó registrada correctamente.' });
    } catch (error) {
      console.error('Error closing won opportunity', error);
      toast({
        title: 'No se pudo guardar la oportunidad',
        description: error instanceof Error ? error.message : 'Revisá los datos e intentá nuevamente.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 md:px-6 lg:px-8 flex justify-end shrink-0">
        <Button variant="outline" size="sm" onClick={() => fetchOpportunities(true)} disabled={loading || refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Recargar datos
        </Button>
      </div>
      <div className="p-4 md:p-6 lg:p-8 flex-1 flex gap-6 overflow-x-auto">
      {kanbanStages.map((stage) => {
          if (stage === 'Ganado (Recurrente)') {
             return <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
              total={groupedOpportunities.recurringTotal}
              focusedOpportunityId={focusedOpportunityId}
              onFocusedOpportunityHandled={onFocusedOpportunityHandled}
            />
          }
          if (stage === 'Cerrado - Ganado') {
             return <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
              total={groupedOpportunities.newWinsTotal}
              focusedOpportunityId={focusedOpportunityId}
              onFocusedOpportunityHandled={onFocusedOpportunityHandled}
            />
          }
          return (
            <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
              focusedOpportunityId={focusedOpportunityId}
              onFocusedOpportunityHandled={onFocusedOpportunityHandled}
            />
          )
        })}
      </div>
      {pendingWonOpportunity && (
        <OpportunityDetailsDialog
          opportunity={pendingWonOpportunity}
          isOpen={true}
          onOpenChange={(open) => { if (!open) setPendingWonOpportunity(null); }}
          onUpdate={handlePendingWonUpdate}
          initialTab="conditions"
          client={{
            id: pendingWonOpportunity.clientId,
            name: pendingWonOpportunity.clientName,
            ownerId: clients.find(item => item.id === pendingWonOpportunity.clientId)?.ownerId,
            ownerName: clients.find(item => item.id === pendingWonOpportunity.clientId)?.ownerName,
          }}
        />
      )}
    </div>
  );
}
