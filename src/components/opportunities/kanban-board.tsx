'use client';

import {
  opportunities,
  opportunityStages,
  users,
} from '@/lib/data';
import type { Opportunity, OpportunityStage } from '@/lib/types';
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

const stageColors: Record<OpportunityStage, string> = {
  Nuevo: 'border-blue-500',
  Propuesta: 'border-yellow-500',
  Negociación: 'border-orange-500',
  'Cerrado - Ganado': 'border-green-500',
  'Cerrado - Perdido': 'border-red-500',
};

const KanbanColumn = ({
  stage,
  opportunities,
}: {
  stage: OpportunityStage;
  opportunities: Opportunity[];
}) => {
  const columnTotal = opportunities.reduce((sum, opp) => sum + opp.value, 0);

  return (
    <div className="flex flex-col w-80 shrink-0">
      <div className="flex items-center justify-between p-2 mb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{stage}</h2>
          <Badge variant="secondary">{opportunities.length}</Badge>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          ${columnTotal.toLocaleString()}
        </span>
      </div>
      <div
        className={`flex-1 space-y-3 p-2 rounded-lg bg-secondary/50 border-t-4 ${stageColors[stage]}`}
      >
        {opportunities.map((opp) => (
          <KanbanCard key={opp.id} opportunity={opp} />
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

const KanbanCard = ({ opportunity }: { opportunity: Opportunity }) => {
  const owner = users.find((user) => user.id === opportunity.ownerId);

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer">
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
            ${opportunity.value.toLocaleString()}
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
  );
};

export function KanbanBoard() {
  return (
    <div className="p-4 md:p-6 lg:p-8 h-full flex gap-6 overflow-x-auto">
      {opportunityStages.map((stage) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          opportunities={opportunities.filter((opp) => opp.stage === stage)}
        />
      ))}
    </div>
  );
}
