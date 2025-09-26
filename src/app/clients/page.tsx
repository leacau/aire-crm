import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { clients, opportunities } from '@/lib/data';
import { FileDown, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function ClientsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Clientes">
        <Button variant="outline">
          <FileDown className="mr-2" />
          Exportar CSV
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Avatar</TableHead>
                <TableHead>Compañía</TableHead>
                <TableHead>Contacto Principal</TableHead>
                <TableHead>Negocios Abiertos</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const clientOpps = opportunities.filter(
                  (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
                );
                const totalValue = clientOpps.reduce(
                  (acc, opp) => acc + opp.value,
                  0
                );
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={client.avatarUrl} alt={client.name} data-ai-hint="logo building" />
                        <AvatarFallback>{client.avatarFallback}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {client.company}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{client.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {client.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{clientOpps.length}</TableCell>
                    <TableCell>${totalValue.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
