
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
import { users } from '@/lib/data';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { isWithinInterval, isToday, isTomorrow, isPast, startOfToday, startOfTomorrow, endOfYesterday, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const activityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Edit className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;

interface TaskSectionProps {
    title: string;
    tasks: ClientActivity[];
    icon: React.ReactNode;
    onTaskToggle: (task: ClientActivity, status: boolean) => void;
}

const TaskSection: React.FC<TaskSectionProps> = ({ title, tasks, icon, onTaskToggle }) => (
    <div>
        <h4 className="flex items-center font-semibold mb-2 text-sm">
            {icon}
            <span className='ml-2'>{title}</span>
        </h4>
        {tasks.length > 0 ? (
            <div className="space-y-4">
                {tasks.map(task => (
                    <div key={task.id} className="flex items-start space-x-2">
                        <Checkbox
                            id={`task-dash-${task.id}`}
                            checked={task.completed}
                            onCheckedChange={() => onTaskToggle(task, !!task.completed)}
                            className='mt-1'
                        />
                        <div className="flex flex-col text-sm">
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
                                <div className='text-xs text-muted-foreground mt-1'>
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
            <p className="text-sm text-muted-foreground">No hay tareas.</p>
        )}
    </div>
);


export default function DashboardPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const fetchData = async () => {
    if (!userInfo) return;

    setLoadingData(true);
    try {
      let userOpps: Opportunity[];
      if (userInfo.role === 'Jefe' || userInfo.role === 'Administracion') {
        userOpps = await getAllOpportunities();
      } else {
        userOpps = await getOpportunitiesForUser(userInfo.id);
      }
      
      const [allClients, allActivities, allTasks] = await Promise.all([
        getClients(),
        getActivities(100),
        getAllClientActivities() // Fetch all tasks for filtering
      ]);
      
      setOpportunities(userOpps);
      setClients(allClients);
      setActivities(allActivities);
      // Filter for tasks assigned to the current user or all if manager
      const userTasks = (userInfo.role === 'Jefe' || userInfo.role === 'Administracion')
            ? allTasks.filter(t => t.isTask)
            : allTasks.filter(t => t.isTask && t.userId === userInfo.id);

      setTasks(userTasks);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoadingData(false);
    }
  };


  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [userInfo, authLoading]);

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
  
  // Client filtering by date is complex, so we'll show all clients for now.
  const totalClients = clients.length;

  const today = startOfToday();
  const overdueTasks = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      // Compare only date part, ignoring time
      return new Date(dueDate.toDateString()) < new Date(today.toDateString());
  });
  const dueTodayTasks = tasks.filter(t => !t.completed && t.dueDate && isToday(new Date(t.dueDate)));
  const dueTomorrowTasks = tasks.filter(t => !t.completed && t.dueDate && isTomorrow(new Date(t.dueDate)));


  return (
    <div className="flex flex-col h-full">
      <Header title="Panel">
        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ingresos Totales
              </CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${totalRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Total de negocios ganados en el período.
              </p>
            </CardContent>
          </Card>
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
                ${forecastedRevenue.toLocaleString()}
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
                <CardContent className="space-y-6">
                    <TaskSection 
                        title="Vencidas"
                        tasks={overdueTasks}
                        icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
                        onTaskToggle={handleTaskToggle}
                    />
                     <TaskSection 
                        title="Vencen Hoy"
                        tasks={dueTodayTasks}
                        icon={<CalendarCheck className="h-5 w-5 text-blue-500" />}
                        onTaskToggle={handleTaskToggle}
                    />
                    <TaskSection 
                        title="Vencen Mañana"
                        tasks={dueTomorrowTasks}
                        icon={<CalendarClock className="h-5 w-5 text-yellow-500" />}
                        onTaskToggle={handleTaskToggle}
                    />
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
                    {filteredActivities.map((activity) => {
                        const performingUser = users.find(u => u.id === activity.userId);
                        return (
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
                                Por: {performingUser?.name || activity.userName || 'Usuario desconocido'}
                            </p>
                            </div>
                        </div>
                        )
                    })}
                </div>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
