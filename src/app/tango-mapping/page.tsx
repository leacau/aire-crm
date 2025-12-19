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
import type { Client } from '@/lib/types';
import { getClients, updateClientTangoMapping } from '@/lib/firebase-service';

type MappingStep = 'upload' | 'map' | 'review';

type ColumnSelection = {
  razonSocial?: string;
  tangoId?: string;
  cuit?: string;
};

type TangoRow = {
  index: number;
  razonSocial: string;
  tangoId: string;
  cuit?: string;
};

const REQUIRED_FIELDS: (keyof ColumnSelection)[] = ['razonSocial', 'tangoId'];
const UNASSIGNED_CLIENT_VALUE = '__none__';
const NO_CUIT_COLUMN = '__none__';

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

  const canAccess = userInfo && hasManagementPrivileges(userInfo);

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/');
    }
  }, [loading, canAccess, router]);

  useEffect(() => {
    if (canAccess) {
      getClients().then(setClients).catch(() => {
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
    rows.forEach((row) => map.set(`${row.index}-${row.tangoId}`, row));
    return map;
  }, [rows]);

  const filteredClients = useMemo(() => {
    if (!filter.trim()) return clients;
    const query = normalizeText(filter);
    return clients.filter(
      (client) =>
        normalizeText(client.denominacion || client.razonSocial).includes(query) ||
        normalizeText(client.cuit || '').includes(query) ||
        normalizeText(client.tangoCompanyId || '').includes(query)
    );
  }, [clients, filter]);

  const getRowOptions = (client: Client, allRows: TangoRow[]) => {
    const MAX_OPTIONS = 200;
    if (allRows.length <= MAX_OPTIONS) return allRows;

    const normalizedClientName = normalizeText(client.denominacion || client.razonSocial);
    const options: TangoRow[] = [];

    if (client.cuit) {
      const normalizedCuit = normalizeText(client.cuit);
      options.push(...allRows.filter((r) => r.cuit && normalizeText(r.cuit) === normalizedCuit));
    }

    if (options.length < MAX_OPTIONS) {
      options.push(
        ...allRows.filter(
          (r) =>
            normalizeText(r.razonSocial).includes(normalizedClientName) &&
            !options.some((opt) => opt.index === r.index && opt.tangoId === r.tangoId)
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
      tangoId: [/id/i, /codigo/i, /código/i],
      cuit: [/cuit/i],
    };
    const regexes = patterns[target];
    return availableHeaders.find((h) => regexes.some((r) => r.test(h)));
  };

  const handleServerFile = async (file: File) => {
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
      tangoId: guessHeader('tangoId', result.headers || []),
      cuit: guessHeader('cuit', result.headers || []) || undefined,
    });
  };

  const applyColumnSelection = () => {
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
        const tangoId = row[columnSelection.tangoId as string];
        if (!razonSocial || !tangoId) return null;
        const cuit = columnSelection.cuit && columnSelection.cuit !== NO_CUIT_COLUMN ? row[columnSelection.cuit] : undefined;
        return {
          index,
          razonSocial: String(razonSocial),
          tangoId: String(tangoId),
          cuit: cuit ? String(cuit) : undefined,
        } as TangoRow;
      })
      .filter(Boolean) as TangoRow[];

    const mappedNames = mappedRows.map((r) => r.razonSocial);
    const rowKeyMap = new Map<string, TangoRow>();
    mappedRows.forEach((row) => {
      rowKeyMap.set(`${row.index}-${row.tangoId}`, row);
    });
    setRows(mappedRows);
    setRawData([]); // liberar memoria del archivo original
    rowOptionsCache.current = {};

    const newSuggestions: Record<string, ClientSuggestion> = {};

    const allowFuzzy = mappedNames.length <= 2000; // evitar uso intensivo de memoria con archivos grandes

    clients.forEach((client) => {
      const normalizedCuit = client.cuit ? normalizeText(client.cuit) : '';
      let rowKey: string | undefined;
      let matchedBy: ClientSuggestion['matchedBy'];
      let matchScore: number | undefined;

      if (normalizedCuit) {
        const match = mappedRows.find((row) => row.cuit && normalizeText(row.cuit) === normalizedCuit);
        if (match) {
          rowKey = `${match.index}-${match.tangoId}`;
          matchedBy = 'cuit';
          matchScore = 1;
        }
      }

      if (!rowKey && allowFuzzy) {
        const { bestMatch } = findBestMatch(client.denominacion || client.razonSocial, mappedNames);
        if (bestMatch.rating > 0.5) {
          const match = mappedRows.find((r) => r.razonSocial === bestMatch.target);
          if (match) {
            rowKey = `${match.index}-${match.tangoId}`;
            matchedBy = 'name';
            matchScore = bestMatch.rating;
          }
        }
      }

      newSuggestions[client.id] = { rowKey, matchedBy, matchScore };
    });

    setSuggestions(newSuggestions);
    setClientSelections({});
    setStep('review');
  };

  const updateRowClient = (clientId: string, rowKey?: string) => {
    setClientSelections((prev) => ({ ...prev, [clientId]: rowKey }));
  };

  const handleApplyMapping = async () => {
    if (!userInfo) return;
    const rowMap = new Map<string, TangoRow>();
    rows.forEach((row) => rowMap.set(`${row.index}-${row.tangoId}`, row));

    const pendingUpdates = clients
      .map((client) => {
        const selection = clientSelections[client.id] ?? suggestions[client.id]?.rowKey;
        if (!selection) return null;
        const row = rowMap.get(selection);
        if (!row) return null;

        const data: { cuit?: string; tangoCompanyId?: string } = {};
        if (!client.cuit && row.cuit) {
          data.cuit = row.cuit;
        }
        if (!client.tangoCompanyId && row.tangoId) {
          data.tangoCompanyId = row.tangoId;
        }

        if (Object.keys(data).length === 0) return null;

        return { client, data };
      })
      .filter(Boolean) as { client: Client; data: { cuit?: string; tangoCompanyId?: string } }[];

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
        {step === 'upload' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Importar archivo de Tango</CardTitle>
                <CardDescription>
                  Sube un Excel o CSV con Razón Social, ID de Tango y CUIT. Sólo jefes, gerentes y administradores
                  pueden acceder a este mapeo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader onDataExtracted={handleDataExtracted} />
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
                    value={columnSelection.tangoId ?? undefined}
                    onValueChange={(value) => setColumnSelection((prev) => ({ ...prev, tangoId: value }))}
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
              </div>
              <div className="flex justify-end gap-2">
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
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <Input
                    placeholder="Buscar por cliente, CUIT o ID Tango"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="md:w-80"
                  />
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
                        <TableHead>ID Tango (CRM)</TableHead>
                        <TableHead>Fila de archivo</TableHead>
                        <TableHead className="w-[180px]">Coincidencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClients.map((client) => {
                        const suggestion = suggestions[client.id];
                        const selectedRowKey = clientSelections[client.id] ?? suggestion?.rowKey ?? UNASSIGNED_CLIENT_VALUE;
                        const row = rowMap.get(selectedRowKey);
                        const rowOptions = getRowOptions(client, rows);
                        return (
                          <TableRow key={client.id}>
                            <TableCell className="max-w-[240px] break-words">
                              <div className="font-medium">{client.denominacion || client.razonSocial}</div>
                              <p className="text-xs text-muted-foreground">{client.ownerName}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{client.cuit || '—'}</TableCell>
                            <TableCell className="whitespace-nowrap">{client.tangoCompanyId || '—'}</TableCell>
                            <TableCell>
                              <Select
                                value={selectedRowKey}
                                onValueChange={(value) => updateRowClient(client.id, value === UNASSIGNED_CLIENT_VALUE ? undefined : value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar fila" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNASSIGNED_CLIENT_VALUE}>Sin asignar</SelectItem>
                                  {rowOptions.map((r) => (
                                    <SelectItem key={`${r.index}-${r.tangoId}`} value={`${r.index}-${r.tangoId}`}>
                                      {r.razonSocial} — ID {r.tangoId}{r.cuit ? ` — CUIT ${r.cuit}` : ''}
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
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
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
      </main>
    </div>
  );
}
