'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api-client';
import { getAllUsers } from '@/lib/api/users';
import type { Client, User } from '@/lib/types';

type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  NOMBRE_COMERCIAL?: string;
  SUBTOTAL?: number | null;
  IVA?: number | null;
  TOTAL_SIN_IMPUESTOS?: number | null;
  TOTAL_BONIFICADO?: number | null;
  ID_GVA14?: number | null;
  TOTAL?: number | null;
  ID_GVA12?: string | number | null;
  ID_GVA23?: number | null;
  ID_GVA38?: number | null;
  _companyId?: string;
  _companyLabel?: string;
};

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

const COMPANIES = [
  { id: 'all', label: 'Todas' },
  { id: '4', label: 'Aire (Avion)' },
  { id: '5', label: 'SRL' },
  { id: '6', label: 'SAS' },
];

const ROWS_PER_PAGE = 50;

const formatCurrency = (value?: unknown) => {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || value == null) return 'No informado';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
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

const getCompanyLabel = (companyId?: string) => COMPANIES.find(item => item.id === companyId)?.label || companyId || '-';

const getClientCodeField = (companyId?: string) => {
  if (companyId === '5') return 'idAireSrl';
  if (companyId === '4') return 'idAire';
  return 'idAireDigital';
};

const getSellerCompanySearch = (companyId?: string) => {
  if (companyId === '5') return 'srl';
  if (companyId === '4') return 'aire';
  return 'sas';
};

