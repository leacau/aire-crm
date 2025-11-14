'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wand2 } from 'lucide-react';
import { executeCommanderFlow } from '@/ai/flows/commander-flow';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '../ui/spinner';
import { useToast } from '@/hooks/use-toast';

export function CommandDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [response, setResponse] = useState('');
  const { userInfo } = useAuth();
  const { toast } = useToast();

  const handleExecute = async () => {
    if (!inputValue.trim() || !userInfo) return;
    
    setIsExecuting(true);
    setResponse('');
    try {
      const result = await executeCommanderFlow(inputValue, userInfo);
      setResponse(result);
    } catch (error) {
      console.error("Error executing command flow:", error);
      toast({ title: "Error al procesar la orden", description: (error as Error).message, variant: "destructive" });
      setResponse('Lo siento, ocurrió un error al procesar tu orden.');
    } finally {
      setIsExecuting(false);
      setInputValue('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleExecute();
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
        <Wand2 className="h-5 w-5" />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Asistente de Comandos</DialogTitle>
            <DialogDescription>
              Escribe una orden en lenguaje natural. Por ejemplo: "Crea un prospecto para la empresa 'Constructora del Litoral' y recuérdame llamarlos mañana".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input
              placeholder="Tu orden..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
            />
            {isExecuting && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner size="small" />
                <p>Procesando...</p>
              </div>
            )}
            {response && (
                <div className="p-3 bg-muted rounded-md text-sm">
                    <p>{response}</p>
                </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cerrar</Button>
            <Button onClick={handleExecute} disabled={isExecuting || !inputValue.trim()}>
              {isExecuting ? '...' : 'Ejecutar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
