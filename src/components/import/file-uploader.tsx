
'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Spinner } from '../ui/spinner';

interface FileUploaderProps {
  onDataExtracted: (data: any[], headers: string[]) => void;
  disabled?: boolean;
  onServerProcess?: (file: File) => Promise<void>;
}

export function FileUploader({ onDataExtracted, disabled, onServerProcess }: FileUploaderProps) {
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) {
            toast({ title: "No se seleccionó ningún archivo", variant: 'destructive' });
            return;
        }

        setIsProcessing(true);
        const { id, dismiss } = toast({
            title: 'Procesando archivo...',
            description: <div className="flex items-center gap-2"><Spinner size="small" /> Por favor, espera.</div>,
            duration: Infinity
        });

        if (onServerProcess) {
            onServerProcess(file)
              .catch((error) => {
                console.error("Error processing file on server:", error);
                toast({ title: "Error al procesar el archivo", description: error.message || 'Intenta nuevamente.', variant: "destructive" });
              })
              .finally(() => {
                setIsProcessing(false);
                dismiss();
              });
            return;
        }

        // Create a Web Worker to process the file off the main thread
        const worker = new Worker('/xlsx-worker.js');

        worker.onmessage = (event) => {
            const { success, data, headers, error } = event.data;
            
            setIsProcessing(false);
            dismiss(); // Dismiss the "processing" toast

            if (success) {
                if (data.length === 0) {
                     toast({ title: 'Archivo vacío o sin datos', description: 'El archivo debe tener al menos una fila de datos.', variant: 'destructive'});
                     return;
                }
                onDataExtracted(data, headers);
                toast({ title: 'Archivo cargado', description: `${data.length} filas leídas.`});
            } else {
                console.error("Error from worker:", error);
                toast({ title: "Error al leer el archivo", description: "Asegúrate de que sea un archivo XLS, XLSX o CSV válido.", variant: "destructive" });
            }
            worker.terminate();
        };

        worker.onerror = (error) => {
            setIsProcessing(false);
            dismiss();
            console.error("Worker error:", error);
            toast({ title: "Ocurrió un error inesperado", description: "No se pudo procesar el archivo.", variant: "destructive" });
            worker.terminate();
        };

        worker.postMessage(file);

    }, [onDataExtracted, toast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop,
        accept: {
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
        },
        maxFiles: 1,
        disabled: disabled || isProcessing,
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
                        "relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                        isDragActive && "border-primary bg-primary/10",
                        (disabled || isProcessing) && "cursor-not-allowed opacity-50 bg-muted/50"
                    )}
                >
                    <input {...getInputProps()} />
                    {isProcessing ? (
                        <>
                            <Spinner size="large" />
                            <p className="mt-4 text-center text-muted-foreground">Procesando archivo...</p>
                        </>
                    ) : (
                        <>
                            <UploadCloud className="h-12 w-12 text-muted-foreground" />
                            {isDragActive ? (
                                <p className="mt-4 text-center text-muted-foreground">Suelta el archivo aquí...</p>
                            ) : (
                                <p className="mt-4 text-center text-muted-foreground">
                                    Arrastra y suelta el archivo, o <span className="font-semibold text-primary">haz clic para seleccionar</span>.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
