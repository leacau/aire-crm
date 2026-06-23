"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, differenceInDays, isValid, addMonths } from "date-fns";
import { CalendarIcon, Save, FileDown, Loader2, ArrowLeft, Plus, Trash2, Mic, MicOff, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { advertisingOrderSchema, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

import { 
    createAdvertisingOrder, 
    getClients, 
    getAgencies, 
    getPrograms, 
    getOpportunitiesByClientId, 
    getAdvertisingOrder,
    updateAdvertisingOrder,
    getBillingRequestsByOrder,
    getAllUsers,
    getWorkflowAssignments
} from "@/lib/firebase-service";
import { Client, Agency, AdvertisingOrder, User, ApprovalStatus, Opportunity } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { sendEmail } from "@/lib/google-gmail-service";
import { hasManagementPrivileges } from "@/lib/role-utils";

import { SrlSection } from "./srl-section";
import { SasSection } from "./sas-section";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientCombobox } from "@/components/clients/client-combobox";
import dynamic from "next/dynamic";

const AdvertisingOrderPdf = dynamic(
  () => import("./advertising-pdf").then(mod => mod.AdvertisingOrderPdf),
  { ssr: false }
);

const spanishMonths: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const spanishNumbers: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

const weekdayByText: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  domingo: 7,
};

const normalizeVoiceText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseSpanishDateText = (input: string): Date | null => {
  const normalized = normalizeVoiceText(input)
    .replace(/^el\s+/, "")
    .replace(/\bdel\b/g, "de")
    .replace(/\bprimero\b/g, "1");
  const match = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = spanishMonths[match[2]];
  const year = Number(match[3]);
  if (!day || month === undefined || !year) return null;
  const date = new Date(year, month, day);
  return isValid(date) ? date : null;
};

