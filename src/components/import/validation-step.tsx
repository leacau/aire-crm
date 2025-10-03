
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
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

const ComparisonCard = ({ title, importValue, systemValue }: { title: string, importValue?: string, systemValue?: string }) => {
    if (!importValue && !systemValue) return null;

    const isSimilar = importValue && systemValue && importValue.toLowerCase() === systemValue.toLowerCase();

    return (
        <div className={cn("p-1.5 rounded-md border", isSimilar ? 'bg-amber-100/50 border-amber-200' : 'bg-muted/30')}>
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-xs text-foreground truncate" title={importValue}>
                <span className="font-medium">Archivo:</span> {importValue || <span className="text-muted-foreground">N/A</span>}
            </p>
            <p className="text-xs text-muted-foreground truncate" title={systemValue}>
                <span className="font-medium">Sistema:</span> {systemValue || <span className="text-muted-foreground">N/A</span>}
            </p>
        </div>
    );
};

export function ValidationStep({ results, setResults, headers, columnMapping, onImport, onBack }: ValidationStepProps) {
    const mappedHeaders = headers.filter(h => columnMapping[h] !== 'ignore');
    const rowsToImport = results.filter(r => r.include);
    
    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);

    const errorCount = results.filter(r => r.issues.some(i => i.type === 'error')).length;
    const warningCount = results.filter(r => r.issues.some(i => i.type === 'warning')).length;

    const handleToggleRow = (index: number, event: React.MouseEvent) => {
        const hasError = results[index].issues.some(i => i.type === 'error');
        if (hasError) return;

        const currentCheckedState = !results[index].include;

        if (event.nativeEvent.shiftKey && lastCheckedIndex !== null) {
            const start = Math.min(lastCheckedIndex, index);
            const end = Math.max(lastCheckedIndex, index);
            
            setResults(prev => prev.map((r, i) => {
                const rowHasError = r.issues.some(issue => issue.type === 'error');
                if (i >= start && i <= end && !rowHasError) {
                    return { ...r, include: currentCheckedState };
                }
                return r;
            }));
        } else {
            setResults(prev => prev.map((r, i) => i === index ? { ...r, include: currentCheckedState } : r));
        }

        setLastCheckedIndex(index);
    };

    const selectableRows = results.filter(r => !r.issues.some(i => i.type === 'error'));
    const selectedSelectableRows = selectableRows.filter(r => r.include);

    const isAllSelected = selectableRows.length > 0 && selectedSelectableRows.length === selectableRows.length;
    const isSomeSelected = selectedSelectableRows.length > 0 && !isAllSelected;

    const handleToggleAll = () => {
        const newCheckedState = !isAllSelected;
        setResults(prev => prev.map(r => {
            const hasError = r.issues.some(i => i.type === 'error');
            return hasError ? r : { ...r, include: newCheckedState };
        }));
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                    <div className="flex items-center gap-4">
                        <Badge variant="destructive">{errorCount} Fila(s) con Errores</Badge>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">{warningCount} Fila(s) con Alertas</Badge>
                    </div>
                    <div className="font-medium">
                        {rowsToImport.length} de {results.length} filas seleccionadas para importar.
                    </div>
                </div>

                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12 sticky left-0 bg-background z-10">
                                    <Checkbox 
                                        checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                        onCheckedChange={handleToggleAll}
                                        aria-label="Seleccionar todo"
                                        disabled={selectableRows.length === 0}
                                    />
                                </TableHead>
                                <TableHead className="w-24">Estado</TableHead>
                                <TableHead className="min-w-[250px]">Detalle de Alerta</TableHead>
                                {mappedHeaders.map(header => (
                                    <TableHead key={header} className="min-w-[150px]">{columnMapping[header]}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {results.map((result, rowIndex) => {
                                const hasError = result.issues.some(i => i.type === 'error');
                                const hasWarning = result.issues.some(i => i.type === 'warning');
                                const firstIssue = result.issues[0];
                                const conflictingClient = firstIssue?.conflictingClient;

                                return (
                                    <TableRow key={rowIndex} className={cn(hasError && 'bg-destructive/10', hasWarning && !hasError && 'bg-yellow-100/30')}>
                                        <TableCell className="sticky left-0 bg-inherit z-10">
                                            <div onClick={(e) => handleToggleRow(rowIndex, e)} className="p-2.5 -m-2.5 cursor-pointer">
                                                <Checkbox
                                                    checked={result.include}
                                                    disabled={hasError}
                                                    aria-label={`Seleccionar fila ${rowIndex + 1}`}
                                                    className="pointer-events-none"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {(hasError || hasWarning) && (
                                                <Badge variant={hasError ? 'destructive' : 'secondary'} className={cn(!hasError && "bg-yellow-100 text-yellow-800 hover:bg-yellow-100")}>
                                                    {hasError ? <AlertCircle className="h-4 w-4 mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                                                    {hasError ? 'Error' : 'Alerta'}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {firstIssue && (
                                                <div className="space-y-1">
                                                    <p className="text-xs font-semibold">{firstIssue.message}</p>
                                                    {conflictingClient && (
                                                        <div className='grid grid-cols-1 gap-1 mt-1'>
                                                            <ComparisonCard 
                                                                title="Denominación"
                                                                importValue={result.data[headers.find(h => columnMapping[h] === 'denominacion')!]}
                                                                systemValue={conflictingClient.denominacion}
                                                            />
                                                             <ComparisonCard 
                                                                title="Razón Social"
                                                                importValue={result.data[headers.find(h => columnMapping[h] === 'razonSocial')!]}
                                                                systemValue={conflictingClient.razonSocial}
                                                            />
                                                            <ComparisonCard 
                                                                title="CUIT"
                                                                importValue={result.data[headers.find(h => columnMapping[h] === 'cuit')!]}
                                                                systemValue={conflictingClient.cuit}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                        {mappedHeaders.map(header => (
                                            <TableCell key={header}>{result.data[header]}</TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                     <ScrollBar orientation="horizontal" />
                </ScrollArea>
                 <div className="flex justify-between gap-4 mt-4">
                     <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
                     <Button onClick={() => onImport(rowsToImport)} disabled={rowsToImport.length === 0}>
                        Importar Selección ({rowsToImport.length})
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
