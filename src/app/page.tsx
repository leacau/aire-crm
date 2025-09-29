
'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Activity,
  CircleDollarSign,
  Users,
  TrendingUp,
  PlusCircle,
  Edit,
  ArrowRight,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle,
} from 'lucide-react';
import type { Opportunity, Client, ActivityLog, ClientActivity } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  getAllOpportunities,
  getOpportunitiesForUser,
  getClients,
  getActivities,
  getAllClientActivities,
  updateClientActivity,
} from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { isWithinInterval, isToday, isTomorrow, startOfToday, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/use-notifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const activityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Edit className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;

type TaskStatus = 'overdue' | 'dueToday' | 'dueTomorrow';

interface TaskSectionProps {
    title: string;
    tasks: ClientActivity[];
    icon: React.ReactNode;
    onTaskToggle: (task: ClientActivity, status: boolean) => void;
}

const TaskSection: React.FC<TaskSectionProps> = ({ title, tasks, icon, onTaskToggle }) => (
    <div className='mt-4'>
        <h4 className="flex items-center font-semibold mb-3 text-md border-b pb-2">
            {icon}
            <span className='ml-2'>{title}</span>
        </h4>
        {tasks.length > 0 ? (
            <div className="space-y-4">
                {tasks.map(task => (
                    <div key={task.id} className="flex items-start space-x-3">
                        <Checkbox
                            id={`task-dash-${task.id}`}
                            checked={task.completed}
                            onCheckedChange={() => onTaskToggle(task, !!task.completed)}
                            className='mt-1'
                        />
                        <div className="flex flex-col text-sm flex-1">
                            <label
                                htmlFor={`task-dash-${task.id}`}
                                className={cn("font-medium leading-none", task.completed && "line-through text-muted-foreground")}
                            >
                                {task.observation}
                            </label>
                            <Link href={`/clients/${task.clientId}`} className="text-xs text-muted-foreground hover:underline mt-0.5">
                                Cliente: {task.clientName}
                            </Link>
                            {task.completed && task.completedAt && (
                                <div className='text-xs text-muted-foreground mt-1 space-y-0.5'>
                                    <p className='flex items-center'>
                                        <CheckCircle className="h-3 w-3 mr-1 text-green-600"/>
                                        Finalizada: {format(new Date(task.completedAt), "PPP", { locale: es })}
                                    </p>
                                    <p>Por: {task.completedByUserName}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <p className="text-sm text-muted-foreground">No hay tareas en esta categoría.</p>
        )}
    </div>
);

const TaskSummaryCard = ({ title, count, icon, onClick, isSelected }: { title: string, count: number, icon: React.ReactNode, onClick: () => void, isSelected: boolean }) => (
    <Card 
        onClick={onClick}
        className={cn(
            "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
            isSelected && "border-primary shadow-md"
        )}
    >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
                {icon}
                <span>{title}</span>
            </CardTitle>
            <Badge variant="secondary">{count}</Badge>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{count}</div>
            <p className="text-xs text-muted-foreground">tareas</p>
        </CardContent>
    </Card>
);

export default function DashboardPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { notificationPermission, requestNotificationPermission, showNotification } = useNotifications();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [notified, setNotified] = useState(false);
  const [selectedTaskStatus, setSelectedTaskStatus] = useState<TaskStatus | null>(null);

  const fetchData = async () => {
    if (!userInfo) return;

    setLoadingData(true);
    try {
      let userOpps: Opportunity[];
      let userClients: Client[];
      let allActivities: ActivityLog[];
      let allTasks: ClientActivity[];
      
      const allClients = await getClients();

      // Admins and Chiefs see everything
      if (userInfo.role === 'Jefe' || userInfo.role === 'Administracion') {
        [userOpps, allActivities, allTasks] = await Promise.all([
          getAllOpportunities(),
          getActivities(100),
          getAllClientActivities(),
        ]);
        userClients = allClients;
        setActivities(allActivities); // Set all activities for Jefe
        setTasks(allTasks.filter(t => t.isTask)); // Show all tasks
      } else { 
        // Asesores only see their own data
        userClients = allClients.filter(client => client.ownerId === userInfo.id);
        const userClientIds = userClients.map(c => c.id);

        const [opps, activities, tasks] = await Promise.all([
          getOpportunitiesForUser(userInfo.id),
          getActivities(100),
          getAllClientActivities(),
        ]);
        
        userOpps = opps;
        
        const filteredActivities = activities.filter(activity => {
            const client = allClients.find(c => c.id === activity.entityId);
            return client && client.ownerId === userInfo.id;
        });

        const filteredTasks = tasks.filter(t => t.isTask && userClientIds.includes(t.clientId));
        
        setActivities(filteredActivities);
        setTasks(filteredTasks);
      }

      setOpportunities(userOpps);
      setClients(userClients);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoadingData(false);
    }
  };


  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchData();
    }
  }, [userInfo, authLoading]);
  
    const today = startOfToday();
    const overdueTasks = tasks.filter(t => {
        if (t.completed || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return new Date(dueDate.toDateString()) < new Date(today.toDateString());
    });
    const dueTodayTasks = tasks.filter(t => !t.completed && t.dueDate && isToday(new Date(t.dueDate)));
    const dueTomorrowTasks = tasks.filter(t => !t.completed && t.dueDate && isTomorrow(new Date(t.dueDate)));
    const hasPendingTasks = overdueTasks.length > 0 || dueTodayTasks.length > 0 || dueTomorrowTasks.length > 0;

  useEffect(() => {
    if (loadingData) return;

    if (hasPendingTasks && notificationPermission === 'default') {
        toast({
            title: 'Permitir notificaciones',
            description: 'Habilita las notificaciones para recibir alertas de tareas.',
            action: <Button onClick={requestNotificationPermission}>Habilitar</Button>,
        });
    }

    if (hasPendingTasks && notificationPermission === 'granted' && !notified) {
        let notificationBody = 'Tienes tareas pendientes:';
        if (overdueTasks.length > 0) notificationBody += `\n- ${overdueTasks.length} vencida(s)`;
        if (dueTodayTasks.length > 0) notificationBody += `\n- ${dueTodayTasks.length} para hoy`;
        if (dueTomorrowTasks.length > 0) notificationBody += `\n- ${dueTomorrowTasks.length} para mañana`;

        showNotification('Tareas Pendientes', {
            body: notificationBody,
        });
        setNotified(true); // Mark as notified for this session
    }
  }, [
      loadingData, 
      hasPendingTasks, 
      overdueTasks.length,
      dueTodayTasks.length,
      dueTomorrowTasks.length,
      notificationPermission, 
      requestNotificationPermission, 
      showNotification, 
      toast, 
      notified
    ]);


  const handleTaskToggle = async (task: ClientActivity, currentStatus: boolean) => {
      if (!userInfo) return;
      const completed = !currentStatus;
      const payload: Partial<ClientActivity> = { 
          completed,
          ...(completed && {
              completedByUserId: userInfo.id,
              completedByUserName: userInfo.name,
          })
      };

      try {
          // Optimistic update
          setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? {
                ...t, 
                completed,
                completedAt: completed ? new Date().toISOString() : undefined,
                completedByUserName: completed ? userInfo.name : undefined
            } : t
          ));
          await updateClientActivity(task.id, payload);
          toast({ title: `Tarea ${completed ? 'completada' : 'marcada como pendiente'}`});
          // No need to refetch, optimistic update is enough for the UI
      } catch (error) {
           console.error("Error updating task status", error);
           setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? task : t)); // Revert on error
           toast({ title: "Error al actualizar la tarea", variant: 'destructive' });
      }
  }

  const handleTaskStatusSelect = (status: TaskStatus) => {
    setSelectedTaskStatus(prev => prev === status ? null : status);
  };

  const getSelectedTasks = () => {
    switch(selectedTaskStatus) {
        case 'overdue': return overdueTasks;
        case 'dueToday': return dueTodayTasks;
        case 'dueTomorrow': return dueTomorrowTasks;
        default: return [];
    }
  };


  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const filteredOpportunities = opportunities.filter(opp => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const closeDate = new Date(opp.closeDate);
    return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
  });
  
  const filteredActivities = activities.filter(activity => {
      if (!dateRange?.from || !dateRange?.to) return true;
      const activityDate = new Date(activity.timestamp);
      return isWithinInterval(activityDate, { start: dateRange.from, end: dateRange.to });
  }).slice(0, 10); // Limit to 10 after filtering


  const totalRevenue = filteredOpportunities
    .filter((o) => o.stage === 'Cerrado - Ganado')
    .reduce((acc, o) => acc + (o.valorCerrado || o.value), 0);

  const forecastedRevenue = filteredOpportunities
    .filter((o) => o.stage !== 'Cerrado - Perdido' && o.stage !== 'Cerrado - Ganado')
    .reduce((acc, o) => acc + o.value * 0.5, 0); // Simplified forecast

  const activeOpportunities = filteredOpportunities.filter(
    (o) => o.stage !== 'Cerrado - Ganado' && o.stage !== 'Cerrado - Perdido'
  ).length;
  
  const totalClients = clients.length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Panel">
        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/billing?tab=paid">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Ingresos Totales
                </CardTitle>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${totalRevenue.toLocaleString('es-AR')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total de negocios ganados en el período.
                </p>
              </CardContent>
            </Card>
          </Link>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Oportunidades Activas
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activeOpportunities}
              </div>
              <p className="text-xs text-muted-foreground">Oportunidades en curso en el período.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Totales</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClients}</div>
              <p className="text-xs text-muted-foreground">
                Total de clientes registrados.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ingresos Previstos
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${forecastedRevenue.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-muted-foreground">
                Basado en el pipeline del período.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 mt-6 md:grid-cols-2">
            <Card>
                 <CardHeader>
                    <CardTitle>Tareas Pendientes</CardTitle>
                    <CardDescription>
                        Tus próximas tareas y las que ya han vencido.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <TaskSummaryCard 
                            title="Vencidas"
                            count={overdueTasks.length}
                            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
                            onClick={() => handleTaskStatusSelect('overdue')}
                            isSelected={selectedTaskStatus === 'overdue'}
                        />
                        <TaskSummaryCard 
                            title="Vencen Hoy"
                            count={dueTodayTasks.length}
                            icon={<CalendarCheck className="h-5 w-5 text-blue-500" />}
                            onClick={() => handleTaskStatusSelect('dueToday')}
                            isSelected={selectedTaskStatus === 'dueToday'}
                        />
                        <TaskSummaryCard 
                            title="Vencen Mañana"
                            count={dueTomorrowTasks.length}
                            icon={<CalendarClock className="h-5 w-5 text-yellow-500" />}
                            onClick={() => handleTaskStatusSelect('dueTomorrow')}
                             isSelected={selectedTaskStatus === 'dueTomorrow'}
                        />
                    </div>
                     {selectedTaskStatus && (
                        <TaskSection 
                           title={
                             selectedTaskStatus === 'overdue' ? 'Detalle de Tareas Vencidas' :
                             selectedTaskStatus === 'dueToday' ? 'Detalle de Tareas para Hoy' :
                             'Detalle de Tareas para Mañana'
                           }
                           tasks={getSelectedTasks()}
                           icon={
                             selectedTaskStatus === 'overdue' ? <AlertTriangle className="h-5 w-5 text-red-500" /> :
                             selectedTaskStatus === 'dueToday' ? <CalendarCheck className="h-5 w-5 text-blue-500" /> :
                             <CalendarClock className="h-5 w-5 text-yellow-500" />
                           }
                           onTaskToggle={handleTaskToggle}
                        />
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                <CardTitle>Actividad Reciente</CardTitle>
                <CardDescription>
                    Un registro de las últimas acciones realizadas en el sistema.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="space-y-4">
                    {filteredActivities.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4">
                            <div className="p-2 bg-muted rounded-full">
                            {activityIcons[activity.type] || getDefaultIcon()}
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
                        )
                    )}
                </div>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
