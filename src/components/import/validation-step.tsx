'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, AlertTriangle, ArrowLeft, Filter, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Client, ClientImportMapping } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

type Issue = {
  type: 'error' | 'warning';
  message: string;
  conflictingClient?: Client;
};

export type ValidationResult = {
  index: number;
  data: any;
  issues: Issue[];
  include: boolean;
};

type ColumnMapping = Record<string, keyof ClientImportMapping | 'ignore'>;

interface ValidationStepProps {
  results: ValidationResult[];
  setResults: React.Dispatch<React.SetStateAction<ValidationResult[]>>;
  headers: string[];
  columnMapping: ColumnMapping;
  onImport: (rowsToImport: ValidationResult[]) => void;
  onBack: () => void;
}

type FilterMode = 'all' | 'errors' | 'warnings' | 'included';

function findHeaderByMappedField(headers: string[], columnMapping: ColumnMapping, field: string) {
  return headers.find((h) => columnMapping[h] === field);
}

/**
 * Resalta DIFERENCIAS (antes estaba al revés).
 */
const ComparisonCard = ({
  title,
  importValue,
  systemValue,
}: {
  title: string;
  importValue?: string;
  systemValue?: string;
}) => {
  if (!importValue && !systemValue) return null;

  const normalizedImport = (importValue || '').toString().trim().toLowerCase();
  const normalizedSystem = (systemValue || '').toString().trim().toLowerCase();
  const isSame = normalizedImport && normalizedSystem && normalizedImport === normalizedSystem;

  return (
    <div className={cn('p-1.5 rounded-md border', isSame ? 'bg-muted/30' : 'bg-amber-100/60 border-amber-200')}>
      <p className="text-xs font-semibold">{title}</p>

      <p className="text-xs text-foreground truncate" title={importValue}>
        <span className="font-medium">Archivo:</span> {importValue || <span className="text-muted-foreground">N/A</span>}
      </p>

      <p className="text-xs text-muted-foreground truncate" title={systemValue}>
        <span className="font-medium">Sistema:</span> {systemValue || <span className="text-muted-foreground">N/A</span>}
      </p>

      {!isSame && (
        <p className="text-[11px] text-amber-900/80 mt-1">
          Diferencia detectada
        </p>
      )}
    </div>
  );
};

