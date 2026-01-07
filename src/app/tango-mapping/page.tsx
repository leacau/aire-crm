'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { FileUploader } from '@/components/import/file-uploader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { findBestMatch } from 'string-similarity';
import { hasManagementPrivileges } from '@/lib/role-utils';
import type { Client, Opportunity, Invoice } from '@/lib/types';
import {
  createInvoice,
  createOpportunity,
  getClients,
  getOpportunitiesByClientId,
  getInvoicesForClient,
  updateClientTangoMapping,
} from '@/lib/firebase-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getNormalizedInvoiceNumber } from '@/lib/invoice-utils';

type MappingStep = 'upload' | 'map' | 'review';
type BillingEntity = 'aire-srl' | 'aire-digital';

type ColumnSelection = {
  razonSocial?: string;
  idTango?: string;
  cuit?: string;
  denominacion?: string;
  email?: string;
  phone?: string;
  rubro?: string;
  condicionIVA?: string;
  provincia?: string;
  localidad?: string;
  tipoEntidad?: string;
  observaciones?: string;
};

type TangoRow = {
  index: number;
  razonSocial: string;
  idTango: string;
  cuit?: string;
  denominacion?: string;
  email?: string;
  phone?: string;
  rubro?: string;
  condicionIVA?: string;
  provincia?: string;
  localidad?: string;
  tipoEntidad?: string;
  observaciones?: string;
};

type InvoiceColumnSelection = {
  idTango?: string;
  invoiceNumber?: string;
  amount?: string;
  issueDate?: string;
  dueDate?: string;
};

type InvoiceRow = {
  index: number;
  idTango: string;
  invoiceNumber: string;
  amount: number;
  issueDate?: string | null;
  dueDate?: string | null;
  clientId?: string;
};

const REQUIRED_FIELDS: (keyof ColumnSelection)[] = ['razonSocial', 'idTango'];
const UNASSIGNED_CLIENT_VALUE = '__none__';
const NO_CUIT_COLUMN = '__none__';
const NO_OPTIONAL_COLUMN = '__none_optional__';
const MAX_PREVIEW_ROWS = 200;
const MAX_OPTIONS = 50;
const INVOICE_REQUIRED_FIELDS: (keyof InvoiceColumnSelection)[] = ['idTango', 'invoiceNumber', 'amount'];
const BILLING_ENTITY_OPTIONS: { value: BillingEntity; label: string }[] = [
  { value: 'aire-srl', label: 'Aire SRL' },
  { value: 'aire-digital', label: 'Aire Digital SAS' },
];

const extractDigits = (value?: string) => (value?.match(/\d/g) || []).join('');
const normalizeInvoiceForDuplicateCheck = (value: string) => getNormalizedInvoiceNumber({ invoiceNumber: value });

const formatCuit = (value: string) => {
  const digits = extractDigits(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
};

const excelSerialToDate = (serial: number) => {
  const base = Date.UTC(1899, 11, 30);
  const millis = Math.round(serial * 24 * 60 * 60 * 1000);
  return new Date(base + millis);
};

const parseDateValue = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dt = excelSerialToDate(value);
    return dt.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const year = y.length === 2 ? `20${y}` : y.padStart(4, '0');
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return iso;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
};

// Helper for chunk processing
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const normalizeText = (value: string) => value?.toString().trim().toLowerCase() || '';

type ClientSuggestion = {
  rowKey?: string;
  matchedBy?: 'cuit' | 'name';
  matchScore?: number;
};