function MultiSelectFilter({
  label,
  options,
  selectedValues,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedSet = new Set(selectedValues);
  const buttonText = selectedValues.length === 0
    ? 'Todos'
    : selectedValues.length === 1
      ? options.find(option => option.value === selectedValues[0])?.label || '1 seleccionado'
      : `${selectedValues.length} seleccionados`;

  const toggleValue = (value: string) => {
    const next = new Set(selectedValues);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="truncate">{buttonText}</span>
            {selectedValues.length > 0 && <Badge variant="secondary">{selectedValues.length}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{label}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
                Limpiar
              </Button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {options.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin opciones disponibles</p>
            ) : options.map(option => (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-muted"
                onClick={() => toggleValue(option.value)}
              >
                <Checkbox checked={selectedSet.has(option.value)} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function TangoInvoicesTab({ clients }: { clients: Client[] }) {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  const today = new Date();
  const [company, setCompany] = useState('all');
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
  const [skippedCompanies, setSkippedCompanies] = useState<Array<{ label: string; reason: string }>>([]);
  const [downloadingInvoiceKey, setDownloadingInvoiceKey] = useState<string | null>(null);

  const canSeeAllInvoices = Boolean(
    isBoss
    || userInfo?.role === 'Jefe'
    || userInfo?.role === 'Gerencia'
    || userInfo?.role === 'Administracion'
    || userInfo?.role === 'Admin',
  );

  useEffect(() => {
    getAllUsers().then(setUsers).catch(error => console.error('Error loading CRM sellers:', error));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedTypes, selectedSellers, selectedClients]);

  const typeOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    invoices.forEach(invoice => {
      const type = String(invoice.TIPO_COMPROBANTE || '').trim();
      if (type) map.set(type, { value: type, label: type });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [invoices]);

  const sellerOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    invoices.forEach(invoice => {
      const code = String(invoice.COD_VENDEDOR || '').trim();
      const name = String(invoice.NOMBRE_VENDEDOR || '').trim();
      if (!code && !name) return;
      const value = `${invoice._companyId || ''}|${normalizeCode(code)}|${normalizeText(name)}`;
      map.set(value, {
        value,
        label: name || code || 'Sin vendedor',
        description: `${getCompanyLabel(invoice._companyId)}${code ? ` - Codigo ${code}` : ''}`,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [invoices]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    invoices.forEach(invoice => {
      const code = String(invoice.COD_CLIENTE || '').trim();
      const name = String(invoice.RAZON_SOCIAL || '').trim();
      if (!code && !name) return;
      const value = `${invoice._companyId || ''}|${normalizeCode(code)}|${normalizeText(name)}`;
      map.set(value, {
        value,
        label: name || code || 'Sin cliente',
        description: `${getCompanyLabel(invoice._companyId)}${code ? ` - Codigo ${code}` : ''}`,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const typeSet = new Set(selectedTypes);
    const sellerSet = new Set(selectedSellers);
    const clientSet = new Set(selectedClients);

    return invoices.filter(invoice => {
      const sellerValue = `${invoice._companyId || ''}|${normalizeCode(invoice.COD_VENDEDOR)}|${normalizeText(invoice.NOMBRE_VENDEDOR)}`;
      const clientValue = `${invoice._companyId || ''}|${normalizeCode(invoice.COD_CLIENTE)}|${normalizeText(invoice.RAZON_SOCIAL)}`;

      return (typeSet.size === 0 || typeSet.has(String(invoice.TIPO_COMPROBANTE || '').trim()))
        && (sellerSet.size === 0 || sellerSet.has(sellerValue))
        && (clientSet.size === 0 || clientSet.has(clientValue));
    });
  }, [invoices, selectedTypes, selectedSellers, selectedClients]);

  const filteredTotal = useMemo(
    () => filteredInvoices.reduce((sum, invoice) => sum + (typeof invoice.TOTAL === 'number' ? invoice.TOTAL : 0), 0),
    [filteredInvoices],
  );

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ROWS_PER_PAGE));
  const visibleInvoices = useMemo(() => filteredInvoices.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  ), [filteredInvoices, page]);

  const handleSearch = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      toast({ title: 'Rango invalido', description: 'La fecha desde no puede ser posterior a la fecha hasta.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setSelectedTypes([]);
    setSelectedSellers([]);
    setSelectedClients([]);
    try {
      const params = new URLSearchParams({ company, fromDate, toDate });
      const response = await apiFetch(`/api/tango/invoices?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || 'Error al consultar Tango');

      setInvoices(Array.isArray(payload.list) ? payload.list : []);
      setSourceTotalCount(Number(payload.sourceTotalCount) || 0);
      setSkippedCompanies(Array.isArray(payload.skippedCompanies) ? payload.skippedCompanies : []);
      setPage(1);

      if (payload.skippedCompanies?.length) {
        toast({
          title: 'Algunas companias no se consultaron',
          description: payload.skippedCompanies.map((item: any) => `${item.label}: ${item.reason}`).join(' | '),
        });
      }
      if (payload.truncated) {
        toast({ title: 'Resultado parcial', description: 'La consulta alcanzo el limite maximo de paginas.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error loading Tango invoices:', error);
      setInvoices([]);
      setSourceTotalCount(0);
      setSkippedCompanies([]);
      toast({
        title: 'No se pudo consultar Tango',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getInvoicePdfId = (invoice: TangoInvoice) => {
    return String(invoice.ID_GVA12 || '').trim();
  };

  const handleDownloadInvoice = async (invoice: TangoInvoice) => {
    const invoiceCompany = invoice._companyId || company;
    const invoiceId = getInvoicePdfId(invoice);
    const downloadKey = `${invoiceCompany}-${invoiceId}`;

    if (!invoiceCompany || invoiceCompany === 'all' || !invoiceId) {
      toast({
        title: 'No se puede descargar',
        description: 'Tango no informo Company o ID_GVA12 para este comprobante.',
        variant: 'destructive',
      });
      return;
    }

    setDownloadingInvoiceKey(downloadKey);
    try {
      const params = new URLSearchParams({ company: invoiceCompany, id: invoiceId });
      const response = await apiFetch(`/api/tango/invoices/pdf?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.details || payload?.error || 'Tango no pudo generar el PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factura-tango-${invoiceCompany}-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading Tango invoice:', error);
      toast({
        title: 'No se pudo descargar la factura',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setDownloadingInvoiceKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-2 xl:grid-cols-[160px_160px_160px_1fr_1fr_1fr_auto] xl:items-end">
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
        <MultiSelectFilter label="Tipo de comprobante" options={typeOptions} selectedValues={selectedTypes} onChange={setSelectedTypes} />
        <MultiSelectFilter label="Vendedor" options={sellerOptions} selectedValues={selectedSellers} onChange={setSelectedSellers} />
        <MultiSelectFilter label="Cliente" options={clientOptions} selectedValues={selectedClients} onChange={setSelectedClients} />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {hasSearched && !loading && (
        <div className="rounded-md border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{filteredInvoices.length}</span> comprobantes visibles de {sourceTotalCount} consultados en Tango.
              {!canSeeAllInvoices && <span className="ml-2">Vista limitada a tus codigos de vendedor.</span>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">Total visible</p>
              <p className="text-2xl font-bold">{formatCurrency(filteredTotal)}</p>
            </div>
          </div>
          {skippedCompanies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {skippedCompanies.map(companyItem => (
                <Badge key={companyItem.label} variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  {companyItem.label}: {companyItem.reason}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="min-w-[1680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Compania</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Sin impuestos</TableHead>
              <TableHead className="text-right">Bonificado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>IDs Tango</TableHead>
              <TableHead className="text-right">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={13} className="h-32 text-center"><Spinner size="large" /></TableCell></TableRow>
            ) : visibleInvoices.length > 0 ? visibleInvoices.map((invoice, index) => {
              const invoiceCompany = invoice._companyId || company;
              const invoicePdfId = getInvoicePdfId(invoice);
              const downloadKey = `${invoiceCompany}-${invoicePdfId}`;
              const clientCodeField = getClientCodeField(invoiceCompany);
              const crmClient = clients.find(item => normalizeCode((item as any)[clientCodeField]) === normalizeCode(invoice.COD_CLIENTE));
              const sellerCompanySearch = getSellerCompanySearch(invoiceCompany);
              const crmSeller = users.find(user => user.sellerConfig?.some(config =>
                config.companyName.toLowerCase().includes(sellerCompanySearch)
                && config.codes.some(code => normalizeCode(code) === normalizeCode(invoice.COD_VENDEDOR))))
                || users.find(user => normalizeText(user.name) === normalizeText(invoice.NOMBRE_VENDEDOR));

              return <TableRow key={`${invoice._companyId || company}-${invoice.ID_GVA12 || invoice.NRO_COMPROBANTE || 'invoice'}-${index}`}>
                <TableCell>
                  <Badge variant="outline">{invoice._companyLabel || getCompanyLabel(invoiceCompany)}</Badge>
                </TableCell>
                <TableCell>{invoice.FECHA_DE_EMISION ? format(new Date(invoice.FECHA_DE_EMISION), 'dd/MM/yyyy') : '-'}</TableCell>
                <TableCell>{invoice.TIPO_COMPROBANTE || '-'}</TableCell>
                <TableCell className="font-medium">{invoice.NRO_COMPROBANTE || '-'}</TableCell>
                <TableCell>
                  <div className="font-medium">{invoice.RAZON_SOCIAL || invoice.NOMBRE_COMERCIAL || '-'}</div>
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
                <TableCell className="text-right">{invoice.SUBTOTAL == null ? 'No informado' : formatCurrency(invoice.SUBTOTAL)}</TableCell>
                <TableCell className="text-right">{invoice.IVA == null ? 'No informado' : formatCurrency(invoice.IVA)}</TableCell>
                <TableCell className="text-right">{invoice.TOTAL_SIN_IMPUESTOS == null ? 'No informado' : formatCurrency(invoice.TOTAL_SIN_IMPUESTOS)}</TableCell>
                <TableCell className="text-right">{invoice.TOTAL_BONIFICADO == null ? 'No informado' : formatCurrency(invoice.TOTAL_BONIFICADO)}</TableCell>
                <TableCell className="text-right font-semibold">{invoice.TOTAL == null ? 'No informado' : formatCurrency(invoice.TOTAL)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  GVA14: {invoice.ID_GVA14 ?? '-'} | GVA12: {invoice.ID_GVA12 ?? '-'} | GVA23: {invoice.ID_GVA23 ?? '-'} | GVA38: {invoice.ID_GVA38 ?? '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title={`PDF Tango - Company ${invoiceCompany} - ID_GVA12 ${invoicePdfId || 'sin informar'}`}
                    onClick={() => handleDownloadInvoice(invoice)}
                    disabled={!invoicePdfId || downloadingInvoiceKey === downloadKey}
                  >
                    {downloadingInvoiceKey === downloadKey ? (
                      <Spinner size="small" className="mr-2" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    PDF
                  </Button>
                </TableCell>
              </TableRow>;
            }) : (
              <TableRow>
                <TableCell colSpan={13} className="h-28 text-center text-muted-foreground">
                  {hasSearched ? 'No se encontraron comprobantes con esos filtros.' : 'Elegí rango, compania y consulta Tango.'}
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