export function ValidationStep({
  results,
  setResults,
  headers,
  columnMapping,
  onImport,
  onBack,
}: ValidationStepProps) {
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const mappedHeaders = useMemo(() => headers.filter((h) => columnMapping[h] !== 'ignore'), [headers, columnMapping]);

  const errorCount = useMemo(
    () => results.filter((r) => r.issues.some((i) => i.type === 'error')).length,
    [results]
  );
  const warningCount = useMemo(
    () => results.filter((r) => r.issues.some((i) => i.type === 'warning')).length,
    [results]
  );

  const selectableRows = useMemo(
    () => results.filter((r) => !r.issues.some((i) => i.type === 'error')),
    [results]
  );
  const selectedSelectableRows = useMemo(() => selectableRows.filter((r) => r.include), [selectableRows]);

  const isAllSelected = selectableRows.length > 0 && selectedSelectableRows.length === selectableRows.length;
  const isSomeSelected = selectedSelectableRows.length > 0 && !isAllSelected;

  const rowsToImport = useMemo(() => results.filter((r) => r.include), [results]);

  const filteredResults = useMemo(() => {
    switch (filterMode) {
      case 'errors':
        return results.filter((r) => r.issues.some((i) => i.type === 'error'));
      case 'warnings':
        return results.filter((r) => r.issues.some((i) => i.type === 'warning') && !r.issues.some((i) => i.type === 'error'));
      case 'included':
        return results.filter((r) => r.include);
      default:
        return results;
    }
  }, [filterMode, results]);

  const handleToggleRow = (index: number, event: React.MouseEvent) => {
    const hasError = results[index].issues.some((i) => i.type === 'error');
    if (hasError) return;

    const currentCheckedState = !results[index].include;

    if (event.nativeEvent.shiftKey && lastCheckedIndex !== null) {
      const start = Math.min(lastCheckedIndex, index);
      const end = Math.max(lastCheckedIndex, index);

      setResults((prev) =>
        prev.map((r, i) => {
          const rowHasError = r.issues.some((issue) => issue.type === 'error');
          if (i >= start && i <= end && !rowHasError) return { ...r, include: currentCheckedState };
          return r;
        })
      );
    } else {
      setResults((prev) => prev.map((r, i) => (i === index ? { ...r, include: currentCheckedState } : r)));
    }

    setLastCheckedIndex(index);
  };

  const handleToggleAll = () => {
    const newCheckedState = !isAllSelected;
    setResults((prev) =>
      prev.map((r) => {
        const hasError = r.issues.some((i) => i.type === 'error');
        return hasError ? r : { ...r, include: newCheckedState };
      })
    );
    setLastCheckedIndex(null);
  };

  const includeAllWarnings = () => {
    setResults((prev) =>
      prev.map((r) => {
        const hasError = r.issues.some((i) => i.type === 'error');
        if (hasError) return r;
        const hasWarning = r.issues.some((i) => i.type === 'warning');
        return hasWarning ? { ...r, include: true } : r;
      })
    );
    setLastCheckedIndex(null);
  };

  const excludeAllWarnings = () => {
    setResults((prev) =>
      prev.map((r) => {
        const hasWarning = r.issues.some((i) => i.type === 'warning');
        const hasError = r.issues.some((i) => i.type === 'error');
        if (hasError) return r;
        return hasWarning ? { ...r, include: false } : r;
      })
    );
    setLastCheckedIndex(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 3: Validar y Revisar Datos</CardTitle>
        <CardDescription>
          Revisa los datos antes de importar. Las filas con errores graves están desmarcadas. Usa SHIFT + clic para seleccionar un rango.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg text-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="destructive">{errorCount} Error(es)</Badge>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                {warningCount} Alerta(s)
              </Badge>

              <Badge variant="outline" className="bg-background">
                {rowsToImport.length} / {results.length} seleccionadas
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setFilterMode('all')}>
                <Filter className="h-4 w-4 mr-2" /> Todos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFilterMode('errors')}>
                <AlertCircle className="h-4 w-4 mr-2" /> Errores
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFilterMode('warnings')}>
                <AlertTriangle className="h-4 w-4 mr-2" /> Alertas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFilterMode('included')}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Incluidos
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={includeAllWarnings}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Incluir alertas
            </Button>
            <Button variant="outline" size="sm" onClick={excludeAllWarnings}>
              <XCircle className="h-4 w-4 mr-2" /> Excluir alertas
            </Button>
          </div>
        </div>

        <ScrollArea className="w-full whitespace-nowrap rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 sticky left-0 bg-background z-10">
                  <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                    onCheckedChange={handleToggleAll}
                    aria-label="Seleccionar todo"
                    disabled={selectableRows.length === 0}
                  />
                </TableHead>
                <TableHead className="w-24">Estado</TableHead>
                <TableHead className="min-w-[320px]">Detalle</TableHead>

                {mappedHeaders.map((header) => (
                  <TableHead key={header} className="min-w-[150px]">
                    {columnMapping[header]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredResults.map((result, visibleIndex) => {
                // IMPORTANT: result.index is original index, but toggle needs the actual array index
                // We’ll compute realIndex using the original results array reference.
                const realIndex = results.findIndex((r) => r.index === result.index);

                const hasError = result.issues.some((i) => i.type === 'error');
                const hasWarning = result.issues.some((i) => i.type === 'warning');
                const conflictingClient = result.issues.find((i) => i.conflictingClient)?.conflictingClient;

                // Safe mapping header lookup
                const denomHeader = findHeaderByMappedField(headers, columnMapping, 'denominacion');
                const razonHeader = findHeaderByMappedField(headers, columnMapping, 'razonSocial');
                const cuitHeader = findHeaderByMappedField(headers, columnMapping, 'cuit');

                const denomImport = denomHeader ? result.data?.[denomHeader] : undefined;
                const razonImport = razonHeader ? result.data?.[razonHeader] : undefined;
                const cuitImport = cuitHeader ? result.data?.[cuitHeader] : undefined;

                return (
                  <TableRow
                    key={`${result.index}-${visibleIndex}`}
                    className={cn(hasError && 'bg-destructive/10', hasWarning && !hasError && 'bg-yellow-100/30')}
                  >
                    <TableCell className="sticky left-0 bg-inherit z-10">
                      <div onClick={(e) => handleToggleRow(realIndex, e)} className="p-2.5 -m-2.5 cursor-pointer">
                        <Checkbox
                          checked={result.include}
                          disabled={hasError}
                          aria-label={`Seleccionar fila ${result.index + 1}`}
                          className="pointer-events-none"
                        />
                      </div>
                    </TableCell>

                    <TableCell>
                      {(hasError || hasWarning) && (
                        <Badge
                          variant={hasError ? 'destructive' : 'secondary'}
                          className={cn(!hasError && 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100')}
                        >
                          {hasError ? <AlertCircle className="h-4 w-4 mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                          {hasError ? 'Error' : 'Alerta'}
                        </Badge>
                      )}
                      {!hasError && !hasWarning && <Badge variant="outline">OK</Badge>}
                    </TableCell>

                    <TableCell>
                      {result.issues?.length ? (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            {result.issues.map((issue, idx) => (
                              <div key={idx} className="text-xs">
                                <span className={cn('font-semibold', issue.type === 'error' ? 'text-destructive' : 'text-yellow-800')}>
                                  {issue.type === 'error' ? 'Error:' : 'Alerta:'}
                                </span>{' '}
                                <span className="text-foreground">{issue.message}</span>
                              </div>
                            ))}
                          </div>

                          {conflictingClient && (
                            <div className="grid grid-cols-1 gap-1">
                              <ComparisonCard title="Denominación" importValue={denomImport} systemValue={conflictingClient.denominacion} />
                              <ComparisonCard title="Razón Social" importValue={razonImport} systemValue={conflictingClient.razonSocial} />
                              <ComparisonCard title="CUIT" importValue={cuitImport} systemValue={conflictingClient.cuit} />
                            </div>
                          )}

                          {(!denomHeader || !razonHeader || !cuitHeader) && (
                            <div className="text-[11px] text-muted-foreground">
                              Tip: para comparación completa, mapeá Denominación / Razón Social / CUIT en el Paso 2.
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin observaciones</span>
                      )}
                    </TableCell>

                    {mappedHeaders.map((header) => (
                      <TableCell key={header}>{result.data?.[header]}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="flex justify-between gap-4 mt-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>

          <Button onClick={() => onImport(rowsToImport)} disabled={rowsToImport.length === 0}>
            Importar Selección ({rowsToImport.length})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
