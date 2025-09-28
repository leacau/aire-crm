
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
} from 'lucide-react';
import type { Opportunity, Client, ActivityLog } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  getAllOpportunities,
  getOpportunitiesForUser,
  getClients,
  getActivities,
} from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';
import { users } from '@/lib/data';

const activityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Edit className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;

export default function DashboardPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
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

        const [allClients, allActivities] = await Promise.all([
          getClients(),
          getActivities(10), // Get last 10 activities
        ]);
        
        setOpportunities(userOpps);
        setClients(allClients);
        setActivities(allActivities);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoadingData(false);
      }
    };

    if (!authLoading) {
      fetchData();
    }
  }, [userInfo, authLoading]);

  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const totalRevenue = opportunities
    .filter((o) => o.stage === 'Cerrado - Ganado')
    .reduce((acc, o) => acc + (o.valorCerrado || o.value), 0);

  const forecastedRevenue = opportunities
    .filter((o) => o.stage !== 'Cerrado - Perdido' && o.stage !== 'Cerrado - Ganado')
    .reduce((acc, o) => acc + o.value * 0.5, 0); // Simplified forecast

  const activeOpportunities = opportunities.filter(
    (o) => o.stage !== 'Cerrado - Ganado' && o.stage !== 'Cerrado - Perdido'
  ).length;
  
  const newClientsThisMonth = clients.filter(c => {
    // This is a simplified check. For a real app, you'd parse createdAt.
    // Assuming createdAt is a Firestore timestamp, it would need to be converted to a Date object first.
    return true; 
  }).length;


  return (
    <div className="flex flex-col h-full">
      <Header title="Panel" />
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
                Total de negocios ganados.
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
              <p className="text-xs text-muted-foreground">Oportunidades en curso.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Totales</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients.length}</div>
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
                Basado en el pipeline actual.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>
                Un registro de las últimas acciones realizadas en el sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity) => {
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
                            Por: {performingUser?.name || 'Usuario desconocido'}
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
