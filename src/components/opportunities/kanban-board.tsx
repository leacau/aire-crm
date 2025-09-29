
'use client';

import {
  opportunityStages,
} from '@/lib/data';
import type { Opportunity, OpportunityStage, Client } from '@/lib/types';
import { MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import React, { useEffect, useState, useCallback } from 'react';
import { OpportunityDetailsDialog } from './opportunity-details-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getOpportunitiesForUser, updateOpportunity, getClients, getUserProfile } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';

const stageColors: Record<OpportunityStage, string> = {
  'Nuevo': 'border-blue-500',
  'Propuesta': 'border-yellow-500',
  'Negociación': 'border-orange-500',
  'Cerrado - Ganado': 'border-green-500',
  'Cerrado - Perdido': 'border-red-500',
};

const KanbanColumn = ({
  stage,
  opportunities,
  onCardDrop,
}: {
  stage: OpportunityStage;
  opportunities: Opportunity[];
  onCardDrop: (e: React.DragEvent<HTMLDivElement>, stage: OpportunityStage) => void;
}) => {
  const columnTotal = opportunities.reduce((sum, opp) => sum + (opp.valorCerrado || opp.value), 0);


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCardDrop(e, stage);
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
          ${columnTotal.toLocaleString('es-AR')}
        </span>
      </div>
      <div
        className={`flex-1 space-y-3 p-2 rounded-lg bg-secondary/50 border-t-4 ${stageColors[stage]}`}
      >
        {opportunities.map((opp) => (
          <KanbanCard key={opp.id} opportunity={opp} onDragStart={(e) => handleDragStart(e, opp.id)} />
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

const KanbanCard = ({ opportunity, onDragStart }: { opportunity: Opportunity, onDragStart: (e: React.DragEvent<HTMLDivElement>) => void; }) => {
  const { userInfo } = useAuth();
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
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
       setIsDetailsOpen(false);
       toast({ title: "Oportunidad Actualizada" });
     } catch (error) {
       console.error("Error updating opportunity", error);
       toast({ title: "Error al actualizar", variant: "destructive" });
     }
  }
  
  const canDrag = userInfo?.role === 'Jefe' || userInfo?.role === 'Asesor';

  const displayValue = opportunity.valorCerrado && opportunity.stage === 'Cerrado - Ganado'
    ? opportunity.valorCerrado
    : opportunity.value;

  return (
    <>
      <Card 
        draggable={canDrag}
        onDragStart={onDragStart}
        className="hover:shadow-md transition-shadow duration-200 cursor-pointer"
        onClick={() => setIsDetailsOpen(true)}
      >
        <CardHeader className="p-4">
          <div className="flex justify-between items-start">
            <CardTitle className="text-base font-semibold leading-tight">
              {opportunity.title}
            </CardTitle>
            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground pt-1">{opportunity.clientName}</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
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
      </Card>
      {isDetailsOpen && (
         <OpportunityDetailsDialog
          opportunity={opportunity}
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          onUpdate={handleUpdate}
        />
      )}
    </>
  );
};

export function KanbanBoard() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOpportunities = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      let userOpps: Opportunity[];
      if (userInfo.role === 'Jefe' || userInfo.role === 'Administracion') {
        userOpps = await getAllOpportunities();
      } else {
        userOpps = await getOpportunitiesForUser(userInfo.id);
      }
      setOpportunities(userOpps);
      const allClients = await getClients();
      setClients(allClients);

    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast({ title: 'Error al cargar oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [userInfo, toast]);

  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchOpportunities();
    }
  }, [authLoading, fetchOpportunities, userInfo]);

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
      {opportunityStages.map((stage) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          opportunities={opportunities.filter((opp) => opp.stage === stage)}
          onCardDrop={handleCardDrop}
        />
      ))}
    </div>
  );
}
