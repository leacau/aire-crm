'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Client } from '@/lib/types';

type MappedData = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>>;
type ColumnMapping = Record<string, keyof MappedData | 'ignore'>;

interface DataPreviewProps {
    data: any[];
    headers: string[];
    columnMapping: ColumnMapping;
}

export function DataPreview({ data, headers, columnMapping }: DataPreviewProps) {
    const previewData = data.slice(0, 5);
    const mappedHeaders = headers.filter(h => columnMapping[h] !== 'ignore');

    return (
        <Card>
            <CardHeader>
                <CardTitle>Paso 3: Vista Previa de Datos</CardTitle>
                <CardDescription>Revisa las primeras 5 filas para asegurarte de que los datos se están asignando correctamente. Las columnas marcadas como "Ignorar" no se mostrarán.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {mappedHeaders.map(header => (
                                    <TableHead key={header}>{columnMapping[header]}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {previewData.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {mappedHeaders.map(header => (
                                        <TableCell key={header}>{row[header]}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
