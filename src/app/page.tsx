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
  Phone,
  Mail,
  Users2,
} from 'lucide-react';
import { recentActivities, opportunities, clients } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const totalRevenue = opportunities
  .filter((o) => o.stage === 'Closed Won')
  .reduce((acc, o) => acc + o.value, 0);

const forecastedRevenue = opportunities
  .filter((o) => o.stage !== 'Closed Lost' && o.stage !== 'Closed Won')
  .reduce((acc, o) => acc + o.value * 0.5, 0); // Simplified forecast

const activityIcons = {
  Call: <Phone className="h-4 w-4 text-muted-foreground" />,
  Email: <Mail className="h-4 w-4 text-muted-foreground" />,
  Meeting: <Users2 className="h-4 w-4 text-muted-foreground" />,
  Note: <Activity className="h-4 w-4 text-muted-foreground" />,
};

export default function DashboardPage() {
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
                +20.1% desde el mes pasado
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
                {opportunities.filter((o) => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length}
              </div>
              <p className="text-xs text-muted-foreground">+10 desde la semana pasada</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nuevos Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{clients.length}</div>
              <p className="text-xs text-muted-foreground">
                +5 este mes
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
                Basado en el pipeline actual
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>
                Un registro de las actividades de venta recientes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className="p-2 bg-muted rounded-full">
                       {activityIcons[activity.type]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{activity.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.date}
                        </p>
                      </div>
                       <p className="text-sm text-muted-foreground">
                        Relacionado con el cliente: {clients.find(c => c.id === activity.clientId)?.name}
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
