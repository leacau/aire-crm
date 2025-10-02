'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ClientImportMapping } from '@/lib/types';
import { cn } from '@/lib/utils';

type Issue = {
    type: 'error' | 'warning';
    message: string;
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

export function ValidationStep({ results, setResults, headers, columnMapping, onImport, onBack }: ValidationStepProps) {
    const mappedHeaders = headers.filter(h => columnMapping[h] !== 'ignore');
    const rowsToImport = results.filter(r => r.include && r.issues.every(i => i.type !== 'error'));
    
    const errorCount = results.filter(r => r.issues.some(i => i.type === 'error')).length;
    const warningCount = results.filter(r => r.issues.length > 0 && r.issues.every(i => i.type === 'warning')).length;

    const handleToggleAll = (checked: boolean) => {
        setResults(prev => prev.map(r => ({ ...r, include: checked })));
    };

    const handleToggleRow = (index: number, checked: boolean) => {
        setResults(prev => prev.map((r, i) => i === index ? { ...r, include: checked } : r));
    };

    const isAllSelected = results.every(r => r.include);
    const isSomeSelected = results.some(r => r.include) && !isAllSelected;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Paso 3: Validar y Revisar Datos</CardTitle>
                <CardDescription>
                    Revisa los datos antes de importar. Las filas con errores no se pueden importar. 
                    Desmarca las filas que no desees importar.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-4">
                        <Badge variant="destructive">{errorCount} Errores</Badge>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">{warningCount} Alertas</Badge>
                    </div>
                    <div className="text-sm font-medium">
                        {rowsToImport.length} de {results.length} filas listas para importar.
                    </div>
                </div>

                <div className="border rounded-lg overflow-auto max-h-[50vh]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <Checkbox 
                                        checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                        onCheckedChange={handleToggleAll}
                                    />
                                </TableHead>
                                <TableHead className="w-24">Estado</TableHead>
                                {mappedHeaders.map(header => (
                                    <TableHead key={header}>{columnMapping[header]}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {results.map((result, rowIndex) => {
                                const hasError = result.issues.some(i => i.type === 'error');
                                return (
                                    <TableRow key={rowIndex} className={cn(hasError && 'bg-destructive/10')}>
                                        <TableCell>
                                            <Checkbox
                                                checked={result.include}
                                                onCheckedChange={(checked) => handleToggleRow(rowIndex, !!checked)}
                                                disabled={hasError}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {result.issues.length > 0 && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <Badge variant={hasError ? 'destructive' : 'secondary'} className={cn(!hasError && "bg-yellow-100 text-yellow-800")}>
                                                                {hasError ? <AlertCircle className="h-4 w-4 mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                                                                {hasError ? 'Error' : 'Alerta'}
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <ul className="list-disc list-inside">
                                                                {result.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}
                                                            </ul>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
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
                </div>
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