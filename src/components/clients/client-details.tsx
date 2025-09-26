'use client'
import type { Client, Opportunity, Activity, User, Person } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Briefcase,
  Mail,
  Phone,
  User as UserIcon,
  PlusCircle,
  Edit,
  Trash2,
  PhoneCall,
  FileText,
  Users as UsersIcon
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '../ui/button';
import { opportunityStages } from '@/lib/data';
import { OpportunityDetailsDialog } from '../opportunities/opportunity-details-dialog';
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OpportunityStage } from '@/lib/types';

const stageColors: Record<OpportunityStage, string> = {
  'Nuevo': 'bg-blue-500',
  'Propuesta': 'bg-yellow-500',
  'Negociación': 'bg-orange-500',
  'Cerrado - Ganado': 'bg-green-500',
  'Cerrado - Perdido': 'bg-red-500',
};

const activityIcons: Record<Activity['type'], React.ReactNode> = {
  Llamada: <PhoneCall className="h-5 w-5" />,
  Email: <Mail className="h-5 w-5" />,
  Reunión: <UsersIcon className="h-5 w-s" />,
  Nota: <FileText className="h-5 w-5" />,
};

const WhatsappIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    <path d="M14.05 14.05a2 2 0 0 0-2.83 0L10 15.22a3.76 3.76 0 0 1-5.29-5.29l1.22-1.22a2 2 0 0 0 0-2.83L5.47 5.47a2 2 0 0 0-2.83 0L2 6.13a7.51 7.51 0 0 0 10.6 10.6l.66-.66a2 2 0 0 0 0-2.83l-.45-.45Z" />
  </svg>
);


export function ClientDetails({
  client,
  opportunities: initialOpportunities,
  activities,
  people,
  users,
}: {
  client: Client;
  opportunities: Opportunity[];
  activities: Activity[];
  people: Person[];
  users: User[];
}) {
  const [opportunities, setOpportunities] = React.useState(initialOpportunities);
  const [selectedOpportunity, setSelectedOpportunity] = React.useState<Opportunity | null>(null);

  const handleOpportunityUpdate = (updatedOpp: Opportunity) => {
    setOpportunities(prev => prev.map(opp => opp.id === updatedOpp.id ? updatedOpp : opp));
    setSelectedOpportunity(null);
  };

  const handleStageChange = (opportunityId: string, newStage: OpportunityStage) => {
    setOpportunities(prev => prev.map(opp => opp.id === opportunityId ? { ...opp, stage: newStage } : opp));
  };

  const openOpportunityDetails = (opp: Opportunity) => {
    setSelectedOpportunity(opp);
  };
  
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={client.avatarUrl} alt={client.name} data-ai-hint="logo building" />
              <AvatarFallback>{client.avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{client.name}</CardTitle>
              <CardDescription>{client.company}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{client.phone}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{client.company}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contactos</CardTitle>
            <Button variant="outline" size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Persona
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {people.map(person => (
              <div key={person.id} className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{person.name}</p>
                  <p className="text-sm text-muted-foreground">{person.email}</p>
                   <p className="text-sm text-muted-foreground">{person.phone}</p>
                </div>
                <div className="flex items-center gap-1">
                  {person.phone && (
                    <>
                     <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a href={`tel:${person.phone}`}>
                          <PhoneCall />
                        </a>
                      </Button>
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a href={`https://wa.me/${person.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <WhatsappIcon />
                        </a>
                      </Button>
                    </>
                  )}
                   <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Oportunidades</CardTitle>
             <Button variant="outline" size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Oportunidad
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="w-[150px]">Etapa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id}>
                    <TableCell 
                      className='font-medium cursor-pointer hover:underline'
                      onClick={() => openOpportunityDetails(opp)}
                    >
                      {opp.title}
                    </TableCell>
                    <TableCell>${opp.value.toLocaleString()}</TableCell>
                    <TableCell>
                       <Select
                          value={opp.stage}
                          onValueChange={(newStage: OpportunityStage) => handleStageChange(opp.id, newStage)}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                             <SelectValue>
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${stageColors[opp.stage]}`} />
                                {opp.stage}
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {opportunityStages.map(stage => (
                              <SelectItem key={stage} value={stage} className="text-xs">
                                <div className="flex items-center gap-2">
                                   <span className={`h-2 w-2 rounded-full ${stageColors[stage]}`} />
                                  {stage}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Línea de Tiempo de Actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-8 pl-6 before:absolute before:inset-y-0 before:w-px before:bg-border before:left-6">
              {activities.map((activity) => (
                <div key={activity.id} className="relative">
                  <div className="absolute -left-3.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background border-2 border-primary text-primary">
                    {activityIcons[activity.type]}
                  </div>
                  <div className="ml-8">
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">{activity.subject}</p>
                        <p className="text-sm text-muted-foreground">{activity.date}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{activity.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedOpportunity && (
        <OpportunityDetailsDialog
          opportunity={selectedOpportunity}
          isOpen={!!selectedOpportunity}
          onOpenChange={(isOpen) => !isOpen && setSelectedOpportunity(null)}
          onUpdate={handleOpportunityUpdate}
        />
      )}
    </div>
  );
}
