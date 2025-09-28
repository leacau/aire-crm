
'use client'
import type { Client, Opportunity, Activity, Person } from '@/lib/types';
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
  PlusCircle,
  Edit,
  Trash2,
  PhoneCall,
  FileText,
  Users as UsersIcon,
  Building,
  Home,
  MapPin,
  FileDigit,
  Building2
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
import { useAuth } from '@/hooks/use-auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { ClientFormDialog } from './client-form-dialog';


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
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-5 w-5"
  >
    <path d="M16.6 14.2l-1.5-0.7c-0.3-0.1-0.5-0.1-0.8 0.1l-0.7 0.8c-1.5-0.8-2.8-2-3.6-3.6l0.8-0.7c0.2-0.2 0.2-0.5 0.1-0.8l-0.7-1.5c-0.1-0.3-0.4-0.5-0.8-0.5h-1.6c-0.4 0-0.8 0.4-0.8 0.8C7 9.8 9.2 16 15.2 16c0.4 0 0.8-0.3 0.8-0.8v-1.6c0-0.4-0.2-0.7-0.5-0.8z" />
  </svg>
);


export function ClientDetails({
  client,
  opportunities: initialOpportunities,
  activities,
  people,
  onUpdate
}: {
  client: Client;
  opportunities: Opportunity[];
  activities: Activity[];
  people: Person[];
  onUpdate: (data: Partial<Omit<Client, 'id'>>) => void;
}) {
  const { userInfo } = useAuth();
  const [opportunities, setOpportunities] = React.useState(initialOpportunities);
  const [selectedOpportunity, setSelectedOpportunity] = React.useState<Opportunity | null>(null);
  const [isClientFormOpen, setIsClientFormOpen] = React.useState(false);

  const canEditClient = userInfo?.role === 'Jefe' || (userInfo?.id === client.ownerId);
  const canEditOpportunity = userInfo?.role === 'Jefe' || userInfo?.role === 'Asesor';
  const canDelete = userInfo?.role === 'Jefe';
  const canReassign = userInfo?.role === 'Jefe' || userInfo?.role === 'Administracion';

  const handleOpportunityUpdate = (updatedOpp: Opportunity) => {
    setOpportunities(prev => prev.map(opp => opp.id === updatedOpp.id ? updatedOpp : opp));
    setSelectedOpportunity(null);
  };

  const handleStageChange = (opportunityId: string, newStage: OpportunityStage) => {
    if (!canEditOpportunity) return;
    setOpportunities(prev => prev.map(opp => opp.id === opportunityId ? { ...opp, stage: newStage } : opp));
  };

  const openOpportunityDetails = (opp: Opportunity) => {
    setSelectedOpportunity(opp);
  };

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'avatarUrl' | 'avatarFallback' | 'personIds' | 'ownerId'>) => {
    onUpdate(clientData);
  };
  
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div className="flex flex-row items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={client.avatarUrl} alt={client.denominacion} data-ai-hint="logo building" />
                <AvatarFallback>{client.avatarFallback}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{client.denominacion}</CardTitle>
                <CardDescription>{client.razonSocial}</CardDescription>
              </div>
            </div>
            {canEditClient && (
               <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsClientFormOpen(true)}>
                  <Edit className="h-4 w-4" />
               </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
             <div className="flex items-center gap-3">
              <FileDigit className="h-4 w-4 text-muted-foreground" />
              <span>{client.cuit}</span>
            </div>
             <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{client.rubro}</span>
            </div>
             <div className="flex items-center gap-3">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span>{client.tipoEntidad}</span>
            </div>
             <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{client.localidad}, {client.provincia}</span>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{client.phone}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contactos</CardTitle>
            {canEditOpportunity && (
              <Button variant="outline" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                Añadir Persona
              </Button>
            )}
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
                          <PhoneCall className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a href={`https://wa.me/${person.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <WhatsappIcon />
                        </a>
                      </Button>
                    </>
                  )}
                  {canEditOpportunity && <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Oportunidades</CardTitle>
            {canEditOpportunity && (
               <Button variant="outline" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                Añadir Oportunidad
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="w-[150px]">Etapa</TableHead>
                   { (canReassign || canDelete) && <TableHead className="w-[50px]"></TableHead> }
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
                          disabled={!canEditOpportunity}
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
                     {(canReassign || canDelete) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {canReassign && <DropdownMenuItem>Reasignar</DropdownMenuItem>}
                            {canDelete && <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
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

      {isClientFormOpen && (
        <ClientFormDialog
            isOpen={isClientFormOpen}
            onOpenChange={setIsClientFormOpen}
            onSave={handleSaveClient}
            client={client}
        />
      )}
    </div>
  );
}
