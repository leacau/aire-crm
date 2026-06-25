'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { getAllUsers } from '@/lib/firebase-service';
import type { Client, User } from '@/lib/types';

type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  ID_GVA14?: number | null;
  TOTAL?: number | null;
  ID_GVA12?: number | null;
  ID_GVA23?: number | null;
  ID_GVA38?: number | null;
};

const COMPANIES = [
  { id: '5', label: 'SRL' },
  { id: '6', label: 'SAS' },
];
const ROWS_PER_PAGE = 50;

const formatCurrency = (value?: any) => {
  let numericValue = 0;
  
  if (typeof value === 'number') {
    numericValue = value;
  } else if (typeof value === 'string') {
    // Limpiamos el string: quitamos los puntos de miles y cambiamos la coma decimal por punto
    const cleanString = value.replace(/\./g, '').replace(',', '.');
    numericValue = Number(cleanString);
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number.isNaN(numericValue) ? 0 : numericValue);
};

const normalizeCode = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/^0+/, '');
  return normalized || (String(value || '').trim() ? '0' : '');
};

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export function TangoInvoicesTab({ clients }: { clients: Client[] }) {
  const { toast } = useToast();
  const today = new Date();
  const [company, setCompany] = useState('6');
  const [fromDate, setFromDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(today, 'yyyy-MM-dd'));
  const [client, setClient] = useState('');
  const [seller, setSeller] = useState('');
  const [invoices, setInvoices] = useState<TangoInvoice[]>([]);
  const [sourceTotalCount, setSourceTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    getAllUsers().then(setUsers).catch(error => console.error('Error loading CRM sellers:', error));
  }, []);

  const totalPages = Math.max(1, Math.ceil(invoices.length / ROWS_PER_PAGE));
  const visibleInvoices = useMemo(() => invoices.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  ), [invoices, page]);

  const handleSearch = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      toast({ title: 'Rango invalido', description: 'La fecha desde no puede ser posterior a la fecha hasta.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('No se pudo validar la sesion.');

      const params = new URLSearchParams({ company, fromDate, toDate });
      if (client.trim()) params.set('client', client.trim());
      if (seller.trim()) params.set('seller', seller.trim());

      const response = await fetch(`/api/tango/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || 'Error al consultar Tango');

      setInvoices(Array.isArray(payload.list) ? payload.list : []);
      setSourceTotalCount(Number(payload.sourceTotalCount) || 0);
      setPage(1);
      if (payload.truncated) {
        toast({ title: 'Resultado parcial', description: 'La consulta alcanzo el limite maximo de paginas.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error loading Tango invoices:', error);
      setInvoices([]);
      setSourceTotalCount(0);
      toast({
        title: 'No se pudo consultar Tango',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-2 xl:grid-cols-[160px_160px_160px_1fr_1fr_auto] xl:items-end">
        <div className="space-y-2">
          <Label>Compania</Label>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANIES.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Desde</Label>
          <Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Hasta</Label>
          <Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Cliente</Label>
          <Input value={client} onChange={event => setClient(event.target.value)} placeholder="Codigo o razon social" />
        </div>
        <div className="space-y-2">
          <Label>Vendedor</Label>
          <Input value={seller} onChange={event => setSeller(event.target.value)} placeholder="Codigo o nombre" />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {hasSearched && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{invoices.length} comprobantes coincidentes de {sourceTotalCount} consultados en Tango.</span>
          {invoices.length > ROWS_PER_PAGE && <span>Pagina {page} de {totalPages}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="min-w-[1280px]">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>IDs Tango</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="h-32 text-center"><Spinner size="large" /></TableCell></TableRow>
            ) : visibleInvoices.length > 0 ? visibleInvoices.map((invoice, index) => {
              const clientCodeField = company === '5' ? 'idAireSrl' : 'idAireDigital';
              const crmClient = clients.find(item => normalizeCode(item[clientCodeField]) === normalizeCode(invoice.COD_CLIENTE));
              const sellerCompanyName = company === '5' ? 'Aire SRL' : 'Aire Digital SAS';
              const crmSeller = users.find(user => user.sellerConfig?.some(config =>
                config.companyName === sellerCompanyName
                && config.codes.some(code => normalizeCode(code) === normalizeCode(invoice.COD_VENDEDOR))))
                || users.find(user => normalizeText(user.name) === normalizeText(invoice.NOMBRE_VENDEDOR));

              return <TableRow key={`${invoice.ID_GVA12 || invoice.NRO_COMPROBANTE || 'invoice'}-${index}`}>
                <TableCell>{invoice.FECHA_DE_EMISION ? format(new Date(invoice.FECHA_DE_EMISION), 'dd/MM/yyyy') : '-'}</TableCell>
                <TableCell>{invoice.TIPO_COMPROBANTE || '-'}</TableCell>
                <TableCell className="font-medium">{invoice.NRO_COMPROBANTE || '-'}</TableCell>
                <TableCell>
                  <div className="font-medium">{invoice.RAZON_SOCIAL || '-'}</div>
                  <div className="text-xs text-muted-foreground">{invoice.COD_CLIENTE || '-'}</div>
                  <div className={`text-xs ${crmClient ? 'text-emerald-700' : 'text-amber-700'}`}>
                    CRM: {crmClient?.denominacion || crmClient?.razonSocial || 'Sin mapear'}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{invoice.NOMBRE_VENDEDOR || '-'}</div>
                  <div className="text-xs text-muted-foreground">{invoice.COD_VENDEDOR || 'Codigo no informado por Tango'}</div>
                  <div className={`text-xs ${crmSeller ? 'text-emerald-700' : 'text-amber-700'}`}>
                    CRM: {crmSeller?.name || 'Sin mapear'}
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">{invoice.TOTAL == null ? 'No informado' : formatCurrency(invoice.TOTAL)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  GVA14: {invoice.ID_GVA14 ?? '-'} | GVA12: {invoice.ID_GVA12 ?? '-'} | GVA23: {invoice.ID_GVA23 ?? '-'} | GVA38: {invoice.ID_GVA38 ?? '-'}
                </TableCell>
              </TableRow>;
            }) : (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {hasSearched ? 'No se encontraron comprobantes con esos filtros.' : 'Completa los filtros y consulta Tango.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {invoices.length > ROWS_PER_PAGE && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1}>
            <ChevronLeft className="mr-1 h-4 w-4" />Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
            Siguiente<ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
