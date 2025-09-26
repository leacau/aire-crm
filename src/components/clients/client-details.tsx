import type { Client, Opportunity, Activity, User } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Briefcase,
  Mail,
  Phone,
  CircleDollarSign,
  Calendar,
  User as UserIcon,
  Phone as PhoneIcon,
  Mail as MailIcon,
  Users as UsersIcon,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const stageBadgeVariant: Record<Opportunity['stage'], 'default' | 'secondary' | 'destructive'> = {
  Nuevo: 'secondary',
  Propuesta: 'default',
  Negociación: 'default',
  'Cerrado - Ganado': 'default',
  'Cerrado - Perdido': 'destructive',
};

const activityIcons: Record<Activity['type'], React.ReactNode> = {
  Llamada: <PhoneIcon className="h-5 w-5" />,
  Email: <MailIcon className="h-5 w-5" />,
  Reunión: <UsersIcon className="h-5 w-s" />,
  Nota: <FileText className="h-5 w-5" />,
};

export function ClientDetails({
  client,
  opportunities,
  activities,
  users,
}: {
  client: Client;
  opportunities: Opportunity[];
  activities: Activity[];
  users: User[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={client.avatarUrl} alt={client.name} data-ai-hint="logo building" />
              <AvatarFallback>{client.avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{client.name}</CardTitle>
              <CardDescription>{client.company}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{client.phone}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{client.company}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Oportunidades</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Etapa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id}>
                    <TableCell className='font-medium'>{opp.title}</TableCell>
                    <TableCell>${opp.value.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={stageBadgeVariant[opp.stage]}>
                        {opp.stage}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Línea de Tiempo de Actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-8 pl-6 before:absolute before:inset-y-0 before:w-px before:bg-border before:left-6">
              {activities.map((activity) => (
                <div key={activity.id} className="relative">
                  <div className="absolute -left-3.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background border-2 border-primary text-primary">
                    {activityIcons[activity.type]}
                  </div>
                  <div className="ml-8">
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">{activity.subject}</p>
                        <p className="text-sm text-muted-foreground">{activity.date}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{activity.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
