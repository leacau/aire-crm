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

type MappedData = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>>;
type ColumnMapping = Record<string, keyof MappedData | 'ignore'>;

export default function ImportPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [ownerId, setOwnerId] = useState<string>('');
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
    const clientFields = ['denominacion', 'razonSocial', 'cuit', 'condicionIVA', 'provincia', 'localidad', 'tipoEntidad', 'rubro', 'email', 'phone', 'observaciones'];
    extractedHeaders.forEach(header => {
        const lowerHeader = header.toLowerCase().replace(/ /g, '');
        const foundField = clientFields.find(field => lowerHeader.includes(field.toLowerCase()));
        initialMapping[header] = foundField as keyof MappedData || 'ignore';
    });
    setColumnMapping(initialMapping);
  };
  
  const handleImport = async () => {
    if (!ownerId) {
        toast({ title: 'Propietario no asignado', description: 'Por favor, selecciona un asesor para asignar estos clientes.', variant: 'destructive'});
        return;
    }
    
    const owner = advisors.find(a => a.id === ownerId);
    if (!owner) {
        toast({ title: 'Error', description: 'Asesor seleccionado no encontrado.', variant: 'destructive'});
        return;
    }

    setIsImporting(true);
    setImportProgress(0);

    const clientsToCreate: MappedData[] = data.map(row => {
        const client: MappedData = {};
        for(const header in columnMapping) {
            const clientField = columnMapping[header];
            if (clientField !== 'ignore') {
                // @ts-ignore
                client[clientField] = row[header];
            }
        }
        return client;
    });

    let successCount = 0;
    for (let i = 0; i < clientsToCreate.length; i++) {
        const clientData = clientsToCreate[i];
        if (clientData.denominacion) {
             try {
                await createClient(clientData, owner.id, owner.name);
                successCount++;
            } catch (error: any) {
                 console.error(`Error importing client ${clientData.denominacion}:`, error);
                 toast({
                    title: `Error importando ${clientData.denominacion}`,
                    description: error.message,
                    variant: 'destructive'
                 });
            }
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
    setOwnerId('');
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
                    ownerId={ownerId}
                    setOwnerId={setOwnerId}
                    advisors={advisors}
                />

                <DataPreview
                    data={data}
                    headers={headers}
                    columnMapping={columnMapping}
                />

                <div className="flex justify-end gap-4">
                     <Button variant="outline" onClick={() => { setData([]); setHeaders([]); }}>Cancelar</Button>
                     <Button onClick={handleImport} disabled={!ownerId}>
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
