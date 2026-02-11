"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { advertisingOrderSchema, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

// Services & Types
import { createAdvertisingOrder, getClients, getAgencies } from "@/lib/firebase-service";
import { Client, Agency } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

// Sub-components
import { SrlSection } from "./srl-section";
import { SasSection } from "./sas-section";

export function AdvertisingForm() {
  const { toast } = useToast();
  const { userInfo } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estado para listas desplegables
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const form = useForm<AdvertisingOrderFormValues>({
    resolver: zodResolver(advertisingOrderSchema),
    defaultValues: {
      accountExecutive: "", // Se llenará con useEffect cuando userInfo esté listo
      materialSent: false,
      certReq: false,
      agencySale: false,
      commissionSrl: 0,
      adjustmentSrl: 0,
      adjustmentSas: 0,
      srlItems: [],
      sasItems: [],
    },
  });

  const { watch, setValue } = form;
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const agencySale = watch("agencySale");

  // Cargar datos iniciales
  useEffect(() => {
    if (userInfo?.name) {
      setValue("accountExecutive", userInfo.name);
    }

    const loadData = async () => {
      try {
        const [clientsData, agenciesData] = await Promise.all([
          getClients(), // Nota: getClients paginado devuelve { clients, lastVisible }. 
          getAgencies()
        ]);
        
        // Ajuste si getClients devuelve objeto paginado o array directo
        // Asumo que tu getClients actual devuelve { clients: [...] }
        // Si devuelve array directo, ajusta esto a: setClients(clientsData)
        if ('clients' in clientsData) {
            setClients(clientsData.clients);
        } else if (Array.isArray(clientsData)) {
             setClients(clientsData as Client[]);
        }

        setAgencies(agenciesData);
      } catch (error) {
        console.error("Error loading form data:", error);
        toast({
          title: "Error de carga",
          description: "No se pudieron cargar clientes o agencias.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [userInfo, setValue, toast]);

  const daysCount = startDate && endDate 
    ? Math.max(0, differenceInDays(endDate, startDate) + 1)
    : 0;

  async function onSubmit(data: AdvertisingOrderFormValues) {
    if (!userInfo) return;
    setIsSubmitting(true);
    
    try {
      // Buscar nombre del cliente seleccionado para guardar redundancia
      const selectedClient = clients.find(c => c.id === data.clientId);
      const selectedAgency = agencies.find(a => a.id === data.agencyId);

      // Preparar objeto para Firebase
      const orderPayload = {
        clientId: data.clientId,
        clientName: selectedClient?.denominacion || "Desconocido",
        agencyId: data.agencyId,
        agencyName: selectedAgency?.name,
        product: data.product,
        accountExecutive: data.accountExecutive || userInfo.name,
        createdBy: userInfo.id,
        
        tangoOrderNo: data.tangoOrderNo,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        materialSent: data.materialSent,
        observations: data.observations,
        certReq: data.certReq,
        agencySale: data.agencySale,
        commissionSrl: data.commissionSrl,
        
        srlItems: data.srlItems,
        sasItems: data.sasItems,
        
        adjustmentSrl: data.adjustmentSrl,
        adjustmentSas: data.adjustmentSas,
      };

      await createAdvertisingOrder(orderPayload);
      
      toast({
        title: "Pedido creado",
        description: "El pedido de publicidad se ha guardado correctamente.",
      });

      // Opcional: Redirigir a la lista o limpiar formulario
      // router.push("/publicidad"); 
      // form.reset();

    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Hubo un problema al guardar el pedido.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) {
    return <div className="p-8 text-center text-muted-foreground">Cargando datos...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-10">
        
        {/* --- SECCIÓN A: CLIENTE Y DATOS GENERALES --- */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 border rounded-md bg-white shadow-sm">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem className="col-span-1">
                <FormLabel>Anunciante (Cliente)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar Cliente" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.denominacion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="agencyId"
            render={({ field }) => (
              <FormItem className="col-span-1">
                <FormLabel>Agencia</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar Agencia" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {agencies.map((agency) => (
                      <SelectItem key={agency.id} value={agency.id}>
                        {agency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="product"
            render={({ field }) => (
              <FormItem className="col-span-1">
                <FormLabel>Producto</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Nueva Campaña Verano" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountExecutive"
            render={({ field }) => (
              <FormItem className="col-span-1">
                <FormLabel>Ejecutivo de Cuentas</FormLabel>
                <FormControl>
                  <Input {...field} readOnly />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* --- SECCIÓN: AIRE SRL --- */}
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b">
            <h3 className="text-lg font-semibold text-slate-800">AIRE SRL</h3>
          </div>
          
          <div className="p-4 grid gap-6">
            {/* Renglón 1 SRL */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
               <FormField
                control={form.control}
                name="tangoOrderNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Orden Tango</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: 0001-12345678" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Inicio</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Seleccione fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fin</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Seleccione fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Días (Total)</FormLabel>
                <FormControl>
                  <Input value={daysCount} readOnly className="bg-slate-50" />
                </FormControl>
              </FormItem>
            </div>

            {/* Renglón 1 SRL - Parte 2 (Checks y Observaciones) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border p-3 rounded-md bg-slate-50/50">
               <FormField
                control={form.control}
                name="materialSent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 col-span-2 bg-white h-full">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Envía material</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

               <FormField
                control={form.control}
                name="certReq"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 col-span-2 bg-white h-full">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Solicita Cert.</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

               <FormField
                control={form.control}
                name="agencySale"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 col-span-2 bg-white h-full">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Venta x Agencia</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {agencySale && (
                <FormField
                  control={form.control}
                  name="commissionSrl"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Comisión (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0} 
                          max={100} 
                          {...field} 
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem className={cn("col-span-4", !agencySale && "col-span-6")}>
                    <FormLabel>Observaciones SRL</FormLabel>
                    <FormControl>
                      <Textarea className="h-full min-h-[50px] resize-none" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* TABLA DINÁMICA SRL */}
            <div className="mt-4">
               {startDate && endDate ? (
                  <SrlSection form={form} startDate={startDate} endDate={endDate} />
               ) : (
                 <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                   Seleccione fechas de Inicio y Fin para ver la grilla de pautado.
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* --- SECCIÓN: AIRE SAS --- */}
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b">
            <h3 className="text-lg font-semibold text-slate-800">AIRE SAS</h3>
          </div>
          <div className="p-4">
             <SasSection form={form} />
          </div>
        </div>

        <div className="flex justify-end pt-6">
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full md:w-auto">
            {isSubmitting ? "Guardando..." : (
                <><Save className="mr-2 h-4 w-4" /> Guardar Pedido</>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
