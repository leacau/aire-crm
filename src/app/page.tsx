

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Lightbulb,
  TrendingDown,
  BadgeCheck,
} from 'lucide-react';
import type { Opportunity, Client, ActivityLog, ClientActivity, User, Invoice } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  getAllOpportunities,
  getOpportunitiesForUser,
  getClients,
  getActivities,
  getAllClientActivities,
  updateClientActivity,
  getAllUsers,
  getInvoices,
} from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';
import type { DateRange } from 'react-day-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { isWithinInterval, isToday, isTomorrow, startOfToday, format, startOfMonth, endOfMonth, parseISO, subMonths, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/use-notifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TasksModal } from '@/components/dashboard/tasks-modal';
import { TaskNotification } from '@/components/dashboard/task-notification';

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
    usersMap: Record<string, User>;
}

const DynamicMonthYearPicker = dynamic(() => import('@/components/ui/month-year-picker').then(mod => mod.MonthYearPicker), {
  ssr: false,
  loading: () => <Skeleton className="h-10 w-[260px]" />,
});


const TaskSection: React.FC<TaskSectionProps> = ({ title, tasks, icon, onTaskToggle, usersMap }) => (
    <div className='mt-4'>
        <h4 className="flex items-center font-semibold mb-3 text-md border-b pb-2">
            {icon}
            <span className='ml-2'>{title}</span>
        </h4>
        {tasks.length > 0 ? (
            <div className="space-y-4">
                {tasks.map(task => {
                    const completedByUserName = task.completedByUserId ? usersMap[task.completedByUserId]?.name : task.completedByUserName;
                    return (
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
                                        <p>Por: {completedByUserName}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
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
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const { notificationPermission, requestNotificationPermission, showNotification } = useNotifications();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notified, setNotified] = useState(false);
  const [selectedTaskStatus, setSelectedTaskStatus] = useState<TaskStatus | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [isTasksModalOpen, setIsTasksModalOpen] = useState(false);
  const tasksSectionRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);


  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [allOpps, allClients, allActivities, allTasks, allInvoices, allUsers, allAdvisors] = await Promise.all([
            getAllOpportunities(),
            getClients(),
            getActivities(100),
            getAllClientActivities(),
            getInvoices(),
            getAllUsers(),
            getAllUsers('Asesor'),
        ]);

        setOpportunities(allOpps);
        setClients(allClients);
        setActivities(allActivities);
        setTasks(allTasks);
        setInvoices(allInvoices);
        setUsers(allUsers);
        setAdvisors(allAdvisors);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);
  
  const { 
    userOpportunities, 
    userClients, 
    userActivities, 
    userTasks,
    userInvoices,
  } = useMemo(() => {
    if (!userInfo) return { userOpportunities: [], userClients: [], userActivities: [], userTasks: [], userInvoices: [] };
    
    let filteredOpps = opportunities;
    let filteredClients = clients;
    let filteredActivities = activities;
    let filteredTasks = tasks.filter(t => t.isTask);
    let filteredInvoices = invoices;

    if (!isBoss) {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      filteredClients = clients.filter(c => userClientIds.has(c.id));
      filteredOpps = opportunities.filter(opp => userClientIds.has(opp.clientId));
      filteredTasks = tasks.filter(t => t.isTask && userClientIds.has(t.clientId));
      const oppIds = new Set(filteredOpps.map(o => o.id));
      filteredInvoices = invoices.filter(i => oppIds.has(i.opportunityId));
      // Note: Activities might be more complex to filter if not directly linked to a client
    } else if (selectedAdvisor !== 'all') {
      const advisorClientIds = new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
      filteredClients = clients.filter(c => advisorClientIds.has(c.id));
      filteredOpps = opportunities.filter(opp => advisorClientIds.has(opp.clientId));
      filteredTasks = tasks.filter(t => t.isTask && advisorClientIds.has(t.clientId));
       const oppIds = new Set(filteredOpps.map(o => o.id));
      filteredInvoices = invoices.filter(i => oppIds.has(i.opportunityId));
    }


    return {
        userOpportunities: filteredOpps,
        userClients: filteredClients,
        userActivities: filteredActivities,
        userTasks: filteredTasks,
        userInvoices: filteredInvoices
    };

  }, [userInfo, isBoss, selectedAdvisor, opportunities, clients, activities, tasks, invoices]);


  const today = startOfToday();
  const overdueTasks = userTasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      return new Date(dueDate.toDateString()) < new Date(today.toDateString());
  });
  const dueTodayTasks = userTasks.filter(t => !t.completed && t.dueDate && isToday(new Date(t.dueDate)));
  const dueTomorrowTasks = userTasks.filter(t => !t.completed && t.dueDate && isTomorrow(new Date(t.dueDate)));
  const hasPendingTasks = overdueTasks.length > 0 || dueTodayTasks.length > 0;

  useEffect(() => {
    if (!loadingData && hasPendingTasks) {
      const modalShown = sessionStorage.getItem('tasksModalShown');
      if (!modalShown) {
        setIsTasksModalOpen(true);
        sessionStorage.setItem('tasksModalShown', 'true');
      }
    }
  }, [loadingData, hasPendingTasks]);


  useEffect(() => {
    if (loadingData || isBoss) return; // Notifications only for non-bosses

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
      isBoss,
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
          const originalTasks = tasks;
          setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? {
                ...t, 
                completed,
                completedAt: completed ? new Date().toISOString() : undefined,
                completedByUserId: completed ? userInfo.id : undefined,
                completedByUserName: completed ? userInfo.name : undefined
            } : t
          ));
          await updateClientActivity(task.id, payload);
          toast({ title: `Tarea ${completed ? 'completada' : 'marcada como pendiente'}`});
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

  const handleShowTasks = () => {
    tasksSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  const usersMap = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {} as Record<string, User>);


  const filteredOpportunities = userOpportunities.filter(opp => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const oppDate = opp.closeDate ? parseISO(opp.closeDate) : new Date(); // Use today if no close date
    return isWithinInterval(oppDate, { start: dateRange.from, end: dateRange.to });
  });
  
  const filteredActivities = userActivities.filter(activity => {
      if (!dateRange?.from || !dateRange?.to) return true;
      const activityDate = new Date(activity.timestamp);
      return isWithinInterval(activityDate, { start: dateRange.from, end: dateRange.to });
  }).slice(0, 10);
  
  const dateFilter = (dateStr: string | null | undefined, range: DateRange) => {
    if (!dateStr || !range.from || !range.to) return false;
    try {
        const date = parseISO(dateStr);
        return isWithinInterval(date, { start: range.from, end: range.to });
    } catch (e) {
        return false;
    }
  };
  
  const totalPaidInPeriod = userInvoices
    .filter(inv => inv.status === 'Pagada' && dateRange && dateFilter(inv.datePaid, dateRange))
    .reduce((acc, inv) => acc + inv.amount, 0);

  const totalToCollectInPeriod = userInvoices
    .filter(inv => inv.status !== 'Pagada' && dateRange && dateFilter(inv.date, dateRange))
    .reduce((acc, inv) => acc + inv.amount, 0);

  const prevMonthStart = dateRange?.from ? startOfMonth(subMonths(dateRange.from, 1)) : null;
  const prevMonthEnd = dateRange?.from ? endOfMonth(subMonths(dateRange.from, 1)) : null;
  
  let previousMonthBilling = 0;
  if(prevMonthStart && prevMonthEnd) {
      const prevMonthRange = { from: prevMonthStart, to: prevMonthEnd };
      const prevPaid = userInvoices
        .filter(inv => inv.status === 'Pagada' && dateFilter(inv.datePaid, prevMonthRange))
        .reduce((acc, inv) => acc + inv.amount, 0);
      const prevToCollect = userInvoices
        .filter(inv => inv.status !== 'Pagada' && dateFilter(inv.date, prevMonthRange))
        .reduce((acc, inv) => acc + inv.amount, 0);
      previousMonthBilling = prevPaid + prevToCollect;
  }
  
  const toCollectDifference = totalToCollectInPeriod - previousMonthBilling;

  const prospectingValue = filteredOpportunities
    .filter(o => o.stage === 'Nuevo')
    .reduce((acc, o) => acc + Number(o.value || 0), 0);
    
  const totalClients = userClients.length;

  return (
    <>
    {hasPendingTasks && (
      <TaskNotification
        overdueCount={overdueTasks.length}
        dueTodayCount={dueTodayTasks.length}
        onShowTasks={handleShowTasks}
      />
    )}
    <div className="flex flex-col h-full">
      <Header title="Panel">
        <DynamicMonthYearPicker date={selectedDate} onDateChange={setSelectedDate} />
        {isBoss && (
          <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por asesor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los asesores</SelectItem>
              {advisors.map(advisor => (
                <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/billing?tab=to-collect">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Facturación a Cobrar
                </CardTitle>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${totalToCollectInPeriod.toLocaleString('es-AR')}
                </div>
                 <p className="text-xs text-muted-foreground mt-1">
                    Mes Anterior (a cobrar): ${previousMonthBilling.toLocaleString('es-AR')}
                </p>
                 <p className={cn(
                    "text-xs font-medium flex items-center mt-1",
                    toCollectDifference >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                  {toCollectDifference >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  Dif: ${toCollectDifference.toLocaleString('es-AR')}
                </p>
              </CardContent>
            </Card>
          </Link>
           <Link href="/billing?tab=paid">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Pagos del Mes
                </CardTitle>
                <BadgeCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${totalPaidInPeriod.toLocaleString('es-AR')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total de facturas pagadas en el período.
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/opportunities">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  En Prospección
                </CardTitle>
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${prospectingValue.toLocaleString('es-AR')}
                </div>
                <p className="text-xs text-muted-foreground">Oportunidades en etapa "Nuevo".</p>
              </CardContent>
            </Card>
          </Link>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Totales</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClients}</div>
              <p className="text-xs text-muted-foreground">
                Total de clientes en cartera.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-1 gap-6" ref={tasksSectionRef}>
            <Card className="lg:col-span-1">
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
                           usersMap={usersMap}
                        />
                    )}
                </CardContent>
            </Card>
            <Card className="lg:col-span-1">
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
                                Por: {usersMap[activity.userId]?.name || 'Usuario desconocido'}
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
    <TasksModal
        isOpen={isTasksModalOpen}
        onOpenChange={setIsTasksModalOpen}
        overdueTasks={overdueTasks}
        dueTodayTasks={dueTodayTasks}
        dueTomorrowTasks={dueTomorrowTasks}
        usersMap={usersMap}
      />
    </>
  );
}
