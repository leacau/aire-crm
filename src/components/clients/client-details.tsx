'use client'
import type { Client, Opportunity, Person, ClientActivity, ClientActivityType, ActivityLog, User, CommercialNote, Program } from '@/lib/types';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
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
  Building,
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
  Eye,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '../ui/button';
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
import { ClientFormDialog } from './client-form-dialog';
import { PersonFormDialog } from '@/components/people/person-form-dialog';
import { createClientActivity, updateClientActivity } from '@/lib/api/client-activities';
import { getActivitiesForEntity } from '@/lib/api/activities';
import { getCommercialNotesByClientId, deleteCommercialNote } from '@/lib/api/commercial-notes';
import {
  getClientActivities,
  getClientTangoBillingSummary,
  getOpportunitiesByClientId,
  getPeopleByClientId,
  type ClientTangoBillingSummary,
} from '@/lib/api/clients';
import { deleteOpportunity, updateOpportunity } from '@/lib/api/opportunities';
import { createPerson, deletePerson, updatePerson } from '@/lib/api/people';
import { getPrograms } from '@/lib/api/programs';
import { getAllUsers } from '@/lib/api/users';
import { sendEmail, createCalendarEvent, deleteCalendarEvent } from '@/lib/api/google-services';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeActivityHtml } from '@/lib/sanitize-html';
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
import { CommentThread } from '@/components/comments/comment-thread';
import { NotePdf } from '@/components/notas/note-pdf';
import { generatePaginatedPdfFromElement } from '@/lib/pdf-utils';
import { ClientTangoInvoices } from './client-tango-invoices';

const stageColors: Record<OpportunityStage, string> = {
  'Nuevo': 'bg-blue-500',
  'Propuesta': 'bg-yellow-500',
  'Negociación': 'bg-orange-500',
  'Negociación a Aprobar': 'bg-purple-500',
  'Cerrado - Ganado': 'bg-green-500',
  'Cerrado - Perdido': 'bg-red-500',
  'Cerrado - No Definido': 'bg-gray-500',
};


const activityIcons: Record<ClientActivityType, React.ReactNode> = {
    'Llamada': <PhoneCall className="h-4 w-4" />,
    'WhatsApp': <MessageSquare className="h-4 w-4" />,
    'Meet': <Video className="h-4 w-4" />,
    'Reunión': <Users className="h-4 w-4" />,
    'Visita Aire': <BuildingIcon className="h-4 w-4" />,
    'Visita a empresa': <Building className="h-4 w-4" />,
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

const quickClientActions: Array<{
  type: ClientActivityType;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    type: 'Llamada',
    label: 'Telefono',
    description: 'Registrar llamada',
    icon: <PhoneCall className="h-5 w-5" />,
  },
  {
    type: 'Mail',
    label: 'Mail',
    description: 'Registrar email',
    icon: <MailIcon className="h-5 w-5" />,
  },
  {
    type: 'WhatsApp',
    label: 'WhatsApp',
    description: 'Registrar WhatsApp',
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    type: 'Visita a empresa',
    label: 'Visita',
    description: 'Registrar visita presencial',
    icon: <Users className="h-5 w-5" />,
  },
  {
    type: 'Meet',
    label: 'Meet',
    description: 'Registrar reunion virtual',
    icon: <Video className="h-5 w-5" />,
  },
];

const formatMoney = (value: number) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);


