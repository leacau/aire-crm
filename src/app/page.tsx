
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
  PhoneCall,
  Mail,
  Users2,
  FileText,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Activity as ActivityType, Opportunity, Client } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  getAllOpportunities,
  getOpportunitiesForUser,
  getClients,
  getAllActivities,
} from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';

const activityIcons: Record<ActivityType['type'], React.ReactNode> = {
  Llamada: <PhoneCall className="h-4 w-4 text-muted-foreground" />,
  Email: <Mail className="h-4 w-4 text-muted-foreground" />,
  Reunión: <Users2 className="h-4 w-4 text-muted-foreground" />,
  Nota: <FileText className="h-4 w-4 text-muted-foreground" />,
};

export default function DashboardPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
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
          getAllActivities(),
        ]);
        
        setOpportunities(userOpps);
        setClients(allClients);
        // Sort activities by date descending and take the first 5
        const sortedActivities = allActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setActivities(sortedActivities.slice(0, 5));

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
                Un registro de las actividades de venta más recientes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className="p-2 bg-muted rounded-full">
                       {activityIcons[activity.type]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{activity.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(activity.date).toLocaleDateString()}
                        </p>
                      </div>
                       <p className="text-sm text-muted-foreground">
                        Relacionado con el cliente: {clients.find(c => c.id === activity.clientId)?.denominacion}
                      </p>
                      <p className="text-sm">{activity.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