export function AdvertisingForm() {
  const { toast } = useToast();
  const { userInfo, getGoogleAccessToken } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfMounted, setIsPdfMounted] = useState(false);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [programs, setPrograms] = useState<any[]>([]); 
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [users, setUsers] = useState<User[]>([]); 

  const [isLoadingData, setIsLoadingData] = useState(true);

  const [editModeId, setEditModeId] = useState<string | null>(null);
  
  const [isRestored, setIsRestored] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [notifyOnSave, setNotifyOnSave] = useState(true); 
  
  const [invoiceCountSrl, setInvoiceCountSrl] = useState(1);
  const [invoiceCountSas, setInvoiceCountSas] = useState(1);
  // 🟢 CONTADOR DE CUOTAS PARA AVIÓN
  const [invoiceCountAvion, setInvoiceCountAvion] = useState(1);
  
  const [materialUrls, setMaterialUrls] = useState<string[]>(['']);
  const [orderCreatedBy, setOrderCreatedBy] = useState<string>('');
  const [voiceCommand, setVoiceCommand] = useState('');
  const [isListeningVoice, setIsListeningVoice] = useState(false);

  const [wasApproved, setWasApproved] = useState(false);
  const [modificationReason, setModificationReason] = useState('');

  const pdfRef = useRef<HTMLDivElement>(null);

  const canReassign = userInfo && (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion' || userInfo.role === 'Admin');

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
      billingRequestsSrl: [], 
      billingRequestsSas: [], 
      billingRequestsAvion: [], 
      canjeId: "",
      event: "",
      startDate: undefined,
      endDate: undefined,
    },
  });

  const { fields: brFieldsSrl, append: brAppendSrl, remove: brRemoveSrl, replace: brReplaceSrl } = useFieldArray({
      control: form.control,
      name: "billingRequestsSrl"
  });

  const { fields: brFieldsSas, append: brAppendSas, remove: brRemoveSas, replace: brReplaceSas } = useFieldArray({
      control: form.control,
      name: "billingRequestsSas"
  });

  // 🟢 VÍNCULO DE CAMPO PARA SUGERENCIAS EN AVIÓN
  const { fields: brFieldsAvion, append: brAppendAvion, remove: brRemoveAvion, replace: brReplaceAvion } = useFieldArray({
      control: form.control,
      name: "billingRequestsAvion"
  });

  const { watch, setValue, getValues } = form;
  const values = watch();
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const agencySale = watch("agencySale");
  const selectedClientId = watch("clientId");
  const srlItemsCurrent = watch("srlItems");
  const sasItemsCurrent = watch("sasItems");

  const keepWonOpportunities = useCallback((items: Opportunity[]) =>
      items.filter(opportunity => opportunity.stage === 'Cerrado - Ganado'), []);

  const getCampaignDateKeys = useCallback((start?: Date, end?: Date) => {
      if (!start || !end || !isValid(start) || !isValid(end) || end < start) return new Set<string>();
      const keys = new Set<string>();
      const cursor = new Date(start);
      while (cursor <= end) {
          keys.add(format(cursor, 'yyyy-MM-dd'));
          cursor.setDate(cursor.getDate() + 1);
      }
      return keys;
  }, []);

  const cleanDailySpotsForRange = useCallback((dailySpots: Record<string, unknown> | undefined, validKeys: Set<string>) => {
      return Object.entries(dailySpots || {}).reduce((acc, [dateKey, value]) => {
          const numericValue = Number(value) || 0;
          if (validKeys.has(dateKey) && numericValue > 0) acc[dateKey] = numericValue;
          return acc;
      }, {} as Record<string, number>);
  }, []);

  const normalizeSrlItemsForRange = useCallback((items: AdvertisingOrderFormValues['srlItems'] = [], start?: Date, end?: Date) => {
      const validKeys = getCampaignDateKeys(start, end);
      return items
          .map(item => ({ ...item, dailySpots: cleanDailySpotsForRange(item.dailySpots, validKeys) }))
          .filter(item => item.month && Object.keys(item.dailySpots || {}).length > 0 || item.programId || item.adType);
  }, [cleanDailySpotsForRange, getCampaignDateKeys]);

  useEffect(() => {
    if (userInfo?.name && !editModeId && !draftLoaded) {
        setValue("accountExecutive", userInfo.name);
        setOrderCreatedBy(userInfo.id);
    }
    const loadData = async () => {
      try {
        const [clientsData, agenciesData, programsData] = await Promise.all([
          getClients(), getAgencies(), getPrograms()
        ]);
        if (clientsData && typeof clientsData === 'object' && 'clients' in clientsData) setClients((clientsData as { clients: Client[] }).clients);
        else if (Array.isArray(clientsData)) setClients(clientsData as Client[]);
        setAgencies(agenciesData);
        setPrograms(programsData);

        if (canReassign) {
            const allUsers = await getAllUsers();
            setUsers(allUsers);
        }

      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [userInfo, setValue, editModeId, draftLoaded, canReassign]);

  useEffect(() => {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      const cloneId = params.get('cloneId');
      const editId = params.get('editId');
      const urlClientId = params.get('clientId');
      const urlOppId = params.get('opportunityId');
      const urlCanjeId = params.get('canjeId');

      const idToFetch = cloneId || editId;

      if (idToFetch) {
          if (editId) setEditModeId(editId);

          getAdvertisingOrder(idToFetch).then(async order => {
              if (order) {
                  if (editId && (
                      order.status === 'Aprobado'
                      || (order.approvalHistory || []).some(item => item.status === 'Aprobado')
                  )) {
                      setWasApproved(true);
                      setNotifyOnSave(true);
                  }

                  if (order.clientId) {
                      getOpportunitiesByClientId(order.clientId).then(items => setOpportunities(keepWonOpportunities(items)));
                  }

                  let fetchedBillingRequestsSrl: any[] = [];
                  let fetchedBillingRequestsSas: any[] = [];
                  let fetchedBillingRequestsAvion: any[] = [];
                  
                  if (editId) {
                      const brs = await getBillingRequestsByOrder(idToFetch);
                      
                      brs.forEach(b => {
                          const mapped = { 
                              date: b.date, 
                              grossAmount: b.grossAmount || 0,
                              adjustment: b.adjustment || 0,
                              amount: b.amount || 0,
                              paymentType: b.paymentType || "Se paga",
                              canjeDescription: b.canjeDescription || ""
                          };

                          const billingCompany = String(b.company || '');
                          if (billingCompany === 'SRL') {
                              fetchedBillingRequestsSrl.push(mapped);
                          } else if (billingCompany === 'SAS') {
                              fetchedBillingRequestsSas.push({ ...mapped, ivaSas: b.ivaSas || 0 });
                          } else if (billingCompany === 'AVIÓN' || billingCompany === 'AVION') {
                              fetchedBillingRequestsAvion.push(mapped);
                          }
                      });

                      fetchedBillingRequestsSrl.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                      fetchedBillingRequestsSas.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                      fetchedBillingRequestsAvion.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  }
                  
                  setMaterialUrls(order.materialUrls?.length ? order.materialUrls : (order.materialUrl ? [order.materialUrl] : ['']));
                  setOrderCreatedBy(order.createdBy || userInfo?.id || '');

                  form.reset({
                      clientId: order.clientId,
                      canjeId: order.canjeId || "",
                      agencyId: order.agencyId || "none",
                      opportunityId: order.opportunityId,
                      newOpportunityTitle: "",
                      product: order.product || "",
                      event: order.event || "",
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
                      billingRequestsSrl: fetchedBillingRequestsSrl,
                      billingRequestsSas: fetchedBillingRequestsSas,
                      // @ts-ignore
                      billingRequestsAvion: fetchedBillingRequestsAvion
                  });
              }
              setIsRestored(true);
          });
      } else if (urlClientId) {
           form.setValue("clientId", urlClientId);
           if (urlCanjeId) form.setValue("canjeId", urlCanjeId);
           if (urlOppId) form.setValue("opportunityId", urlOppId);
           getOpportunitiesByClientId(urlClientId).then(items => setOpportunities(keepWonOpportunities(items)));
           setIsRestored(true);
      } else {
          const draft = localStorage.getItem('advertising_order_draft');
          if (draft) {
              try {
                  const parsed = JSON.parse(draft);
                   if (parsed.startDate) parsed.startDate = new Date(parsed.startDate);
                   if (parsed.endDate) parsed.endDate = new Date(parsed.endDate);
                   if (parsed.materialUrls) setMaterialUrls(parsed.materialUrls);
                   if (parsed.createdBy) setOrderCreatedBy(parsed.createdBy);
                   form.reset(parsed);
                  setDraftLoaded(true);
                  toast({ title: "Borrador recuperado", description: "Se han restaurado los datos." });
              } catch (e) {
                  console.error("Error recuperando borrador", e);
              }
          }
          setIsRestored(true);
      }
  }, [form, toast, userInfo, keepWonOpportunities]);

  useEffect(() => {
      if (!isRestored || editModeId) return;
      localStorage.setItem('advertising_order_draft', JSON.stringify({ ...values, materialUrls, createdBy: orderCreatedBy }));
  }, [values, materialUrls, isRestored, editModeId, orderCreatedBy]);

  const handleClearDraft = () => {
      if (!window.confirm("¿Seguro que quieres limpiar todo el formulario para empezar de cero?")) return;
      localStorage.removeItem('advertising_order_draft');
      setMaterialUrls(['']);
      setOrderCreatedBy(userInfo?.id || '');
      form.reset({
          accountExecutive: userInfo?.name || "",
          materialSent: false, materialUrl: "", certReq: false, agencySale: false,
          commissionSrl: 0, adjustmentSrl: 0, adjustmentSas: 0,
          srlItems: [], sasItems: [], billingRequestsSrl: [], billingRequestsSas: [], billingRequestsAvion: [],
          startDate: undefined, endDate: undefined, clientId: "", canjeId: "", agencyId: "none", opportunityId: "", newOpportunityTitle: "", product: "", event: "", tangoOrderNo: "", observations: ""
      });
      setDraftLoaded(false);
      toast({ title: "Borrador limpiado" });
  };

  useEffect(() => {
    if (!selectedClientId) { setOpportunities([]); return; }
    const fetchOpps = async () => {
        try {
            const opps = await getOpportunitiesByClientId(selectedClientId);
            setOpportunities(keepWonOpportunities(opps));
        } catch (error) { console.error(error); }
    };
    fetchOpps();
  }, [selectedClientId, keepWonOpportunities]);

  useEffect(() => {
      if (!isRestored || !startDate || !endDate || !isValid(startDate) || !isValid(endDate)) return;
      const currentItems = form.getValues("srlItems") || [];
      const normalizedItems = normalizeSrlItemsForRange(currentItems, startDate, endDate);
      if (JSON.stringify(currentItems) !== JSON.stringify(normalizedItems)) {
          setValue("srlItems", normalizedItems, { shouldDirty: true, shouldValidate: true });
      }
  }, [startDate, endDate, isRestored, form, setValue, normalizeSrlItemsForRange]);

  useEffect(() => {
      if (isRestored && srlItemsCurrent?.length === 0) {
          if (values.adjustmentSrl !== 0) setValue("adjustmentSrl", 0);
          if (values.billingRequestsSrl?.length > 0) setValue("billingRequestsSrl", []);
      }
      if (isRestored && sasItemsCurrent?.length === 0) {
          if (values.adjustmentSas !== 0) setValue("adjustmentSas", 0);
          if (values.billingRequestsSas?.length > 0) setValue("billingRequestsSas", []);
      }
  }, [srlItemsCurrent, sasItemsCurrent, isRestored, values.adjustmentSrl, values.adjustmentSas, values.billingRequestsSrl?.length, values.billingRequestsSas?.length, setValue]);

  const handleAddMaterialUrl = () => setMaterialUrls([...materialUrls, '']);
  const handleMaterialUrlChange = (index: number, value: string) => {
      const newUrls = [...materialUrls];
      newUrls[index] = value;
      setMaterialUrls(newUrls);
  };
  const handleRemoveMaterialUrl = (index: number) => {
      const newUrls = materialUrls.filter((_, i) => i !== index);
      setMaterialUrls(newUrls.length ? newUrls : ['']);
  };

  const findProgramFromCommand = useCallback((command: string) => {
      const normalizedCommand = normalizeVoiceText(command);
      return [...programs]
          .filter(program => program?.name)
          .sort((a, b) => String(b.name).length - String(a.name).length)
          .find(program => normalizedCommand.includes(normalizeVoiceText(String(program.name))));
  }, [programs]);

  const getCommandWeekdays = (normalizedCommand: string) => {
      if (/\b(por dia|por día|todos los dias|todos los días|diario|diaria)\b/.test(normalizedCommand)) {
          return [1, 2, 3, 4, 5, 6, 7];
      }
      const days = Object.entries(weekdayByText)
          .filter(([dayName]) => normalizedCommand.includes(dayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
          .map(([, dayValue]) => dayValue);
      return Array.from(new Set(days));
  };

  const getActionTypeFromCommand = (normalizedCommand: string) => {
      if (/\bnota comercial\b/.test(normalizedCommand)) return "Nota Comercial";
      if (/\bauspicios?\b/.test(normalizedCommand)) return "Auspicio";
      if (/\bmicro\b/.test(normalizedCommand)) return "Micro";
      if (/\bsorteo\b/.test(normalizedCommand)) return "Sorteo";
      if (/\bjuego\b/.test(normalizedCommand)) return "Juego";
      if (/\bpnt\b/.test(normalizedCommand)) return "PNT";
      if (/\bspot\b/.test(normalizedCommand)) return "Spot";
      return null;
  };

  const getRepetitionCountFromCommand = (normalizedCommand: string, actionType: string) => {
      const actionWord = normalizeVoiceText(actionType).split(" ")[0];
      const numericBeforeAction = normalizedCommand.match(new RegExp(`(\\d+)\\s+${actionWord}s?\\b`));
      if (numericBeforeAction) return Math.max(1, Number(numericBeforeAction[1]) || 1);

      const wordBeforeAction = normalizedCommand.match(new RegExp(`\\b(${Object.keys(spanishNumbers).join("|")})\\s+${actionWord}s?\\b`));
      if (wordBeforeAction) return spanishNumbers[wordBeforeAction[1]] || 1;

      const numericBeforeDay = normalizedCommand.match(/(\d+)\s+(?:por dia|por día|diarios|diarias)/);
      if (numericBeforeDay) return Math.max(1, Number(numericBeforeDay[1]) || 1);

      return 1;
  };

  const getRateForVoiceItem = useCallback((program: any, actionType: string, hasTv: boolean) => {
      const rates = program?.rates || {};
      if (actionType === "Spot") return hasTv ? (rates.spotTv || 0) : (rates.spotRadio || 0);
      if (actionType === "PNT") return hasTv ? (rates.pntMasBarrida || 0) : (rates.pnt || 0);
      if (actionType === "Auspicio") return rates.auspicio || rates.Auspicio || 0;
      if (actionType === "Nota Comercial") return rates.notaComercial || rates["Nota Comercial"] || 0;
      return rates[actionType] || 0;
  }, []);

  const applyVoiceCommand = useCallback((rawCommand?: string) => {
      const command = (rawCommand || voiceCommand).trim();
      if (!command) {
          toast({ title: "No hay instrucción", description: "Dictá o escribí un comando para aplicarlo.", variant: "destructive" });
          return;
      }

      const normalizedCommand = normalizeVoiceText(command);
      const dateMatch = normalizedCommand.match(/(?:desde|del)\s+(.+?)\s+(?:al|hasta)\s+(.+)$/);
      if (dateMatch && /(periodo|período|fecha|vigencia|rango|desde|del)/.test(normalizedCommand)) {
          const parsedStart = parseSpanishDateText(dateMatch[1]);
          const parsedEnd = parseSpanishDateText(dateMatch[2]);
          if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
              toast({ title: "No pude entender el período", description: "Probá: desde el primero de mayo de 2026 al 31 de agosto de 2026.", variant: "destructive" });
              return;
          }
          setValue("startDate", parsedStart, { shouldDirty: true, shouldValidate: true });
          setValue("endDate", parsedEnd, { shouldDirty: true, shouldValidate: true });
          toast({ title: "Período cargado", description: `${format(parsedStart, "dd/MM/yyyy")} al ${format(parsedEnd, "dd/MM/yyyy")}` });
          setVoiceCommand("");
          return;
      }

      const program = findProgramFromCommand(command);
      const actionType = getActionTypeFromCommand(normalizedCommand);
      if (!program || !actionType) {
          toast({
              title: "No pude armar la pauta",
              description: "Necesito reconocer un programa y una acción. Ej: cargá un spot de 20 segundos todos los martes en Ahora Vengo.",
              variant: "destructive",
          });
          return;
      }

      const currentStart = form.getValues("startDate");
      const currentEnd = form.getValues("endDate");
      if (!currentStart || !currentEnd || !isValid(currentStart) || !isValid(currentEnd) || currentEnd < currentStart) {
          toast({ title: "Falta el período", description: "Primero cargá fecha de inicio y fin de la orden.", variant: "destructive" });
          return;
      }

      const weekdays = getCommandWeekdays(normalizedCommand);
      if (weekdays.length === 0) {
          toast({ title: "Faltan días", description: "Indicá todos los días, por día, o días específicos como martes y jueves.", variant: "destructive" });
          return;
      }

      const secondsMatch = normalizedCommand.match(/(\d+)\s*(?:segundos|seg|")/);
      const seconds = actionType === "Spot" ? Number(secondsMatch?.[1] || 0) : 0;
      if (actionType === "Spot" && seconds <= 0) {
          toast({ title: "Faltan segundos", description: "Para spots indicá la duración, por ejemplo: spot de 20 segundos.", variant: "destructive" });
          return;
      }

      const repetitions = getRepetitionCountFromCommand(normalizedCommand, actionType);
      const dailySpots: Record<string, number> = {};
      const cursor = new Date(currentStart);
      while (cursor <= currentEnd) {
          const jsDay = cursor.getDay();
          const isoDay = jsDay === 0 ? 7 : jsDay;
          if (weekdays.includes(isoDay)) {
              dailySpots[format(cursor, "yyyy-MM-dd")] = repetitions;
          }
          cursor.setDate(cursor.getDate() + 1);
      }

      if (Object.keys(dailySpots).length === 0) {
          toast({ title: "No hay fechas para esa pauta", description: "El rango cargado no contiene los días indicados.", variant: "destructive" });
          return;
      }

      const hasTv = /\b(tv|tele|pantalla|barrida)\b/.test(normalizedCommand);
      const nextItems = [
          ...(form.getValues("srlItems") || []),
          {
              month: "Mensual",
              programId: program.id,
              adType: actionType,
              hasTv,
              seconds,
              dailySpots,
              unitRate: getRateForVoiceItem(program, actionType, hasTv),
          },
      ];
      setValue("srlItems", nextItems, { shouldDirty: true, shouldValidate: true });
      toast({
          title: "Pauta cargada",
          description: `${actionType} en ${program.name}: ${Object.keys(dailySpots).length} día(s), ${repetitions} por día.`,
      });
      setVoiceCommand("");
  }, [findProgramFromCommand, form, getRateForVoiceItem, setValue, toast, voiceCommand]);

  const startVoiceInput = () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
          toast({ title: "Dictado no disponible", description: "Tu navegador no permite reconocimiento de voz aquí. Podés escribir el comando y aplicarlo.", variant: "destructive" });
          return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "es-AR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListeningVoice(true);
      recognition.onerror = () => {
          setIsListeningVoice(false);
          toast({ title: "No se pudo escuchar", description: "Revisá permisos de micrófono o escribí el comando manualmente.", variant: "destructive" });
      };
      recognition.onend = () => setIsListeningVoice(false);
      recognition.onresult = (event: any) => {
          const transcript = String(event.results?.[0]?.[0]?.transcript || "");
          setVoiceCommand(transcript);
          applyVoiceCommand(transcript);
      };
      recognition.start();
  };

  const daysCount = (startDate && endDate && isValid(startDate) && isValid(endDate))
    ? Math.max(0, differenceInDays(endDate, startDate) + 1) : 0;

  let totalMonthsCycle = 0;
  if (startDate && endDate && isValid(startDate) && isValid(endDate) && endDate >= startDate) {
      let current = new Date(startDate);
      while (current <= endDate) {
          totalMonthsCycle++;
          current = addMonths(current, 1);
      }
  }

  useEffect(() => {
      if (!isRestored || editModeId || totalMonthsCycle < 1) return;
      setInvoiceCountSrl(totalMonthsCycle);
      setInvoiceCountSas(totalMonthsCycle);
      setInvoiceCountAvion(totalMonthsCycle);
  }, [totalMonthsCycle, isRestored, editModeId]);

  const showSections = startDate && endDate && isValid(startDate) && isValid(endDate) && (endDate >= startDate);

  const srlItemsValid = normalizeSrlItemsForRange(values.srlItems, startDate, endDate).filter(item => item.month) || [];
  const sasItemsValid = values.sasItems?.filter(item => item.month) || [];

  const srlSubtotal = srlItemsValid.reduce((acc, item) => {
    const totalAds = Object.values(item.dailySpots || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
    return acc + ((item.unitRate || 0) * totalAds * multiplier);
  }, 0) || 0;

  const sasSubtotal = sasItemsValid.reduce((acc, item) => {
    let net = 0;
    if (item.format === "Banner") net = (item.cpm || 0) * (item.unitRate || 0);
    else net = (item.unitRate || 0);
    return acc + net;
  }, 0) || 0;

  const srlAdjustment = values.adjustmentSrl || 0;
  const totalOrderSrlNet = srlSubtotal - srlAdjustment;
  const hasSrl = srlItemsValid.length > 0;

  const sasAdjustment = values.adjustmentSas || 0;
  const sasIva = (sasSubtotal - sasAdjustment) * 0.05;
  const totalOrderSasNet = sasSubtotal - sasAdjustment + sasIva;
  const hasSas = sasItemsValid.length > 0;

  const handleGenerateBillingSrl = () => {
      if (invoiceCountSrl < 1) return;
      const campaignGross = srlSubtotal * Math.max(1, totalMonthsCycle);
      const campaignAdj = srlAdjustment * Math.max(1, totalMonthsCycle);
      const campaignNet = totalOrderSrlNet * Math.max(1, totalMonthsCycle);
      const invGross = campaignGross / invoiceCountSrl;
      const invAdj = campaignAdj / invoiceCountSrl;
      const invNet = campaignNet / invoiceCountSrl;
      const newBrs = [];
      let curDate = startDate && isValid(startDate) ? new Date(startDate) : new Date();
      for (let i = 0; i < invoiceCountSrl; i++) {
          newBrs.push({ date: format(curDate, 'yyyy-MM-dd'), grossAmount: Number(invGross.toFixed(2)), adjustment: Number(invAdj.toFixed(2)), amount: Number(invNet.toFixed(2)), paymentType: 'Se paga', canjeDescription: '' });
          curDate = addMonths(curDate, 1);
      }
      setValue("billingRequestsSrl", newBrs, { shouldValidate: true });
  };

  const handleGenerateBillingSas = () => {
      if (invoiceCountSas < 1) return;
      const campaignGross = sasSubtotal * Math.max(1, totalMonthsCycle);
      const campaignAdj = sasAdjustment * Math.max(1, totalMonthsCycle);
      const campaignIva = sasIva * Math.max(1, totalMonthsCycle);
      const campaignNet = totalOrderSasNet * Math.max(1, totalMonthsCycle);
      const invGross = campaignGross / invoiceCountSas;
      const invAdj = campaignAdj / invoiceCountSas;
      const invIva = campaignIva / invoiceCountSas;
      const invNet = campaignNet / invoiceCountSas;
      const newBrs = [];
      let curDate = startDate && isValid(startDate) ? new Date(startDate) : new Date();
      for (let i = 0; i < invoiceCountSas; i++) {
          newBrs.push({ date: format(curDate, 'yyyy-MM-dd'), grossAmount: Number(invGross.toFixed(2)), adjustment: Number(invAdj.toFixed(2)), ivaSas: Number(invIva.toFixed(2)), amount: Number(invNet.toFixed(2)), paymentType: 'Se paga', canjeDescription: '' });
          curDate = addMonths(curDate, 1);
      }
      setValue("billingRequestsSas", newBrs, { shouldValidate: true });
  };

  // 🟢 GENERACIÓN DE LÍNEAS PARA AVIÓN
  const handleGenerateBillingAvion = () => {
      if (invoiceCountAvion < 1) return;
      const newBrs = [];
      let curDate = startDate && isValid(startDate) ? new Date(startDate) : new Date();
      for (let i = 0; i < invoiceCountAvion; i++) {
          newBrs.push({ date: format(curDate, 'yyyy-MM-dd'), grossAmount: 0, adjustment: 0, amount: 0, paymentType: 'Canje', canjeDescription: '' });
          curDate = addMonths(curDate, 1);
      }
      setValue("billingRequestsAvion", newBrs, { shouldValidate: true });
  };

  const sortSrlByDate = () => {
      const current = getValues("billingRequestsSrl");
      const sorted = [...current].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      brReplaceSrl(sorted);
  };

  const sortSasByDate = () => {
      const current = getValues("billingRequestsSas");
      const sorted = [...current].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      brReplaceSas(sorted);
  };

  // 🟢 ORDENAR TABLA AVIÓN
  const sortAvionByDate = () => {
      const current = getValues("billingRequestsAvion") || [];
      const sorted = [...current].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      brReplaceAvion(sorted);
  };

  const updateRowNetSrl = (index: number) => {
      setTimeout(() => {
          const row = form.getValues(`billingRequestsSrl.${index}`);
          if (!row) return;
          const gross = parseFloat(row.grossAmount as any) || 0;
          const adj = parseFloat(row.adjustment as any) || 0;
          setValue(`billingRequestsSrl.${index}.amount`, gross - adj, { shouldValidate: true });
      }, 50);
  };

  const updateRowNetSas = (index: number) => {
      setTimeout(() => {
          const row = form.getValues(`billingRequestsSas.${index}`);
          if (!row) return;
          const gross = parseFloat(row.grossAmount as any) || 0;
          const adj = parseFloat(row.adjustment as any) || 0;
          const iva = (gross - adj) * 0.05; 
          setValue(`billingRequestsSas.${index}.ivaSas`, iva, { shouldValidate: true });
          setValue(`billingRequestsSas.${index}.amount`, gross - adj + iva, { shouldValidate: true });
      }, 50);
  };

  // 🟢 RECALCULAR FILA AVIÓN
  const updateRowNetAvion = (index: number) => {
      setTimeout(() => {
          const row = form.getValues(`billingRequestsAvion.${index}`);
          if (!row) return;
          const gross = parseFloat(row.grossAmount as any) || 0;
          const adj = parseFloat(row.adjustment as any) || 0;
          setValue(`billingRequestsAvion.${index}.amount`, gross - adj, { shouldValidate: true });
      }, 50);
  };

  const sumGrossSrl = values.billingRequestsSrl?.reduce((sum, item) => sum + (Number(item.grossAmount)||0), 0) || 0;
  const sumAdjSrl = values.billingRequestsSrl?.reduce((sum, item) => sum + (Number(item.adjustment)||0), 0) || 0;
  const sumNetSrl = values.billingRequestsSrl?.reduce((sum, item) => sum + (Number(item.amount)||0), 0) || 0;
  const campaignSrlGross = srlSubtotal * Math.max(1, totalMonthsCycle);
  const campaignSrlNet = totalOrderSrlNet * Math.max(1, totalMonthsCycle);
  const hasGrossErrorSrl = Math.abs(sumGrossSrl - campaignSrlGross) > 5; 
  const hasNetErrorSrl = Math.abs(sumNetSrl - campaignSrlNet) > 5;

  const sumGrossSas = values.billingRequestsSas?.reduce((sum, item) => sum + (Number(item.grossAmount)||0), 0) || 0;
  const sumAdjSas = values.billingRequestsSas?.reduce((sum, item) => sum + (Number(item.adjustment)||0), 0) || 0;
  const sumIvaSas = values.billingRequestsSas?.reduce((sum, item) => sum + (Number(item.ivaSas)||0), 0) || 0;
  const sumNetSas = values.billingRequestsSas?.reduce((sum, item) => sum + (Number(item.amount)||0), 0) || 0;
  const campaignSasGross = sasSubtotal * Math.max(1, totalMonthsCycle);
  const campaignSasNet = totalOrderSasNet * Math.max(1, totalMonthsCycle);
  const hasGrossErrorSas = Math.abs(sumGrossSas - campaignSasGross) > 5; 
  const hasNetErrorSas = Math.abs(sumNetSas - campaignSasNet) > 5;

  const getPreviewOrder = (): AdvertisingOrder => {
      const selectedClient = clients.find(c => c.id === values.clientId);
      const selectedAgency = agencies.find(a => a.id === values.agencyId);
      const selectedOpp = opportunities.find(o => o.id === values.opportunityId);
      const oppTitle = selectedOpp?.title;

      const safeStartDate = (values.startDate && isValid(values.startDate)) ? values.startDate.toISOString() : new Date().toISOString();
      const safeEndDate = (values.endDate && isValid(values.endDate)) ? values.endDate.toISOString() : new Date().toISOString();

      return {
          id: "preview",
          clientId: values.clientId || "",
          clientName: selectedClient?.razonSocial || selectedClient?.denominacion || "Cliente (Vista Previa)",
          agencyId: values.agencyId === "none" ? undefined : values.agencyId,
          agencyName: values.agencyId === "none" ? undefined : selectedAgency?.name,
          product: "", 
          event: values.event || undefined,
          opportunityId: values.opportunityId,
          opportunityTitle: oppTitle || "Campaña",
          accountExecutive: values.accountExecutive || userInfo?.name || "",
          createdAt: new Date().toISOString(),
          createdBy: orderCreatedBy || userInfo?.id || "",
          tangoOrderNo: values.tangoOrderNo,
          startDate: safeStartDate,
          endDate: safeEndDate,
          materialSent: values.materialSent || false,
          materialUrl: materialUrls[0] || "",
          materialUrls: materialUrls.filter(u => u.trim() !== ''),
          observations: values.observations,
          certReq: values.certReq || false,
          agencySale: values.agencySale || false,
          commissionSrl: values.commissionSrl || 0,
          srlItems: srlItemsValid,
          sasItems: sasItemsValid,
          adjustmentSrl: values.adjustmentSrl || 0,
          adjustmentSas: values.adjustmentSas || 0,
          totalSrl: totalOrderSrlNet,
          totalSas: totalOrderSasNet,
          totalOrder: totalOrderSrlNet + totalOrderSasNet,
          billingRequestsSrl: values.billingRequestsSrl,
          billingRequestsSas: values.billingRequestsSas,
          // @ts-ignore
          billingRequestsAvion: values.billingRequestsAvion
      };
  };

  const generatePdfBase64 = async (containerElement: HTMLElement) => {
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);
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
      flushSync(() => {
        setIsExporting(true);
        setIsPdfMounted(true);
      });
      try {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (!pdfRef.current) throw new Error("No se pudo preparar la vista del PDF.");
          const pdf = await generatePdfBase64(pdfRef.current);
          pdf.save(`OP-${format(new Date(), 'yyyyMMdd')}.pdf`);
          toast({ title: "PDF Exportado", description: "El archivo se ha descargado correctamente." });
      } catch (err) {
          console.error("Error exportando PDF:", err);
          toast({ title: "Error", description: "No se pudo generar el PDF.", variant: "destructive" });
      } finally {
          setIsExporting(false);
          setIsPdfMounted(false);
      }
  };

  const onInvalid = (errors: any) => {
      const missing = [];
      if (errors.clientId) missing.push("Cliente");
      if (errors.opportunityId) missing.push("Oportunidad Cerrado - Ganado");
      if (errors.startDate || errors.endDate) missing.push("Fechas de Vigencia");
      if (errors.observations) missing.push("Observaciones (Obligatorio por desajuste)");
      toast({ title: "Faltan datos", description: `Por favor completa: ${missing.join(", ")}`, variant: "destructive" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          if (e.target instanceof HTMLTextAreaElement) {
              return;
          }
          e.preventDefault();
      }
  };

  async function onSubmit(data: AdvertisingOrderFormValues) {
    if (!userInfo) return;
    setIsSubmitting(true);
    try {
      const selectedClient = clients.find(c => c.id === data.clientId);
      const selectedAgency = agencies.find(a => a.id === data.agencyId);
      
      const finalOppId = data.opportunityId;
      const existingOpp = opportunities.find(o => o.id === finalOppId);
      if (!existingOpp || existingOpp.stage !== 'Cerrado - Ganado') {
          toast({
              title: "Oportunidad no habilitada",
              description: "La orden solo puede vincularse a una oportunidad Cerrado - Ganado.",
              variant: "destructive"
          });
          setIsSubmitting(false);
          return;
      }
      const oppTitle = existingOpp.title;

      let targetStatus: ApprovalStatus = notifyOnSave ? 'Pendiente' : 'Borrador';

      if (wasApproved) {
          if (!modificationReason.trim()) {
              toast({ title: "Falta Justificación", description: "Debe indicar el motivo de la modificación del contrato.", variant: "destructive" });
              setIsSubmitting(false); return;
          }
          targetStatus = 'Pendiente de Modificación';
      }

      const historyItem = {
          timestamp: format(new Date(), 'dd/MM/yyyy HH:mm'),
          status: targetStatus,
          userId: userInfo.id,
          userName: userInfo.name,
          userRole: userInfo.role,
          comments: wasApproved ? `Modificación de Contrato: ${modificationReason.trim()}` : (editModeId ? 'Orden de publicidad corregida y reenviada para evaluación.' : 'Carga inicial enviada a revisión.')
      };

      const validSrlItems = normalizeSrlItemsForRange(data.srlItems, data.startDate, data.endDate);
      const validSasItems = data.sasItems;
      const preview = getPreviewOrder();
      
      const rawPayload: any = {
        ...preview,
        status: targetStatus,
        clientId: data.clientId,
        canjeId: data.canjeId || undefined,
        clientName: selectedClient?.razonSocial || selectedClient?.denominacion || "Desconocido",
        clientRazonSocial: selectedClient?.razonSocial || "",
        clientCuit: selectedClient?.cuit || "",
        agencyId: data.agencyId === "none" ? undefined : data.agencyId,
        agencyName: data.agencyId === "none" ? undefined : selectedAgency?.name,
        opportunityId: finalOppId,
        opportunityTitle: oppTitle,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        srlItems: validSrlItems,
        sasItems: validSasItems,
        billingRequestsSrl: data.billingRequestsSrl, 
        billingRequestsSas: data.billingRequestsSas,
        // @ts-ignore
        billingRequestsAvion: data.billingRequestsAvion,
        accountExecutive: data.accountExecutive,
        createdBy: orderCreatedBy || userInfo.id
      };

      const cleanPayload = JSON.parse(JSON.stringify(rawPayload));
      delete cleanPayload.id;

      if (editModeId) {
          await updateAdvertisingOrder(editModeId, cleanPayload, userInfo.id, userInfo.name, {
              modificationReason: wasApproved ? modificationReason : undefined,
              userRole: userInfo.role,
              historyItem,
          });
      } else {
          cleanPayload.approvalHistory = [historyItem];
          await createAdvertisingOrder(cleanPayload);
      }

      if (notifyOnSave) {
          const accessToken = await getGoogleAccessToken();
          if (accessToken) {
              try {
                  const clientDisplayName = selectedClient?.razonSocial || selectedClient?.denominacion || 'Desconocido';
                  const ownerUser = users.find(u => u.id === (cleanPayload.createdBy || orderCreatedBy));
                  const advisorDisplayName = ownerUser?.name || cleanPayload.accountExecutive || userInfo.name;
                  const advisorEmail = ownerUser?.email || (advisorDisplayName === userInfo.name ? userInfo.email : undefined);
                  const workflowAssignments = await getWorkflowAssignments();
                  const configuredApproverEmails = workflowAssignments.approvers
                      .map(userId => users.find(user => user.id === userId)?.email)
                      .filter((email): email is string => Boolean(email));
                  const recipients = configuredApproverEmails.length > 0
                      ? Array.from(new Set(configuredApproverEmails))
                      : ['materiales@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'lchena@airedesantafe.com.ar'];
                  const baseUrl = window.location.origin;
                  const emailSubject = wasApproved ? `REVISIÓN DE CONTRATO - Orden de Publicidad - ${clientDisplayName}` : `Pedido de Revisión de Orden de Publicidad - ${clientDisplayName}`;
                  const emailBody = `
                      <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
                          <p>El asesor <strong>${advisorDisplayName}</strong> cargó un pedido de revisión de una <strong>Orden de Publicidad</strong> para el cliente <strong>${clientDisplayName}</strong>.</p>
                          ${wasApproved ? `<div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 15px; margin: 15px 0;"><strong>Atención:</strong> Esta orden ya estaba aprobada y fue modificada.<br/><br/><strong>Motivo del Asesor:</strong> <i>"${modificationReason.trim()}"</i></div>` : ''}
                          <p>Para evaluar la pauta y ver los detalles completos en el Centro de Revisión, ingresa desde el siguiente enlace directo:</p>
                          <p style="margin-top: 15px;"><a href="${baseUrl}/approvals?tab=pending" style="display: inline-block; padding: 10px 20px; background-color: #1d4ed8; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">EVALUAR ORDEN DE PUBLICIDAD</a></p>
                      </div>
                  `;
                  
                  await sendEmail({
                      accessToken,
                      to: recipients,
                      subject: emailSubject,
                      body: emailBody,
                      fromName: advisorDisplayName,
                      fromEmail: userInfo.email,
                      replyTo: advisorEmail,
                  });
              } catch (emailErr) {}
          }
      }

      localStorage.removeItem('advertising_order_draft'); 
      toast({ 
        title: notifyOnSave ? "Enviado a Revisión" : "Guardado Provisorio", 
        description: notifyOnSave ? "Orden enviada a la bandeja de pendientes correctamente." : "Guardado en modo Borrador (No enviado)." 
      });
      router.push(`/publicidad`);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar la orden comercial.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) return <div className="p-8 text-center">Cargando...</div>;

  const ActionButtons = () => (
      <div className="flex flex-wrap items-center justify-between w-full gap-4">
          <div className="flex items-center gap-4">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                 <ArrowLeft className="mr-2 h-4 w-4" /> Volver
              </Button>
              {draftLoaded && !editModeId && (
                  <Button type="button" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={handleClearDraft}>
                      Limpiar Borrador
                  </Button>
              )}
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="outline" onClick={handleExportPdf} disabled={isExporting || !showSections}>
               {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
               {isExporting ? "Generando..." : "Exportar PDF"}
            </Button>
            <div className="flex items-center space-x-2 border rounded-md px-3 py-2 bg-white h-10">
                <Switch id="notify" checked={notifyOnSave} onCheckedChange={setNotifyOnSave} disabled={wasApproved} />
                <Label htmlFor="notify" className={cn("text-sm font-semibold", wasApproved ? "cursor-not-allowed" : "cursor-pointer")}>
                    {wasApproved ? "Reaprobación obligatoria" : "Pasar a aprobación"}
                </Label>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> {editModeId ? 'Guardar Cambios' : 'Guardar Pedido'}</>}
            </Button>
          </div>
      </div>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} onKeyDown={handleKeyDown} className="space-y-8 pb-10">
        
        <div className="bg-white p-4 border rounded-md shadow-sm">
            <ActionButtons />
        </div>

        {isPdfMounted && (
          <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
              <AdvertisingOrderPdf ref={pdfRef} order={getPreviewOrder()} programs={programs} />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 border rounded-md bg-white shadow-sm">
          <FormField control={form.control} name="clientId" render={({ field }) => (
              <FormItem><FormLabel>Anunciante (Cliente) <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <ClientCombobox
                    clients={clients}
                    value={field.value}
                    onChange={(val) => { field.onChange(val); setValue("opportunityId", ""); }}
                    placeholder="Buscar cliente..."
                  />
                </FormControl>
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
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl><SelectTrigger><SelectValue placeholder={opportunities.length === 0 ? "Sin oportunidades ganadas" : "Seleccionar"} /></SelectTrigger></FormControl>
                      <SelectContent>
                         {opportunities.map(opp => (<SelectItem key={opp.id} value={opp.id}>{opp.title} ({opp.stage})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Solo se muestran oportunidades en estado Cerrado - Ganado.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
          </div>
          <div className="space-y-2 flex flex-col justify-end pb-1">
             <FormLabel>Ejecutivo / Autor de Orden</FormLabel>
             {canReassign ? (
                 <Select value={orderCreatedBy || userInfo?.id} onValueChange={(val) => {
                     setOrderCreatedBy(val);
                     const u = users.find(x => x.id === val);
                     if (u) form.setValue('accountExecutive', u.name);
                 }}>
                     <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                     <SelectContent>
                         {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                     </SelectContent>
                 </Select>
             ) : (
                 <Input value={form.watch('accountExecutive')} readOnly className="bg-slate-50" />
             )}
          </div>
        </div>

        <div className="border rounded-md bg-white shadow-sm p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <Label>Asistente de carga por voz</Label>
              <Textarea
                value={voiceCommand}
                onChange={event => setVoiceCommand(event.target.value)}
                placeholder='Ej: "cargá el período desde el primero de mayo de 2026 al 31 de agosto de 2026" o "cargá un spot de 20 segundos todos los martes y jueves en Santa Siesta"'
                className="min-h-[76px] resize-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => applyVoiceCommand()}>
                <Wand2 className="mr-2 h-4 w-4" />
                Aplicar
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b"><h3 className="text-lg font-semibold text-slate-800">AIRE SRL</h3></div>
          <div className="p-4 grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
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
               <FormItem><FormLabel>Meses (Ciclos)</FormLabel><FormControl><Input value={totalMonthsCycle} readOnly className="bg-slate-50" /></FormControl></FormItem>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start border p-3 rounded-md bg-slate-50">
               <FormField control={form.control} name="materialSent" render={({ field }) => (<FormItem className="flex flex-row items-center h-10 space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Envía mat.</FormLabel></FormItem>)} />
               
               <div className="col-span-4 space-y-2">
                   <div className="flex justify-between items-center mb-1">
                       <FormLabel>Links de Materiales (Drive/URL)</FormLabel>
                       <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddMaterialUrl}><Plus className="h-4 w-4"/></Button>
                   </div>
                   {materialUrls.map((url, idx) => (
                       <div key={idx} className="flex gap-2">
                           <Input value={url} onChange={e => handleMaterialUrlChange(idx, e.target.value)} placeholder="https://..." className="h-9" />
                           {materialUrls.length > 1 && (
                               <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-red-500 hover:bg-red-100" onClick={() => handleRemoveMaterialUrl(idx)}>
                                   <Trash2 className="h-4 w-4"/>
                               </Button>
                           )}
                       </div>
                   ))}
               </div>

               <FormField control={form.control} name="certReq" render={({ field }) => (<FormItem className="flex flex-row items-center h-10 space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Solicita Cert.</FormLabel></FormItem>)} />
               <FormField control={form.control} name="agencySale" render={({ field }) => (<FormItem className="flex flex-row items-center h-10 space-x-2 border p-3 bg-white rounded col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="m-0">Venta Agencia</FormLabel></FormItem>)} />
               {agencySale && (<FormField control={form.control} name="commissionSrl" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Comisión (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} onChange={e=>field.onChange(parseFloat(e.target.value)||0)}/></FormControl></FormItem>)} />)}
            </div>

            <div className="grid grid-cols-1">
                <FormField control={form.control} name="event" render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel>Evento</FormLabel>
                    <FormControl><Input placeholder="Ej: Maratón Santa Fe-Coronda" {...field} /></FormControl>
                    <FormDescription>Agrupa órdenes de distintos clientes dentro de una misma acción o acontecimiento.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="observations" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones {(values.adjustmentSrl > 0 || values.adjustmentSas > 0) && <span className="text-red-500 text-xs ml-1">(Obligatorio por desajuste)</span>}</FormLabel>
                    <FormControl><Textarea className="h-10 resize-none" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
            </div>

            <div className="mt-4">
               {showSections ? (
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
          <div className="p-4">
             {showSections ? (
                 <SasSection form={form} startDate={startDate} endDate={endDate} />
             ) : (
                 <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                    {(!startDate || !endDate) ? "Seleccione fechas de Inicio y Fin." : "La fecha de Fin debe ser posterior a la de Inicio."}
                 </div>
             )}
          </div>
        </div>

        {wasApproved && (
            <Card className="border-amber-400 bg-amber-50 shadow-md animate-in fade-in zoom-in duration-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-amber-800 text-lg flex items-center">
                        ⚠️ Modificación de Contrato Aprobado
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Label className="text-amber-900 font-bold mb-2 block">
                        Esta Orden de Publicidad ya había sido aprobada y validada por la Administración.
                        Al guardar, volverá a la bandeja de revisión. Debe justificar el motivo del cambio: *
                    </Label>
                    <Textarea
                        value={modificationReason}
                        onChange={e => setModificationReason(e.target.value)}
                        placeholder="Ej: A pedido del cliente, reemplazamos en la facturación de Mayo la Nota Web por 1 Carrusel..."
                        className="bg-white mt-1 border-amber-300 focus-visible:ring-amber-500"
                        rows={3}
                    />
                </CardContent>
            </Card>
        )}

        {hasSrl && (
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-slate-800">Sugerencia de Facturación AIRE SRL</h3>
                <div className="flex gap-2 items-center bg-white p-1 rounded border shadow-sm">
                    <Label className="text-xs px-2 whitespace-nowrap">Dividir en N facturas:</Label>
                    <Input type="number" min={1} value={invoiceCountSrl} onChange={e => setInvoiceCountSrl(parseInt(e.target.value) || 1)} className="w-16 h-8 text-center" />
                    <Button type="button" size="sm" variant="secondary" className="h-8" onClick={handleGenerateBillingSrl}>Generar</Button>
                </div>
            </div>
            <div className="p-4 space-y-4">
                {brFieldsSrl.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end bg-slate-50 p-3 rounded-md border border-slate-200 flex-wrap">
                        <FormField control={form.control} name={`billingRequestsSrl.${index}.date`} render={({field}) => (
                            <FormItem className="flex-[2] min-w-[120px]">
                                <FormLabel className="text-xs">Fecha a Facturar</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} onBlur={() => sortSrlByDate()} />
                                </FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSrl.${index}.grossAmount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Bruto</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetSrl(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSrl.${index}.adjustment`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Desajuste</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetSrl(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSrl.${index}.amount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Neto Final</FormLabel>
                                <FormControl><Input type="number" step="0.01" className="font-bold bg-white" {...field} readOnly /></FormControl>
                            </FormItem>
                        )} />
                        
                        {/* 🟢 TIPO DE PAGO SRL */}
                        <FormField control={form.control} name={`billingRequestsSrl.${index}.paymentType`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[110px]">
                                <FormLabel className="text-xs">Tipo Pago</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Se paga">Se paga</SelectItem>
                                        <SelectItem value="Canje">Canje</SelectItem>
                                        <SelectItem value="Mixto">Mixto</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        {/* 🟢 DESCRIPCIÓN DE CANJE SRL */}
                        {form.watch(`billingRequestsSrl.${index}.paymentType`) !== "Se paga" && (
                            <FormField control={form.control} name={`billingRequestsSrl.${index}.canjeDescription`} render={({field}) => (
                                <FormItem className="flex-[2] min-w-[150px]">
                                    <FormLabel className="text-xs">Descripción Canje</FormLabel>
                                    <FormControl><Input {...field} placeholder="Detalle de la contraprestación..." className="h-9 bg-white" /></FormControl>
                                </FormItem>
                            )} />
                        )}

                        <Button type="button" variant="ghost" className="text-red-500 mb-0.5 hover:bg-red-100 px-2" onClick={() => brRemoveSrl(index)}>
                            <Trash2 className="h-5 w-5"/>
                        </Button>
                    </div>
                ))}

                {brFieldsSrl.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 py-2 bg-slate-200 rounded-md font-bold text-sm items-center border border-slate-300">
                        <div className="flex-[2] min-w-[120px] text-right pr-4 text-slate-700">Comprobación de sumas:</div>
                        <div className={cn("flex-1 min-w-[90px]", hasGrossErrorSrl ? "text-red-600" : "text-green-700")}>${sumGrossSrl.toLocaleString('es-AR')}</div>
                        <div className="flex-1 min-w-[90px] text-slate-600">${sumAdjSrl.toLocaleString('es-AR')}</div>
                        <div className={cn("flex-1 min-w-[90px]", hasNetErrorSrl ? "text-red-600" : "text-green-700")}>${sumNetSrl.toLocaleString('es-AR')}</div>
                        <div className="w-[36px]"></div>
                        {(hasGrossErrorSrl || hasNetErrorSrl) && (
                            <div className="w-full text-xs text-red-600 text-right mt-1 font-normal italic">
                                La suma de las cuotas no coincide con el total de la campaña SRL. (Bruto: ${campaignSrlGross.toLocaleString('es-AR')} | Neto: ${campaignSrlNet.toLocaleString('es-AR')})
                            </div>
                        )}
                    </div>
                )}
                
                <Button type="button" variant="outline" size="sm" onClick={() => brAppendSrl({ date: '', grossAmount: 0, adjustment: 0, amount: 0, paymentType: 'Se paga', canjeDescription: '' })}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar cuota manual
                </Button>
            </div>
        </div>
        )}

        {hasSas && (
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-slate-800">Sugerencia de Facturación AIRE SAS</h3>
                <div className="flex gap-2 items-center bg-white p-1 rounded border shadow-sm">
                    <Label className="text-xs px-2 whitespace-nowrap">Dividir en N facturas:</Label>
                    <Input type="number" min={1} value={invoiceCountSas} onChange={e => setInvoiceCountSas(parseInt(e.target.value) || 1)} className="w-16 h-8 text-center" />
                    <Button type="button" size="sm" variant="secondary" className="h-8" onClick={handleGenerateBillingSas}>Generar</Button>
                </div>
            </div>
            <div className="p-4 space-y-4">
                {brFieldsSas.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end bg-slate-50 p-3 rounded-md border border-slate-200 flex-wrap">
                        <FormField control={form.control} name={`billingRequestsSas.${index}.date`} render={({field}) => (
                            <FormItem className="flex-[2] min-w-[120px]">
                                <FormLabel className="text-xs">Fecha a Facturar</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} onBlur={() => sortSasByDate()} />
                                </FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSas.${index}.grossAmount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Bruto</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetSas(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSas.${index}.adjustment`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Desajuste</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetSas(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSas.${index}.ivaSas`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">IVA (5%)</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetSas(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsSas.${index}.amount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Neto Final</FormLabel>
                                <FormControl><Input type="number" step="0.01" className="font-bold bg-white" {...field} readOnly /></FormControl>
                            </FormItem>
                        )} />
                        
                        {/* 🟢 TIPO DE PAGO SAS */}
                        <FormField control={form.control} name={`billingRequestsSas.${index}.paymentType`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[110px]">
                                <FormLabel className="text-xs">Tipo Pago</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Se paga">Se paga</SelectItem>
                                        <SelectItem value="Canje">Canje</SelectItem>
                                        <SelectItem value="Mixto">Mixto</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        {/* 🟢 DESCRIPCIÓN DE CANJE SAS */}
                        {form.watch(`billingRequestsSas.${index}.paymentType`) !== "Se paga" && (
                            <FormField control={form.control} name={`billingRequestsSas.${index}.canjeDescription`} render={({field}) => (
                                <FormItem className="flex-[2] min-w-[150px]">
                                    <FormLabel className="text-xs">Descripción Canje</FormLabel>
                                    <FormControl><Input {...field} placeholder="Detalle del canje..." className="h-9 bg-white" /></FormControl>
                                </FormItem>
                            )} />
                        )}

                        <Button type="button" variant="ghost" className="text-red-500 mb-0.5 hover:bg-red-100 px-2" onClick={() => brRemoveSas(index)}>
                            <Trash2 className="h-5 w-5"/>
                        </Button>
                    </div>
                ))}

                {brFieldsSas.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 py-2 bg-slate-200 rounded-md font-bold text-sm items-center border border-slate-300">
                        <div className="flex-[2] min-w-[120px] text-right pr-4 text-slate-700">Comprobación de sumas:</div>
                        <div className={cn("flex-1 min-w-[90px]", hasGrossErrorSas ? "text-red-600" : "text-green-700")}>${sumGrossSas.toLocaleString('es-AR')}</div>
                        <div className="flex-1 min-w-[90px] text-slate-600">${sumAdjSas.toLocaleString('es-AR')}</div>
                        <div className="flex-1 min-w-[90px] text-slate-600">${sumIvaSas.toLocaleString('es-AR')}</div>
                        <div className={cn("flex-1 min-w-[90px]", hasNetErrorSas ? "text-red-600" : "text-green-700")}>${sumNetSas.toLocaleString('es-AR')}</div>
                        <div className="w-[36px]"></div>
                        {(hasGrossErrorSas || hasNetErrorSas) && (
                            <div className="w-full text-xs text-red-600 text-right mt-1 font-normal italic">
                                La suma de las cuotas no coincide con el total de la campaña SAS. (Bruto: ${campaignSasGross.toLocaleString('es-AR')} | Neto: ${campaignSasNet.toLocaleString('es-AR')})
                            </div>
                        )}
                    </div>
                )}
                
                <Button type="button" variant="outline" size="sm" onClick={() => brAppendSas({ date: '', grossAmount: 0, adjustment: 0, ivaSas: 0, amount: 0, paymentType: 'Se paga', canjeDescription: '' })}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar cuota manual
                </Button>
            </div>
        </div>
        )}

        {/* 🟢 NUEVO BLOQUE: SUGERENCIA DE FACTURACIÓN EN AVIÓN */}
        {showSections && (
        <div className="space-y-4 border rounded-md bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-slate-800">Sugerencia de Facturación en AVIÓN (No se emite)</h3>
                <div className="flex gap-2 items-center bg-white p-1 rounded border shadow-sm">
                    <Label className="text-xs px-2 whitespace-nowrap">Dividir en N cuotas:</Label>
                    <Input type="number" min={1} value={invoiceCountAvion} onChange={e => setInvoiceCountAvion(parseInt(e.target.value) || 1)} className="w-16 h-8 text-center" />
                    <Button type="button" size="sm" variant="secondary" className="h-8" onClick={handleGenerateBillingAvion}>Generar</Button>
                </div>
            </div>
            <div className="p-4 space-y-4">
                {brFieldsAvion.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end bg-slate-50 p-3 rounded-md border border-slate-200 flex-wrap">
                        <FormField control={form.control} name={`billingRequestsAvion.${index}.date`} render={({field}) => (
                            <FormItem className="flex-[2] min-w-[120px]">
                                <FormLabel className="text-xs">Fecha Estimada</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} onBlur={() => sortAvionByDate()} />
                                </FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsAvion.${index}.grossAmount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Valor Bruto</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetAvion(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsAvion.${index}.adjustment`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Desajuste</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} onChange={e => { field.onChange(parseFloat(e.target.value)||0); updateRowNetAvion(index); }} /></FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name={`billingRequestsAvion.${index}.amount`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[90px]">
                                <FormLabel className="text-xs">Importe Neto</FormLabel>
                                <FormControl><Input type="number" step="0.01" className="font-bold bg-white" {...field} readOnly /></FormControl>
                            </FormItem>
                        )} />
                        
                        <FormField control={form.control} name={`billingRequestsAvion.${index}.paymentType`} render={({field}) => (
                            <FormItem className="flex-1 min-w-[110px]">
                                <FormLabel className="text-xs">Tipo Pago</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Se paga">Se paga</SelectItem>
                                        <SelectItem value="Canje">Canje</SelectItem>
                                        <SelectItem value="Mixto">Mixto</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        {form.watch(`billingRequestsAvion.${index}.paymentType`) !== "Se paga" && (
                            <FormField control={form.control} name={`billingRequestsAvion.${index}.canjeDescription`} render={({field}) => (
                                <FormItem className="flex-[2] min-w-[150px]">
                                    <FormLabel className="text-xs">Descripción Canje</FormLabel>
                                    <FormControl><Input {...field} placeholder="Detalle del canje..." className="h-9 bg-white" /></FormControl>
                                </FormItem>
                            )} />
                        )}

                        <Button type="button" variant="ghost" className="text-red-500 mb-0.5 hover:bg-red-100 px-2" onClick={() => brRemoveAvion(index)}>
                            <Trash2 className="h-5 w-5"/>
                        </Button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => brAppendAvion({ date: '', grossAmount: 0, adjustment: 0, amount: 0, paymentType: 'Canje', canjeDescription: '' })}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar cuota manual (AVIÓN)
                </Button>
            </div>
        </div>
        )}

        <div className="flex justify-between items-center pt-6 border-t mt-8 gap-4">
          <ActionButtons />
        </div>
        <Button
          type="button"
          onClick={startVoiceInput}
          disabled={isListeningVoice}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full p-0 shadow-lg"
          title={isListeningVoice ? 'Escuchando...' : 'Dictar orden'}
        >
          {isListeningVoice ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
      </form>
    </Form>
  );
}
