'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { BarChart3, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getClients } from '@/lib/api/clients';
import { getTangoCollections, getTangoInvoices, type TangoCollectionRecord, type TangoInvoiceRecord } from '@/lib/api/tango';
import type { Client } from '@/lib/types';

type CollectionStatus = 'paid' | 'pending';
type CollectionsTab = CollectionStatus | 'monthly';

type TangoInvoice = TangoInvoiceRecord;

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

const ROWS_PER_PAGE = 80;

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

const getLateBucket = (daysLate: number | null) => {
  const value = Number(daysLate);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value <= 30) return '1-30';
  if (value <= 60) return '31-60';
  if (value <= 90) return '61-90';
  if (value <= 120) return '91-120';
  return '120-plus';
};

const lateBucketOptionsBase: FilterOption[] = [
  { value: '0', label: '0 dias' },
  { value: '1-30', label: '1 a 30 dias' },
  { value: '31-60', label: '31 a 60 dias' },
  { value: '61-90', label: '61 a 90 dias' },
  { value: '91-120', label: '91 a 120 dias' },
  { value: '120-plus', label: 'Mas de 120 dias' },
];

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const getClientCodeField = (companyId?: string) => {
  if (companyId === '4') return 'idAire';
  if (companyId === '5') return 'idAireSrl';
  return 'idAireDigital';
};

const lateBucketLabels = lateBucketOptionsBase.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

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
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <p className="text-sm font-medium">{label}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>Limpiar</Button>
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

