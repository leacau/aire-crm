'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  onDataExtracted: (data: any[], headers: string[]) => void;
  disabled?: boolean;
}

export function FileUploader({ onDataExtracted, disabled }: FileUploaderProps) {
    const { toast } = useToast();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) {
            toast({ title: "No se seleccionó ningún archivo", variant: 'destructive' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
            try {
                const bstr = event.target?.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (json.length < 2) {
                    toast({ title: 'Archivo vacío o sin encabezados', description: 'El archivo debe tener al menos una fila de encabezado y una fila de datos.', variant: 'destructive'});
                    return;
                }

                const headers = json[0] as string[];
                const data = json.slice(1).map((row: any) => {
                    const rowData: { [key: string]: any } = {};
                    headers.forEach((header, index) => {
                        rowData[header] = row[index];
                    });
                    return rowData;
                });

                onDataExtracted(data, headers);
                 toast({ title: 'Archivo cargado', description: `${data.length} filas leídas.`});
            } catch (error) {
                console.error("Error parsing file:", error);
                toast({ title: "Error al leer el archivo", description: "Asegúrate de que sea un archivo XLS, XLSX o CSV válido.", variant: "destructive" });
            }
        };
        reader.readAsBinaryString(file);
    }, [onDataExtracted, toast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop,
        accept: {
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
        },
        maxFiles: 1,
        disabled,
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>Paso 1: Cargar Archivo</CardTitle>
                <CardDescription>Arrastra o selecciona un archivo XLS, XLSX o CSV para importar tus clientes.</CardDescription>
            </CardHeader>
            <CardContent>
                <div 
                    {...getRootProps()} 
                    className={cn(
                        "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                        isDragActive && "border-primary bg-primary/10",
                        disabled && "cursor-not-allowed opacity-50 bg-muted/50"
                    )}
                >
                    <input {...getInputProps()} />
                    <UploadCloud className="h-12 w-12 text-muted-foreground" />
                    {isDragActive ? (
                        <p className="mt-4 text-center text-muted-foreground">Suelta el archivo aquí...</p>
                    ) : (
                        <p className="mt-4 text-center text-muted-foreground">
                            Arrastra y suelta el archivo, o <span className="font-semibold text-primary">haz clic para seleccionar</span>.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}