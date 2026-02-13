// src/components/publicidad/advertising-form.tsx
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, differenceInDays, isValid } from "date-fns";
import { CalendarIcon, Save, FileDown, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { PDFDownloadLink } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { advertisingOrderSchema, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

// Services & Types
import { 
    createAdvertisingOrder, 
    getClients, 
    getAgencies, 
    getPrograms, 
    getOpportunitiesByClientId, 
    createQuickOpportunity 
} from "@/lib/firebase-service";
import { Client, Agency, AdvertisingOrder } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

// Sub-components
import { SrlSection } from "./srl-section";
import { SasSection } from "./sas-section";
import { AdvertisingOrderPdf } from "./advertising-pdf";

export function AdvertisingForm() {
  const { toast } = useToast();
  const { userInfo } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [programs, setPrograms] = useState<any[]>([]); 
  
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [isNewOpp, setIsNewOpp] = useState(false);

  const [isLoadingData, setIsLoadingData] = useState(true);

  const form = useForm<AdvertisingOrderFormValues>({
    resolver: zodResolver(advertisingOrderSchema),
    defaultValues: {
      accountExecutive: "",
      materialSent: false,
      certReq: false,
      agencySale: false,
      commissionSrl: 0,
      adjustmentSrl: 0,
      adjustmentSas: 0,
      srlItems: [],
      sasItems: [],
      startDate: undefined,
      endDate: undefined,
    },
  });

  const { watch, setValue } = form;
  const values = watch();
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const agencySale = watch("agencySale");
  const selectedClientId = watch("clientId");

  // Activar renderizado de cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Cargar datos iniciales
  useEffect(() => {
    if (userInfo?.name) setValue("accountExecutive", userInfo.name);

    const loadData = async () => {
      try {
        const [clientsData, agenciesData, programsData] = await Promise.all([
          getClients(),
          getAgencies(),
          getPrograms()
        ]);
        
        if ('clients' in clientsData) {
            setClients(clientsData.clients);
        } else if (Array.isArray(clientsData)) {
             setClients(clientsData as Client[]);
        }
        setAgencies(agenciesData);
        setPrograms(programsData);
      } catch (error) {
        console.error("Error loading form data:", error);
        toast({ title: "Error", description: "Fallo carga de datos.", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [userInfo, setValue, toast]);

  // Cargar Oportunidades
  useEffect(() => {
    if (!selectedClientId) {
        setOpportunities([]);
        return;
    }
    const fetchOpps = async () => {
        try {
            const opps = await getOpportunitiesByClientId(selectedClientId);
            setOpportunities(opps);
        } catch (error) {
            console.error(error);
        }
    };
    fetchOpps();
  }, [selectedClientId]);

  // Validaciones visuales
  const daysCount = (startDate && endDate && isValid(startDate) && isValid(endDate))
    ? Math.max(0, differenceInDays(endDate, startDate) + 1) 
    : 0;

  const showSrlSection = startDate && endDate && isValid(startDate) && isValid(endDate) && (endDate >= startDate);

  // --- LÓGICA DE PDF SEGURA ---
  const getPreviewOrder = (): AdvertisingOrder => {
      const selectedClient = clients.find(c => c.id === values.clientId);
      const selectedAgency = agencies.find(a => a.id === values.agencyId);
      const selectedOpp = opportunities.find(o => o.id === values.opportunityId);
      const oppTitle = values.opportunityId === 'new_custom_opportunity' ? values.newOpportunityTitle : selectedOpp?.title;

      const safeStartDate = (values.startDate && isValid(values.startDate)) ? values.startDate.toISOString() : new Date().toISOString();
      const safeEndDate = (values.endDate && isValid(values.endDate)) ? values.endDate.toISOString() : new Date().toISOString();

      const srlSubtotal = values.srlItems?.reduce((acc, item) => {
        const totalAds = Object.values(item.dailySpots || {}).reduce((sum, val) => sum + (val || 0), 0);
        const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
        return acc + ((item.unitRate || 0) * totalAds * multiplier);
      }, 0) || 0;
      const srlTotal = srlSubtotal - (values.adjustmentSrl || 0);

      const sasSubtotal = values.sasItems?.reduce((acc, item) => {
        let net = 0;
        if (item.format === "Banner") {
            net = (item.cpm || 0) * (item.unitRate || 0);
        } else {
            net = (item.unitRate || 0);
        }
        return acc + net;
      }, 0) || 0;
      const sasTotal = (sasSubtotal - (values.adjustmentSas || 0)) * 1.05;

      return {
          id: "preview",
          clientId: values.clientId || "",
          clientName: selectedClient?.denominacion || "Cliente (Vista Previa)",
          agencyId: values.agencyId,
          agencyName: selectedAgency?.name,
          product: "", 
          opportunityId: values.opportunityId,
          opportunityTitle: oppTitle || "Campaña",
          accountExecutive: values.accountExecutive || userInfo?.name || "",
          createdAt: new Date().toISOString(),
          createdBy: userInfo?.id || "",
          tangoOrderNo: values.tangoOrderNo,
          startDate: safeStartDate,
          endDate: safeEndDate,
          materialSent: values.materialSent || false,
          observations: values.observations,
          certReq: values.certReq || false,
          agencySale: values.agencySale || false,
          commissionSrl: values.commissionSrl || 0,
          srlItems: values.srlItems || [],
          sasItems: values.sasItems || [],
          adjustmentSrl: values.adjustmentSrl || 0,
          adjustmentSas: values.adjustmentSas || 0,
          totalSrl: srlTotal,
          totalSas: sasTotal,
          totalOrder: srlTotal + sasTotal
      };
  };

  // --- MANEJO DE ERRORES AL GUARDAR ---
  const onInvalid = (errors: any) => {
      console.log("Errores de validación:", errors);
      let errorMsg = "Revisa los campos obligatorios marcados en rojo.";
      if (errors.clientId) errorMsg = "Falta seleccionar el Anunciante (Cliente).";
      else if (errors.startDate || errors.endDate) errorMsg = "Faltan las fechas de Inicio o Fin.";
      
      toast({
          title: "No se puede guardar",
          description: errorMsg,
          variant: "destructive"
      });
  };

  async function onSubmit(data: AdvertisingOrderFormValues) {
    if (!userInfo) return;
    setIsSubmitting(true);
    
    try {
      const selectedClient = clients.find(c => c.id === data.clientId);
      const selectedAgency = agencies.find(a => a.id === data.agencyId);
      
      let finalOppId = data.opportunityId;
      let oppTitle = "";

      if (data.opportunityId === "new_custom_opportunity") {
          if (!data.newOpportunityTitle) {
              toast({ title: "Error", description: "Ingrese nombre para la nueva oportunidad", variant: "destructive"});
              setIsSubmitting(false);
              return;
          }
          finalOppId = await createQuickOpportunity(
              data.newOpportunityTitle, 
              data.clientId, 
              selectedClient?.denominacion || "Cliente", 
              userInfo.id
          );
          oppTitle = data.newOpportunityTitle;
      } else {
          const existingOpp = opportunities.find(o => o.id === finalOppId);
          oppTitle = existingOpp?.title || "Sin Asignar";
      }

      const preview = getPreviewOrder();
      
      const orderPayload = {
        ...preview,
        clientId: data.clientId,
        clientName: selectedClient?.denominacion || "Desconocido",
        agencyId: data.agencyId,
        agencyName: selectedAgency?.name,
        opportunityId: finalOppId,
        opportunityTitle: oppTitle,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        id: undefined 
      };
      
      delete orderPayload.id;

      await createAdvertisingOrder(orderPayload);
      
      toast({ title: "Pedido creado", description: "Se guardó correctamente." });
      router.push(`/clients/${data.clientId}`);

    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Error al guardar.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) return <div className="p-8 text-center text-muted-foreground">Cargando datos...</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8 pb-10">
        
        {/* HEADER */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 border rounded-md bg-white shadow-sm">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anunciante (Cliente) *</FormLabel>
                <Select onValueChange={(val) => {
                    field.onChange(val);
                    setValue("opportunityId", ""); 
                }} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>))}
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
              <FormItem>
                <FormLabel>Agencia</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {agencies.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <div className="col-span-1">
             <FormField
                control={form.control}
                name="opportunityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto (Oportunidad)</FormLabel>
                    <Select onValueChange={(val) => {
                        field.onChange(val);
                        setIsNewOpp(val === "new_custom_opportunity");
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                           <SelectValue placeholder={opportunities.length === 0 ? "Sin oportunidades" : "Seleccionar Propuesta"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                         {opportunities.map(opp => (
                             <SelectItem key={opp.id} value={opp.id}>{opp.title} ({opp.stage})</SelectItem>
                         ))}
                         <SelectItem value="new_custom_opportunity" className="font-bold text-blue-600">
                             + Crear Nueva Oportunidad
                         </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {isNewOpp && (
                  <FormField
                    control={form.control}
                    name="newOpportunityTitle"
                    render={({ field }) => (
                        <div className="mt-2">
                             <Input placeholder="Nombre del nuevo producto/campaña" {...field} />
                        </div>
                    )}
                  />
              )}
          </div>

          <FormField
            control={form.control}
            name="accountExecutive"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ejecutivo</FormLabel>
                <FormControl><Input {...field} readOnly /></FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* AIRE SRL */}
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b"><h3 className="text-lg font-semibold text-slate-800">AIRE SRL</h3></div>
          <div className="p-4 grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
               <FormField control={form.control} name="tangoOrderNo" render={({ field }) => (<FormItem><FormLabel>Orden Tango</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
               
               <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Inicio *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Fecha</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date("1900-01-01")} initialFocus /></PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
               
               <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Fin *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Fecha</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date("1900-01-01")} initialFocus /></PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
               
               <FormItem><FormLabel>Días</FormLabel><FormControl><Input value={daysCount} readOnly className="bg-slate-50" /></FormControl></FormItem>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border p-3 rounded-md bg-slate-50">
               <FormField control={form.control} name="materialSent" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Envía mat.</FormLabel></FormItem>)} />
               <FormField control={form.control} name="certReq" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Solicita Cert.</FormLabel></FormItem>)} />
               <FormField control={form.control} name="agencySale" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Venta Agencia</FormLabel></FormItem>)} />
               {agencySale && (<FormField control={form.control} name="commissionSrl" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Comisión (%)</FormLabel><FormControl><Input type="number" {...field} onChange={e=>field.onChange(parseFloat(e.target.value)||0)}/></FormControl></FormItem>)} />)}
               <FormField control={form.control} name="observations" render={({ field }) => (<FormItem className={cn("col-span-4", !agencySale && "col-span-6")}><FormLabel>Observaciones</FormLabel><FormControl><Textarea className="h-10 resize-none" {...field} /></FormControl></FormItem>)} />
            </div>

            <div className="mt-4">
               {showSrlSection ? (
                  <SrlSection form={form} startDate={startDate} endDate={endDate} programs={programs} />
               ) : (
                 <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                    {(!startDate || !endDate) ? "Seleccione fechas de Inicio y Fin." : "La fecha de Fin debe ser posterior a la de Inicio."}
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* AIRE SAS */}
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b"><h3 className="text-lg font-semibold text-slate-800">AIRE SAS</h3></div>
          <div className="p-4"><SasSection form={form} /></div>
        </div>

        {/* FOOTER ACCIONES */}
        <div className="flex justify-end pt-6 gap-4">
          
          {/* BOTÓN PDF PROTEGIDO: Solo se renderiza el real si hay datos */}
          {isClient && showSrlSection ? (
              <PDFDownloadLink 
                document={<AdvertisingOrderPdf order={getPreviewOrder()} />} 
                fileName="Orden_Publicidad_Preview.pdf"
                className="no-underline"
              >
                {({ loading }) => (
                    <Button type="button" variant="outline" size="lg" disabled={loading}>
                        <FileDown className="mr-2 h-4 w-4" /> 
                        {loading ? 'Generando...' : 'Exportar PDF'}
                    </Button>
                )}
              </PDFDownloadLink>
          ) : (
              // Botón "dummy" deshabilitado para que el usuario sepa que existe pero requiere datos
              <Button type="button" variant="outline" size="lg" disabled title="Complete fechas para exportar">
                  <FileDown className="mr-2 h-4 w-4" /> Exportar PDF
              </Button>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : <><Save className="mr-2 h-4 w-4" /> Guardar Pedido</>}
          </Button>
        </div>
      </form>
    </Form>
  );
}
