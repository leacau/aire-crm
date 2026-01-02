'use client';

import React, { useCallback, useMemo, useState } from 'react';
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
  onFileSelected?: (file: File) => void;
  /**
   * Tamaño máximo recomendado para evitar que el browser sufra (por defecto 20MB).
   * Si vas a procesar server-side, podés subir este valor.
   */
  maxSizeBytes?: number;
  /**
   * Path del worker. Por defecto: /xlsx-worker.js (debe estar en /public).
   */
  workerPath?: string;
}

export function FileUploader({
  onDataExtracted,
  disabled,
  onServerProcess,
  onFileSelected,
  maxSizeBytes = 20 * 1024 * 1024,
  workerPath = '/xlsx-worker.js',
}: FileUploaderProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const maxSizeLabel = useMemo(() => {
    const mb = maxSizeBytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  }, [maxSizeBytes]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      const rejection = fileRejections?.[0];
      if (rejection?.errors?.length) {
        const message = rejection.errors.map((e: any) => e.message).join(' • ');
        toast({ title: 'Archivo rechazado', description: message, variant: 'destructive' });
        return;
      }

      const file = acceptedFiles[0];
      if (!file) {
        toast({ title: 'No se seleccionó ningún archivo', variant: 'destructive' });
        return;
      }

      if (file.size > maxSizeBytes && !onServerProcess) {
        toast({
          title: 'Archivo demasiado grande para procesar en el navegador',
          description: `Tu archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB. Máximo recomendado: ${maxSizeLabel}. Sugerencia: procesalo en el servidor.`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedFileName(file.name);
      setIsProcessing(true);

      const { dismiss } = toast({
        title: 'Procesando archivo…',
        description: (
          <div className="flex items-center gap-2">
            <Spinner size="small" /> Por favor, espera.
          </div>
        ),
        duration: Infinity,
      });

      onFileSelected?.(file);

      // Server-side processing (recommended for large files)
      if (onServerProcess) {
        onServerProcess(file)
          .catch((error) => {
            console.error('Error processing file on server:', error);
            toast({
              title: 'Error al procesar el archivo',
              description: error?.message || 'Intenta nuevamente.',
              variant: 'destructive',
            });
          })
          .finally(() => {
            setIsProcessing(false);
            dismiss();
          });
        return;
      }

      // Client-side worker processing
      let worker: Worker | null = null;
      try {
        worker = new Worker(workerPath);
      } catch (e) {
        console.error('Worker init error:', e);
        setIsProcessing(false);
        dismiss();
        toast({
          title: 'No se pudo iniciar el procesador de archivos',
          description: 'Verificá que /public/xlsx-worker.js exista y esté accesible.',
          variant: 'destructive',
        });
        return;
      }

      worker.onmessage = (event) => {
        const { success, data, headers, error } = event.data;

        setIsProcessing(false);
        dismiss();

        if (success) {
          if (!data || data.length === 0) {
            toast({
              title: 'Archivo vacío o sin datos',
              description: 'El archivo debe tener al menos una fila de datos.',
              variant: 'destructive',
            });
            worker?.terminate();
            return;
          }

          onDataExtracted(data, headers || []);
          toast({ title: 'Archivo cargado', description: `${data.length} filas leídas.` });
        } else {
          console.error('Error from worker:', error);
          toast({
            title: 'Error al leer el archivo',
            description: 'Asegúrate de que sea un archivo XLS, XLSX o CSV válido.',
            variant: 'destructive',
          });
        }

        worker?.terminate();
      };

      worker.onerror = (error) => {
        console.error('Worker error:', error);
        setIsProcessing(false);
        dismiss();
        toast({
          title: 'Ocurrió un error inesperado',
          description: 'No se pudo procesar el archivo.',
          variant: 'destructive',
        });
        worker?.terminate();
      };

      worker.postMessage(file);
    },
    [maxSizeBytes, maxSizeLabel, onDataExtracted, onFileSelected, onServerProcess, toast, workerPath]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: maxSizeBytes,
    disabled: disabled || isProcessing,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 1: Cargar Archivo</CardTitle>
        <CardDescription>
          Arrastra o selecciona un archivo XLS, XLSX o CSV para importar tus clientes.
          <span className="block text-xs text-muted-foreground mt-1">
            Límite recomendado navegador: {maxSizeLabel}. Archivos grandes: mejor server-side.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            'relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
            isDragActive && 'border-primary bg-primary/10',
            (disabled || isProcessing) && 'cursor-not-allowed opacity-50 bg-muted/50'
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <>
              <Spinner size="large" />
              <p className="mt-4 text-center text-muted-foreground">Procesando archivo…</p>
              {selectedFileName && (
                <p className="mt-1 text-xs text-muted-foreground truncate max-w-[90%]" title={selectedFileName}>
                  {selectedFileName}
                </p>
              )}
            </>
          ) : (
            <>
              <UploadCloud className="h-12 w-12 text-muted-foreground" />
              {isDragActive ? (
                <p className="mt-4 text-center text-muted-foreground">Suelta el archivo aquí…</p>
              ) : (
                <p className="mt-4 text-center text-muted-foreground">
                  Arrastra y suelta el archivo, o <span className="font-semibold text-primary">haz clic para seleccionar</span>.
                </p>
              )}
              {selectedFileName && (
                <p className="mt-2 text-xs text-muted-foreground truncate max-w-[90%]" title={selectedFileName}>
                  Último archivo: {selectedFileName}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
