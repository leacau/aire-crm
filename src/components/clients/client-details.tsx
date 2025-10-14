'use client'
import type { Client, Opportunity, Person, ClientActivity, ClientActivityType, ActivityLog, User, Invoice } from '@/lib/types';
import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  BellPlus,
  Clock,
  BadgeAlert,
  Star,
  CircleDollarSign,
  TrendingUp,
  Linkedin,
  ClipboardList,
  FileDown,
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
import { createPerson, getPeopleByClientId, updatePerson, getOpportunitiesByClientId, createOpportunity, updateOpportunity, createClientActivity, getClientActivities, updateClientActivity, getActivitiesForEntity, deleteOpportunity, deletePerson, getAllUsers, getInvoicesForClient } from '@/lib/firebase-service';
import { sendEmail, createCalendarEvent, deleteCalendarEvent } from '@/lib/google-gmail-service';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '../ui/spinner';
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
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ClientPdf } from './client-pdf';

const stageColors: Record<OpportunityStage, string> = {
  'Nuevo': 'bg-blue-500',
  'Propuesta': 'bg-yellow-500',
  'Negociación': 'bg-orange-500',
  'Negociación a Aprobar': 'bg-orange-500',
  'Cerrado - Ganado': 'bg-green-500',
  'Cerrado - Perdido': 'bg-red-500',
};


const activityIcons: Record<ClientActivityType, React.ReactNode> = {
    'Llamada': <PhoneCall className="h-4 w-4" />,
    'WhatsApp': <MessageSquare className="h-4 w-4" />,
    'Meet': <Video className="h-4 w-4" />,
    'Reunión': <Users className="h-4 w-4" />,
    'Visita Aire': <BuildingIcon className="h-4 w-4" />,
    'Mail': <MailIcon className="h-4 w-4" />,
    'LinkedIn': <Linkedin className="h-4 w-4" />,
    'Otra': <ClipboardList className="h-4 w-4" />,
};

const systemActivityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Edit className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
  'delete': <Trash2 className="h-5 w-5 text-red-500" />
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;