export default function TangoMappingPage() {
  const router = useRouter();
  const { userInfo, loading } = useAuth();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [step, setStep] = useState<MappingStep>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [columnSelection, setColumnSelection] = useState<ColumnSelection>({});
  const [rows, setRows] = useState<TangoRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [clientSelections, setClientSelections] = useState<Record<string, string | undefined>>({});
  const [suggestions, setSuggestions] = useState<Record<string, ClientSuggestion>>({});
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const rowOptionsCache = React.useRef<Record<string, { rowsVersion: number; options: TangoRow[] }>>({});
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [billingEntity, setBillingEntity] = useState<BillingEntity | undefined>();
  const [activeTab, setActiveTab] = useState<'clients' | 'invoices'>('clients');

  const [invoiceHeaders, setInvoiceHeaders] = useState<string[]>([]);
  const [invoiceRawData, setInvoiceRawData] = useState<any[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [invoiceColumnSelection, setInvoiceColumnSelection] = useState<InvoiceColumnSelection>({});
  const [invoiceSelections, setInvoiceSelections] = useState<Record<number, { opportunityId?: string }>>({});
  const [opportunitiesByClient, setOpportunitiesByClient] = useState<Record<string, Opportunity[]>>({});
  const [loadingOpportunities, setLoadingOpportunities] = useState<Record<string, boolean>>({});
  const [invoicesByClient, setInvoicesByClient] = useState<Record<string, Invoice[]>>({});
  const [loadingInvoices, setLoadingInvoices] = useState<Record<string, boolean>>({});

  const canAccess = userInfo && hasManagementPrivileges(userInfo);

  const billingEntityLabel = useMemo(() => {
    if (billingEntity === 'aire-srl') return 'ID Aire SRL';
    if (billingEntity === 'aire-digital') return 'ID Aire Digital';
    return 'ID Tango';
  }, [billingEntity]);

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/');
    }
  }, [loading, canAccess, router]);

  useEffect(() => {
    if (canAccess) {
      getClients()
        .then((list) =>
          setClients(
            list.map((c) => ({
              id: c.id,
              denominacion: c.denominacion,
              razonSocial: c.razonSocial,
              cuit: c.cuit,
              ownerName: c.ownerName,
              tangoCompanyId: c.tangoCompanyId,
              idTango: c.idTango,
              idAireSrl: c.idAireSrl,
              idAireDigital: c.idAireDigital,
              phone: c.phone,
              email: c.email,
              rubro: c.rubro,
            }))
          )
        )
        .catch(() => {
          toast({
            title: 'Error',
            description: 'No se pudieron cargar los clientes existentes.',
            variant: 'destructive',
          });
        });
    }
  }, [canAccess, toast]);

  const existingCuitMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => {
      if (c.cuit) {
        map.set(normalizeText(c.cuit), c);
      }
    });
    return map;
  }, [clients]);

  const clientNameList = useMemo(() => {
    return clients.map((c) => ({
      id: c.id,
      name: c.denominacion || c.razonSocial,
    }));
  }, [clients]);

  const rowMap = useMemo(() => {
    const map = new Map<string, TangoRow>();
    rows.forEach((row) => map.set(`${row.index}-${row.idTango}`, row));
    return map;
  }, [rows]);

  const filteredClients = useMemo(() => {
    if (!filter.trim()) return clients;
    const query = normalizeText(filter);
    return clients.filter(
      (client) =>
        normalizeText(client.denominacion || client.razonSocial).includes(query) ||
        normalizeText(client.cuit || '').includes(query) ||
        normalizeText(client.tangoCompanyId || client.idTango || '').includes(query) ||
        normalizeText(client.idAireSrl || '').includes(query) ||
        normalizeText(client.idAireDigital || '').includes(query) ||
        normalizeText(client.email || '').includes(query) ||
        normalizeText(client.phone || '').includes(query) ||
        normalizeText(client.rubro || '').includes(query)
    );
  }, [clients, filter]);

  const getRowOptions = (client: Client, allRows: TangoRow[]) => {
    const MAX_OPTIONS = 50;
    if (allRows.length <= MAX_OPTIONS) return allRows;

    const normalizedClientName = normalizeText(client.denominacion || client.razonSocial);
    const options: TangoRow[] = [];

    if (client.cuit) {
      const normalizedCuit = extractDigits(client.cuit);
      options.push(...allRows.filter((r) => r.cuit && extractDigits(r.cuit) === normalizedCuit));
    }

    if (options.length < MAX_OPTIONS) {
      options.push(
        ...allRows.filter(
          (r) =>
            normalizeText(r.razonSocial).includes(normalizedClientName) &&
            !options.some((opt) => opt.index === r.index && opt.idTango === r.idTango)
        )
      );
    }

    if (options.length < MAX_OPTIONS) {
      options.push(...allRows.slice(0, MAX_OPTIONS - options.length));
    }

    return options;
  };

  const guessHeader = (target: keyof ColumnSelection, availableHeaders: string[]) => {
    const patterns: Record<keyof ColumnSelection, RegExp[]> = {
      razonSocial: [/razon/i, /razón/i, /empresa/i, /nombre/i],
      idTango: [/id/i, /codigo/i, /código/i],
      cuit: [/cuit/i],
      denominacion: [/denominacion/i, /denominación/i, /nombre/i],
      email: [/mail/i, /correo/i, /email/i],
      phone: [/telefono/i, /teléfono/i, /celular/i, /phone/i],
      rubro: [/rubro/i, /categoria/i, /categoría/i],
      condicionIVA: [/iva/i, /condicion/i, /condición/i],
      provincia: [/provincia/i],
      localidad: [/localidad/i, /ciudad/i],
      tipoEntidad: [/tipo/i, /entidad/i],
      observaciones: [/observ/i, /nota/i, /coment/i],
    };
    const regexes = patterns[target];
    return availableHeaders.find((h) => regexes.some((r) => r.test(h)));
  };

  const guessInvoiceHeader = (target: keyof InvoiceColumnSelection, availableHeaders: string[]) => {
    const patterns: Record<keyof InvoiceColumnSelection, RegExp[]> = {
      idTango: [/id/i, /tango/i, /aire/i],
      invoiceNumber: [/nro/i, /numero/i, /factura/i, /número/i],
      amount: [/monto/i, /importe/i, /total/i],
      issueDate: [/fecha/i, /emision/i, /emisión/i],
      dueDate: [/vencimiento/i, /vence/i],
    };
    const regexes = patterns[target];
    return availableHeaders.find((h) => regexes.some((r) => r.test(h)));
  };

  const handleServerFile = async (file: File) => {
    setLastFile(file);
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/tango-mapping/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'No se pudo procesar el archivo');
    }
    const result = await response.json();
    setRawData(result.rows || []);
    setHeaders(result.headers || []);
    setRowsTruncated(Boolean(result.truncated));
    setStep('map');
    setColumnSelection({
      razonSocial: guessHeader('razonSocial', result.headers || []),
      idTango: guessHeader('idTango', result.headers || []),
      cuit: guessHeader('cuit', result.headers || []) || undefined,
      denominacion: guessHeader('denominacion', result.headers || []),
      email: guessHeader('email', result.headers || []),
      phone: guessHeader('phone', result.headers || []),
      rubro: guessHeader('rubro', result.headers || []),
      condicionIVA: guessHeader('condicionIVA', result.headers || []),
      provincia: guessHeader('provincia', result.headers || []),
      localidad: guessHeader('localidad', result.headers || []),
      tipoEntidad: guessHeader('tipoEntidad', result.headers || []),
      observaciones: guessHeader('observaciones', result.headers || []),
    });
  };

  const handleDataExtracted = (data: any[], extractedHeaders: string[]) => {
    const limited = data.slice(0, MAX_PREVIEW_ROWS);
    setRawData(limited);
    setHeaders(extractedHeaders);
    setRowsTruncated(data.length > limited.length);
    setStep('map');
    setColumnSelection({
      razonSocial: guessHeader('razonSocial', extractedHeaders),
      idTango: guessHeader('idTango', extractedHeaders),
      cuit: guessHeader('cuit', extractedHeaders) || undefined,
      denominacion: guessHeader('denominacion', extractedHeaders),
      email: guessHeader('email', extractedHeaders),
      phone: guessHeader('phone', extractedHeaders),
      rubro: guessHeader('rubro', extractedHeaders),
      condicionIVA: guessHeader('condicionIVA', extractedHeaders),
      provincia: guessHeader('provincia', extractedHeaders),
      localidad: guessHeader('localidad', extractedHeaders),
      tipoEntidad: guessHeader('tipoEntidad', extractedHeaders),
      observaciones: guessHeader('observaciones', extractedHeaders),
    });
  };

  const handleSearchInFile = async () => {
    if (!lastFile || !searchTerm.trim()) return;
    const formData = new FormData();
    formData.append('file', lastFile);
    formData.append('q', searchTerm.trim());
    const response = await fetch('/api/tango-mapping/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      toast({
        title: 'Error en la búsqueda',
        description: 'No se pudo buscar en el archivo.',
        variant: 'destructive',
      });
      return;
    }
    const result = await response.json();
    setRawData(result.rows || []);
    setHeaders(result.headers || headers);
    setRowsTruncated(Boolean(result.truncated));
    setSuggestions({});
    setClientSelections({});
    rowOptionsCache.current = {};
    setStep('map');
    setColumnSelection({
      razonSocial: guessHeader('razonSocial', result.headers || headers || []),
      idTango: guessHeader('idTango', result.headers || headers || []),
      cuit: guessHeader('cuit', result.headers || headers || []) || undefined,
      denominacion: guessHeader('denominacion', result.headers || headers || []),
      email: guessHeader('email', result.headers || headers || []),
      phone: guessHeader('phone', result.headers || headers || []),
      rubro: guessHeader('rubro', result.headers || headers || []),
      condicionIVA: guessHeader('condicionIVA', result.headers || headers || []),
      provincia: guessHeader('provincia', result.headers || headers || []),
      localidad: guessHeader('localidad', result.headers || headers || []),
      tipoEntidad: guessHeader('tipoEntidad', result.headers || headers || []),
      observaciones: guessHeader('observaciones', result.headers || headers || []),
    });
  };

  const handleInvoiceDataExtracted = (data: any[], extractedHeaders: string[]) => {
    setInvoiceRawData(data);
    setInvoiceHeaders(extractedHeaders);
    setInvoiceRows([]);
    setInvoiceSelections({});
    setInvoiceColumnSelection({
      idTango: guessInvoiceHeader('idTango', extractedHeaders),
      invoiceNumber: guessInvoiceHeader('invoiceNumber', extractedHeaders),
      amount: guessInvoiceHeader('amount', extractedHeaders),
      issueDate: guessInvoiceHeader('issueDate', extractedHeaders),
      dueDate: guessInvoiceHeader('dueDate', extractedHeaders),
    });
  };

  const applyColumnSelection = () => {
    if (!billingEntity) {
      toast({
        title: 'Selecciona la empresa facturadora',
        description: 'Indica si el archivo corresponde a Aire SRL o Aire Digital SAS.',
        variant: 'destructive',
      });
      return;
    }

    const missing = REQUIRED_FIELDS.filter((field) => !columnSelection[field]);
    if (missing.length > 0) {
      toast({
        title: 'Campos requeridos',
        description: 'Selecciona las columnas de Razón Social y ID de Tango.',
        variant: 'destructive',
      });
      return;
    }

    const mappedRows: TangoRow[] = rawData
      .map((row, index) => {
        const razonSocial = row[columnSelection.razonSocial as string];
        const idTango = row[columnSelection.idTango as string];
        if (!razonSocial || !idTango) return null;
        const cuit =
          columnSelection.cuit && columnSelection.cuit !== NO_CUIT_COLUMN ? row[columnSelection.cuit] : undefined;
        const denominacion = columnSelection.denominacion ? row[columnSelection.denominacion] : undefined;
        const email = columnSelection.email ? row[columnSelection.email] : undefined;
        const phone = columnSelection.phone ? row[columnSelection.phone] : undefined;
        const rubro = columnSelection.rubro ? row[columnSelection.rubro] : undefined;
        const condicionIVA = columnSelection.condicionIVA ? row[columnSelection.condicionIVA] : undefined;
        const provincia = columnSelection.provincia ? row[columnSelection.provincia] : undefined;
        const localidad = columnSelection.localidad ? row[columnSelection.localidad] : undefined;
        const tipoEntidad = columnSelection.tipoEntidad ? row[columnSelection.tipoEntidad] : undefined;
        const observaciones = columnSelection.observaciones ? row[columnSelection.observaciones] : undefined;
        const rowIndex = typeof row.__row === 'number' ? row.__row : index;
        return {
          index: rowIndex,
          razonSocial: String(razonSocial),
          idTango: String(idTango),
          cuit: cuit ? String(cuit) : undefined,
          denominacion: denominacion ? String(denominacion) : undefined,
          email: email ? String(email) : undefined,
          phone: phone ? String(phone) : undefined,
          rubro: rubro ? String(rubro) : undefined,
          condicionIVA: condicionIVA ? String(condicionIVA) : undefined,
          provincia: provincia ? String(provincia) : undefined,
          localidad: localidad ? String(localidad) : undefined,
          tipoEntidad: tipoEntidad ? String(tipoEntidad) : undefined,
          observaciones: observaciones ? String(observaciones) : undefined,
        } as TangoRow;
      })
      .filter(Boolean) as TangoRow[];

    const shouldExcludeByTangoId = (row: TangoRow) => {
      const targetId = normalizeText(row.idTango);
      if (!targetId) return false;
      if (billingEntity === 'aire-srl') {
        return clients.some((c) => normalizeText(c.idAireSrl || '') === targetId);
      }
      if (billingEntity === 'aire-digital') {
        return clients.some((c) => normalizeText(c.idAireDigital || '') === targetId);
      }
      return clients.some((c) => normalizeText(c.idTango || c.tangoCompanyId || '') === targetId);
    };

    const filteredRows = mappedRows.filter((row) => !shouldExcludeByTangoId(row));

    const mappedNames = filteredRows.map((r) => r.denominacion || r.razonSocial);
    const allowFuzzy = mappedNames.length <= 2000; // evitar uso intensivo de memoria con archivos grandes
    const newSuggestions: Record<string, ClientSuggestion> = {};

    clients.forEach((client) => {
      const normalizedCuit = extractDigits(client.cuit);
      let rowKey: string | undefined;
      let matchedBy: ClientSuggestion['matchedBy'];
      let matchScore: number | undefined;

      if (normalizedCuit) {
        const match = filteredRows.find((row) => row.cuit && extractDigits(row.cuit) === normalizedCuit);
        if (match) {
          rowKey = `${match.index}-${match.idTango}`;
          matchedBy = 'cuit';
          matchScore = 1;
        }
      }

      if (!rowKey && allowFuzzy) {
        const { bestMatch } = findBestMatch(client.denominacion || client.razonSocial, mappedNames);
        if (bestMatch.rating === 1) {
          const match = filteredRows.find(
            (r) => (r.denominacion || r.razonSocial) === bestMatch.target
          );
          if (match) {
            rowKey = `${match.index}-${match.idTango}`;
            matchedBy = 'name';
            matchScore = bestMatch.rating;
          }
        }
      }

      newSuggestions[client.id] = { rowKey, matchedBy, matchScore };
    });

    setRows(filteredRows);
    setRawData([]); // liberar memoria del archivo original
    rowOptionsCache.current = {};
    setSuggestions(newSuggestions);
    setClientSelections({});
    setStep('review');
  };

  const loadOpportunitiesForClients = async (clientIds: string[]) => {
    const idsToLoad = clientIds.filter((id) => !opportunitiesByClient[id] && !loadingOpportunities[id]);
    if (idsToLoad.length === 0) return;
    setLoadingOpportunities((prev) =>
      idsToLoad.reduce((acc, id) => ({ ...acc, [id]: true }), { ...prev })
    );
    const results = await Promise.all(
      idsToLoad.map(async (clientId) => {
        try {
          const ops = await getOpportunitiesByClientId(clientId);
          return { clientId, ops };
        } catch {
          return { clientId, ops: [] };
        }
      })
    );
    setOpportunitiesByClient((prev) => {
      const updated = { ...prev };
      results.forEach(({ clientId, ops }) => {
        updated[clientId] = ops;
      });
      return updated;
    });
    setLoadingOpportunities((prev) => {
      const updated = { ...prev };
      idsToLoad.forEach((id) => delete updated[id]);
      return updated;
    });
  };

  const loadInvoicesForClients = async (clientIds: string[]) => {
    const idsToLoad = clientIds.filter((id) => !invoicesByClient[id] && !loadingInvoices[id]);
    if (idsToLoad.length === 0) return;
    setLoadingInvoices((prev) =>
      idsToLoad.reduce((acc, id) => ({ ...acc, [id]: true }), { ...prev })
    );
    const results = await Promise.all(
      idsToLoad.map(async (clientId) => {
        try {
          const invs = await getInvoicesForClient(clientId);
          return { clientId, invs };
        } catch {
          return { clientId, invs: [] };
        }
      })
    );
    setInvoicesByClient((prev) => {
      const updated = { ...prev };
      results.forEach(({ clientId, invs }) => {
        updated[clientId] = invs;
      });
      return updated;
    });
    setLoadingInvoices((prev) => {
      const updated = { ...prev };
      idsToLoad.forEach((id) => delete updated[id]);
      return updated;
    });
  };

  const applyInvoiceColumnSelection = async () => {
    if (!billingEntity) {
      toast({
        title: 'Selecciona la empresa facturadora',
        description: 'Indica si el archivo corresponde a Aire SRL o Aire Digital SAS.',
        variant: 'destructive',
      });
      return;
    }
    const missing = INVOICE_REQUIRED_FIELDS.filter((field) => !invoiceColumnSelection[field]);
    if (missing.length > 0) {
      toast({
        title: 'Campos requeridos',
        description: 'Selecciona las columnas de ID Tango, Número y Monto de factura.',
        variant: 'destructive',
      });
      return;
    }

    const mappedInvoices: InvoiceRow[] = invoiceRawData
      .map((row, index) => {
        const idTango = row[invoiceColumnSelection.idTango as string];
        const invoiceNumber = row[invoiceColumnSelection.invoiceNumber as string];
        const amountRaw = row[invoiceColumnSelection.amount as string];
        if (!idTango || !invoiceNumber || amountRaw === undefined || amountRaw === null) return null;
        const amount = Number(String(amountRaw).replace(',', '.'));
        if (Number.isNaN(amount)) return null;
        const issueDateRaw = invoiceColumnSelection.issueDate ? row[invoiceColumnSelection.issueDate] : undefined;
        const dueDateRaw = invoiceColumnSelection.dueDate ? row[invoiceColumnSelection.dueDate] : undefined;
        const rowIndex = typeof row.__row === 'number' ? row.__row : index;
        const digitsInvoiceNumber = extractDigits(String(invoiceNumber));
        return {
          index: rowIndex,
          idTango: String(idTango),
          invoiceNumber: digitsInvoiceNumber || String(invoiceNumber),
          amount,
          issueDate: parseDateValue(issueDateRaw),
          dueDate: parseDateValue(dueDateRaw),
        } as InvoiceRow;
      })
      .filter(Boolean) as InvoiceRow[];

    const normalize = (v: string) => normalizeText(v);
    const resolveClientForId = (idValue: string) => {
      if (billingEntity === 'aire-srl') {
        return clients.find((c) => c.idAireSrl && normalize(c.idAireSrl) === normalize(idValue));
      }
      if (billingEntity === 'aire-digital') {
        return clients.find((c) => c.idAireDigital && normalize(c.idAireDigital) === normalize(idValue));
      }
      return (
        clients.find((c) => c.idTango && normalize(c.idTango) === normalize(idValue)) ||
        clients.find((c) => c.tangoCompanyId && normalize(c.tangoCompanyId) === normalize(idValue))
      );
    };

    const withClients = mappedInvoices.map((inv) => {
      const client = resolveClientForId(inv.idTango);
      return { ...inv, clientId: client?.id };
    });

    const clientIds = Array.from(new Set(withClients.map((i) => i.clientId).filter(Boolean) as string[]));
    
    // Fetch existing invoices to filter out duplicates with batch processing
    const existingInvoicesMap: Record<string, Invoice[]> = {};
    const chunks = chunkArray(clientIds, 10); // Process 10 clients at a time

    // Provide some feedback if the list is long
    if (chunks.length > 5) {
        toast({ title: 'Procesando...', description: 'Verificando duplicados con la base de datos.' });
    }

    for (const chunk of chunks) {
        await Promise.all(
            chunk.map(async (clientId) => {
                try {
                    const invs = await getInvoicesForClient(clientId);
                    existingInvoicesMap[clientId] = invs;
                } catch (error) {
                    console.error(`Error loading invoices for client ${clientId}`, error);
                    existingInvoicesMap[clientId] = [];
                }
            })
        );
    }

    // Update local cache
    setInvoicesByClient((prev) => ({ ...prev, ...existingInvoicesMap }));

    const filteredRows = withClients.filter((inv) => {
      if (!inv.clientId) return true; // Keep unassigned to warn user
      const existing = existingInvoicesMap[inv.clientId];
      if (!existing) return true;
      const targetNumber = normalizeInvoiceForDuplicateCheck(inv.invoiceNumber);
      if (!targetNumber) return true;
      const isDuplicate = existing.some((e) => normalizeInvoiceForDuplicateCheck(e.invoiceNumber || '') === targetNumber);
      return !isDuplicate;
    });

    const duplicatesCount = withClients.length - filteredRows.length;

    setInvoiceRows(filteredRows);
    loadOpportunitiesForClients(clientIds);
    setInvoiceSelections({});
    
    toast({ 
      title: 'Archivo de facturas listo', 
      description: `${filteredRows.length} facturas detectadas. ${duplicatesCount} duplicadas se han ocultado.` 
    });
  };

  const getOpportunityOptions = (clientId?: string) => {
    if (!clientId) return [];
    return opportunitiesByClient[clientId] || [];
  };

  const isDuplicateInvoice = (inv: InvoiceRow) => {
    if (!inv.clientId) return false;
    const existing = invoicesByClient[inv.clientId] || [];
    const targetNumber = normalizeInvoiceForDuplicateCheck(inv.invoiceNumber);
    if (!targetNumber) return false;
    return existing.some((e) => normalizeInvoiceForDuplicateCheck(e.invoiceNumber || '') === targetNumber);
  };

  const removeInvoiceRow = (rowIndex: number) => {
    setInvoiceRows((prev) => prev.filter((r) => r.index !== rowIndex));
    setInvoiceSelections((prev) => {
      const updated = { ...prev };
      delete updated[rowIndex];
      return updated;
    });
  };

  const updateInvoiceSelection = (rowIndex: number, opportunityId?: string) => {
    setInvoiceSelections((prev) => ({ ...prev, [rowIndex]: { opportunityId } }));
  };

  const handleApplyInvoices = async () => {
    if (!userInfo) return;
    
    setIsSaving(true);

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const genericByClient: Record<string, string> = {};

    for (const invoice of invoiceRows) {
      try {
        if (!invoice.clientId) {
          failed++;
          continue;
        }
        const existingOps = getOpportunityOptions(invoice.clientId);
        const existingGeneric = existingOps.find((op) => op.title === 'Genérica para carga de facturas');
        if (existingGeneric) {
          genericByClient[invoice.clientId] = existingGeneric.id;
        }
        const duplicate = isDuplicateInvoice(invoice);
        if (duplicate) {
          duplicates++;
          continue;
        }
        const selected = invoiceSelections[invoice.index]?.opportunityId;
        let opportunityId = selected;
        if (!opportunityId) {
          const opts = getOpportunityOptions(invoice.clientId);
          opportunityId = opts[0]?.id;
        }
        if (!opportunityId && genericByClient[invoice.clientId]) {
          opportunityId = genericByClient[invoice.clientId];
        }
        if (opportunityId === '__create__' || (!opportunityId && existingOps.length === 0)) {
          const client = clients.find((c) => c.id === invoice.clientId);
          if (!client) {
            failed++;
            continue;
          }
          const genericTitle = 'Genérica para carga de facturas';
          const newOppId = await createOpportunity(
            {
              title: existingOps.length === 0 ? genericTitle : `Factura ${invoice.invoiceNumber}`,
              clientId: client.id,
              clientName: client.denominacion || client.razonSocial,
              value: invoice.amount,
              stage: 'Nuevo',
              closeDate: invoice.issueDate || new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
            },
            userInfo.id,
            userInfo.name,
            client.ownerName
          );
          opportunityId = newOppId;
          if (existingOps.length === 0) {
            genericByClient[client.id] = newOppId;
          }
          setOpportunitiesByClient((prev) => ({
            ...prev,
            [client.id]: [
              ...(prev[client.id] || []),
              {
                id: newOppId,
                title: existingOps.length === 0 ? genericTitle : `Factura ${invoice.invoiceNumber}`,
                clientId: client.id,
                clientName: client.denominacion || client.razonSocial,
                value: invoice.amount,
                stage: 'Nuevo',
                closeDate: invoice.issueDate || new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString(),
              } as Opportunity,
            ],
          }));
        }

        if (!opportunityId) {
          failed++;
          continue;
        }

        await createInvoice(
          {
            opportunityId,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            date: invoice.issueDate || new Date().toISOString().split('T')[0],
            dueDate: invoice.dueDate || null,
            status: 'Generada',
            dateGenerated: new Date().toISOString(),
          },
          userInfo.id,
          userInfo.name,
          clients.find((c) => c.id === invoice.clientId)?.ownerName || userInfo.name
        );
        setInvoicesByClient((prev) => ({
          ...prev,
          [invoice.clientId]: [
            ...(prev[invoice.clientId] || []),
            {
              id: `${invoice.clientId}-${invoice.invoiceNumber}-${Date.now()}`,
              opportunityId,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount,
              date: invoice.issueDate,
              dueDate: invoice.dueDate,
              status: 'Generada',
              dateGenerated: new Date().toISOString(),
              isCreditNote: false,
              creditNoteMarkedAt: null,
            },
          ],
        }));
        success++;
      } catch (error) {
        console.error('Error importing invoice', error);
        failed++;
      }
    }

    setIsSaving(false);

    toast({
      title: 'Importación de facturas',
      description: `${success} facturas cargadas${duplicates ? `, ${duplicates} duplicadas` : ''}${failed ? `, ${failed} con errores` : ''}.`,
      variant: failed || duplicates ? 'destructive' : 'default',
    });
  };


  const updateRowClient = (clientId: string, rowKey?: string) => {
    setClientSelections((prev) => ({ ...prev, [clientId]: rowKey ?? UNASSIGNED_CLIENT_VALUE }));
  };

  const getSelectionForClient = (clientId: string, defaultRowKey?: string) => {
    const storedSelection = clientSelections[clientId];
    const hasStored = Object.prototype.hasOwnProperty.call(clientSelections, clientId);
    return hasStored ? storedSelection : defaultRowKey ?? UNASSIGNED_CLIENT_VALUE;
  };

  const getCoincidenceScore = (clientId: string, selectedKey: string | undefined) => {
    if (!selectedKey || selectedKey === UNASSIGNED_CLIENT_VALUE) return -1;
    const suggestion = suggestions[clientId];
    if (suggestion?.matchedBy === 'cuit') return 3;
    if (suggestion?.matchedBy === 'name' && suggestion.matchScore) return 1 + suggestion.matchScore;
    return 0;
  };

  const sortedClients = useMemo(() => {
    return filteredClients
      .map((client) => {
        const suggestion = suggestions[client.id];
        const selectedRowKey = getSelectionForClient(client.id, suggestion?.rowKey);
        const score = getCoincidenceScore(client.id, selectedRowKey);
        return { client, selectedRowKey, score };
      })
      .sort((a, b) => {
        if (sortDirection === 'desc') {
          if (b.score !== a.score) return b.score - a.score;
        } else {
          if (a.score !== b.score) return a.score - b.score;
        }
        return (a.client.denominacion || a.client.razonSocial).localeCompare(
          b.client.denominacion || b.client.razonSocial
        );
      });
  }, [filteredClients, suggestions, clientSelections, sortDirection]);

  const handleApplyMapping = async () => {
    if (!userInfo || !billingEntity) return;
    const rowMap = new Map<string, TangoRow>();
    rows.forEach((row) => rowMap.set(`${row.index}-${row.idTango}`, row));

    const pendingUpdates = clients
      .map((client) => {
        const selection = clientSelections[client.id] ?? suggestions[client.id]?.rowKey;
        const manualId = (manualIdOverrides[client.id] || '').trim();
        if (!selection && !manualId) return null;
        const row = selection ? rowMap.get(selection) : undefined;

        const data: {
          cuit?: string;
          tangoCompanyId?: string;
          idTango?: string;
          email?: string;
          phone?: string;
          rubro?: string;
          razonSocial?: string;
          denominacion?: string;
          idAireSrl?: string;
          idAireDigital?: string;
          condicionIVA?: string;
          provincia?: string;
          localidad?: string;
          tipoEntidad?: string;
          observaciones?: string;
        } = {};
        const idToUse = manualId || row?.idTango;
        if (row?.cuit) {
          data.cuit = formatCuit(row.cuit || '');
        }
        if (billingEntity === 'aire-srl' && idToUse) {
          data.idAireSrl = idToUse;
        }
        if (billingEntity === 'aire-digital' && idToUse) {
          data.idAireDigital = idToUse;
        }
        if (idToUse) {
          data.tangoCompanyId = idToUse;
          data.idTango = idToUse;
        }
        if (row?.provincia) {
          data.provincia = row.provincia;
        }
        if (row?.localidad) {
          data.localidad = row.localidad;
        }
        if (row?.razonSocial) {
          data.razonSocial = row.razonSocial;
        }
        if (row?.email && !client.email) {
          data.email = row.email;
        }
        if (row?.phone && !client.phone) {
          data.phone = row.phone;
        }
        if (row?.rubro && !client.rubro) {
          data.rubro = row.rubro;
        }
        if (row?.denominacion && !client.denominacion) {
          data.denominacion = row.denominacion;
        }
        if (row?.razonSocial && !client.razonSocial) {
          data.razonSocial = row.razonSocial;
        }
        if (row?.condicionIVA && !client.condicionIVA) {
          data.condicionIVA = row.condicionIVA as any;
        }
        if (row?.tipoEntidad && !client.tipoEntidad) {
          data.tipoEntidad = row.tipoEntidad as any;
        }
        if (row?.observaciones && !client.observaciones) {
          data.observaciones = row.observaciones;
        }

        if (Object.keys(data).length === 0) return null;

        return { client, data };
      })
      .filter(Boolean) as {
        client: Client;
        data: {
          cuit?: string;
          tangoCompanyId?: string;
          idTango?: string;
          email?: string;
          phone?: string;
          rubro?: string;
          razonSocial?: string;
          denominacion?: string;
          idAireSrl?: string;
          idAireDigital?: string;
          condicionIVA?: string;
          provincia?: string;
          localidad?: string;
          tipoEntidad?: string;
          observaciones?: string;
        };
      }[];

    if (pendingUpdates.length === 0) {
      toast({
        title: 'Sin cambios',
        description: 'No hay datos faltantes para actualizar con el archivo cargado.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    let success = 0;
    let failed = 0;

    for (const item of pendingUpdates) {
      try {
        await updateClientTangoMapping(
          item.client.id,
          item.data,
          userInfo.id,
          userInfo.name
        );
        success++;
      } catch (error: any) {
        failed++;
        console.error('Error updating client', error);
      }
    }

    setIsSaving(false);
    toast({
      title: 'Mapeo completado',
      description: `${success} clientes actualizados${failed ? `, ${failed} con errores` : ''}. Solo se completaron campos faltantes.`,
      variant: failed ? 'destructive' : 'default',
    });
  };

  if (loading || !canAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Mapeo con Tango" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'clients' | 'invoices')}>
          <TabsList>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="invoices">Facturas</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="space-y-6">
            {step === 'upload' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Empresa facturadora</CardTitle>
                    <CardDescription>Elegí si el ID Tango corresponde a Aire SRL o Aire Digital SAS.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={billingEntity} onValueChange={(value: BillingEntity) => setBillingEntity(value)}>
                      <SelectTrigger className="w-full md:w-80">
                        <SelectValue placeholder="Seleccionar empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {BILLING_ENTITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Importar archivo de Tango</CardTitle>
                    <CardDescription>
                      Sube un Excel o CSV con Razón Social, ID de Tango y CUIT. Sólo jefes, gerentes y administradores
                      pueden acceder a este mapeo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FileUploader onDataExtracted={handleDataExtracted} onServerProcess={handleServerFile} />
                  </CardContent>
                </Card>
              </div>
            )}

            {step === 'map' && (
              <Card>
                <CardHeader>
                  <CardTitle>Selecciona las columnas</CardTitle>
                  <CardDescription>Indica qué columnas corresponden a los datos de Tango.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Razón Social *</p>
                      <Select
                        value={columnSelection.razonSocial ?? undefined}
                        onValueChange={(value) => setColumnSelection((prev) => ({ ...prev, razonSocial: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">ID de Tango *</p>
                      <Select
                        value={columnSelection.idTango ?? undefined}
                        onValueChange={(value) => setColumnSelection((prev) => ({ ...prev, idTango: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">CUIT (opcional)</p>
                      <Select
                        value={columnSelection.cuit || NO_CUIT_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            cuit: value === NO_CUIT_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CUIT_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Denominación / Fantasía (opcional)</p>
                      <Select
                        value={columnSelection.denominacion ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            denominacion: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Email (opcional)</p>
                      <Select
                        value={columnSelection.email ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            email: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Teléfono (opcional)</p>
                      <Select
                        value={columnSelection.phone ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            phone: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Rubro (opcional)</p>
                      <Select
                        value={columnSelection.rubro ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            rubro: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Condición IVA (opcional)</p>
                      <Select
                        value={columnSelection.condicionIVA ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            condicionIVA: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Provincia (opcional)</p>
                      <Select
                        value={columnSelection.provincia ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            provincia: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Localidad (opcional)</p>
                      <Select
                        value={columnSelection.localidad ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            localidad: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Tipo de Entidad (opcional)</p>
                      <Select
                        value={columnSelection.tipoEntidad ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            tipoEntidad: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Observaciones (opcional)</p>
                      <Select
                        value={columnSelection.observaciones ?? NO_OPTIONAL_COLUMN}
                        onValueChange={(value) =>
                          setColumnSelection((prev) => ({
                            ...prev,
                            observaciones: value === NO_OPTIONAL_COLUMN ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar columna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setStep('upload')}>
                      Volver
                    </Button>
                    <Button onClick={applyColumnSelection}>Continuar</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'review' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Previsualización y mapeo</CardTitle>
                    <CardDescription>
                      Ajusta la fila del archivo de Tango para cada cliente del CRM. Sólo se completarán datos faltantes
                      (CUIT o ID de Tango) en los clientes seleccionados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary">Empresa: {billingEntityLabel}</Badge>
                      {rowsTruncated && <span>Mostrando primeras {MAX_PREVIEW_ROWS} filas.</span>}
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Input
                        placeholder="Buscar por cliente, CUIT o ID Tango"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="md:w-80"
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="Buscar en el archivo (nombre/ID/CUIT)"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="md:w-72"
                          disabled={!lastFile}
                        />
                        <Button
                          variant="outline"
                          onClick={handleSearchInFile}
                          disabled={!lastFile || !searchTerm.trim()}
                        >
                          Buscar en archivo
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">Clientes: {clients.length}</Badge>
                        <Badge variant="outline">Filas de archivo: {rows.length}</Badge>
                      </div>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente CRM</TableHead>
                            <TableHead>CUIT (CRM)</TableHead>
                            <TableHead>{billingEntityLabel} (CRM)</TableHead>
                            <TableHead>Fila de archivo</TableHead>
                            <TableHead>Datos del archivo</TableHead>
                            <TableHead className="w-[180px]">
                              <button
                                type="button"
                                className="flex items-center gap-1 text-sm font-medium"
                                onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                              >
                                Coincidencia
                                <span className="text-xs text-muted-foreground">
                                  {sortDirection === 'desc' ? '▼' : '▲'}
                                </span>
                              </button>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedClients.map(({ client, selectedRowKey }) => {
                            const suggestion = suggestions[client.id];
                            const row = rowMap.get(selectedRowKey);
                            const rowOptions = getRowOptions(client, rows);
                            const clientBillingId =
                              billingEntity === 'aire-srl'
                                ? client.idAireSrl
                                : billingEntity === 'aire-digital'
                                ? client.idAireDigital
                                : client.idTango || client.tangoCompanyId;
                            return (
                              <TableRow key={client.id}>
                                <TableCell className="max-w-[240px] break-words">
                                  <div className="font-medium">{client.denominacion || client.razonSocial}</div>
                                  <p className="text-xs text-muted-foreground">{client.ownerName}</p>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{client.cuit || '—'}</TableCell>
                                <TableCell className="whitespace-nowrap">{clientBillingId || '—'}</TableCell>
                                <TableCell>
                                  <Select
                                    value={selectedRowKey}
                                    onValueChange={(value) =>
                                      updateRowClient(client.id, value === UNASSIGNED_CLIENT_VALUE ? undefined : value)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccionar fila" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={UNASSIGNED_CLIENT_VALUE}>Sin asignar</SelectItem>
                                      {rowOptions.map((r) => (
                                        <SelectItem key={`${r.index}-${r.idTango}`} value={`${r.index}-${r.idTango}`}>
                                          <span className="font-medium">{r.denominacion || r.razonSocial}</span>
                                          {` — ID ${r.idTango}`}
                                          {r.cuit ? ` — CUIT ${r.cuit}` : ''}
                                          {r.email ? ` — ${r.email}` : ''}
                                          {r.phone ? ` — Tel ${r.phone}` : ''}
                                          {r.rubro ? ` — Rubro ${r.rubro}` : ''}
                                        </SelectItem>
                                      ))}
                                      {rowOptions.length < rows.length && (
                                        <SelectItem value="__truncated" disabled>
                                          {`Mostrando ${rowOptions.length} de ${rows.length} filas, filtra por CUIT o nombre para acotar.`}
                                        </SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {row ? (
                                    <div className="space-y-1">
                                      <div className="text-foreground">{row.denominacion || row.razonSocial}</div>
                                      <div className="flex flex-wrap gap-2 text-xs">
                                        {row.idTango && <Badge variant="outline">ID {row.idTango}</Badge>}
                                        {row.cuit && <Badge variant="outline">CUIT {row.cuit}</Badge>}
                                        {row.email && <Badge variant="outline">{row.email}</Badge>}
                                        {row.phone && <Badge variant="outline">{row.phone}</Badge>}
                                        {row.rubro && <Badge variant="outline">{row.rubro}</Badge>}
                                      </div>
                                    </div>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {selectedRowKey !== UNASSIGNED_CLIENT_VALUE && row ? (
                                    <Badge variant={clientSelections[client.id] ? 'secondary' : 'default'}>
                                      {suggestion?.matchedBy === 'cuit'
                                        ? 'Coincidencia por CUIT'
                                        : suggestion?.matchedBy === 'name'
                                        ? `Nombre ~${Math.round((suggestion.matchScore || 0) * 100)}%`
                                        : 'Asignado manualmente'}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Sin coincidencia</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {filteredClients.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                No hay filas para mostrar.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setStep('map')}>
                        Ajustar columnas
                      </Button>
                      <Button onClick={handleApplyMapping} disabled={isSaving}>
                        {isSaving ? 'Actualizando...' : 'Aplicar mapeo a clientes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Importar facturas</CardTitle>
                <CardDescription>Selecciona el archivo y asigna las facturas a propuestas existentes o nuevas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Empresa facturadora</p>
                  <Select value={billingEntity} onValueChange={(value: BillingEntity) => setBillingEntity(value)}>
                    <SelectTrigger className="w-full md:w-80">
                      <SelectValue placeholder="Seleccionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_ENTITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FileUploader onDataExtracted={handleInvoiceDataExtracted} />
                {invoiceHeaders.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium">Columnas de facturas</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">ID Aire / Tango *</p>
                        <Select
                          value={invoiceColumnSelection.idTango ?? undefined}
                          onValueChange={(value) =>
                            setInvoiceColumnSelection((prev) => ({ ...prev, idTango: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar columna" />
                          </SelectTrigger>
                          <SelectContent>
                            {invoiceHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Número de factura *</p>
                        <Select
                          value={invoiceColumnSelection.invoiceNumber ?? undefined}
                          onValueChange={(value) =>
                            setInvoiceColumnSelection((prev) => ({ ...prev, invoiceNumber: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar columna" />
                          </SelectTrigger>
                          <SelectContent>
                            {invoiceHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Monto *</p>
                        <Select
                          value={invoiceColumnSelection.amount ?? undefined}
                          onValueChange={(value) =>
                            setInvoiceColumnSelection((prev) => ({ ...prev, amount: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar columna" />
                          </SelectTrigger>
                          <SelectContent>
                            {invoiceHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Fecha factura</p>
                        <Select
                          value={invoiceColumnSelection.issueDate ?? NO_OPTIONAL_COLUMN}
                          onValueChange={(value) =>
                            setInvoiceColumnSelection((prev) => ({
                              ...prev,
                              issueDate: value === NO_OPTIONAL_COLUMN ? undefined : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar columna" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                            {invoiceHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Fecha de vencimiento</p>
                        <Select
                          value={invoiceColumnSelection.dueDate ?? NO_OPTIONAL_COLUMN}
                          onValueChange={(value) =>
                            setInvoiceColumnSelection((prev) => ({
                              ...prev,
                              dueDate: value === NO_OPTIONAL_COLUMN ? undefined : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar columna" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_OPTIONAL_COLUMN}>Ninguna</SelectItem>
                            {invoiceHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={applyInvoiceColumnSelection}>Generar vista previa</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {invoiceRows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Asignar facturas a propuestas</CardTitle>
                  <CardDescription>Relaciona cada factura con su cliente y propuesta.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Factura</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Vencimiento</TableHead>
                          <TableHead>Propuesta</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceRows.map((inv) => {
                          const client = clients.find((c) => c.id === inv.clientId);
                          const ops = getOpportunityOptions(inv.clientId);
                          const selection = invoiceSelections[inv.index]?.opportunityId;
                          return (
                            <TableRow key={inv.index}>
                              <TableCell>
                                <div className="font-medium">#{inv.invoiceNumber}</div>
                                <div className="text-xs text-muted-foreground">ID {inv.idTango}</div>
                              </TableCell>
                              <TableCell className="max-w-[220px]">
                                {client ? (
                                  <div className="space-y-1">
                                    <div className="font-medium">{client.denominacion || client.razonSocial}</div>
                                    <div className="text-xs text-muted-foreground">{client.ownerName}</div>
                                  </div>
                                ) : (
                                  <Badge variant="destructive">Cliente no encontrado</Badge>
                                )}
                              </TableCell>
                              <TableCell>${inv.amount.toLocaleString('es-AR')}</TableCell>
                              <TableCell>{inv.issueDate || '—'}</TableCell>
                              <TableCell>{inv.dueDate || '—'}</TableCell>
                              <TableCell>
                                {client ? (
                                  <Select
                                    value={selection ?? (ops[0]?.id || '__create__')}
                                    onValueChange={(value) => updateInvoiceSelection(inv.index, value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccionar propuesta" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ops.map((op) => (
                                        <SelectItem key={op.id} value={op.id}>
                                          {op.title}
                                        </SelectItem>
                                      ))}
                                      <SelectItem value="__create__">Crear nueva propuesta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-sm text-muted-foreground">No disponible</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => removeInvoiceRow(inv.index)}>
                                  Eliminar
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleApplyInvoices} disabled={isSaving}>
                      {isSaving ? 'Importando...' : 'Importar facturas'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
