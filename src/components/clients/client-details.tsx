

'use client'
import type { Client, Opportunity, Person, ClientActivity, ClientActivityType, ActivityLog } from '@/lib/types';
import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Mail,
  Phone,
  PlusCircle,
  Edit,
  Trash2,
  PhoneCall,
  Users as UsersIcon,
  Building,
  Home,
  MapPin,
  FileDigit,
  Building2,
  Briefcase,
  MessageSquare,
  Users,
  Video,
  BuildingIcon,
  MailIcon,
  CalendarIcon,
  CheckCircle,
  FileText,
  Activity,
  ArrowRight,
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
import { clientActivityTypes } from '@/lib/types';
import { OpportunityDetailsDialog } from '../opportunities/opportunity-details-dialog';
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
import { PersonFormDialog } from '@/components/people/person-form-dialog';
import { createPerson, getPeopleByClientId, updatePerson, getOpportunitiesByClientId, createOpportunity, updateOpportunity, createClientActivity, getClientActivities, updateClientActivity, getActivitiesForEntity } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '../ui/spinner';
import { users } from '@/lib/data';


const stageColors: Record<OpportunityStage, string> = {
  'Nuevo': 'bg-blue-500',
  'Propuesta': 'bg-yellow-500',
  'Negociación': 'bg-orange-500',
  'Cerrado - Ganado': 'bg-green-500',
  'Cerrado - Perdido': 'bg-red-500',
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

const activityIcons: Record<ClientActivityType, React.ReactNode> = {
    'Llamada': <PhoneCall className="h-4 w-4" />,
    'WhatsApp': <MessageSquare className="h-4 w-4" />,
    'Meet': <Video className="h-4 w-4" />,
    'Reunión': <Users className="h-4 w-4" />,
    'Visita Aire': <BuildingIcon className="h-4 w-4" />,
    'Mail': <MailIcon className="h-4 w-4" />,
};

const systemActivityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Edit className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;


export function ClientDetails({
  client,
  onUpdate
}: {
  client: Client;
  onUpdate: (data: Partial<Omit<Client, 'id'>>) => void;
}) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  
  const [people, setPeople] = useState<Person[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  
  // New Activity State
  const [newActivityType, setNewActivityType] = useState<ClientActivityType | ''>('');
  const [newActivityObservation, setNewActivityObservation] = useState('');
  const [isTask, setIsTask] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isOpportunityFormOpen, setIsOpportunityFormOpen] = useState(false);
  
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isPersonFormOpen, setIsPersonFormOpen] = useState(false);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);

  const fetchClientData = async () => {
      if(!userInfo) return;
      try {
        const [clientPeople, clientOpportunities, activities, systemLogs] = await Promise.all([
            getPeopleByClientId(client.id),
            getOpportunitiesByClientId(client.id),
            getClientActivities(client.id),
            getActivitiesForEntity(client.id)
        ]);
        setPeople(clientPeople);
        setOpportunities(clientOpportunities);
        setClientActivities(activities);
        setSystemActivities(systemLogs);
      } catch (error) {
        console.error("Error fetching client data:", error);
        toast({ title: "Error al cargar los datos del cliente", variant: "destructive" });
      }
  }

  useEffect(() => {
    fetchClientData();
  }, [client.id, userInfo]);


  const canEditClient = userInfo?.role === 'Jefe' || (userInfo?.id === client.ownerId);
  const canEditContact = userInfo?.role === 'Jefe' || (userInfo?.id === client.ownerId);
  const canEditOpportunity = userInfo?.role === 'Jefe' || userInfo?.role === 'Asesor';
  const canDelete = userInfo?.role === 'Jefe';
  const canReassign = userInfo?.role === 'Jefe' || userInfo?.role === 'Administracion';

  const handleOpportunityUpdate = async (updatedOpp: Partial<Opportunity>) => {
    if(!selectedOpportunity || !userInfo) return;
    try {
        await updateOpportunity(selectedOpportunity.id, updatedOpp, userInfo.id, userInfo.name);
        fetchClientData();
        toast({ title: 'Oportunidad Actualizada' });
    } catch (error) {
        console.error("Error updating opportunity", error);
        toast({ title: "Error al actualizar la oportunidad", variant: 'destructive' });
    }
  };

  const handleOpportunityCreate = async (newOppData: Omit<Opportunity, 'id'>) => {
     if(!userInfo) return;
     try {
        const fullNewOpp = {
            ...newOppData,
            clientId: client.id,
            clientName: client.denominacion,
            ownerId: userInfo.id,
        }
        await createOpportunity(fullNewOpp, userInfo.id, userInfo.name);
        fetchClientData();
        toast({ title: 'Oportunidad Creada' });
    } catch (error) {
        console.error("Error creating opportunity", error);
        toast({ title: "Error al crear la oportunidad", variant: 'destructive' });
    }
  };


  const handleStageChange = async (opportunityId: string, newStage: OpportunityStage) => {
    if (!canEditOpportunity || !userInfo) return;
    const originalOpportunities = opportunities;
    const updatedOpportunities = opportunities.map(opp => opp.id === opportunityId ? { ...opp, stage: newStage } : opp);
    setOpportunities(updatedOpportunities);
    try {
        await updateOpportunity(opportunityId, { stage: newStage }, userInfo.id, userInfo.name);
        fetchClientData(); // Refetch to get new system log
    } catch (error) {
        console.error('Error updating stage', error);
        setOpportunities(originalOpportunities);
        toast({ title: 'Error al cambiar la etapa', variant: 'destructive' });
    }
  };

  const handleOpenOpportunityForm = (opp: Opportunity | null = null) => {
    setSelectedOpportunity(opp);
    setIsOpportunityFormOpen(true);
  };
  
  const handleOpenPersonForm = (person: Person | null = null) => {
    setSelectedPerson(person);
    setIsPersonFormOpen(true);
  }

  const handleSavePerson = async (personData: Omit<Person, 'id' | 'clientIds'> & { clientIds?: string[]}) => {
     if(!userInfo) return;
     try {
        if (selectedPerson) { // Editing existing person
            await updatePerson(selectedPerson.id, personData, userInfo.id, userInfo.name);
            fetchClientData();
            toast({ title: "Contacto Actualizado" });
        } else { // Creating new person
            const newPersonData = { ...personData, clientIds: [client.id] };
            await createPerson(newPersonData, userInfo.id, userInfo.name);
            fetchClientData();
            toast({ title: "Contacto Creado" });
        }
    } catch (error) {
        console.error("Error saving person", error);
        toast({ title: "Error al guardar el contacto", variant: 'destructive' });
    }
  };
  
  const resetActivityForm = () => {
    setNewActivityType('');
    setNewActivityObservation('');
    setIsTask(false);
    setDueDate(undefined);
  };


  const handleSaveClientActivity = async () => {
    if (!newActivityType || !newActivityObservation.trim() || !userInfo) {
        toast({ title: "Datos incompletos", description: "Selecciona un tipo y añade una observación.", variant: 'destructive'});
        return;
    }
    if (isTask && !dueDate) {
        toast({ title: "Fecha de vencimiento requerida", description: "Por favor, selecciona una fecha para la tarea.", variant: 'destructive'});
        return;
    }

    setIsSavingActivity(true);
    
    const activityPayload: Omit<ClientActivity, 'id' | 'timestamp'> = {
        clientId: client.id,
        clientName: client.denominacion,
        type: newActivityType,
        observation: newActivityObservation,
        userId: userInfo.id,
        userName: userInfo.name,
        isTask,
        completed: false,
        ...(isTask && dueDate && { dueDate: dueDate.toISOString() }),
    };

    try {
        await createClientActivity(activityPayload);
        toast({ title: "Actividad Registrada" });
        resetActivityForm();
        fetchClientData(); // Refresh activities
    } catch (error) {
        console.error("Error saving client activity:", error);
        toast({ title: "Error al guardar la actividad", variant: 'destructive'});
    } finally {
        setIsSavingActivity(false);
    }
  }

  const handleTaskCompleteToggle = async (activity: ClientActivity, currentStatus: boolean) => {
      if(!userInfo) return;
      const completed = !currentStatus;
      const payload: Partial<ClientActivity> = { 
          completed,
          ...(completed && {
              completedByUserId: userInfo.id,
              completedByUserName: userInfo.name,
          })
      };

      try {
          await updateClientActivity(activity.id, payload);
          fetchClientData();
          toast({ title: `Tarea ${!currentStatus ? 'completada' : 'marcada como pendiente'}`});
      } catch (error) {
          console.error("Error updating task status", error);
          toast({ title: "Error al actualizar la tarea", variant: 'destructive' });
      }
  }


  const handleSaveClient = (clientData: Omit<Client, 'id' | 'avatarUrl' | 'avatarFallback' | 'personIds' | 'ownerId'>) => {
    onUpdate(clientData);
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Avatar className="h-16 w-16">
                      <AvatarImage src={client.avatarUrl} alt={client.denominacion} data-ai-hint="logo building" />
                      <AvatarFallback>{client.avatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                      <CardTitle className="text-2xl truncate">{client.denominacion}</CardTitle>
                      <CardDescription className="truncate">{client.razonSocial}</CardDescription>
                  </div>
              </div>
               {canEditClient && (
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => setIsClientFormOpen(true)}>
                      <Edit className="h-4 w-4" />
                  </Button>
              )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
           <div className="flex items-center gap-3">
            <FileDigit className="h-4 w-4 text-muted-foreground" />
            <span>{client.cuit}</span>
          </div>
           <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>{client.condicionIVA}</span>
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
           {client.observaciones && (
              <div className="space-y-1 pt-2">
                  <h4 className="font-medium text-sm">Observaciones</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{client.observaciones}</p>
              </div>
            )}
        </CardContent>
      </Card>

      <Tabs defaultValue="opportunities" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="contacts">Contactos</TabsTrigger>
          <TabsTrigger value="activity">Actividad</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="opportunities">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Oportunidades</CardTitle>
              {canEditOpportunity && (
                 <Button variant="outline" size="sm" onClick={() => handleOpenOpportunityForm()}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Nueva Oportunidad
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
                        onClick={() => handleOpenOpportunityForm(opp)}
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
                   {opportunities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canReassign || canDelete ? 4 : 3} className="h-24 text-center">
                          No hay oportunidades para este cliente.
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contacts">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Contactos</CardTitle>
                {canEditContact && (
                    <Button variant="outline" size="sm" onClick={() => handleOpenPersonForm()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Contacto
                    </Button>
                )}
                </CardHeader>
                <CardContent className="space-y-4">
                {people.map(person => (
                    <div key={person.id} className="flex items-start justify-between">
                    <div>
                        <p className="font-medium">{person.name}</p>
                        {person.cargo && <p className="text-sm text-muted-foreground">{person.cargo}</p>}
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
                        {canEditContact && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPersonForm(person)}><Edit className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </div>
                    </div>
                ))}
                {people.length === 0 && <p className="text-sm text-muted-foreground text-center">No hay contactos para este cliente.</p>}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="activity">
            <Card>
                <CardHeader>
                <CardTitle>Registro de Actividad</CardTitle>
                <CardDescription>Añade y visualiza interacciones y tareas con el cliente.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 p-4 border rounded-md">
                        <h4 className="font-medium">Nueva Actividad</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Select value={newActivityType} onValueChange={(value) => setNewActivityType(value as ClientActivityType)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tipo de actividad" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientActivityTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Textarea 
                                placeholder="Escribe una observación..." 
                                value={newActivityObservation}
                                onChange={(e) => setNewActivityObservation(e.target.value)}
                                className="sm:col-span-2"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="is-task" checked={isTask} onCheckedChange={(checked) => setIsTask(!!checked)} />
                                <Label htmlFor="is-task" className='font-normal'>Crear como Tarea</Label>
                            </div>
                            {isTask && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                        "w-[240px] justify-start text-left font-normal",
                                        !dueDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dueDate ? format(dueDate, "PPP", { locale: es }) : <span>Fecha de vencimiento</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={dueDate}
                                            onSelect={setDueDate}
                                            initialFocus
                                            locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                         <Button onClick={handleSaveClientActivity} disabled={isSavingActivity}>
                            {isSavingActivity ? (
                                <>
                                <Spinner size="small" color="white" className="mr-2" />
                                Guardando...
                                </>
                            ) : (
                                "Guardar Actividad"
                            )}
                        </Button>
                    </div>

                    <div className="mt-6 space-y-4">
                        {clientActivities.map(activity => (
                            <div key={activity.id} className="flex items-start gap-3">
                                {activity.isTask && (
                                    <Checkbox 
                                        id={`task-${activity.id}`}
                                        checked={activity.completed}
                                        onCheckedChange={() => handleTaskCompleteToggle(activity, !!activity.completed)}
                                        className="mt-1"
                                    />
                                )}
                                <div className={cn("p-2 bg-muted rounded-full", !activity.isTask && "mt-1")}>
                                    {activityIcons[activity.type]}
                                </div>
                                <div className={cn('flex-1', activity.completed && 'line-through text-muted-foreground')}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sm">{activity.type}</span>
                                        <span className="text-xs">
                                            {new Date(activity.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-sm">{activity.observation}</p>
                                    {activity.isTask && activity.dueDate && (
                                        <p className="text-xs mt-1 font-medium flex items-center">
                                            <CalendarIcon className="h-3 w-3 mr-1" />
                                            Vence: {format(new Date(activity.dueDate), "PPP", { locale: es })}
                                        </p>
                                    )}
                                    <p className="text-xs mt-1">Registrado por: {activity.userName}</p>
                                    {activity.completed && activity.completedAt && (
                                        <div className='text-xs mt-1'>
                                            <p className='font-medium flex items-center text-green-600'>
                                               <CheckCircle className="h-3 w-3 mr-1"/>
                                               Finalizada: {format(new Date(activity.completedAt), "PPP", { locale: es })}
                                            </p>
                                            <p className="text-muted-foreground">Por: {activity.completedByUserName}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {clientActivities.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No hay actividades registradas.</p>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="history">
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Cambios del Sistema</CardTitle>
                    <CardDescription>
                        Un registro automático de las acciones realizadas sobre este cliente y sus entidades asociadas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {systemActivities.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4">
                            <div className="p-2 bg-muted rounded-full">
                            {systemActivityIcons[activity.type] || getDefaultIcon()}
                            </div>
                            <div className="flex-1">
                            <div className="flex items-center justify-between">
                                <p className="text-sm" dangerouslySetInnerHTML={{ __html: activity.details }} />
                                <p className="text-sm text-muted-foreground whitespace-nowrap">
                                {new Date(activity.timestamp).toLocaleDateString()}
                                </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Por: {activity.userName || 'Usuario desconocido'}
                            </p>
                            </div>
                        </div>
                        ))}
                         {systemActivities.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No hay historial de cambios para este cliente.</p>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
      
      {isOpportunityFormOpen && (
        <OpportunityDetailsDialog
          opportunity={selectedOpportunity}
          isOpen={isOpportunityFormOpen}
          onOpenChange={setIsOpportunityFormOpen}
          onUpdate={handleOpportunityUpdate}
          onCreate={handleOpportunityCreate}
          client={{id: client.id, name: client.denominacion}}
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

      {isPersonFormOpen && (
        <PersonFormDialog
            isOpen={isPersonFormOpen}
            onOpenChange={setIsPersonFormOpen}
            onSave={handleSavePerson}
            person={selectedPerson}
        />
      )}
    </div>
  );
}
