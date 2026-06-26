'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getAllUsers } from '@/lib/firebase-service';
import type { Client, User } from '@/lib/types';
import {
  formatTangoCurrency,
  getTangoInvoices,
  normalizeTangoCode,
  normalizeTangoText,
  tangoCompanies,
  type TangoCompanyId,
  type TangoInvoice,
} from '@/modules/billing/client';

const ROWS_PER_PAGE = 50;

export function TangoInvoicesTab({ clients }: { clients: Client[] }) {
  const { toast } = useToast();
  const today = new Date();
  const [company, setCompany] = useState<TangoCompanyId>('6');
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
      toast({
        title: 'Rango inválido',
        description: 'La fecha desde no puede ser posterior a la fecha hasta.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const result = await getTangoInvoices({
        company,
        fromDate,
        toDate,
        client: client.trim() || undefined,
        seller: seller.trim() || undefined,
      });

      setInvoices(Array.isArray(result.list) ? result.list : []);
      setSourceTotalCount(Number(result.sourceTotalCount) || 0);
      setPage(1);
      if (result.truncated) {
        toast({
          title: 'Resultado parcial',
          description: 'La consulta alcanzó el límite máximo de páginas.',
          variant: 'destructive',
        });
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
          <Label>Compañía</Label>
          <Select value={company} onValueChange={value => setCompany(value as TangoCompanyId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {tangoCompanies.map(item => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
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
          <Input value={client} onChange={event => setClient(event.target.value)} placeholder="Código o razón social" />
        </div>
        <div className="space-y-2">
          <Label>Vendedor</Label>
          <Input value={seller} onChange={event => setSeller(event.target.value)} placeholder="Código o nombre" />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {hasSearched && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{invoices.length} comprobantes coincidentes de {sourceTotalCount} consultados en Tango.</span>
          {invoices.length > ROWS_PER_PAGE && <span>Página {page} de {totalPages}</span>}
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
              const companyConfig = tangoCompanies.find(item => item.id === company) || tangoCompanies[2];
              const crmClient = clients.find(item =>
                normalizeTangoCode(item[companyConfig.crmClientField]) === normalizeTangoCode(invoice.COD_CLIENTE),
              );

              const crmSeller = users.find(user => user.sellerConfig?.some(config =>
                config.companyName.toLowerCase().includes(companyConfig.sellerCompanySearch)
                && config.codes.some(code => normalizeTangoCode(code) === normalizeTangoCode(invoice.COD_VENDEDOR)),
              ))
                || users.find(user => normalizeTangoText(user.name) === normalizeTangoText(invoice.NOMBRE_VENDEDOR));

              return (
                <TableRow key={`${invoice.ID_GVA12 || invoice.NRO_COMPROBANTE || 'invoice'}-${index}`}>
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
                    <div className="text-xs text-muted-foreground">{invoice.COD_VENDEDOR || 'Código no informado por Tango'}</div>
                    <div className={`text-xs ${crmSeller ? 'text-emerald-700' : 'text-amber-700'}`}>
                      CRM: {crmSeller?.name || 'Sin mapear'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatTangoCurrency(invoice.TOTAL)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    GVA14: {invoice.ID_GVA14 ?? '-'} | GVA12: {invoice.ID_GVA12 ?? '-'} | GVA23: {invoice.ID_GVA23 ?? '-'} | GVA38: {invoice.ID_GVA38 ?? '-'}
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {hasSearched ? 'No se encontraron comprobantes con esos filtros.' : 'Completá los filtros y consultá Tango.'}
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