export function ClientDetails({
  client,
  onUpdate,
  onValidateCuit
}: {
  client: Client;
  onUpdate: (data: Partial<Omit<Client, 'id'>>) => void;
  onValidateCuit: (cuit: string, clientId?: string) => Promise<string | false>;
}) {
  const { userInfo, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const pdfRef = useRef<HTMLDivElement>(null);
  
  const [people, setPeople] = useState<Person[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // New Activity State
  const [newActivityType, setNewActivityType] = useState<ClientActivityType | ''>('');
  const [newActivityObservation, setNewActivityObservation] = useState('');
  const [newActivityOpportunityId, setNewActivityOpportunityId] = useState<string | undefined>();
  const [isTask, setIsTask] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState('09:00');
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isOpportunityFormOpen, setIsOpportunityFormOpen] = useState(false);
  
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isPersonFormOpen, setIsPersonFormOpen] = useState(false);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  
  const [oppToDelete, setOppToDelete] = useState<Opportunity | null>(null);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string, description: string, onConfirm: () => void} | null>(null);

  const fetchClientData = async () => {
      if(!userInfo) return;
      try {
        const [clientPeople, clientOpportunities, clientInvoices, activities, systemLogs, allUsers] = await Promise.all([
            getPeopleByClientId(client.id),
            getOpportunitiesByClientId(client.id),
            getInvoicesForClient(client.id),
            getClientActivities(client.id),
            getActivitiesForEntity(client.id),
            getAllUsers(),
        ]);
        setPeople(clientPeople);
        setOpportunities(clientOpportunities);
        setInvoices(clientInvoices);
        setClientActivities(activities);
        setSystemActivities(systemLogs);
        setUsers(allUsers);
      } catch (error) {
        console.error("Error fetching client data:", error);
        toast({ title: "Error al cargar los datos del cliente", variant: "destructive" });
      }
  }

  useEffect(() => {
    fetchClientData();
  }, [client.id, userInfo]);

  const usersMap = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {} as Record<string, User>);

  const totalPaidInvoices = invoices.filter(inv => inv.status === 'Pagada').reduce((sum, inv) => sum + inv.amount, 0);


  const canEditClient = isBoss || (userInfo?.id === client.ownerId);
  const canEditContact = isBoss || (userInfo?.id === client.ownerId);
  const canEditOpportunity = isBoss || (userInfo?.id === client.ownerId);
  const canDelete = isBoss;

  const handleOpportunityUpdate = async (updatedOpp: Partial<Opportunity>) => {
    if(!selectedOpportunity || !userInfo) return;
    try {
        const accessToken = await getGoogleAccessToken();
        await updateOpportunity(selectedOpportunity.id, updatedOpp, userInfo.id, userInfo.name, client.ownerName, accessToken);
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
        }
        await createOpportunity(fullNewOpp, userInfo.id, userInfo.name, client.ownerName);
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
        await updateOpportunity(opportunityId, { stage: newStage }, userInfo.id, userInfo.name, client.ownerName);
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
    setDueTime('09:00');
    setNewActivityOpportunityId(undefined);
  };

  const combineDateAndTime = (date: Date, time: string): Date => {
      const [hours, minutes] = time.split(':').map(Number);
      return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
  };


  const handleSaveClientActivity = async () => {
    if (!newActivityType || !newActivityObservation.trim() || !userInfo) {
        toast({ title: "Datos incompletos", description: "Selecciona un tipo y añade una observación.", variant: 'destructive'});
        return;
    }
    if (isTask && (!dueDate || !dueTime)) {
        toast({ title: "Fecha y hora de vencimiento requeridas", description: "Por favor, selecciona fecha y hora para la tarea.", variant: 'destructive'});
        return;
    }

    setIsSavingActivity(true);

    let finalDueDate: Date | undefined = undefined;
    if (isTask && dueDate) {
        finalDueDate = combineDateAndTime(dueDate, dueTime);
    }
    
    const selectedOpp = opportunities.find(opp => opp.id === newActivityOpportunityId);

    const activityPayload: Omit<ClientActivity, 'id' | 'timestamp'> = {
        clientId: client.id,
        clientName: client.denominacion,
        opportunityId: newActivityOpportunityId,
        opportunityTitle: selectedOpp?.title,
        type: newActivityType,
        observation: newActivityObservation,
        userId: userInfo.id,
        userName: userInfo.name,
        isTask,
        completed: false,
        ...(isTask && finalDueDate && { dueDate: finalDueDate.toISOString() }),
    };

    let calendarEventId: string | undefined = undefined;
    if(activityPayload.isTask && activityPayload.dueDate) {
        const token = await getGoogleAccessToken();
        if (token) {
            try {
                const calendarEvent = {
                    summary: `Tarea CRM: ${activityPayload.observation}`,
                    description: `Tarea registrada en el CRM para el cliente: ${client.denominacion}.\n\nObservación: ${activityPayload.observation}`,
                    start: { dateTime: activityPayload.dueDate },
                    end: { dateTime: activityPayload.dueDate },
                    reminders: {
                        useDefault: false,
                        overrides: [
                            { method: 'popup', minutes: 10 },
                            { method: 'popup', minutes: 60 * 24 }, // 24 hours
                        ],
                    },
                };
                const createdEvent = await createCalendarEvent(token, calendarEvent);
                calendarEventId = createdEvent.id;
            } catch(e) {
                 console.error("Failed to create calendar event", e);
                 toast({ title: "Error al crear evento en calendario", description: "La tarea se guardó en el CRM, pero no se pudo crear el evento en Google Calendar.", variant: "destructive"});
            }
        }
    }


    try {
        if (calendarEventId) {
            activityPayload.googleCalendarEventId = calendarEventId;
        }
        await createClientActivity(activityPayload);
        toast({ title: "Actividad Registrada" });
        resetActivityForm();
        fetchClientData(); // Refresh activities
    } catch (error) {
        console.error("Error saving client activity:", error);
        toast({ title: "Error al guardar la actividad", variant: 'destructive' });
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

      // If task is completed, delete the calendar event
      if(completed && activity.googleCalendarEventId) {
          const token = await getGoogleAccessToken();
          if (token) {
              try {
                  await deleteCalendarEvent(token, activity.googleCalendarEventId);
                  payload.googleCalendarEventId = null; // Remove from our db
              } catch(e) {
                  console.error("Failed to delete calendar event", e);
                  // Non-blocking, the user can delete it manually
              }
          }
      }

      try {
          await updateClientActivity(activity.id, payload);
          fetchClientData();
          toast({ title: `Tarea ${!currentStatus ? 'completada' : 'marcada como pendiente'}`});
      } catch (error) {
          console.error("Error updating task status", error);
          toast({ title: "Error al actualizar la tarea", variant: 'destructive' });
      }
  }

  const handleConvertToTask = async (activity: ClientActivity, newDueDate: Date) => {
    if (!userInfo) return;

    let calendarEventId: string | undefined = undefined;
    const token = await getGoogleAccessToken();
    if (token) {
        try {
            const calendarEvent = {
                summary: `Tarea CRM: ${activity.observation}`,
                description: `Tarea registrada en el CRM para el cliente: ${client.denominacion}.\n\nObservación: ${activity.observation}`,
                start: { dateTime: newDueDate.toISOString() },
                end: { dateTime: newDueDate.toISOString() },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 10 },
                        { method: 'popup', minutes: 60 * 24 }, // 24 hours
                    ],
                },
            };
            const createdEvent = await createCalendarEvent(token, calendarEvent);
            calendarEventId = createdEvent.id;
        } catch(e) {
             console.error("Failed to create calendar event", e);
             toast({ title: "Error al crear evento en calendario", variant: "destructive"});
        }
    }

    try {
      const payload: Partial<ClientActivity> = {
        isTask: true,
        dueDate: newDueDate.toISOString(),
        ...(calendarEventId && { googleCalendarEventId: calendarEventId })
      };
      await updateClientActivity(activity.id, payload);
      fetchClientData();
      toast({ title: 'Actividad convertida en Tarea' });
    } catch (error) {
      console.error('Error converting to task', error);
      toast({ title: 'Error al crear la tarea', variant: 'destructive' });
    }
  };

  const handleSendTaskEmail = async (task: ClientActivity) => {
    if (!userInfo || !userInfo.email) return;

    setIsSendingEmail(task.id);
    try {
        const accessToken = await getGoogleAccessToken();
        if (!accessToken) {
            throw new Error("No se pudo obtener el token de acceso de Google.");
        }
        
        const subject = `Recordatorio de Tarea: ${task.observation}`;
        const body = `
            <p>Hola ${userInfo.name},</p>
            <p>Este es un recordatorio para tu tarea pendiente:</p>
            <p><strong>Tarea:</strong> ${task.observation}</p>
            <p><strong>Cliente:</strong> ${task.clientName}</p>
            ${task.dueDate ? `<p><strong>Vence:</strong> ${format(new Date(task.dueDate), 'PPP p', { locale: es })}</p>` : ''}
            <p>Puedes ver más detalles en el <a href="https://aire-crm.vercel.app/clients/${task.clientId}">CRM</a>.</p>
        `;

        await sendEmail({
            accessToken,
            to: userInfo.email,
            subject,
            body,
        });

        toast({ title: "Correo de recordatorio enviado" });

    } catch (error: any) {
        console.error("Error sending task email:", error);
        toast({ title: "Error al enviar el correo", description: error.message, variant: "destructive" });
    } finally {
        setIsSendingEmail(null);
    }
  };


  const handleSaveClient = (clientData: any) => {
    onUpdate(clientData);
  };

  const openDeleteDialog = (item: Opportunity | Person, type: 'opportunity' | 'person') => {
    const onConfirm = type === 'opportunity' 
        ? () => confirmDeleteOpportunity(item as Opportunity) 
        : () => confirmDeletePerson(item as Person);

    const title = type === 'opportunity' ? '¿Eliminar oportunidad?' : '¿Eliminar contacto?';
    const description = `Esta acción es irreversible. Se eliminará permanentemente <strong>${(item as any).title || (item as any).name}</strong>.`;

    setAlertConfig({ title, description, onConfirm });
    setIsAlertOpen(true);
  };
  
  const confirmDeleteOpportunity = async (opp: Opportunity) => {
    if (!userInfo) return;
    try {
      await deleteOpportunity(opp.id, userInfo.id, userInfo.name);
      toast({ title: "Oportunidad Eliminada" });
      fetchClientData(); // Refresh the list
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      toast({ title: "Error al eliminar la oportunidad", variant: "destructive" });
    } finally {
      setIsAlertOpen(false);
      setAlertConfig(null);
    }
  };
  
  const confirmDeletePerson = async (person: Person) => {
    if (!userInfo) return;
    try {
      await deletePerson(person.id, userInfo.id, userInfo.name);
      fetchClientData();
    } catch (error) {
      console.error("Error deleting person:", error);
      toast({ title: "Error al eliminar el contacto", variant: "destructive" });
    } finally {
      setIsAlertOpen(false);
      setAlertConfig(null);
    }
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    const element = pdfRef.current;
    if (!element) {
      setIsGeneratingPdf(false);
      return;
    }

    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      const ratio = imgWidth / imgHeight;
      const widthInPdf = pdfWidth;
      const heightInPdf = widthInPdf / ratio;
      
      let y = 0;
      if (heightInPdf < pdfHeight) {
        y = (pdfHeight - heightInPdf) / 2;
      }
      
      pdf.addImage(imgData, 'PNG', 0, y, widthInPdf, heightInPdf);
      pdf.save(`ALTA-${client.denominacion.replace(/ /g, "_")}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
      toast({ title: "Error al generar el PDF", variant: "destructive" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };


  const ConvertToTaskPopover = ({ activity }: { activity: ClientActivity }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [newDueDate, setNewDueDate] = useState<Date | undefined>();
    const [newDueTime, setNewDueTime] = useState('09:00');

    const onSave = () => {
      if (newDueDate && newDueTime) {
        const finalDate = combineDateAndTime(newDueDate, newDueTime);
        handleConvertToTask(activity, finalDate);
        setPopoverOpen(false);
      } else {
        toast({ title: 'Selecciona fecha y hora', variant: 'destructive' });
      }
    };

    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
            <BellPlus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={newDueDate}
            onSelect={setNewDueDate}
            initialFocus
            locale={es}
          />
          <div className="p-2 border-t">
            <Label htmlFor="convert-time" className="text-xs">Hora</Label>
            <Input id="convert-time" type="time" value={newDueTime} onChange={e => setNewDueTime(e.target.value)} />
          </div>
          <div className="p-2 border-t flex justify-end">
            <Button size="sm" onClick={onSave}>Guardar Tarea</Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };
  
  return (
    <>
    <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        <ClientPdf ref={pdfRef} client={client} contact={people[0] || null} />
    </div>
    <div className="space-y-6">
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <Card className='md:col-span-2'>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-2xl truncate">{client.denominacion}</CardTitle>
                        <CardDescription className="truncate">{client.razonSocial}</CardDescription>
                         <div className="flex items-center gap-2 mt-2">
                          {client.isNewClient && client.newClientDate && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                              <Star className="h-3 w-3 mr-1" />
                              Nuevo ({format(new Date(client.newClientDate), 'dd/MM/yy')})
                            </Badge>
                          )}
                          {client.isDeactivated && (
                            <Badge variant="destructive">
                              <BadgeAlert className="h-3 w-3 mr-1" />
                              Dado de Baja
                              {client.deactivationHistory && client.deactivationHistory.length > 0 &&
                                ` (${format(new Date(client.deactivationHistory[client.deactivationHistory.length - 1]), 'dd/MM/yy')})`
                              }
                            </Badge>
                          )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                     <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                        {isGeneratingPdf ? <Spinner size="small" /> : <FileDown className="h-4 w-4" />}
                     </Button>
                    {canEditClient && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsClientFormOpen(true)}>
                            <Edit className="h-4 w-4" />
                        </Button>
                    )}
                 </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
             {client.cuit && (
              <div className="flex items-center gap-3">
                <FileDigit className="h-4 w-4 text-muted-foreground" />
                <span>{client.cuit}</span>
              </div>
             )}
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
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Total Histórico Facturado
                </CardTitle>
                <CardDescription>Suma de todas las facturas pagadas de este cliente.</CardDescription>
            </CardHeader>
            <CardContent>
                 <p className="text-3xl font-bold">${totalPaidInvoices.toLocaleString('es-AR')}</p>
            </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="opportunities" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
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
                  Nueva
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
                     { canDelete && <TableHead className="w-[50px]"></TableHead> }
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
                      <TableCell>${opp.value.toLocaleString('es-AR')}</TableCell>
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
                       {canDelete && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem className="text-destructive" onClick={() => openDeleteDialog(opp, 'opportunity')}>Eliminar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                   {opportunities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canDelete ? 4 : 3} className="h-24 text-center">
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
                    Nuevo
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
                                <MessageSquare className="h-4 w-4" />
                            </a>
                            </Button>
                        </>
                        )}
                        {canEditContact && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPersonForm(person)}><Edit className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDeleteDialog(person, 'person')}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select value={newActivityType} onValueChange={(value) => setNewActivityType(value as ClientActivityType)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tipo de actividad" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientActivityTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                </SelectContent>
                            </Select>
                             <div className="flex items-center space-x-2">
                                <Checkbox id="is-task" checked={isTask} onCheckedChange={(checked) => setIsTask(!!checked)} />
                                <Label htmlFor="is-task" className='font-normal'>Crear como Tarea/Recordatorio</Label>
                            </div>
                        </div>
                        <Textarea 
                            placeholder="Escribe una observación..." 
                            value={newActivityObservation}
                            onChange={(e) => setNewActivityObservation(e.target.value)}
                            className="sm:col-span-2"
                        />
                        {isTask && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Oportunidad (Opcional)</Label>
                                    <Select value={newActivityOpportunityId} onValueChange={setNewActivityOpportunityId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Asociar a oportunidad..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Ninguna</SelectItem>
                                            {opportunities.map(opp => <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2 md:col-span-2">
                                  <Popover>
                                      <PopoverTrigger asChild>
                                      <Button
                                          variant={"outline"}
                                          className={cn(
                                          "w-full justify-start text-left font-normal",
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
                                  <div className="relative">
                                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="time"
                                        value={dueTime}
                                        onChange={(e) => setDueTime(e.target.value)}
                                        className="pl-8 w-[120px]"
                                    />
                                   </div>
                                </div>
                            </div>
                        )}
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
                        {clientActivities.map(activity => {
                            const userName = usersMap[activity.userId]?.name || activity.userName;
                            const completedByUserName = activity.completedByUserId ? (usersMap[activity.completedByUserId]?.name || activity.completedByUserName) : undefined;
                            return (
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
                                            <div className='flex items-center gap-2'>
                                                <span className="font-semibold text-sm">{activity.type}</span>
                                                {!activity.isTask && <ConvertToTaskPopover activity={activity} />}
                                            </div>
                                            <span className="text-xs">
                                                {new Date(activity.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-sm">{activity.observation}</p>
                                        {activity.opportunityTitle && (
                                          <p className="text-xs mt-1 font-medium flex items-center text-muted-foreground">
                                            <CircleDollarSign className="h-3 w-3 mr-1" />
                                            Oportunidad: {activity.opportunityTitle}
                                          </p>
                                        )}
                                        {activity.isTask && activity.dueDate && (
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs mt-1 font-medium flex items-center">
                                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                                    Vence: {format(new Date(activity.dueDate), "PPP p", { locale: es })}
                                                </p>
                                                {!activity.completed && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-primary mt-1"
                                                        onClick={() => handleSendTaskEmail(activity)}
                                                        disabled={isSendingEmail === activity.id}
                                                    >
                                                        {isSendingEmail === activity.id 
                                                            ? <Spinner size="small" /> 
                                                            : <Mail className="h-4 w-4" />
                                                        }
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                        <p className="text-xs mt-1">Registrado por: {userName}</p>
                                        {activity.completed && activity.completedAt && (
                                            <div className='text-xs mt-1'>
                                                <p className='font-medium flex items-center text-green-600'>
                                                <CheckCircle className="h-3 w-3 mr-1"/>
                                                Finalizada: {format(new Date(activity.completedAt), "PPP", { locale: es })}
                                                </p>
                                                <p className="text-muted-foreground">Por: {completedByUserName}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {clientActivities.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No hay actividades registradas.</p>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="history">
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Cambios</CardTitle>
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
                                Por: {usersMap[activity.userId]?.name || 'Usuario desconocido'}
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
            onValidateCuit={onValidateCuit}
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
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>{alertConfig?.title}</AlertDialogTitle>
            <AlertDialogDescription dangerouslySetInnerHTML={{ __html: alertConfig?.description || '' }} />
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsAlertOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => alertConfig?.onConfirm()} variant="destructive">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
