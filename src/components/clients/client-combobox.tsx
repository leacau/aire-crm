'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Client } from '@/lib/types';

interface ClientComboboxProps {
  clients: Client[];
  value?: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearLabel?: string;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = 'Seleccionar cliente...',
  disabled,
  className,
  clearLabel,
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedClient = clients.find(client => client.id === value);

  const filteredClients = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return clients.slice(0, 80);
    return clients
      .filter(client => normalize([
        client.denominacion,
        client.razonSocial,
        client.razonSocialTango,
        client.cuit,
      ].filter(Boolean).join(' ')).includes(term))
      .slice(0, 80);
  }, [clients, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selectedClient && 'text-muted-foreground', className)}
        >
          <span className="truncate">
            {selectedClient
              ? selectedClient.razonSocial || selectedClient.denominacion
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar por nombre, razon social o CUIT..."
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {clearLabel ? (
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent',
                  !value && 'bg-accent',
                )}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                  setQuery('');
                }}
              >
                <Check className={cn('h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                <span>{clearLabel}</span>
              </button>
            ) : null}
            {filteredClients.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados.</div>
            ) : (
              filteredClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent',
                    value === client.id && 'bg-accent',
                  )}
                  onClick={() => {
                    onChange(client.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Check className={cn('mt-0.5 h-4 w-4', value === client.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{client.denominacion}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[client.razonSocial, client.cuit].filter(Boolean).join(' · ') || 'Sin razon social'}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
