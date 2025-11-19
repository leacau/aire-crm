

'use client';

import {
  opportunityStages,
} from '@/lib/data';
import type { Opportunity, OpportunityStage, Client, User } from '@/lib/types';
import { MoreHorizontal, FileCheck2 } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth.tsx';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, updateOpportunity, getClients, getUserProfile } from '@/lib/firebase-service';
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


const stageColors: Record<OpportunityStage | 'Ganado (Recurrente)', string> = {
  'Nuevo': 'border-blue-500',
  'Propuesta': 'border-yellow-500',
  'Negociación': 'border-orange-500',
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
}: {
  stage: OpportunityStage | 'Ganado (Recurrente)';
  opportunities: Opportunity[];
  onCardDrop: (e: React.DragEvent<HTMLDivElement>, stage: OpportunityStage) => void;
  total?: number;
}) => {
  const columnTotal = total ?? opportunities.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
  const roundedTotal = Math.round(columnTotal * 100) / 100;


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if(stage !== 'Ganado (Recurrente)') {
        onCardDrop(e, stage as OpportunityStage);
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

  useEffect(() => {
    const fetchOwner = async () => {
      const client = (await getClients()).find(c => c.id === opportunity.clientId);
        if(client?.ownerId) {
            const ownerProfile = await getUserProfile(client.ownerId);
            if(ownerProfile) {
                setOwner({
                    name: ownerProfile.name,
                    avatarUrl: `https://picsum.photos/seed/${client.ownerId}/40/40`,
                    initials: ownerProfile.name.substring(0, 2).toUpperCase()
                });
            }
        }
    }
    fetchOwner();
  }, [opportunity.clientId]);

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

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const [allOpps, allClients] = await Promise.all([
        getAllOpportunities(),
        getClients(),
      ]);
      setOpportunities(allOpps);
      setClients(allClients);

    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
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

    // 1. Filter by Advisor/User
    if(isBoss) {
      if(selectedAdvisor !== 'all' && advisorClientIds) {
        opps = opps.filter(opp => advisorClientIds.has(opp.clientId));
      }
    } else {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      opps = opps.filter(opp => userClientIds.has(opp.clientId));
    }
    
    // 2. Filter by Date
    if (dateRange?.from) {
        const filterDate = startOfMonth(dateRange.from);
        const openStages: OpportunityStage[] = ['Nuevo', 'Propuesta', 'Negociación', 'Negociación a Aprobar'];

        opps = opps.filter(opp => {
            if (openStages.includes(opp.stage)) {
                return true;
            }

            if (opp.stage === 'Cerrado - Ganado') {
                if (!opp.closeDate) return false;
                const closeDate = parseISO(opp.closeDate);

                if (opp.finalizationDate) {
                    const startDate = startOfMonth(closeDate);
                    const endDate = endOfMonth(parseISO(opp.finalizationDate));
                    return isWithinInterval(filterDate, { start: startDate, end: endDate });
                }
                
                const maxPeriodicity = opp.periodicidad?.[0] || 'Ocasional';
                const durationMonths = getPeriodDurationInMonths(maxPeriodicity);

                if (durationMonths > 1) {
                    const startDate = startOfMonth(closeDate);
                    const endDate = addMonths(startDate, durationMonths -1);
                    return isWithinInterval(filterDate, { start: startDate, end: endDate });
                } else {
                    return isSameMonth(filterDate, closeDate);
                }
            }
            
            // For other closed stages, only show if closeDate is in the current month
            if (opp.closeDate) {
                return isSameMonth(filterDate, parseISO(opp.closeDate));
            }
            return false;
        });
    }
    
    // 3. Filter by Client
    if (selectedClient !== 'all') {
      opps = opps.filter(opp => opp.clientId === selectedClient);
    }

    return opps;
  }, [opportunities, clients, userInfo, isBoss, selectedAdvisor, dateRange, advisorClientIds, selectedClient]);


  const groupedOpportunities = useMemo(() => {
    const groups: Record<OpportunityStage | 'Ganado (Recurrente)', Opportunity[]> = {
      'Nuevo': [],
      'Propuesta': [],
      'Negociación': [],
      'Negociación a Aprobar': [],
      'Cerrado - Ganado': [],
      'Ganado (Recurrente)': [],
      'Cerrado - No Definido': [],
      'Cerrado - Perdido': [],
    };

    filteredOpportunities.forEach(opp => {
      if (opp.stage === 'Cerrado - Ganado' && dateRange?.from) {
        // Use createdAt to determine if it's a new win for the month or recurrent
        if (isSameMonth(parseISO(opp.createdAt), dateRange.from)) {
          groups['Cerrado - Ganado'].push(opp);
        } else {
          groups['Ganado (Recurrente)'].push(opp);
        }
      } else if (groups[opp.stage]) {
        groups[opp.stage].push(opp);
      }
    });

    const recurringTotal = groups['Ganado (Recurrente)'].reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const newWinsTotal = groups['Cerrado - Ganado'].reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    
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


  const handleCardDrop = async (e: React.DragEvent<HTMLDivElement>, newStage: OpportunityStage) => {
    const opportunityId = e.dataTransfer.getData('opportunityId');
    const oppToMove = opportunities.find(opp => opp.id === opportunityId);

    if (oppToMove && oppToMove.stage !== newStage) {
      if (userInfo?.role === 'Administracion') {
        toast({ title: "Acción no permitida", description: "Los administradores no pueden modificar las etapas.", variant: "destructive" });
        return;
      }
      
      const updatedOpportunity = { ...oppToMove, stage: newStage };
      setOpportunities(prevOpps => 
          prevOpps.map(opp => opp.id === updatedOpportunity.id ? updatedOpportunity : opp)
      );

      try {
        if (!userInfo) throw new Error("User not authenticated");
        const client = clients.find(c => c.id === oppToMove.clientId);
        if (!client) throw new Error("Client not found for opportunity");

        await updateOpportunity(opportunityId, { stage: newStage }, userInfo.id, userInfo.name, client.ownerName);
        toast({ title: "Etapa actualizada", description: `"${oppToMove.title}" se movió a ${newStage}.` });
      } catch (error) {
        console.error("Error updating opportunity stage:", error);
        toast({ title: "Error al actualizar", variant: "destructive" });
        // Revert UI change on error
        setOpportunities(prevOpps => 
          prevOpps.map(opp => opp.id === opportunityId ? oppToMove : opp)
        );
      }
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
    <div className="p-4 md:p-6 lg:p-8 h-full flex gap-6 overflow-x-auto">
      {opportunityStages.map((stage) => {
          if (stage === 'Ganado (Recurrente)') {
             return <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
              total={groupedOpportunities.recurringTotal}
            />
          }
          if (stage === 'Cerrado - Ganado') {
             return <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
              total={groupedOpportunities.newWinsTotal}
            />
          }
          return (
            <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={groupedOpportunities.groups[stage]}
              onCardDrop={handleCardDrop}
            />
          )
        })}
    </div>
  );
}
