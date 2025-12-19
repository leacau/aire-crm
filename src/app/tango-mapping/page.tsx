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
  clientId?: string;
  clientName?: string;
  matchScore?: number;
  matchedBy?: 'cuit' | 'name';
};

const REQUIRED_FIELDS: (keyof ColumnSelection)[] = ['razonSocial', 'tangoId'];
const UNASSIGNED_CLIENT_VALUE = '__none__';
const NO_CUIT_COLUMN = '__none__';

const normalizeText = (value: string) => value?.toString().trim().toLowerCase() || '';

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

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows;
    const query = normalizeText(filter);
    return rows.filter(
      (row) =>
        normalizeText(row.razonSocial).includes(query) ||
        normalizeText(row.tangoId).includes(query) ||
        normalizeText(row.cuit || '').includes(query) ||
        normalizeText(row.clientName || '').includes(query)
    );
  }, [rows, filter]);

  const guessHeader = (target: keyof ColumnSelection, availableHeaders: string[]) => {
    const patterns: Record<keyof ColumnSelection, RegExp[]> = {
      razonSocial: [/razon/i, /razón/i, /empresa/i, /nombre/i],
      tangoId: [/id/i, /codigo/i, /código/i],
      cuit: [/cuit/i],
    };
    const regexes = patterns[target];
    return availableHeaders.find((h) => regexes.some((r) => r.test(h)));
  };

  const handleDataExtracted = (data: any[], extractedHeaders: string[]) => {
    setRawData(data);
    setHeaders(extractedHeaders);
    setStep('map');
    setColumnSelection({
      razonSocial: guessHeader('razonSocial', extractedHeaders),
      tangoId: guessHeader('tangoId', extractedHeaders),
      cuit: guessHeader('cuit', extractedHeaders) || undefined,
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

    const clientNameLookup = clientNameList.map((c) => c.name);

    const rowsWithSuggestions = mappedRows.map((row) => {
      const normalizedCuit = row.cuit ? normalizeText(row.cuit) : '';
      let clientId: string | undefined;
      let matchedBy: TangoRow['matchedBy'];
      let matchScore: number | undefined;

      if (normalizedCuit && existingCuitMap.has(normalizedCuit)) {
        const match = existingCuitMap.get(normalizedCuit)!;
        clientId = match.id;
        matchedBy = 'cuit';
        matchScore = 1;
      } else if (clientNameLookup.length > 0) {
        const { bestMatch } = findBestMatch(row.razonSocial, clientNameLookup);
        const match = clientNameList.find((c) => c.name === bestMatch.target);
        clientId = bestMatch.rating > 0.5 ? match?.id : undefined;
        matchedBy = clientId ? 'name' : undefined;
        matchScore = bestMatch.rating;
      }

      const matchedClient = clients.find((c) => c.id === clientId);

      return {
        ...row,
        clientId,
        clientName: matchedClient ? matchedClient.denominacion || matchedClient.razonSocial : undefined,
        matchedBy,
        matchScore,
      };
    });

    setRows(rowsWithSuggestions);
    setStep('review');
  };

  const updateRowClient = (rowIndex: number, clientId?: string) => {
    const selectedClient = clientId ? clients.find((c) => c.id === clientId) : undefined;
    const selectedName = selectedClient ? selectedClient.denominacion || selectedClient.razonSocial : undefined;
    setRows((prev) =>
      prev.map((row) =>
        row.index === rowIndex
          ? {
              ...row,
              clientId,
              clientName: selectedName,
              matchedBy: clientId ? undefined : row.matchedBy,
            }
          : row
      )
    );
  };

  const handleApplyMapping = async () => {
    if (!userInfo) return;
    const rowsToUpdate = rows.filter((row) => row.clientId);
    if (rowsToUpdate.length === 0) {
      toast({
        title: 'Sin asignaciones',
        description: 'Selecciona al menos un cliente para actualizar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    let success = 0;
    let failed = 0;

    for (const row of rowsToUpdate) {
      try {
        await updateClientTangoMapping(
          row.clientId!,
          { cuit: row.cuit, tangoCompanyId: row.tangoId },
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
      description: `${success} clientes actualizados${failed ? `, ${failed} con errores` : ''}.`,
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
                  Ajusta el cliente correspondiente a cada empresa de Tango. Sólo se actualizarán las filas con un
                  cliente seleccionado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <Input
                    placeholder="Buscar por Razón Social, CUIT o cliente"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="md:w-80"
                  />
                  <div className="flex gap-2">
                    <Badge variant="secondary">Filas: {rows.length}</Badge>
                    <Badge variant="outline">Con cliente: {rows.filter((r) => r.clientId).length}</Badge>
                  </div>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Razón Social (Excel)</TableHead>
                        <TableHead>ID Tango</TableHead>
                        <TableHead>CUIT</TableHead>
                        <TableHead>Cliente en CRM</TableHead>
                        <TableHead className="w-[160px]">Coincidencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={`${row.index}-${row.tangoId}`}>
                          <TableCell className="max-w-[240px] break-words">{row.razonSocial}</TableCell>
                          <TableCell>{row.tangoId}</TableCell>
                          <TableCell>{row.cuit || '-'}</TableCell>
                          <TableCell>
                            <Select
                              value={row.clientId || UNASSIGNED_CLIENT_VALUE}
                              onValueChange={(value) =>
                                updateRowClient(row.index, value === UNASSIGNED_CLIENT_VALUE ? undefined : value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar cliente" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED_CLIENT_VALUE}>Sin asignar</SelectItem>
                                {clients.map((client) => (
                                  <SelectItem key={client.id} value={client.id}>
                                    {client.denominacion || client.razonSocial}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {row.clientId ? (
                              <Badge variant={row.matchedBy ? 'default' : 'secondary'}>
                                {row.matchedBy === 'cuit'
                                  ? 'Coincidencia por CUIT'
                                  : row.matchedBy === 'name'
                                  ? `Nombre ~${Math.round((row.matchScore || 0) * 100)}%`
                                  : 'Asignado manualmente'}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Sin coincidencia</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredRows.length === 0 && (
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
