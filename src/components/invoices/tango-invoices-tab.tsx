'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getAllUsers } from '@/lib/firebase-service';
import type { Client, User } from '@/lib/types';
import {
  formatTangoCurrency,
  getTangoInvoices,
  normalizeTangoCode,
  normalizeTangoText,
  tangoCompanies,
  type TangoCompanyFilter,
  type TangoInvoice,
} from '@/modules/billing/client';

const ROWS_PER_PAGE = 50;

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

function uniqueOptions(options: FilterOption[]) {
  const seen = new Set<string>();
  return options
    .filter(option => {
      if (!option.value || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const selectedLabels = options.filter(option => selected.includes(option.value)).map(option => option.label);

  const toggleValue = (value: string) => {
    onChange(selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value]);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between" disabled={disabled || options.length === 0}>
            <span className="truncate text-left">
              {selected.length === 0 ? 'Todos' : `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{label}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Limpiar
            </Button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {options.map(option => (
              <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-muted">
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggleValue(option.value)}
                />
                <span className="grid gap-0.5 text-sm leading-tight">
                  <span>{option.label}</span>
                  {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
                </span>
              </label>
            ))}
          </div>
          {selectedLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t pt-2">
              {selectedLabels.slice(0, 6).map(item => (
                <Badge key={item} variant="secondary">{item}</Badge>
              ))}
              {selectedLabels.length > 6 && <Badge variant="outline">+{selectedLabels.length - 6}</Badge>}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

const getTypeKey = (invoice: TangoInvoice) => normalizeTangoText(invoice.TIPO_COMPROBANTE || '-');
const getClientKey = (invoice: TangoInvoice) => `${invoice._companyId || 'all'}:${normalizeTangoCode(invoice.COD_CLIENTE)}`;
const getSellerKey = (invoice: TangoInvoice) =>
  `${invoice._companyId || 'all'}:${normalizeTangoCode(invoice.COD_VENDEDOR) || normalizeTangoText(invoice.NOMBRE_VENDEDOR)}`;

export function TangoInvoicesTab({ clients, mappingWarning }: { clients: Client[]; mappingWarning?: string | null }) {
  const { toast } = useToast();
  const { userInfo, isBoss } = useAuth();
  const userEmail = userInfo?.email?.toLowerCase();
  const canViewTeamInvoices = Boolean(
    isBoss
    || userEmail === 'lchena@airedesantafe.com.ar'
    || userEmail === 'leandrochena@gmail.com'
    || userInfo?.role === 'Gerencia'
    || userInfo?.role === 'Administracion'
    || userInfo?.role === 'Admin',
  );
  const today = new Date();
  const [company, setCompany] = useState<TangoCompanyFilter>('all');
  const [fromDate, setFromDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(today, 'yyyy-MM-dd'));
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<TangoInvoice[]>([]);
  const [sourceTotalCount, setSourceTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[]>([]);
  const [resultScope, setResultScope] = useState<'all' | 'own'>(canViewTeamInvoices ? 'all' : 'own');

  useEffect(() => {
    if (!userInfo) {
      setUsers([]);
      return;
    }

    if (!canViewTeamInvoices) {
      setUsers([userInfo]);
      return;
    }

    getAllUsers().then(setUsers).catch(error => console.error('Error loading CRM sellers:', error));
  }, [canViewTeamInvoices, userInfo]);

  useEffect(() => {
    setSelectedTypes([]);
    setSelectedSellers([]);
    setSelectedClients([]);
    setPage(1);
  }, [company, fromDate, toDate]);

  const typeOptions = useMemo(() => uniqueOptions(invoices.map(invoice => ({
    value: getTypeKey(invoice),
    label: invoice.TIPO_COMPROBANTE || '-',
  }))), [invoices]);

  const sellerOptions = useMemo(() => uniqueOptions(invoices.map(invoice => {
    const companyLabel = tangoCompanies.find(item => item.id === invoice._companyId)?.shortLabel;
    return {
      value: getSellerKey(invoice),
      label: invoice.NOMBRE_VENDEDOR || invoice.COD_VENDEDOR || 'Sin vendedor',
      description: [companyLabel, invoice.COD_VENDEDOR].filter(Boolean).join(' · '),
    };
  })), [invoices]);

  const clientOptions = useMemo(() => uniqueOptions(invoices.map(invoice => {
    const companyLabel = tangoCompanies.find(item => item.id === invoice._companyId)?.shortLabel;
    return {
      value: getClientKey(invoice),
      label: invoice.RAZON_SOCIAL || invoice.COD_CLIENTE || 'Sin cliente',
      description: [companyLabel, invoice.COD_CLIENTE].filter(Boolean).join(' · '),
    };
  })), [invoices]);

  const filteredInvoices = useMemo(() => invoices.filter(invoice =>
    (selectedTypes.length === 0 || selectedTypes.includes(getTypeKey(invoice)))
    && (selectedSellers.length === 0 || selectedSellers.includes(getSellerKey(invoice)))
    && (selectedClients.length === 0 || selectedClients.includes(getClientKey(invoice))),
  ), [invoices, selectedClients, selectedSellers, selectedTypes]);

  const filteredTotal = useMemo(
    () => filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.TOTAL || 0), 0),
    [filteredInvoices],
  );

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ROWS_PER_PAGE));
  const visibleInvoices = useMemo(() => filteredInvoices.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  ), [filteredInvoices, page]);

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
      const result = await getTangoInvoices({ company, fromDate, toDate });

      setInvoices(Array.isArray(result.list) ? result.list : []);
      setSourceTotalCount(Number(result.sourceTotalCount) || 0);
      setResultScope(result.scope || (canViewTeamInvoices ? 'all' : 'own'));
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
      setResultScope(canViewTeamInvoices ? 'all' : 'own');
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
      {mappingWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar el mapeo CRM</AlertTitle>
          <AlertDescription>
            Tango se puede consultar igual, pero los comprobantes aparecerán como “Sin mapear” hasta corregir la conexión
            de Firebase Admin. Detalle: {mappingWarning}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-2 xl:grid-cols-[170px_160px_160px_1fr_1fr_1fr_auto] xl:items-end">
        <div className="space-y-2">
          <Label>Compañía</Label>
          <Select value={company} onValueChange={value => setCompany(value as TangoCompanyFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
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
        <MultiSelectFilter label="Tipo de comprobante" options={typeOptions} selected={selectedTypes} onChange={setSelectedTypes} disabled={!hasSearched || loading} />
        <MultiSelectFilter label="Vendedor" options={sellerOptions} selected={selectedSellers} onChange={setSelectedSellers} disabled={!hasSearched || loading} />
        <MultiSelectFilter label="Cliente" options={clientOptions} selected={selectedClients} onChange={setSelectedClients} disabled={!hasSearched || loading} />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {hasSearched && !loading && (
        <div className="grid gap-2 rounded-md border bg-white px-4 py-3 text-sm text-muted-foreground md:grid-cols-2">
          <span>
            {filteredInvoices.length} comprobantes visibles de {invoices.length} filtrados ({sourceTotalCount} consultados en Tango).
            {' '}
            {resultScope === 'own' ? 'Vista limitada a tus comprobantes asignados.' : 'Vista completa del equipo.'}
          </span>
          <span className="font-semibold text-slate-800 md:text-right">Total mostrado: {formatTangoCurrency(filteredTotal)}</span>
          {filteredInvoices.length > ROWS_PER_PAGE && <span className="md:col-span-2">Página {page} de {totalPages}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="min-w-[1380px]">
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
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
              <TableRow><TableCell colSpan={8} className="h-32 text-center"><Spinner size="large" /></TableCell></TableRow>
            ) : visibleInvoices.length > 0 ? visibleInvoices.map((invoice, index) => {
              const companyConfig = tangoCompanies.find(item => item.id === invoice._companyId)
                || tangoCompanies.find(item => item.id === company)
                || tangoCompanies[2];
              const crmClient = clients.find(item =>
                normalizeTangoCode(item[companyConfig.crmClientField]) === normalizeTangoCode(invoice.COD_CLIENTE),
              );

              const crmSeller = users.find(user => user.sellerConfig?.some(config =>
                config.companyName.toLowerCase().includes(companyConfig.sellerCompanySearch)
                && config.codes.some(code => normalizeTangoCode(code) === normalizeTangoCode(invoice.COD_VENDEDOR)),
              ))
                || users.find(user => normalizeTangoText(user.name) === normalizeTangoText(invoice.NOMBRE_VENDEDOR));

              return (
                <TableRow key={`${invoice._companyId || company}-${invoice.ID_GVA12 || invoice.NRO_COMPROBANTE || 'invoice'}-${index}`}>
                  <TableCell><Badge variant="outline">{companyConfig.shortLabel}</Badge></TableCell>
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
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                  {hasSearched ? 'No se encontraron comprobantes con esos filtros.' : 'Completá los filtros y consultá Tango.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filteredInvoices.length > ROWS_PER_PAGE && (
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
