'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { endOfMonth, format } from 'date-fns';
import { Receipt, Search } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Client } from '@/lib/types';

type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  NOMBRE_COMERCIAL?: string;
  TOTAL?: number | string | null;
  _company?: string;
  _companyId?: string;
};

type CompanyOption = {
  id: string;
  label: string;
  field: keyof Client | 'idTango' | 'tangoCompanyId';
};

type FilterOption = {
  value: string;
  label: string;
};

const COMPANIES: CompanyOption[] = [
  { id: '4', label: 'Aire', field: 'idAire' },
  { id: '5', label: 'Aire SRL', field: 'idAireSrl' },
  { id: '6', label: 'Aire Digital SAS', field: 'idAireDigital' },
];

const parseAmount = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;

  const rawValue = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!rawValue) return 0;

  const hasComma = rawValue.includes(',');
  const hasDot = rawValue.includes('.');
  let normalized = rawValue;

  if (hasComma && hasDot) {
    normalized = rawValue.lastIndexOf('.') > rawValue.lastIndexOf(',')
      ? rawValue.replace(/,/g, '')
      : rawValue.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const parts = rawValue.split(',');
    const lastPart = parts[parts.length - 1] || '';
    normalized = parts.length > 1 && lastPart.length === 3
      ? rawValue.replace(/,/g, '')
      : rawValue.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value?: unknown) => {
  const numericValue = parseAmount(value);
  if (value == null || value === '') return 'No informado';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
};

const getMonthRange = (month: string) => {
  const safeMonth = month || format(new Date(), 'yyyy-MM');
  const firstDay = new Date(`${safeMonth}-01T00:00:00`);

  return {
    fromDate: format(firstDay, 'yyyy-MM-dd'),
    toDate: format(endOfMonth(firstDay), 'yyyy-MM-dd'),
  };
};

const getClientTangoId = (client: Client, company: CompanyOption) => {
  const value = (client as any)[company.field];
  if (value) return String(value);

  if (company.id === '5') {
    return String((client as any).idTango || (client as any).tangoCompanyId || '');
  }

  return '';
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
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <p className="text-sm font-medium">{label}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Limpiar
            </Button>
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {options.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin opciones disponibles</p>
            ) : options.map(option => (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-muted"
                onClick={() => toggleValue(option.value)}
              >
                <Checkbox checked={selectedSet.has(option.value)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ClientTangoInvoices({ client }: { client: Client }) {
  const [invoices, setInvoices] = useState<TangoInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const typeOptions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    invoices.forEach(invoice => {
      const type = String(invoice.TIPO_COMPROBANTE || '').trim();
      if (type) map.set(type, { value: type, label: type });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const typeSet = new Set(selectedTypes);
    return invoices.filter(invoice => (
      typeSet.size === 0 || typeSet.has(String(invoice.TIPO_COMPROBANTE || '').trim())
    ));
  }, [invoices, selectedTypes]);

  const filteredTotal = useMemo(
    () => filteredInvoices.reduce((sum, invoice) => sum + parseAmount(invoice.TOTAL), 0),
    [filteredInvoices],
  );

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Sesion no valida');

      const { fromDate, toDate } = getMonthRange(selectedMonth);
      const companiesToFetch = selectedCompany === 'all'
        ? COMPANIES
        : COMPANIES.filter(company => company.id === selectedCompany);

      const requestOptions = {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store' as RequestCache,
      };

      const companyInvoices = await Promise.all(companiesToFetch.map(async company => {
        const tangoClientId = getClientTangoId(client, company);
        if (!tangoClientId) return [] as TangoInvoice[];

        const params = new URLSearchParams({
          company: company.id,
          client: tangoClientId,
          fromDate,
          toDate,
        });

        try {
          const response = await fetch(`/api/tango/invoices?${params.toString()}`, requestOptions);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.details || payload?.error || `Tango respondio ${response.status}`);
          }

          return (Array.isArray(payload.list) ? payload.list : []).map((invoice: TangoInvoice) => ({
            ...invoice,
            _company: company.label,
            _companyId: company.id,
          }));
        } catch (companyError) {
          console.error(`Error cargando facturas para ${company.label}:`, companyError);
          return [] as TangoInvoice[];
        }
      }));

      const allInvoices = companyInvoices.flat().sort((a, b) => {
        const dateA = a.FECHA_DE_EMISION ? new Date(a.FECHA_DE_EMISION).getTime() : 0;
        const dateB = b.FECHA_DE_EMISION ? new Date(b.FECHA_DE_EMISION).getTime() : 0;
        return dateB - dateA;
      });

      setInvoices(allInvoices);
      setSelectedTypes(current => current.filter(type => allInvoices.some(invoice => invoice.TIPO_COMPROBANTE === type)));
    } catch (err: any) {
      setInvoices([]);
      setError(err.message || 'Error al buscar facturas de Tango');
    } finally {
      setLoading(false);
    }
  }, [client, selectedCompany, selectedMonth]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return (
    <div className="space-y-4">
      <div className="rounded-r-md border-l-4 border-emerald-600 bg-emerald-50 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-emerald-900">Historial de Facturacion Oficial</h3>
        <p className="text-xs text-emerald-800">
          Comprobantes emitidos en Tango para los IDs vinculados de este cliente.
        </p>
      </div>

      <div className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-2 lg:grid-cols-[180px_180px_1fr_auto] lg:items-end">
        <div className="space-y-2">
          <Label>Mes / Año</Label>
          <Input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Company</Label>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {COMPANIES.map(company => (
                <SelectItem key={company.id} value={company.id}>{company.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <MultiSelectFilter
          label="Tipo de comprobante"
          options={typeOptions}
          selectedValues={selectedTypes}
          onChange={setSelectedTypes}
        />
        <Button onClick={fetchInvoices} disabled={loading}>
          {loading ? <Spinner size="small" className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
          Aplicar
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <Receipt className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasSearched && (
        <div className="rounded-md border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{filteredInvoices.length}</span> comprobantes visibles de {invoices.length} encontrados.
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">Total visible</p>
              <p className="text-2xl font-bold">{formatCurrency(filteredTotal)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
        <Table className="min-w-[900px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Vendedor Tango</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Spinner size="large" />
                </TableCell>
              </TableRow>
            ) : filteredInvoices.length > 0 ? filteredInvoices.map((invoice, index) => (
              <TableRow key={`${invoice._companyId}-${invoice.NRO_COMPROBANTE || index}`}>
                <TableCell>{invoice.FECHA_DE_EMISION ? format(new Date(invoice.FECHA_DE_EMISION), 'dd/MM/yyyy') : '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{invoice._company}</Badge>
                </TableCell>
                <TableCell>{invoice.TIPO_COMPROBANTE || '-'}</TableCell>
                <TableCell className="font-medium">{invoice.NRO_COMPROBANTE || '-'}</TableCell>
                <TableCell>
                  <div className="text-sm">{invoice.NOMBRE_VENDEDOR || 'S/D'}</div>
                  <div className="text-[10px] text-slate-500">Codigo: {invoice.COD_VENDEDOR || 'S/D'}</div>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-700">
                  {formatCurrency(invoice.TOTAL)}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  No se encontraron comprobantes de Tango con esos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
