'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { FileUploader } from '@/components/import/file-uploader';
import { ColumnMapper } from '@/components/import/column-mapper';
import { DataPreview } from '@/components/import/data-preview';
import type { Client, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { createClient, getUsersByRole } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

type MappedData = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>> & { ownerName?: string };
type ColumnMapping = Record<string, keyof MappedData | 'ignore'>;

export default function ImportPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const canAccess = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion';

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/');
    }
    if (canAccess) {
        getUsersByRole('Asesor').then(setAdvisors);
    }
  }, [userInfo, loading, router, canAccess]);

  const handleDataExtracted = (extractedData: any[], extractedHeaders: string[]) => {
    setData(extractedData);
    setHeaders(extractedHeaders);
    // Auto-map based on header names if possible
    const initialMapping: ColumnMapping = {};
    const clientFields = ['denominacion', 'razonSocial', 'cuit', 'condicionIVA', 'provincia', 'localidad', 'tipoEntidad', 'rubro', 'email', 'phone', 'observaciones', 'ownerName'];
    extractedHeaders.forEach(header => {
        const lowerHeader = header.toLowerCase().replace(/ /g, '');
        const foundField = clientFields.find(field => lowerHeader.includes(field.toLowerCase()));
        initialMapping[header] = foundField as keyof MappedData || 'ignore';
    });
    setColumnMapping(initialMapping);
  };
  
  const handleImport = async () => {
    const ownerNameColumn = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerName');
    if (!ownerNameColumn) {
        toast({ title: 'Propietario no asignado', description: 'Por favor, asigna la columna "Propietario" a una de las columnas de tu archivo.', variant: 'destructive'});
        return;
    }
    
    const advisorsMap = new Map(advisors.map(a => [a.name.toLowerCase(), a]));

    setIsImporting(true);
    setImportProgress(0);

    const clientsToCreate: (MappedData & { rawOwnerName?: string })[] = data.map(row => {
        const client: MappedData & { rawOwnerName?: string } = {};
        for(const header in columnMapping) {
            const clientField = columnMapping[header];
            if (clientField !== 'ignore') {
                const value = row[header];
                // @ts-ignore
                client[clientField] = value === undefined ? '' : value;
            }
        }
        client.rawOwnerName = row[ownerNameColumn];
        return client;
    });

    let successCount = 0;
    for (let i = 0; i < clientsToCreate.length; i++) {
        const clientData = clientsToCreate[i];
        
        const ownerName = clientData.rawOwnerName;
        const owner = ownerName ? advisorsMap.get(String(ownerName).toLowerCase()) : undefined;

        if (clientData.denominacion && owner) {
             try {
                // We don't want to save rawOwnerName to the client object
                const { rawOwnerName, ...clientToSave } = clientData;
                await createClient(clientToSave, owner.id, owner.name);
                successCount++;
            } catch (error: any) {
                 console.error(`Error importing client ${clientData.denominacion}:`, error);
                 toast({
                    title: `Error importando ${clientData.denominacion}`,
                    description: error.message,
                    variant: 'destructive',
                    duration: 10000,
                 });
            }
        } else if (clientData.denominacion && !owner) {
             toast({
                title: `Propietario no encontrado para: ${clientData.denominacion}`,
                description: `No se encontró un asesor llamado "${ownerName}". Este cliente no fue importado.`,
                variant: 'destructive',
                duration: 10000,
             });
        }
        setImportProgress(((i + 1) / clientsToCreate.length) * 100);
    }
    
    setIsImporting(false);
    toast({
        title: 'Importación Completa',
        description: `${successCount} de ${clientsToCreate.length} clientes fueron importados exitosamente.`
    });
    // Reset state
    setData([]);
    setHeaders([]);
    setColumnMapping({});
  };


  if (loading || !canAccess) {
    return (
       <div className="flex h-full w-full items-center justify-center">
          <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Importar Clientes" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
        <FileUploader onDataExtracted={handleDataExtracted} disabled={data.length > 0} />
        
        {data.length > 0 && !isImporting && (
            <>
                <ColumnMapper 
                    headers={headers}
                    columnMapping={columnMapping}
                    setColumnMapping={setColumnMapping}
                />

                <DataPreview
                    data={data}
                    headers={headers}
                    columnMapping={columnMapping}
                />

                <div className="flex justify-end gap-4">
                     <Button variant="outline" onClick={() => { setData([]); setHeaders([]); }}>Cancelar</Button>
                     <Button onClick={handleImport}>
                        Importar {data.length} Clientes
                    </Button>
                </div>
            </>
        )}
        
        {isImporting && (
             <div className="flex flex-col items-center justify-center p-8 border rounded-lg">
                <Spinner size="large" />
                <p className="mt-4 text-lg font-medium">Importando clientes...</p>
                <p className="text-sm text-muted-foreground">{Math.round(importProgress)}% completado</p>
                <Progress value={importProgress} className="w-full max-w-md mt-4" />
            </div>
        )}

      </main>
    </div>
  );
}