export function ClientDetails({
  client,
  onUpdate,
  onValidateCuit,
  onCreateOpportunity,
  initialOpportunityId,
}: {
  client: Client;
  onUpdate: (data: Partial<Omit<Client, 'id'>>) => void;
  onValidateCuit: (cuit: string, clientId?: string) => Promise<string | false>;
  onCreateOpportunity: (newOppData: Omit<Opportunity, 'id'>) => void;
  initialOpportunityId?: string;
}) {
  const { userInfo, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const pdfRef = useRef<HTMLDivElement>(null);
  const notePdfRef = useRef<HTMLDivElement>(null); // Referencia para el PDF de la nota
  const hasOpenedInitialOpportunityRef = useRef(false);
  
  const [people, setPeople] = useState<Person[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tangoBillingSummary, setTangoBillingSummary] = useState<ClientTangoBillingSummary | null>(null);
  const [isLoadingTangoBilling, setIsLoadingTangoBilling] = useState(false);
  const [tangoBillingError, setTangoBillingError] = useState<string | null>(null);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notes, setNotes] = useState<CommercialNote[]>([]); 
  const [programs, setPrograms] = useState<Program[]>([]); // Necesario para el PDF de la nota
  
  // PDF Generation State for Notes
  const [downloadingNoteId, setDownloadingNoteId] = useState<string | null>(null);
  const [noteForPdf, setNoteForPdf] = useState<CommercialNote | null>(null);

  // New Activity State
  const [newActivityType, setNewActivityType] = useState<ClientActivityType | ''>('');
  const [newActivityObservation, setNewActivityObservation] = useState('');
  const [newActivityOpportunityId, setNewActivityOpportunityId] = useState<string | undefined>();
  const [isTask, setIsTask] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState('09:00');
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [quickActivity, setQuickActivity] = useState<{ type: ClientActivityType; label: string } | null>(null);
  const [quickActivityObservation, setQuickActivityObservation] = useState('');
  const [isSavingQuickActivity, setIsSavingQuickActivity] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isRightRailOpen, setIsRightRailOpen] = useState(true);

  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isOpportunityFormOpen, setIsOpportunityFormOpen] = useState(false);
  
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isPersonFormOpen, setIsPersonFormOpen] = useState(false);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  
  const [oppToDelete, setOppToDelete] = useState<Opportunity | null>(null);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string, description: string, onConfirm: () => void} | null>(null);

  const fetchClientData = useCallback(async () => {
      if(!userInfo) return;
      try {
        const [clientPeople, clientOpportunities, activities, systemLogs, allUsers, clientNotes, allPrograms] = await Promise.all([
            getPeopleByClientId(client.id),
            getOpportunitiesByClientId(client.id),
            getClientActivities(client.id),
            getActivitiesForEntity(client.id),
            getAllUsers(),
            getCommercialNotesByClientId(client.id),
            getPrograms() // Traemos los programas
        ]);
        setPeople(clientPeople);
        setOpportunities(clientOpportunities);
        setClientActivities(activities);
        setSystemActivities(systemLogs);
        setUsers(allUsers);
        setNotes(clientNotes);
        setPrograms(allPrograms);
      } catch (error) {
        console.error("Error fetching client data:", error);
        toast({ title: "Error al cargar los datos del cliente", variant: "destructive" });
      }
  }, [client.id, toast, userInfo]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const fetchTangoBillingSummary = useCallback(async () => {
    if (!userInfo) return;
    setIsLoadingTangoBilling(true);
    setTangoBillingError(null);

    try {
      setTangoBillingSummary(await getClientTangoBillingSummary(client.id));
    } catch (error) {
      console.error('Error fetching Tango billing summary:', error);
      setTangoBillingSummary(null);
      setTangoBillingError(error instanceof Error ? error.message : 'No se pudo cargar el total de Tango.');
    } finally {
      setIsLoadingTangoBilling(false);
    }
  }, [client.id, userInfo]);

  useEffect(() => {
    fetchTangoBillingSummary();
  }, [fetchTangoBillingSummary]);

  const usersMap = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {} as Record<string, User>);

  const canEditClient = isBoss || (userInfo?.id === client.ownerId);
  const canEditContact = isBoss || (userInfo?.id === client.ownerId);
  const canEditOpportunity = isBoss || (userInfo?.id === client.ownerId);
  const canDelete = isBoss;

  // ... (Funciones de oportunidad, contacto, actividad existentes sin cambios) ...
  const handleOpportunityUpdate = async (updatedOpp: Partial<Opportunity>) => {
    if(!selectedOpportunity || !userInfo) return;
    try {
        await updateOpportunity(selectedOpportunity.id, updatedOpp);
        fetchClientData();
        toast({ title: 'Oportunidad Actualizada' });
    } catch (error) {
        console.error("Error updating opportunity", error);
        toast({ title: "Error al actualizar la oportunidad", variant: 'destructive' });
    }
  };


  const handleStageChange = async (opportunityId: string, newStage: OpportunityStage) => {
    if (!canEditOpportunity || !userInfo) return;
    const originalOpportunities = opportunities;
    const updatedOpportunities = opportunities.map(opp => opp.id === opportunityId ? { ...opp, stage: newStage } : opp);
    setOpportunities(updatedOpportunities);
    try {
        await updateOpportunity(opportunityId, { stage: newStage });
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

  useEffect(() => {
    if (!initialOpportunityId) return;
    if (hasOpenedInitialOpportunityRef.current) return;
    if (opportunities.length === 0) return;
    const targetOpportunity = opportunities.find(opportunity => opportunity.id === initialOpportunityId);
    if (!targetOpportunity) return;
    setSelectedOpportunity(targetOpportunity);
    setIsOpportunityFormOpen(true);
    hasOpenedInitialOpportunityRef.current = true;
  }, [initialOpportunityId, opportunities]);
  
  const handleOpenPersonForm = (person: Person | null = null) => {
    setSelectedPerson(person);
    setIsPersonFormOpen(true);
  }

  const handleSavePerson = async (personData: Omit<Person, 'id' | 'clientIds'> & { clientIds?: string[]}) => {
     if(!userInfo) return;
     try {
        if (selectedPerson) { // Editing existing person
            await updatePerson(selectedPerson.id, personData);
            fetchClientData();
            toast({ title: "Contacto Actualizado" });
        } else { // Creating new person
            const newPersonData = { ...personData, clientIds: [client.id] };
            await createPerson(newPersonData);
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
        toast({ title: "Error al guardar la actividad", variant: "destructive" });
    } finally {
        setIsSavingActivity(false);
    }
  }

  const handleSaveQuickClientActivity = async () => {
    if (!quickActivity || !userInfo) return;

    setIsSavingQuickActivity(true);
    try {
      const observation = quickActivityObservation.trim()
        || `${quickActivity.label} registrada automaticamente.`;

      await createClientActivity({
        clientId: client.id,
        clientName: client.denominacion,
        type: quickActivity.type,
        observation,
        userId: userInfo.id,
        userName: userInfo.name,
        isTask: false,
        completed: false,
      });

      toast({ title: 'Accion registrada', description: `${quickActivity.label} asentada en el historial del cliente.` });
      setQuickActivity(null);
      setQuickActivityObservation('');
      fetchClientData();
    } catch (error) {
      console.error('Error saving quick client activity:', error);
      toast({ title: 'Error al registrar la accion', variant: 'destructive' });
    } finally {
      setIsSavingQuickActivity(false);
    }
  };

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

  const openDeleteDialog = (item: Opportunity | Person | CommercialNote, type: 'opportunity' | 'person' | 'note') => {
    let onConfirm: () => void;
    let title: string;
    let description: string;

    if (type === 'opportunity') {
        onConfirm = () => confirmDeleteOpportunity(item as Opportunity);
        title = '¿Eliminar oportunidad?';
        description = `Esta acción es irreversible. Se eliminará permanentemente <strong>${(item as Opportunity).title}</strong>.`;
    } else if (type === 'person') {
        onConfirm = () => confirmDeletePerson(item as Person);
        title = '¿Eliminar contacto?';
        description = `Esta acción es irreversible. Se eliminará permanentemente <strong>${(item as Person).name}</strong>.`;
    } else {
        // NOTE deletion
        onConfirm = () => confirmDeleteNote(item as CommercialNote);
        title = '¿Eliminar nota comercial?';
        description = `Esta acción es irreversible. Se eliminará permanentemente la nota <strong>${(item as CommercialNote).title}</strong>.`;
    }

    setAlertConfig({ title, description, onConfirm });
    setIsAlertOpen(true);
  };
  
  const confirmDeleteOpportunity = async (opp: Opportunity) => {
    if (!userInfo) return;
    try {
      await deleteOpportunity(opp.id);
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
      await deletePerson(person.id);
      fetchClientData();
    } catch (error) {
      console.error("Error deleting person:", error);
      toast({ title: "Error al eliminar el contacto", variant: "destructive" });
    } finally {
      setIsAlertOpen(false);
      setAlertConfig(null);
    }
  };
  
  // NUEVO: Función para confirmar borrado de nota
  const confirmDeleteNote = async (note: CommercialNote) => {
    if (!userInfo) return;
    try {
        await deleteCommercialNote(note.id);
        toast({ title: "Nota Comercial Eliminada" });
        fetchClientData();
    } catch (error) {
        console.error("Error deleting note:", error);
        toast({ title: "Error al eliminar la nota", variant: "destructive" });
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

  // Función auxiliar para capturar y generar PDF multipágina
  const generateMultiPagePdf = async (element: HTMLElement, title: string) => generatePaginatedPdfFromElement(element);

  // Función para descargar PDF de Nota
  const handleDownloadNotePdf = async (note: CommercialNote) => {
    setNoteForPdf(note);
    setDownloadingNoteId(note.id);

    // Esperamos un momento para que React renderice el componente oculto con los datos de la nota
    setTimeout(async () => {
        if (!notePdfRef.current) {
            setDownloadingNoteId(null);
            setNoteForPdf(null);
            return;
        }
        try {
            const pdf = await generateMultiPagePdf(notePdfRef.current, note.title);
            pdf.save(`Nota_${note.title.replace(/ /g, "_")}.pdf`);
        } catch (error) {
            console.error(error);
            toast({ title: "Error al generar PDF de la nota", variant: "destructive" });
        } finally {
            setDownloadingNoteId(null);
            setNoteForPdf(null);
        }
    }, 500); // 500ms delay to ensure render
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

  const primaryContact = people[0] || null;
  const openOpportunities = opportunities.filter(opp => !opp.stage.startsWith('Cerrado'));
  const totalOpportunityValue = openOpportunities.reduce((total, opp) => total + (opp.value || 0), 0);
  const recentClientActivities = [...clientActivities]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);
  const pendingTasks = clientActivities
    .filter(activity => activity.isTask && !activity.completed)
    .sort((a, b) => new Date(a.dueDate || a.timestamp).getTime() - new Date(b.dueDate || b.timestamp).getTime())
    .slice(0, 4);
  const latestActivity = recentClientActivities[0];
  
  return (
    <>
    <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        <ClientPdf ref={pdfRef} client={client} contact={people[0] || null} />
    </div>
    
    {/* Hidden Note PDF Render Container */}
    <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        {noteForPdf && (
            <NotePdf 
                ref={notePdfRef} 
                note={noteForPdf} 
                programs={programs} 
            />
        )}
    </div>

    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-4 xl:items-start",
          isRightRailOpen
            ? "xl:grid-cols-[320px_minmax(0,1fr)_320px]"
            : "xl:grid-cols-[320px_minmax(0,1fr)]"
        )}
      >
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-xl">{client.denominacion}</CardTitle>
                  <CardDescription className="truncate">{client.razonSocial}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
              <div className="flex flex-wrap gap-2 pt-2">
                {client.isNewClient && client.newClientDate && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <Star className="mr-1 h-3 w-3" />
                    Nuevo ({format(new Date(client.newClientDate), 'dd/MM/yy')})
                  </Badge>
                )}
                {client.isDeactivated && (
                  <Badge variant="destructive">
                    <BadgeAlert className="mr-1 h-3 w-3" />
                    Dado de Baja
                    {client.deactivationHistory && client.deactivationHistory.length > 0 &&
                      ` (${format(new Date(client.deactivationHistory[client.deactivationHistory.length - 1]), 'dd/MM/yy')})`
                    }
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{client.ownerName || 'Sin asesor asignado'}</span>
              </div>
              {client.cuit && (
                <div className="flex items-center gap-3">
                  <FileDigit className="h-4 w-4 text-muted-foreground" />
                  <span>{client.cuit}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{client.rubro || 'Sin rubro'}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{client.localidad}, {client.provincia}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{client.email || 'Sin email'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{client.phone || 'Sin telefono'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Acciones rapidas
              </CardTitle>
              <CardDescription>Asenta una actividad de hoy en pocos segundos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {quickClientActions.map(action => (
                  <Button
                    key={action.type}
                    type="button"
                    variant="outline"
                    className="h-auto flex-col items-center gap-2 px-2 py-3 text-center hover:border-primary hover:bg-primary/5"
                    onClick={() => {
                      setQuickActivity({ type: action.type, label: action.label });
                      setQuickActivityObservation('');
                    }}
                  >
                    <span className="rounded-full bg-primary/10 p-2 text-primary">{action.icon}</span>
                    <span className="text-xs font-bold">{action.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informacion clave</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Condicion IVA</p>
                <p className="font-medium">{client.condicionIVA}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo de entidad</p>
                <p className="font-medium">{client.tipoEntidad}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ultima actividad</p>
                <p className="font-medium">
                  {latestActivity ? format(new Date(latestActivity.timestamp), 'dd/MM/yyyy HH:mm') : 'Sin actividad registrada'}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4">
          <Tabs defaultValue="highlights" className="w-full">
            <div className="flex flex-col gap-3 rounded-md border bg-background p-2 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="grid h-auto w-full grid-cols-2 bg-transparent p-0 md:grid-cols-4 lg:w-auto">
                <TabsTrigger value="highlights" className="rounded-sm px-4 py-2">Informacion destacada</TabsTrigger>
                <TabsTrigger value="info" className="rounded-sm px-4 py-2">Informacion</TabsTrigger>
                <TabsTrigger value="activity" className="rounded-sm px-4 py-2">Actividades</TabsTrigger>
                <TabsTrigger value="income" className="rounded-sm px-4 py-2">Ingresos</TabsTrigger>
              </TabsList>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden shrink-0 xl:inline-flex"
                onClick={() => setIsRightRailOpen(current => !current)}
              >
                {isRightRailOpen ? <PanelRightClose className="mr-2 h-4 w-4" /> : <PanelRightOpen className="mr-2 h-4 w-4" />}
                {isRightRailOpen ? 'Ocultar panel' : 'Mostrar panel'}
              </Button>
            </div>

            <TabsContent value="highlights" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vista general</CardTitle>
                  <CardDescription>Resumen comercial del cliente y su actividad reciente.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs uppercase text-muted-foreground">Facturacion Tango</p>
                    {isLoadingTangoBilling ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner size="small" />
                        Consultando...
                      </div>
                    ) : (
                      <>
                        <p className="mt-1 text-2xl font-bold">{formatMoney(tangoBillingSummary?.total || 0)}</p>
                        <p className="text-xs text-muted-foreground">{tangoBillingSummary?.invoiceCount || 0} comprobantes oficiales</p>
                      </>
                    )}
                  </div>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs uppercase text-muted-foreground">Oportunidades abiertas</p>
                    <p className="mt-1 text-2xl font-bold">{openOpportunities.length}</p>
                    <p className="text-xs text-muted-foreground">{formatMoney(totalOpportunityValue)} en pipeline</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs uppercase text-muted-foreground">Contactos</p>
                    <p className="mt-1 text-2xl font-bold">{people.length}</p>
                    <p className="text-xs text-muted-foreground">{primaryContact?.name || 'Sin contacto principal'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Interacciones recientes</CardTitle>
                    <CardDescription>Ultimos movimientos asentados por el equipo comercial.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setQuickActivity({ type: 'Mail', label: 'Mail' })}>
                    <Mail className="mr-2 h-4 w-4" />
                    Crear correo
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border p-4">
                      <h4 className="font-semibold">Entrantes</h4>
                      <p className="mt-12 text-center text-sm text-muted-foreground">No hay actividad entrante diferenciada en este registro.</p>
                    </div>
                    <div className="rounded-md border p-4">
                      <h4 className="font-semibold">Salientes</h4>
                      <div className="mt-4 space-y-4">
                        {recentClientActivities.map(activity => (
                          <div key={activity.id} className="flex gap-3">
                            <div className="mt-0.5 rounded-full bg-muted p-2">{activityIcons[activity.type]}</div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{activity.type} registrada</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(activity.timestamp), 'dd/MM/yyyy')}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{activity.observation}</p>
                            </div>
                          </div>
                        ))}
                        {recentClientActivities.length === 0 && (
                          <p className="py-10 text-center text-sm text-muted-foreground">No hay interacciones registradas.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Oportunidades principales</CardTitle>
                  <CardDescription>Negocios abiertos asociados a este cliente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openOpportunities.slice(0, 4).map(opp => (
                    <button
                      key={opp.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/50"
                      onClick={() => handleOpenOpportunityForm(opp)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{opp.title}</p>
                        <p className="text-xs text-muted-foreground">{opp.stage}</p>
                      </div>
                      <p className="shrink-0 font-bold">{formatMoney(opp.value)}</p>
                    </button>
                  ))}
                  {openOpportunities.length === 0 && (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No hay oportunidades abiertas.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="info" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Informacion de la empresa</CardTitle>
                  <CardDescription>Datos administrativos y comerciales del cliente.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm md:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Denominacion</p><p className="font-medium">{client.denominacion}</p></div>
                  <div><p className="text-xs text-muted-foreground">Razon social</p><p className="font-medium">{client.razonSocial}</p></div>
                  <div><p className="text-xs text-muted-foreground">CUIT</p><p className="font-medium">{client.cuit || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Condicion IVA</p><p className="font-medium">{client.condicionIVA}</p></div>
                  <div><p className="text-xs text-muted-foreground">Rubro</p><p className="font-medium">{client.rubro || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ubicacion</p><p className="font-medium">{client.localidad}, {client.provincia}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{client.email || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Telefono</p><p className="font-medium">{client.phone || '-'}</p></div>
                  <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Observaciones</p><p className="whitespace-pre-wrap font-medium">{client.observaciones || '-'}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>IDs Tango</CardTitle>
                  <CardDescription>Vinculos usados para mapear facturacion oficial.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {client.idAire && <Badge variant="outline">Aire: {client.idAire}</Badge>}
                    {client.idAireSrl && <Badge variant="outline">Aire SRL: {client.idAireSrl}</Badge>}
                    {client.idAireDigital && <Badge variant="outline">Aire Digital: {client.idAireDigital}</Badge>}
                    {!client.idAireSrl && client.idTango && <Badge variant="outline">ID Tango: {client.idTango}</Badge>}
                    {!client.idAireDigital && client.tangoCompanyId && <Badge variant="outline">ID Tango Alt: {client.tangoCompanyId}</Badge>}
                    {!client.idAire && !client.idAireSrl && !client.idAireDigital && !client.idTango && !client.tangoCompanyId && (
                      <p className="text-sm text-muted-foreground">Este cliente no tiene IDs Tango vinculados.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {userInfo && (
                <CommentThread
                  entityType="client"
                  entityId={client.id}
                  entityName={client.denominacion}
                  ownerId={client.ownerId}
                  ownerName={client.ownerName}
                  currentUser={userInfo}
                  getAccessToken={getGoogleAccessToken}
                />
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Notas comerciales</CardTitle>
                  <CardDescription>Documentos y propuestas historicas asociadas al cliente.</CardDescription>
                </CardHeader>
                <CardContent>
                  {notes.map(note => (
                    <div key={note.id} className="flex flex-col gap-3 border-b py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{note.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(note.createdAt), "PPP", { locale: es })} - Por: {note.advisorName}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/notas/${note.id}`} target="_blank">
                            <Eye className="mr-2 h-4 w-4" />
                            Ver
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadNotePdf(note)} disabled={downloadingNoteId === note.id}>
                          {downloadingNoteId === note.id ? <Spinner size="small" className="mr-2"/> : <FileDown className="mr-2 h-4 w-4" />}
                          PDF
                        </Button>
                        {isBoss && (
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(note, 'note')} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="text-center text-sm text-muted-foreground">No hay notas registradas.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Historial de cambios</CardTitle>
                  <CardDescription>Registro automatico de cambios realizados sobre el cliente.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {systemActivities.slice(0, 8).map((activity) => (
                      <div key={activity.id} className="flex items-start gap-4">
                        <div className="rounded-full bg-muted p-2">
                          {systemActivityIcons[activity.type] || getDefaultIcon()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <p className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeActivityHtml(activity.details) }} />
                            <p className="text-xs text-muted-foreground sm:whitespace-nowrap">
                              {new Date(activity.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Por: {usersMap[activity.userId]?.name || 'Usuario desconocido'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {systemActivities.length === 0 && <p className="text-center text-sm text-muted-foreground">No hay historial de cambios para este cliente.</p>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Actividades</CardTitle>
                  <CardDescription>Registra interacciones, crea tareas y revisa el historial del cliente.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 rounded-md border p-4">
                    <h4 className="font-medium">Nueva actividad</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Select value={newActivityType} onValueChange={(value) => setNewActivityType(value as ClientActivityType)}>
                        <SelectTrigger><SelectValue placeholder="Tipo de actividad" /></SelectTrigger>
                        <SelectContent>{clientActivityTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="new-is-task" checked={isTask} onCheckedChange={(checked) => setIsTask(!!checked)} />
                        <Label htmlFor="new-is-task" className="font-normal">Crear como tarea/recordatorio</Label>
                      </div>
                    </div>
                    <Textarea placeholder="Escribe una observacion..." value={newActivityObservation} onChange={(e) => setNewActivityObservation(e.target.value)} />
                    {isTask && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Oportunidad (opcional)</Label>
                          <Select value={newActivityOpportunityId} onValueChange={setNewActivityOpportunityId}>
                            <SelectTrigger><SelectValue placeholder="Asociar a oportunidad..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ninguna</SelectItem>
                              {opportunities.map(opp => <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 md:col-span-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dueDate ? format(dueDate, "PPP", { locale: es }) : <span>Fecha de vencimiento</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus locale={es} />
                            </PopoverContent>
                          </Popover>
                          <div className="relative">
                            <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-[120px] pl-8" />
                          </div>
                        </div>
                      </div>
                    )}
                    <Button onClick={handleSaveClientActivity} disabled={isSavingActivity}>
                      {isSavingActivity ? <><Spinner size="small" color="white" className="mr-2" />Guardando...</> : "Guardar actividad"}
                    </Button>
                  </div>

                  <div className="mt-6 space-y-3">
                    {clientActivities.map(activity => {
                      const userName = usersMap[activity.userId]?.name || activity.userName;
                      const completedByUserName = activity.completedByUserId ? (usersMap[activity.completedByUserId]?.name || activity.completedByUserName) : undefined;
                      return (
                        <div key={activity.id} className="rounded-md border bg-background p-4">
                          <div className="flex items-start gap-3">
                            {activity.isTask && (
                              <Checkbox id={`new-task-${activity.id}`} checked={activity.completed} onCheckedChange={() => handleTaskCompleteToggle(activity, !!activity.completed)} className="mt-1" />
                            )}
                            <div className={cn("rounded-full bg-muted p-2", !activity.isTask && "mt-1")}>{activityIcons[activity.type]}</div>
                            <div className={cn("min-w-0 flex-1", activity.completed && "text-muted-foreground line-through")}>
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{activity.type}</span>
                                  {!activity.isTask && <ConvertToTaskPopover activity={activity} />}
                                </div>
                                <span className="text-xs text-muted-foreground">{format(new Date(activity.timestamp), "PPP p", { locale: es })}</span>
                              </div>
                              <p className="mt-1 text-sm">{activity.observation}</p>
                              {activity.opportunityTitle && (
                                <p className="mt-2 flex items-center text-xs font-medium text-muted-foreground">
                                  <CircleDollarSign className="mr-1 h-3 w-3" />
                                  Oportunidad: {activity.opportunityTitle}
                                </p>
                              )}
                              {activity.isTask && activity.dueDate && (
                                <div className="flex items-center gap-2">
                                  <p className="mt-1 flex items-center text-xs font-medium">
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    Vence: {format(new Date(activity.dueDate), "PPP p", { locale: es })}
                                  </p>
                                  {!activity.completed && (
                                    <Button variant="ghost" size="icon" className="mt-1 h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleSendTaskEmail(activity)} disabled={isSendingEmail === activity.id}>
                                      {isSendingEmail === activity.id ? <Spinner size="small" /> : <Mail className="h-4 w-4" />}
                                    </Button>
                                  )}
                                </div>
                              )}
                              <p className="mt-2 text-xs text-muted-foreground">Registrado por: {userName}</p>
                              {activity.completed && activity.completedAt && (
                                <div className="mt-1 text-xs">
                                  <p className="flex items-center font-medium text-green-600"><CheckCircle className="mr-1 h-3 w-3"/>Finalizada: {format(new Date(activity.completedAt), "PPP", { locale: es })}</p>
                                  <p className="text-muted-foreground">Por: {completedByUserName}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {clientActivities.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No hay actividades registradas.</p>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="income" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Total Historico Facturado
                  </CardTitle>
                  <CardDescription>Comprobantes oficiales de Tango para todos los IDs vinculados del cliente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingTangoBilling ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner size="small" />Consultando Tango...</div>
                  ) : tangoBillingError ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-destructive">No se pudo cargar Tango.</p>
                      <p className="text-xs text-muted-foreground">{tangoBillingError}</p>
                      <Button variant="outline" size="sm" onClick={fetchTangoBillingSummary}>Reintentar</Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold">{formatMoney(tangoBillingSummary?.total || 0)}</p>
                      <p className="text-xs text-muted-foreground">
                        {tangoBillingSummary?.invoiceCount || 0} comprobantes sumados, incluyendo FAC, CDE, NC y otros tipos disponibles.
                        {tangoBillingSummary?.truncated ? ' La consulta fue limitada por paginacion de Tango.' : ''}
                      </p>
                      {tangoBillingSummary && tangoBillingSummary.byCompany.length > 0 && (
                        <div className="space-y-1 rounded-md bg-muted/60 p-3 text-xs">
                          {tangoBillingSummary.byCompany.map(company => (
                            <div key={`${company.companyId}-${company.clientCode}`} className="flex justify-between gap-3">
                              <span className="text-muted-foreground">{company.companyLabel} ({company.clientCode}) - {company.invoiceCount} comp.</span>
                              <span className="font-semibold">{formatMoney(company.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              <ClientTangoInvoices client={client} />
            </TabsContent>
          </Tabs>
        </section>

        {isRightRailOpen && (
          <aside className="space-y-4 xl:sticky xl:top-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Contactos ({people.length})</CardTitle>
                {canEditContact && <Button variant="ghost" size="sm" onClick={() => handleOpenPersonForm()}><PlusCircle className="mr-2 h-4 w-4" />Agregar</Button>}
              </CardHeader>
              <CardContent className="space-y-3">
                {people.slice(0, 4).map(person => (
                  <div key={person.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{person.name}</p>
                        {person.cargo && <p className="text-xs text-muted-foreground">{person.cargo}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {person.phone && (
                          <>
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7"><a href={`tel:${person.phone}`}><PhoneCall className="h-4 w-4" /></a></Button>
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7"><a href={`https://wa.me/${person.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /></a></Button>
                          </>
                        )}
                        {canEditContact && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenPersonForm(person)}><Edit className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDeleteDialog(person, 'person')}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </div>
                    <p className="mt-2 truncate text-sm text-muted-foreground">{person.email || 'Sin email'}</p>
                    <p className="truncate text-sm text-muted-foreground">{person.phone || 'Sin telefono'}</p>
                  </div>
                ))}
                {people.length === 0 && <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No hay contactos asociados.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Negocios ({opportunities.length})</CardTitle>
                {canEditOpportunity && <Button variant="ghost" size="sm" onClick={() => handleOpenOpportunityForm()}><PlusCircle className="mr-2 h-4 w-4" />Agregar</Button>}
              </CardHeader>
              <CardContent className="space-y-3">
                {opportunities.slice(0, 4).map(opp => (
                  <button key={opp.id} type="button" className="w-full rounded-md border p-3 text-left hover:bg-muted/50" onClick={() => handleOpenOpportunityForm(opp)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{opp.title}</p>
                      <p className="shrink-0 text-sm font-bold">{formatMoney(opp.value)}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${stageColors[opp.stage]}`} />
                      {opp.stage}
                    </div>
                  </button>
                ))}
                {opportunities.length === 0 && <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No hay oportunidades asociadas.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tareas pendientes ({pendingTasks.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox checked={task.completed} onCheckedChange={() => handleTaskCompleteToggle(task, !!task.completed)} className="mt-1" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{task.observation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{task.dueDate ? format(new Date(task.dueDate), "PPP p", { locale: es }) : 'Sin vencimiento'}</p>
                    </div>
                  </div>
                ))}
                {pendingTasks.length === 0 && <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Sin tareas pendientes.</p>}
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </div>

      {isOpportunityFormOpen && (
        <OpportunityDetailsDialog
          opportunity={selectedOpportunity}
          isOpen={isOpportunityFormOpen}
          onOpenChange={setIsOpportunityFormOpen}
          onUpdate={handleOpportunityUpdate}
          onCreate={onCreateOpportunity}
          client={{id: client.id, name: client.denominacion, ownerName: client.ownerName, ownerId: client.ownerId}}
        />
      )}

       {isClientFormOpen && (
        <ClientFormDialog
            isOpen={isClientFormOpen}
            onOpenChange={setIsClientFormOpen}
            onSaveSuccess={handleSaveClient}
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
    <Dialog open={Boolean(quickActivity)} onOpenChange={(open) => {
        if (!open && !isSavingQuickActivity) {
            setQuickActivity(null);
            setQuickActivityObservation('');
        }
    }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Registrar {quickActivity?.label}</DialogTitle>
                <DialogDescription>
                    La accion quedara asentada con fecha de hoy para {client.denominacion}. La aclaracion es opcional.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
                <Label htmlFor="quick-activity-observation">Aclaracion opcional</Label>
                <Textarea
                    id="quick-activity-observation"
                    value={quickActivityObservation}
                    onChange={(event) => setQuickActivityObservation(event.target.value)}
                    placeholder="Ej: Se converso sobre nueva propuesta, quedo en responder..."
                    rows={4}
                />
            </div>
            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingQuickActivity}
                    onClick={() => {
                        setQuickActivity(null);
                        setQuickActivityObservation('');
                    }}
                >
                    Cancelar
                </Button>
                <Button type="button" onClick={handleSaveQuickClientActivity} disabled={isSavingQuickActivity || !quickActivity}>
                    {isSavingQuickActivity ? (
                        <>
                            <Spinner size="small" color="white" className="mr-2" />
                            Guardando...
                        </>
                    ) : (
                        'Guardar accion'
                    )}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>{alertConfig?.title}</AlertDialogTitle>
            <AlertDialogDescription dangerouslySetInnerHTML={{ __html: sanitizeActivityHtml(alertConfig?.description) }} />
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