export default function CollectionsPage() {
  const { toast } = useToast();
  const today = new Date();
  const [activeTab, setActiveTab] = useState<CollectionsTab>('paid');
  const status: CollectionStatus = activeTab === 'pending' ? 'pending' : 'paid';
  const [fromDate, setFromDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(today, 'yyyy-MM-dd'));
  const [selectedYear, setSelectedYear] = useState(String(today.getFullYear()));
  const [records, setRecords] = useState<TangoCollectionRecord[]>([]);
  const [monthlyInvoices, setMonthlyInvoices] = useState<TangoInvoice[]>([]);
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [selectedLateBuckets, setSelectedLateBuckets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sourceTotalCount, setSourceTotalCount] = useState(0);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [hasMonthlySearched, setHasMonthlySearched] = useState(false);

  const resetFilters = () => {
    setSelectedClients([]);
    setSelectedSellers([]);
    setSelectedLateBuckets([]);
  };

  useEffect(() => {
    let active = true;
    getClients()
      .then(clients => {
        if (active) setCrmClients(clients);
      })
      .catch(error => console.error('Error loading CRM clients for Tango collections:', error));
    return () => { active = false; };
  }, []);

  const handleSearch = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      toast({ title: 'Rango invalido', description: 'La fecha desde no puede ser posterior a la fecha hasta.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    resetFilters();

    try {
      const params: Record<string, string> = { status };
      if (status === 'paid') {
        params.fromDate = fromDate;
        params.toDate = toDate;
      }
      const payload = await getTangoCollections(params);

      setRecords(payload.list);
      setSourceTotalCount(Number(payload.sourceTotalCount) || 0);
      setCanSeeAll(Boolean(payload.canSeeAll));
      setTruncated(Boolean(payload.truncated));
      if (payload.truncated) {
        toast({ title: 'Resultado parcial', description: 'La consulta alcanzo el limite maximo de paginas.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error loading Tango collections:', error);
      setRecords([]);
      setSourceTotalCount(0);
      setCanSeeAll(false);
      setTruncated(false);
      toast({
        title: 'No se pudo consultar Tango',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMonthlySearch = async () => {
    setLoading(true);
    setHasMonthlySearched(true);
    setSelectedSellers([]);

    try {
      const payload = await getTangoInvoices<TangoInvoice>({
        company: 'all',
        fromDate: `${selectedYear}-01-01`,
        toDate: `${selectedYear}-12-31`,
      });

      setMonthlyInvoices(payload.list);
      setSourceTotalCount(Number(payload.sourceTotalCount) || 0);
      setTruncated(Boolean(payload.truncated));
      if (payload.truncated) {
        toast({ title: 'Resultado parcial', description: 'La consulta alcanzo el limite maximo de paginas.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error loading monthly Tango invoices:', error);
      setMonthlyInvoices([]);
      toast({
        title: 'No se pudo consultar Tango',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const clientOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    records.forEach(record => {
      const value = `${normalizeCode(record.clientCode)}|${normalizeText(record.clientName)}`;
      if (!value.trim()) return;
      map.set(value, { value, label: record.clientName || record.clientCode || 'Sin cliente', description: record.clientCode });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const sellerOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    records.forEach(record => {
      const value = `${normalizeCode(record.sellerCode)}|${normalizeText(record.sellerName)}`;
      if (!value.trim()) return;
      map.set(value, { value, label: record.sellerName || record.sellerCode || 'Sin asesor', description: record.sellerCode });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const monthlySellerOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    monthlyInvoices.forEach(invoice => {
      const code = String(invoice.COD_VENDEDOR || '').trim();
      const name = String(invoice.NOMBRE_VENDEDOR || '').trim();
      const value = `${normalizeCode(code)}|${normalizeText(name)}`;
      if (!value.trim()) return;
      map.set(value, { value, label: name || code || 'Sin asesor', description: code });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [monthlyInvoices]);

  const lateBucketOptions = useMemo(() => {
    const buckets = new Set<string>(records.map(record => getLateBucket(record.daysLate)));
    return lateBucketOptionsBase.filter(option => buckets.has(option.value));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const clientSet = new Set(selectedClients);
    const sellerSet = new Set(selectedSellers);
    const lateSet = new Set(selectedLateBuckets);

    return records.filter(record => {
      const clientValue = `${normalizeCode(record.clientCode)}|${normalizeText(record.clientName)}`;
      const sellerValue = `${normalizeCode(record.sellerCode)}|${normalizeText(record.sellerName)}`;
      const lateValue = getLateBucket(record.daysLate);

      return (clientSet.size === 0 || clientSet.has(clientValue))
        && (sellerSet.size === 0 || sellerSet.has(sellerValue))
        && (lateSet.size === 0 || lateSet.has(lateValue));
    });
  }, [records, selectedClients, selectedSellers, selectedLateBuckets]);

  const visibleTotal = useMemo(
    () => filteredRecords.reduce((sum, record) => sum + (record.amount || 0), 0),
    [filteredRecords],
  );

  const visibleRecords = filteredRecords.slice(0, ROWS_PER_PAGE);

  const monthlyRows = useMemo(() => {
    const sellerSet = new Set(selectedSellers);
    const rows = new Map<string, {
      clientCode: string;
      clientName: string;
      sellerName: string;
      crmClientName?: string;
      months: number[];
      total: number;
    }>();

    const findCrmClient = (invoice: TangoInvoice, clientCode: string) => {
      const codeField = getClientCodeField(invoice._companyId);
      const normalizedClientCode = normalizeCode(clientCode);
      return crmClients.find(client => normalizeCode((client as any)[codeField]) === normalizedClientCode);
    };

    monthlyInvoices
      .filter(invoice => String(invoice.TIPO_COMPROBANTE || '').trim().toUpperCase() === 'FAC')
      .filter(invoice => !normalizeText(invoice.NOMBRE_VENDEDOR).includes('oficial'))
      .filter(invoice => {
        const sellerValue = `${normalizeCode(invoice.COD_VENDEDOR)}|${normalizeText(invoice.NOMBRE_VENDEDOR)}`;
        return sellerSet.size === 0 || sellerSet.has(sellerValue);
      })
      .forEach(invoice => {
        const date = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
        const monthIndex = Number(date.slice(5, 7)) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;
        const clientCode = String(invoice.COD_CLIENTE || '').trim();
        const clientName = String(invoice.RAZON_SOCIAL || invoice.NOMBRE_COMERCIAL || 'Sin cliente').trim();
        const crmClient = findCrmClient(invoice, clientCode);
        const crmClientName = crmClient?.denominacion || crmClient?.razonSocial || '';
        const key = crmClient?.id || `${normalizeCode(clientCode)}|${normalizeText(clientName)}`;
        const current = rows.get(key) || {
          clientCode,
          clientName,
          sellerName: String(invoice.NOMBRE_VENDEDOR || ''),
          crmClientName,
          months: Array(12).fill(0),
          total: 0,
        };
        if (!current.crmClientName && crmClientName) current.crmClientName = crmClientName;
        const amount = typeof invoice.TOTAL === 'number' ? invoice.TOTAL : 0;
        current.months[monthIndex] += amount;
        current.total += amount;
        rows.set(key, current);
      });

    return Array.from(rows.values()).sort((a, b) => b.total - a.total);
  }, [crmClients, monthlyInvoices, selectedSellers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cobranzas Tango</h1>
        <p className="text-sm text-muted-foreground">Comprobantes cobrados e imputados, y mora pendiente desde Tango.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => {
        setActiveTab(value as CollectionsTab);
        setRecords([]);
        setMonthlyInvoices([]);
        setHasSearched(false);
        setHasMonthlySearched(false);
        resetFilters();
      }}>
        <TabsList>
          <TabsTrigger value="paid">Cobradas / imputadas</TabsTrigger>
          <TabsTrigger value="pending">Mora pendiente</TabsTrigger>
          <TabsTrigger value="monthly">Clientes por mes</TabsTrigger>
        </TabsList>

        <TabsContent value="paid" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[160px_160px_1fr_1fr_1fr_auto] xl:items-end">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} />
              </div>
              <MultiSelectFilter label="Cliente" options={clientOptions} selectedValues={selectedClients} onChange={setSelectedClients} />
              <MultiSelectFilter label="Asesor" options={sellerOptions} selectedValues={selectedSellers} onChange={setSelectedSellers} />
              <MultiSelectFilter label="Tiempo de mora" options={lateBucketOptions} selectedValues={selectedLateBuckets} onChange={setSelectedLateBuckets} />
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
                Consultar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
              <MultiSelectFilter label="Cliente" options={clientOptions} selectedValues={selectedClients} onChange={setSelectedClients} />
              <MultiSelectFilter label="Asesor" options={sellerOptions} selectedValues={selectedSellers} onChange={setSelectedSellers} />
              <MultiSelectFilter label="Tiempo de mora" options={lateBucketOptions} selectedValues={selectedLateBuckets} onChange={setSelectedLateBuckets} />
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
                Consultar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {(activeTab === 'paid' || activeTab === 'pending') && (
          <div className="space-y-4">
          {hasSearched && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{status === 'paid' ? 'Facturas cobradas' : 'Mora pendiente'}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {filteredRecords.length} visibles de {sourceTotalCount} registros consultados.
                    {!canSeeAll && <span className="ml-2">Vista limitada a tus codigos de vendedor.</span>}
                    {truncated && <span className="ml-2 text-destructive">Resultado parcial.</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-muted-foreground">Total visible</p>
                  <p className="text-2xl font-bold">{formatCurrency(visibleTotal)}</p>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Comprobante</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Asesor</TableHead>
                          <TableHead>Emision</TableHead>
                          {status === 'pending' && <TableHead>Vencimiento</TableHead>}
                          {status === 'pending' && <TableHead>Tiempo de mora</TableHead>}
                          <TableHead className="text-right">{status === 'paid' ? 'Imputado' : 'Total factura'}</TableHead>
                          {status === 'pending' && <TableHead className="text-right">Total imputado</TableHead>}
                          {status === 'pending' && <TableHead className="text-right">Saldo pendiente</TableHead>}
                          {status === 'paid' && <TableHead className="text-right">Valor factura</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={status === 'paid' ? 6 : 9} className="h-24 text-center text-muted-foreground">
                              Sin registros para los filtros seleccionados.
                            </TableCell>
                          </TableRow>
                        ) : visibleRecords.map(record => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <div className="font-medium">{record.voucherType || '-'}</div>
                              <div className="text-xs text-muted-foreground">{record.voucherNumber || 'Sin numero'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{record.clientName || 'Sin cliente'}</div>
                              <div className="text-xs text-muted-foreground">{record.clientCode || 'Sin codigo'}</div>
                            </TableCell>
                            <TableCell>
                              <div>{record.sellerName || 'Sin asesor'}</div>
                              <div className="text-xs text-muted-foreground">{record.sellerCode || 'Sin codigo'}</div>
                            </TableCell>
                            <TableCell>{record.issueDate || '-'}</TableCell>
                            {status === 'pending' && <TableCell>{record.dueDate || '-'}</TableCell>}
                            {status === 'pending' && <TableCell>{lateBucketLabels[getLateBucket(record.daysLate)]}</TableCell>}
                            <TableCell className="text-right font-medium">
                              {formatCurrency(status === 'pending' ? record.invoiceTotal : record.amount)}
                            </TableCell>
                            {status === 'pending' && <TableCell className="text-right">{formatCurrency(record.imputedAmount || 0)}</TableCell>}
                            {status === 'pending' && <TableCell className="text-right font-semibold">{formatCurrency(record.pendingAmount ?? record.amount)}</TableCell>}
                            {status === 'paid' && <TableCell className="text-right">{formatCurrency(record.invoiceTotal)}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {filteredRecords.length > ROWS_PER_PAGE && (
                  <p className="mt-3 text-xs text-muted-foreground">Mostrando los primeros {ROWS_PER_PAGE} registros. Ajusta los filtros para acotar el resultado.</p>
                )}
              </CardContent>
            </Card>
          )}
          </div>
        )}

        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-[180px_1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>Año</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, index) => String(today.getFullYear() - index)).map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MultiSelectFilter label="Vendedor" options={monthlySellerOptions} selectedValues={selectedSellers} onChange={setSelectedSellers} />
              <Button onClick={handleMonthlySearch} disabled={loading}>
                {loading ? <Spinner size="small" className="mr-2" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                Consultar
              </Button>
            </CardContent>
          </Card>

          {hasMonthlySearched && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes con facturación mensual</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {monthlyRows.length} clientes con comprobantes FAC en {selectedYear}.
                  {truncated && <span className="ml-2 text-destructive">Resultado parcial.</span>}
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[240px]">Cliente</TableHead>
                          {MONTHS.map(month => <TableHead key={month} className="min-w-[130px] text-right">{month}</TableHead>)}
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
                              Sin facturación FAC para los filtros seleccionados.
                            </TableCell>
                          </TableRow>
                        ) : monthlyRows.map(row => (
                          <TableRow key={`${row.clientCode}-${row.clientName}`}>
                            <TableCell>
                              <div className="font-medium">{row.clientName}</div>
                              <div className="text-xs text-muted-foreground">{row.clientCode || 'Sin codigo'}{row.sellerName ? ` · ${row.sellerName}` : ''}</div>
                              <div className={row.crmClientName ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>
                                CRM: {row.crmClientName || 'Sin mapear'}
                              </div>
                            </TableCell>
                            {row.months.map((amount, index) => (
                              <TableCell key={MONTHS[index]} className="text-right">
                                {amount > 0 ? formatCurrency(amount) : '-'}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">{formatCurrency(row.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
