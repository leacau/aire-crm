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
  CircleDollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle,
  Briefcase,
  TrendingDown,
  Clock
} from 'lucide-react';
import type { Opportunity, Client, ClientActivity, User, Invoice, PaymentEntry } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  getAllOpportunities,
  getClients,
  getAllClientActivities,
  updateClientActivity,
  getAllUsers,
  getInvoices,
  getPaymentEntries,
} from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, isToday, isTomorrow, startOfToday, format, startOfMonth, endOfMonth, parseISO, subMonths, eachMonthOfInterval, differenceInDays, startOfDay } from 'date-fns';
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
import { useRouter } from 'next/navigation';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";


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

const EXCLUDED_OWNERS_FOR_BOSS_BILLING = ['Mario Altamirano', 'Corporativo', 'Sin Asesor', 'Sin propietario'];

// Helper for currency formatting
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
};

export default function DashboardPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { notificationPermission, requestNotificationPermission, showNotification } = useNotifications();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notified, setNotified] = useState(false);
  const [selectedTaskStatus, setSelectedTaskStatus] = useState<TaskStatus | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState('all');
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
      if (!userInfo) return;
      setLoadingData(true);
      try {
        const [allOpps, allClients, allTasks, allInvoices, allPayments, allUsers, allAdvisors] = await Promise.all([
            getAllOpportunities(userInfo, isBoss),
            getClients(),
            getAllClientActivities(),
            getInvoices(),
            getPaymentEntries(),
            getAllUsers(),
            getAllUsers('Asesor'),
        ]);

        setOpportunities(allOpps);
        setClients(allClients);
        setTasks(allTasks);
        setInvoices(allInvoices);
        setPaymentEntries(allPayments);
        setUsers(allUsers);
        setAdvisors(allAdvisors);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoadingData(false);
      }
    };
    
    if (userInfo) {
      fetchData();
    }
  }, [userInfo, isBoss]);
  
  const { 
    userOpportunities, 
    userClients, 
    userTasks,
    userInvoices,
    userPayments
  } = useMemo(() => {
    if (!userInfo || !userInfo.id) return { userOpportunities: [], userClients: [], userTasks: [], userInvoices: [], userPayments: [] };
    
    let filteredOpps = opportunities;
    let filteredClients = clients;
    let filteredTasks = tasks.filter(t => t.isTask);
    let filteredInvoices = invoices;
    let filteredPayments = paymentEntries;

    if (!isBoss) {
      const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
      filteredClients = clients.filter(c => userClientIds.has(c.id));
      filteredOpps = opportunities.filter(opp => userClientIds.has(opp.clientId));
      filteredTasks = tasks.filter(t => t.isTask && (t.userId === userInfo.id || (t.clientId && userClientIds.has(t.clientId))));
      const oppIds = new Set(filteredOpps.map(o => o.id));
      filteredInvoices = invoices.filter(i => oppIds.has(i.opportunityId));
      filteredPayments = paymentEntries.filter(p => p.advisorId === userInfo.id);
      
    } else if (selectedAdvisor !== 'all') {
      const advisorClientIds = new Set(clients.filter(c => c.ownerId === selectedAdvisor).map(c => c.id));
      filteredClients = clients.filter(c => advisorClientIds.has(c.id));
      filteredOpps = opportunities.filter(opp => advisorClientIds.has(opp.clientId));
      filteredTasks = tasks.filter(t => t.isTask && (t.userId === selectedAdvisor || (t.clientId && advisorClientIds.has(t.clientId))));
      const oppIds = new Set(filteredOpps.map(o => o.id));
      filteredInvoices = invoices.filter(i => oppIds.has(i.opportunityId));
      filteredPayments = paymentEntries.filter(p => p.advisorId === selectedAdvisor);
    }

    return {
        userOpportunities: filteredOpps,
        userClients: filteredClients,
        userTasks: filteredTasks,
        userInvoices: filteredInvoices,
        userPayments: filteredPayments
    };

  }, [userInfo, isBoss, selectedAdvisor, opportunities, clients, tasks, invoices, paymentEntries]);


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
    if (opp.title === 'Genérica para carga de facturas') return false; 
    if (!dateRange?.from || !dateRange?.to) return true;
    const oppDate = opp.closeDate ? parseISO(opp.closeDate) : new Date();
    return isWithinInterval(oppDate, { start: dateRange.from, end: dateRange.to });
  });
  
  const dateFilter = (dateStr: string | null | undefined, range: DateRange) => {
    if (!dateStr || !range.from || !range.to) return false;
    try {
        const date = parseISO(dateStr);
        return isWithinInterval(date, { start: range.from, end: range.to });
    } catch (e) {
        return false;
    }
  };

  const oppClientIdMap = new Map(opportunities.map(o => [o.id, o.clientId]));
  const clientOwnerMap = new Map(clients.map(c => [c.id, { id: c.ownerId, name: c.ownerName }]));

  const isValidInvoice = (inv: Invoice) => {
      const clientId = oppClientIdMap.get(inv.opportunityId);
      if (!clientId) return false;
      const ownerData = clientOwnerMap.get(clientId);
      if (!ownerData || !ownerData.id) return false;

      if (isBoss && selectedAdvisor === 'all') {
          const ownerName = ownerData.name || '';
          const isExcluded = EXCLUDED_OWNERS_FOR_BOSS_BILLING.some(excluded => 
              ownerName.toLowerCase().includes(excluded.toLowerCase())
          );
          if (isExcluded) return false;
      }
      return true;
  };
  
  const totalPaidInPeriod = userInvoices
    .filter(inv => inv.status === 'Pagada' && dateRange && dateFilter(inv.datePaid, dateRange) && isValidInvoice(inv))
    .reduce((acc, inv) => acc + inv.amount, 0);

  const totalToCollectInPeriod = userInvoices
    .filter(inv => inv.status !== 'Pagada' && !inv.isCreditNote && dateRange && dateFilter(inv.date, dateRange) && isValidInvoice(inv))
    .reduce((acc, inv) => acc + inv.amount, 0);

  const totalBillingInPeriod = totalPaidInPeriod + totalToCollectInPeriod;

  const prevMonthStart = dateRange?.from ? startOfMonth(subMonths(dateRange.from, 1)) : null;
  const prevMonthEnd = dateRange?.from ? endOfMonth(subMonths(dateRange.from, 1)) : null;
  
  let previousMonthBilling = 0;
  if(prevMonthStart && prevMonthEnd) {
      const prevMonthRange = { from: prevMonthStart, to: prevMonthEnd };
      const prevPaid = userInvoices
        .filter(inv => inv.status === 'Pagada' && dateFilter(inv.datePaid, prevMonthRange) && isValidInvoice(inv))
        .reduce((acc, inv) => acc + inv.amount, 0);
      const prevToCollect = userInvoices
        .filter(inv => inv.status !== 'Pagada' && !inv.isCreditNote && dateFilter(inv.date, prevMonthRange) && isValidInvoice(inv))
        .reduce((acc, inv) => acc + inv.amount, 0);
      previousMonthBilling = prevPaid + prevToCollect;
  }
  
  const billingDifference = totalBillingInPeriod - previousMonthBilling;
    
  const forecastedValue = filteredOpportunities
    .filter(o => ['Propuesta', 'Negociación', 'Negociación a Aprobar'].includes(o.stage))
    .reduce((acc, o) => acc + Number(o.value || 0), 0);

  const totalClients = userClients.length;

  // --- VISUALIZATION LOGIC ---

  const showManagementView = userInfo?.role === 'Admin' || (isBoss && userInfo?.area === 'Comercial');
  const now = new Date();
  
  // 1. Billing Evolution Data
  // "no debe contabilizar el mes en curso, debe mostrar el mes ultimo pasado y los 11 anteriores"
  // Range: [Start of 12 months ago, End of last month]
  const startOfLastMonth = startOfMonth(subMonths(now, 1));
  
  const last12Months = eachMonthOfInterval({
      start: subMonths(startOfLastMonth, 11), // 11 months before last month = 12 months total
      end: endOfMonth(subMonths(now, 1))
  });

  const getBillingForMonth = (date: Date, invoiceList: Invoice[]) => {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const range = { from: monthStart, to: monthEnd };
      
      return invoiceList
        .filter(inv => {
             // "Debe sumar el total de facturas cargadas a clientes del vendedor de acuerdo a la fecha de emisión"
             return inv.date && dateFilter(inv.date, range) && isValidInvoice(inv);
        })
        .reduce((acc, inv) => acc + inv.amount, 0);
  };

  // Prepare data for Chart (Advisor View)
  const billingChartData = last12Months.map(monthDate => ({
      month: format(monthDate, 'MMM yy', { locale: es }),
      amount: getBillingForMonth(monthDate, userInvoices),
      fullDate: monthDate
  }));

  // Prepare data for Table (Management View)
  const billingTableColumns = [...last12Months].reverse().slice(0, 6); // Last 6 months for columns
  const billingTableData = advisors.map(advisor => {
      // Get invoices for this advisor
      const advisorClientIds = new Set(clients.filter(c => c.ownerId === advisor.id).map(c => c.id));
      const oppIds = new Set(opportunities.filter(o => advisorClientIds.has(o.clientId)).map(o => o.id));
      const advisorInvoices = invoices.filter(i => oppIds.has(i.opportunityId));
      
      const rowData: any = {
          advisorName: advisor.name,
          advisorId: advisor.id,
          totalYear: 0
      };

      let total = 0;
      last12Months.forEach(month => {
          const val = getBillingForMonth(month, advisorInvoices);
          total += val;
          if (billingTableColumns.some(c => c.getTime() === month.getTime())) {
              rowData[format(month, 'MMM yy', { locale: es })] = val;
          }
      });
      rowData.totalYear = total;
      return rowData;
  }).sort((a, b) => b.totalYear - a.totalYear);


  // 2. Mora Data
  // "comprobantes cargados en la sección Mora para cada vendedor... no Pagado" -> Use PaymentEntry
  const getDaysLatePayment = (payment: PaymentEntry) => {
      if (!payment.dueDate) return 0;
      const due = parseISO(payment.dueDate);
      return differenceInDays(startOfDay(now), startOfDay(due));
  };

  const categorizeMora = (paymentsList: PaymentEntry[]) => {
      const buckets = {
          '0': 0, // Not late or current
          '1-30': 0,
          '31-60': 0,
          '61-90': 0,
          '91+': 0
      };

      paymentsList.forEach(payment => {
          if (payment.status === 'Pagado') return;
          
          const days = getDaysLatePayment(payment);
          const amount = payment.amount || 0;
          
          if (days <= 0) buckets['0'] += amount;
          else if (days <= 30) buckets['1-30'] += amount;
          else if (days <= 60) buckets['31-60'] += amount;
          else if (days <= 90) buckets['61-90'] += amount;
          else buckets['91+'] += amount;
      });
      return buckets;
  };

  const moraChartData = (() => {
      const buckets = categorizeMora(userPayments);
      return [
          { name: 'Al día', value: buckets['0'], color: '#22c55e' }, // green
          { name: '1-30 días', value: buckets['1-30'], color: '#eab308' }, // yellow
          { name: '31-60 días', value: buckets['31-60'], color: '#f97316' }, // orange
          { name: '61-90 días', value: buckets['61-90'], color: '#ef4444' }, // red
          { name: '+90 días', value: buckets['91+'], color: '#7f1d1d' }, // dark red
      ];
  })();

  const moraTableData = advisors.map(advisor => {
      const advisorPayments = paymentEntries.filter(p => p.advisorId === advisor.id);
      
      const buckets = categorizeMora(advisorPayments);
      return {
          advisorName: advisor.name,
          advisorId: advisor.id,
          ...buckets,
          total: Object.values(buckets).reduce((a, b) => a + b, 0)
      };
  }).sort((a, b) => b.total - a.total);


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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/billing?tab=to-collect">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Facturación del Período
                </CardTitle>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalBillingInPeriod)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagado: {formatCurrency(totalPaidInPeriod)} / 
                  A cobrar: {formatCurrency(totalToCollectInPeriod)}
                </p>
                 <p className="text-xs text-muted-foreground mt-1">
                    Mes Anterior: {formatCurrency(previousMonthBilling)}
                </p>
                 <p className={cn(
                    "text-xs font-medium flex items-center mt-1",
                    billingDifference >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                  {billingDifference >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  Dif: {formatCurrency(billingDifference)}
                </p>
              </CardContent>
            </Card>
          </Link>
           <Link href="/opportunities">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  En Cartera
                </CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(forecastedValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Propuesta, Negociación y Aprobación.
                </p>
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

        <div className="mt-6 flex flex-col gap-6" ref={tasksSectionRef}>
            {/* Tareas */}
            <Card className="w-full">
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

            {/* Evolución de Facturación */}
            <Card className='w-full'>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Evolución de Facturación (12 meses anteriores)
                    </CardTitle>
                    <CardDescription>
                        {showManagementView 
                            ? "Comparativa de facturación por asesor (excluyendo mes en curso)." 
                            : "Tu histórico de facturación (excluyendo mes en curso)."}
                    </CardDescription>
                </CardHeader>
                <CardContent className='min-h-[300px]'>
                    {showManagementView ? (
                         <div className="overflow-auto max-h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asesor</TableHead>
                                        <TableHead className='text-right'>Total Año</TableHead>
                                        {billingTableColumns.map(col => (
                                            <TableHead key={col.toISOString()} className='text-right whitespace-nowrap'>
                                                {format(col, 'MMM yy', { locale: es })}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {billingTableData.map((row) => (
                                        <TableRow key={row.advisorId}>
                                            <TableCell className="font-medium">{row.advisorName}</TableCell>
                                            <TableCell className='text-right font-bold'>{formatCurrency(row.totalYear)}</TableCell>
                                            {billingTableColumns.map(col => (
                                                <TableCell key={col.toISOString()} className='text-right'>
                                                    {formatCurrency(row[format(col, 'MMM yy', { locale: es })] || 0)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                         </div>
                    ) : (
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={billingChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis 
                                        dataKey="month" 
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <YAxis 
                                        tickFormatter={(value) => `$${value/1000}k`}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip 
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="amount" 
                                        stroke="hsl(var(--primary))" 
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: "hsl(var(--primary))" }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Resumen de Mora */}
             <Card className='w-full'>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-orange-500" />
                        Resumen de Mora
                    </CardTitle>
                    <CardDescription>
                         {showManagementView 
                            ? "Estado de deuda vencida agrupada por asesor (Sección Mora, excluyendo Pagados)." 
                            : "Tu cartera de deuda agrupada por días de atraso (Sección Mora, excluyendo Pagados)."}
                    </CardDescription>
                </CardHeader>
                <CardContent className='min-h-[300px]'>
                    {showManagementView ? (
                        <div className="overflow-auto max-h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asesor</TableHead>
                                        <TableHead className='text-right text-green-600'>Al día</TableHead>
                                        <TableHead className='text-right text-yellow-600'>1-30</TableHead>
                                        <TableHead className='text-right text-orange-600'>31-60</TableHead>
                                        <TableHead className='text-right text-red-600'>61-90</TableHead>
                                        <TableHead className='text-right text-red-800'>+90</TableHead>
                                        <TableHead className='text-right font-bold'>Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {moraTableData.map((row) => (
                                        <TableRow key={row.advisorId}>
                                            <TableCell className="font-medium text-xs">{row.advisorName}</TableCell>
                                            <TableCell className='text-right text-xs'>{formatCurrency(row['0'])}</TableCell>
                                            <TableCell className='text-right text-xs'>{formatCurrency(row['1-30'])}</TableCell>
                                            <TableCell className='text-right text-xs'>{formatCurrency(row['31-60'])}</TableCell>
                                            <TableCell className='text-right text-xs'>{formatCurrency(row['61-90'])}</TableCell>
                                            <TableCell className='text-right text-xs'>{formatCurrency(row['91+'])}</TableCell>
                                            <TableCell className='text-right font-bold text-xs'>{formatCurrency(row.total)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={moraChartData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        width={80}
                                        tick={{ fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip 
                                        cursor={{fill: 'transparent'}}
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {moraChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
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
