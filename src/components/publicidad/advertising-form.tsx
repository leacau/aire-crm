// src/components/publicidad/advertising-form.tsx

"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, differenceInDays, isValid, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { CalendarIcon, Save, FileDown, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react"; 
import { useRouter } from "next/navigation";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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

import { 
    createAdvertisingOrder, 
    getClients, 
    getAgencies, 
    getPrograms, 
    getOpportunitiesByClientId, 
    createQuickOpportunity,
    getAdvertisingOrder,
    updateAdvertisingOrder,
    getBillingRequestsByOrder
} from "@/lib/firebase-service";
import { Client, Agency, AdvertisingOrder } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { sendEmail } from "@/lib/google-gmail-service";

import { SrlSection } from "./srl-section";
import { SasSection } from "./sas-section";
import { AdvertisingOrderPdf } from "./advertising-pdf";

export function AdvertisingForm() {
  const { toast } = useToast();
  const { userInfo, getGoogleAccessToken } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [programs, setPrograms] = useState<any[]>([]); 
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [isNewOpp, setIsNewOpp] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [editModeId, setEditModeId] = useState<string | null>(null);

  const pdfRef = useRef<HTMLDivElement>(null);

  const form = useForm<AdvertisingOrderFormValues>({
    resolver: zodResolver(advertisingOrderSchema),
    defaultValues: {
      accountExecutive: "",
      materialSent: false,
      materialUrl: "",
      certReq: false,
      agencySale: false,
      commissionSrl: 0,
      adjustmentSrl: 0,
      adjustmentSas: 0,
      srlItems: [],
      sasItems: [],
      billingRequests: [], 
      startDate: undefined,
      endDate: undefined,
    },
  });

  const { fields: brFields, append: brAppend, remove: brRemove } = useFieldArray({
      control: form.control,
      name: "billingRequests"
  });

  const { watch, setValue, getValues } = form;
  const values = watch();
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const agencySale = watch("agencySale");
  const selectedClientId = watch("clientId");

  useEffect(() => {
      console.log(userInfo)
    if (userInfo?.name && !editModeId) setValue("accountExecutive", userInfo.name);
    const loadData = async () => {
      try {
        const [clientsData, agenciesData, programsData] = await Promise.all([
          getClients(), getAgencies(), getPrograms()
        ]);
        if ('clients' in clientsData) setClients(clientsData.clients);
        else if (Array.isArray(clientsData)) setClients(clientsData as Client[]);
        setAgencies(agenciesData);
        setPrograms(programsData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [userInfo, setValue, editModeId]);

  useEffect(() => {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      const cloneId = params.get('cloneId');
      const editId = params.get('editId');
      const urlClientId = params.get('clientId');
      const urlOppId = params.get('opportunityId');

      const idToFetch = cloneId || editId;

      if (idToFetch) {
          if (editId) setEditModeId(editId);

          getAdvertisingOrder(idToFetch).then(async order => {
              if (order) {
                  if (order.clientId) {
                      getOpportunitiesByClientId(order.clientId).then(setOpportunities);
                  }

                  let fetchedBillingRequests: any[] = [];
                  if (editId) {
                      const brs = await getBillingRequestsByOrder(idToFetch);
                      fetchedBillingRequests = brs.map(b => ({ date: b.date, amount: b.amount }));
                  }
                  
                  form.reset({
                      clientId: order.clientId,
                      agencyId: order.agencyId || "none",
                      opportunityId: order.opportunityId,
                      newOpportunityTitle: "",
                      product: order.product || "",
                      accountExecutive: order.accountExecutive,
                      tangoOrderNo: editId ? order.tangoOrderNo : "", 
                      startDate: new Date(order.startDate),
                      endDate: new Date(order.endDate),
                      materialSent: order.materialSent || false,
                      materialUrl: order.materialUrl || "",
                      observations: order.observations || "",
                      certReq: order.certReq || false,
                      agencySale: order.agencySale || false,
                      commissionSrl: order.commissionSrl || 0,
                      srlItems: order.srlItems || [],
                      sasItems: order.sasItems || [],
                      adjustmentSrl: order.adjustmentSrl || 0,
                      adjustmentSas: order.adjustmentSas || 0,
                      billingRequests: fetchedBillingRequests 
                  });
              }
          });
      } else if (urlClientId) {
           form.setValue("clientId", urlClientId);
           if (urlOppId) form.setValue("opportunityId", urlOppId);
           getOpportunitiesByClientId(urlClientId).then(setOpportunities);
      }
  }, [form]);

  useEffect(() => {
    if (!selectedClientId) { setOpportunities([]); return; }
    const fetchOpps = async () => {
        try {
            const opps = await getOpportunitiesByClientId(selectedClientId);
            setOpportunities(opps);
        } catch (error) { console.error(error); }
    };
    fetchOpps();
  }, [selectedClientId]);

  useEffect(() => {
      if (!startDate || !endDate) return;
      const currentSrlItems = getValues("srlItems") || [];
      if (currentSrlItems.length === 0) return;

      const validStart = startOfMonth(startDate);
      const validEnd = endOfMonth(endDate);
      let hasChanges = false;

      const cleanedItems = currentSrlItems.filter(item => {
          if (!item.month) return false;
          const itemMonthDate = new Date(`${item.month}-15`); 
          const isValid = isWithinInterval(itemMonthDate, { start: validStart, end: validEnd });
          if (!isValid) hasChanges = true;
          return isValid;
      });

      if (hasChanges) {
          setValue("srlItems", cleanedItems, { shouldValidate: true });
      }
  }, [startDate, endDate, setValue, getValues]);

  const daysCount = (startDate && endDate && isValid(startDate) && isValid(endDate))
    ? Math.max(0, differenceInDays(endDate, startDate) + 1) : 0;

  const showSrlSection = startDate && endDate && isValid(startDate) && isValid(endDate) && (endDate >= startDate);

  const getPreviewOrder = (): AdvertisingOrder => {
      const selectedClient = clients.find(c => c.id === values.clientId);
      const selectedAgency = agencies.find(a => a.id === values.agencyId);
      const selectedOpp = opportunities.find(o => o.id === values.opportunityId);
      const oppTitle = values.opportunityId === 'new_custom_opportunity' ? values.newOpportunityTitle : selectedOpp?.title;

      const safeStartDate = (values.startDate && isValid(values.startDate)) ? values.startDate.toISOString() : new Date().toISOString();
      const safeEndDate = (values.endDate && isValid(values.endDate)) ? values.endDate.toISOString() : new Date().toISOString();

      const srlItemsValid = values.srlItems?.filter(item => item.month) || [];

      const srlSubtotal = srlItemsValid.reduce((acc, item) => {
        const totalAds = Object.values(item.dailySpots || {}).reduce((sum, val) => sum + (val || 0), 0);
        const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
        return acc + ((item.unitRate || 0) * totalAds * multiplier);
      }, 0) || 0;
      const srlTotal = srlSubtotal - (values.adjustmentSrl || 0);

      const sasSubtotal = values.sasItems?.reduce((acc, item) => {
        let net = 0;
        if (item.format === "Banner") net = (item.cpm || 0) * (item.unitRate || 0);
        else net = (item.unitRate || 0);
        return acc + net;
      }, 0) || 0;
      const sasTotal = (sasSubtotal - (values.adjustmentSas || 0)) * 1.05;

      return {
          id: "preview",
          clientId: values.clientId || "",
          clientName: selectedClient?.denominacion || "Cliente (Vista Previa)",
          agencyId: values.agencyId === "none" ? undefined : values.agencyId,
          agencyName: values.agencyId === "none" ? undefined : selectedAgency?.name,
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
          materialUrl: values.materialUrl || "",
          observations: values.observations,
          certReq: values.certReq || false,
          agencySale: values.agencySale || false,
          commissionSrl: values.commissionSrl || 0,
          srlItems: srlItemsValid,
          sasItems: values.sasItems || [],
          adjustmentSrl: values.adjustmentSrl || 0,
          adjustmentSas: values.adjustmentSas || 0,
          totalSrl: srlTotal,
          totalSas: sasTotal,
          totalOrder: srlTotal + sasTotal
      };
  };

  const generatePdfBase64 = async (containerElement: HTMLElement) => {
        const pdf = new jsPDF('l', 'mm', 'a4', true); 
        const pdfWidthMm = 297;
        const pdfHeightMm = 210;

        const topPaddingMm = 15;
        const bottomPaddingMm = 15;
        const usableHeightMm = pdfHeightMm - topPaddingMm - bottomPaddingMm;

        const domWidthPx = containerElement.offsetWidth;
        const mmToPx = domWidthPx / pdfWidthMm;
        const pageHeightPx = pdfHeightMm * mmToPx;
        const usableHeightPx = usableHeightMm * mmToPx;
        const topPaddingPx = topPaddingMm * mmToPx;

        const blocks = Array.from(containerElement.querySelectorAll('.pdf-block')) as HTMLElement[];
        
        blocks.forEach(b => b.style.marginTop = '0px');
        void containerElement.offsetHeight;

        let absoluteY = topPaddingPx;
        let currentPageIndex = 0;

        blocks.forEach((block) => {
            const blockHeight = block.offsetHeight;
            const blockMarginBottom = parseFloat(window.getComputedStyle(block).marginBottom) || 0;
            const totalBlockHeight = blockHeight + blockMarginBottom;

            const pageBottomLimit = (currentPageIndex * pageHeightPx) + topPaddingPx + usableHeightPx;

            if (absoluteY + totalBlockHeight > pageBottomLimit && currentPageIndex >= 0) {
                currentPageIndex++;
                const targetY = (currentPageIndex * pageHeightPx) + topPaddingPx;
                const marginToAdd = targetY - absoluteY;
                
                block.style.marginTop = `${marginToAdd}px`;
                absoluteY = targetY + totalBlockHeight;
            } else {
                absoluteY += totalBlockHeight;
            }
        });

        const canvas = await html2canvas(containerElement, { 
            scale: 1.5, 
            useCORS: true, 
            logging: false,
            backgroundColor: '#ffffff' 
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const ratio = canvas.width / canvas.height;
        const mappedHeight = pdfWidthMm / ratio;

        let heightLeft = mappedHeight;
        let position = 0;
        let currentPage = 1;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, mappedHeight);
        heightLeft -= pdfHeightMm;

        while (heightLeft > 0) {
            position -= pdfHeightMm;
            pdf.addPage();
            currentPage++;
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, mappedHeight);
            heightLeft -= pdfHeightMm;
        }

        const links = containerElement.querySelectorAll('a');
        const elementRect = containerElement.getBoundingClientRect();

        links.forEach((link) => {
            const linkRect = link.getBoundingClientRect();
            if (linkRect.width === 0 || linkRect.height === 0) return;
            
            const topInPx = linkRect.top - elementRect.top;
            const topInMm = (topInPx * mappedHeight) / elementRect.height;
            const sliceIndex = Math.floor(topInMm / pdfHeightMm);
            const topOnPage = topInMm - (sliceIndex * pdfHeightMm);

            const left = ((linkRect.left - elementRect.left) * pdfWidthMm) / elementRect.width;
            const width = (linkRect.width * pdfWidthMm) / elementRect.width;
            const linkH = (linkRect.height * mappedHeight) / elementRect.height;

            pdf.setPage(sliceIndex + 1);
            pdf.link(left, topOnPage, width, linkH, { url: link.href });
        });

        return pdf;
  };

  const handleExportPdf = async () => {
      if (!pdfRef.current) return;
      setIsExporting(true);
      try {
          const pdf = await generatePdfBase64(pdfRef.current);
          pdf.save(`OP-${format(new Date(), 'yyyyMMdd')}.pdf`);
          toast({ title: "PDF Exportado", description: "El archivo se ha descargado correctamente." });
      } catch (err) {
          console.error("Error exportando PDF:", err);
          toast({ title: "Error", description: "No se pudo generar el PDF.", variant: "destructive" });
      } finally {
          setIsExporting(false);
      }
  };

  const onInvalid = (errors: any) => {
      const missing = [];
      if (errors.clientId) missing.push("Cliente");
      if (errors.startDate || errors.endDate) missing.push("Fechas de Vigencia");
      if (errors.srlItems) missing.push("Falta seleccionar Programa en la tabla SRL");
      if (errors.sasItems) missing.push("Falta formato en tabla SAS");
      toast({ title: "Faltan datos obligatorios", description: `Por favor completa: ${missing.join(", ")}`, variant: "destructive" });
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
              toast({ title: "Falta Nombre", description: "Ingrese nombre para la nueva oportunidad", variant: "destructive"});
              setIsSubmitting(false); return;
          }
          finalOppId = await createQuickOpportunity(data.newOpportunityTitle, data.clientId, selectedClient?.denominacion || "Cliente", userInfo.id);
          oppTitle = data.newOpportunityTitle;
      } else if (!data.opportunityId) {
          toast({ title: "Falta Producto", description: "Seleccione una oportunidad o cree una nueva", variant: "destructive"});
          setIsSubmitting(false); return;
      } else {
          const existingOpp = opportunities.find(o => o.id === finalOppId);
          oppTitle = existingOpp?.title || "Sin Asignar";
      }

      const validSrlItems = data.srlItems.filter(item => {
          if (!item.month) return false;
          const itemDate = new Date(`${item.month}-02`); 
          const start = startOfMonth(data.startDate);
          const end = endOfMonth(data.endDate);
          return isWithinInterval(itemDate, { start, end });
      });

      const preview = getPreviewOrder();
      const orderPayload = {
        ...preview,
        clientId: data.clientId,
        clientName: selectedClient?.denominacion || "Desconocido",
        agencyId: data.agencyId === "none" ? undefined : data.agencyId,
        agencyName: data.agencyId === "none" ? undefined : selectedAgency?.name,
        opportunityId: finalOppId,
        opportunityTitle: oppTitle,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        srlItems: validSrlItems,
        sasItems: data.sasItems,
        billingRequests: data.billingRequests, 
        id: undefined 
      };

      const cleanPayload = JSON.parse(JSON.stringify(orderPayload));

      let finalOrderId = editModeId;

      if (editModeId) {
          await updateAdvertisingOrder(editModeId, cleanPayload, userInfo.id, userInfo.name);
      } else {
          finalOrderId = await createAdvertisingOrder(cleanPayload);
      }

      if (pdfRef.current && finalOrderId) {
          const accessToken = await getGoogleAccessToken();
          if (accessToken) {
              try {
                  const pdf = await generatePdfBase64(pdfRef.current);
                  const pdfBase64 = pdf.output('datauristring').split(',')[1];
                  const baseUrl = window.location.origin;
                  const detailLink = `${baseUrl}/publicidad/${finalOrderId}`;
                  
                  const emailBody = `
                      <div style="font-family: Arial, sans-serif; color: #333;">
                          <h2 style="color: #1d4ed8;">Orden de Publicidad ${editModeId ? 'Editada' : 'Registrada'}</h2>
                          <p>El ejecutivo <strong>${userInfo!.name}</strong> ha ${editModeId ? 'actualizado' : 'cargado'} una orden.</p>
                          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #1d4ed8; margin: 20px 0;">
                              <p><strong>Cliente:</strong> ${selectedClient?.denominacion || 'Desconocido'}</p>
                              <p><strong>Producto:</strong> ${oppTitle}</p>
                              <p><strong>Vigencia:</strong> ${format(new Date(data.startDate), "dd/MM/yyyy")} al ${format(new Date(data.endDate), "dd/MM/yyyy")}</p>
                          </div>
                          <p>Puede ver el detalle ingresando al siguiente enlace:</p>
                          <p><a href="${detailLink}">Ver Detalles de la Orden</a></p>
                      </div>
                  `;

                  await sendEmail({
                      accessToken,
                      to: ['lchena@airedesantafe.com.ar', /* 'alucca@airedesantafe.com.ar', 'materiales@airedesantafe.com.ar' */, ${userInfo!.email}], 
                      subject: `${editModeId ? 'Modificación' : 'Nueva'} OP: ${oppTitle} - ${selectedClient?.denominacion}`,
                      body: emailBody,
                      attachments: [{
                          filename: `OP_${oppTitle.replace(/ /g, "_")}.pdf`,
                          content: pdfBase64,
                          encoding: 'base64'
                      }]
                  });
              } catch (emailErr) {
                  console.error("Error al enviar correo de la orden:", emailErr);
              }
          }
      }

      toast({ title: "Guardado", description: "Orden guardada exitosamente." });
      router.push(`/publicidad`);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8 pb-10">
        
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
            <AdvertisingOrderPdf ref={pdfRef} order={getPreviewOrder()} programs={programs} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 border rounded-md bg-white shadow-sm">
          <FormField control={form.control} name="clientId" render={({ field }) => (
              <FormItem><FormLabel>Anunciante (Cliente) <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={(val) => { field.onChange(val); setValue("opportunityId", ""); }} value={field.value || undefined}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                  <SelectContent>{clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>))}</SelectContent>
                </Select>
              <FormMessage /></FormItem>
            )} />
          <FormField control={form.control} name="agencyId" render={({ field }) => (
              <FormItem><FormLabel>Agencia</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="none">Ninguna</SelectItem>{agencies.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}</SelectContent>
                </Select>
              </FormItem>
            )} />
          <div className="col-span-1">
             <FormField control={form.control} name="opportunityId" render={({ field }) => (
                  <FormItem><FormLabel>Producto (Oportunidad) <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); setIsNewOpp(val === "new_custom_opportunity"); }} value={field.value || undefined}>
                      <FormControl><SelectTrigger><SelectValue placeholder={opportunities.length === 0 ? "Sin oportunidades" : "Seleccionar"} /></SelectTrigger></FormControl>
                      <SelectContent>
                         {opportunities.map(opp => (<SelectItem key={opp.id} value={opp.id}>{opp.title} ({opp.stage})</SelectItem>))}
                         <SelectItem value="new_custom_opportunity" className="font-bold text-blue-600">+ Crear Nueva</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              {isNewOpp && (<FormField control={form.control} name="newOpportunityTitle" render={({ field }) => (<div className="mt-2"><Input placeholder="Nombre del producto *" {...field} /></div>)} />)}
          </div>
          <FormField control={form.control} name="accountExecutive" render={({ field }) => (<FormItem><FormLabel>Ejecutivo</FormLabel><FormControl><Input {...field} readOnly /></FormControl></FormItem>)} />
        </div>

        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b"><h3 className="text-lg font-semibold text-slate-800">AIRE SRL</h3></div>
          <div className="p-4 grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
               <FormField control={form.control} name="tangoOrderNo" render={({ field }) => (<FormItem><FormLabel>Orden Tango</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
               <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Inicio <span className="text-red-500">*</span></FormLabel>
                    <Popover>
                      <PopoverTrigger asChild><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Fecha</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date("1900-01-01")} initialFocus /></PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
               <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Fin <span className="text-red-500">*</span></FormLabel>
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
               <FormField control={form.control} name="materialUrl" render={({ field }) => (<FormItem className="col-span-4"><FormLabel>Link de Materiales (Drive/URL)</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl></FormItem>)} />
               <FormField control={form.control} name="certReq" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Solicita Cert.</FormLabel></FormItem>)} />
               <FormField control={form.control} name="agencySale" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Venta Agencia</FormLabel></FormItem>)} />
               {agencySale && (<FormField control={form.control} name="commissionSrl" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Comisión (%)</FormLabel><FormControl><Input type="number" {...field} onChange={e=>field.onChange(parseFloat(e.target.value)||0)}/></FormControl></FormItem>)} />)}
            </div>

            <div className="grid grid-cols-1">
                <FormField control={form.control} name="observations" render={({ field }) => (<FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea className="h-10 resize-none" {...field} /></FormControl></FormItem>)} />
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

        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b"><h3 className="text-lg font-semibold text-slate-800">AIRE SAS</h3></div>
          <div className="p-4"><SasSection form={form} /></div>
        </div>

        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b">
                <h3 className="text-lg font-semibold text-slate-800">Fechas de Facturación (Administración)</h3>
            </div>
            <div className="p-4 space-y-4">
                {brFields.map((field, index) => (
                    <div key={field.id} className="flex gap-4 items-end bg-slate-50 p-3 rounded-md border border-slate-200">
                        <FormField control={form.control} name={`billingRequests.${index}.date`} render={({field}) => (
                            <FormItem className="flex-1">
                                <FormLabel>Fecha a Facturar</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequests.${index}.amount`} render={({field}) => (
                            <FormItem className="flex-1">
                                <FormLabel>Monto a Facturar</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <Button type="button" variant="ghost" className="text-red-500 mb-0.5 hover:bg-red-100" onClick={() => brRemove(index)}>
                            <Trash2 className="h-5 w-5"/>
                        </Button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => brAppend({ date: '', amount: 0 })}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar fecha de facturación
                </Button>
            </div>
        </div>

        <div className="flex justify-between items-center pt-6 border-t mt-8 gap-4">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
             <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
          
          <div className="flex gap-4">
            <Button 
              type="button" 
              variant="outline" 
              size="lg" 
              onClick={handleExportPdf}
              disabled={isExporting || !showSrlSection}
            >
               {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
               {isExporting ? "Generando..." : "Exportar PDF"}
            </Button>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> {editModeId ? 'Guardar Cambios' : 'Guardar Pedido'}</>}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
