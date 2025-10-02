'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Client, User } from '@/lib/types';
import { ArrowRight } from 'lucide-react';

type MappedData = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>>;
type ColumnMapping = Record<string, keyof MappedData | 'ignore'>;

interface ColumnMapperProps {
    headers: string[];
    columnMapping: ColumnMapping;
    setColumnMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
    ownerId: string;
    setOwnerId: React.Dispatch<React.SetStateAction<string>>;
    advisors: User[];
}

const clientFields: { value: keyof MappedData; label: string }[] = [
    { value: 'denominacion', label: 'Denominación' },
    { value: 'razonSocial', label: 'Razón Social' },
    { value: 'cuit', label: 'CUIT' },
    { value: 'condicionIVA', label: 'Condición IVA' },
    { value: 'provincia', label: 'Provincia' },
    { value: 'localidad', label: 'Localidad' },
    { value: 'tipoEntidad', label: 'Tipo Entidad' },
    { value: 'rubro', label: 'Rubro' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Teléfono' },
    { value: 'observaciones', label: 'Observaciones' },
];

export function ColumnMapper({ headers, columnMapping, setColumnMapping, ownerId, setOwnerId, advisors }: ColumnMapperProps) {
    const handleMappingChange = (header: string, value: keyof MappedData | 'ignore') => {
        setColumnMapping(prev => ({ ...prev, [header]: value }));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Paso 2: Asignar Columnas y Propietario</CardTitle>
                <CardDescription>Asigna cada columna de tu archivo a un campo del CRM y elige a qué asesor pertenecerán los nuevos clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <Label className="font-semibold text-lg">Asignar Columnas</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                        {headers.map(header => (
                            <div key={header} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                                <Label htmlFor={`map-${header}`} className="flex-1 font-medium truncate" title={header}>
                                    {header}
                                </Label>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <Select
                                    value={columnMapping[header] || 'ignore'}
                                    onValueChange={(value: keyof MappedData | 'ignore') => handleMappingChange(header, value)}
                                >
                                    <SelectTrigger id={`map-${header}`} className="w-[180px]">
                                        <SelectValue placeholder="Seleccionar campo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ignore">Ignorar</SelectItem>
                                        {clientFields.map(field => (
                                            <SelectItem key={field.value} value={field.value}>
                                                {field.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                </div>
                 <div>
                    <Label htmlFor="owner" className="font-semibold text-lg">Asignar Propietario</Label>
                     <Select value={ownerId} onValueChange={setOwnerId}>
                        <SelectTrigger id="owner" className="w-full md:w-[300px] mt-2">
                            <SelectValue placeholder="Seleccionar un asesor..." />
                        </SelectTrigger>
                        <SelectContent>
                            {advisors.map(advisor => (
                                <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
