'use server';
/**
 * @fileOverview An AI agent that can execute commands within the CRM.
 */

import { ai } from '@/ai/genkit';
import {
  createCommanderClient,
  createCommanderClientActivity,
  createCommanderProspect,
  getCommanderClients,
  getCommanderProspects,
} from '@/lib/server/commander-crm';
import type { ClientActivity, User } from '@/lib/types';
import { z } from 'zod';
import { findBestMatch } from 'string-similarity';

type CommanderContext = {
  currentUser: User;
  userId: string;
  userName: string;
};

function findBestNamedMatch<T>(
  search: string,
  items: T[],
  getNames: (item: T) => string[],
): { item: T; name: string; rating: number } | null {
  const candidates = items.flatMap(item => (
    getNames(item)
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => ({ item, name }))
  ));

  if (candidates.length === 0) return null;

  const bestMatch = findBestMatch(search, candidates.map(candidate => candidate.name));
  if (bestMatch.bestMatch.rating <= 0.6) return null;

  const candidate = candidates[bestMatch.bestMatchIndex];
  return { ...candidate, rating: bestMatch.bestMatch.rating };
}

// Define tools for the AI to use
const createClientTool = ai.defineTool(
  {
    name: 'createClient',
    description: 'Creates a new client in the CRM. Use this for confirmed clients ready for business opportunities.',
    inputSchema: z.object({
      denominacion: z.string().describe("The client's official name or denomination."),
      razonSocial: z.string().optional().describe("The client's legal name (Razón Social)."),
      cuit: z.string().optional().describe("The client's CUIT number."),
      email: z.string().optional().describe("The client's primary email address."),
      phone: z.string().optional().describe("The client's primary phone number."),
    }),
    outputSchema: z.object({
      id: z.string(),
      denominacion: z.string(),
    }),
  },
  async (input, context) => {
    const { currentUser } = context as unknown as CommanderContext;
    const clientId = await createCommanderClient({
      denominacion: input.denominacion,
      razonSocial: input.razonSocial || input.denominacion,
      cuit: input.cuit || '',
      email: input.email || '',
      phone: input.phone || '',
      condicionIVA: 'Consumidor Final',
      provincia: '',
      localidad: '',
      tipoEntidad: 'Privada',
      rubro: '',
    }, currentUser);
    return { id: clientId, denominacion: input.denominacion };
  }
);


const createProspectTool = ai.defineTool(
  {
    name: 'createProspect',
    description: 'Creates a new prospect in the CRM. A prospect is a potential client that is not yet qualified.',
    inputSchema: z.object({
      companyName: z.string().describe('The name of the prospect company.'),
      contactName: z.string().optional().describe('The name of the contact person.'),
      contactPhone: z.string().optional().describe('The phone number of the contact person.'),
      contactEmail: z.string().optional().describe('The email address of the contact person.'),
    }),
    outputSchema: z.object({
        id: z.string(),
        companyName: z.string()
    }),
  },
  async (input, context) => {
    const { currentUser } = context as unknown as CommanderContext;
    const prospectId = await createCommanderProspect({ ...input, companyName: input.companyName || '', status: 'Nuevo' }, currentUser);
    return { id: prospectId, companyName: input.companyName };
  }
);


const scheduleTaskTool = ai.defineTool(
  {
    name: 'scheduleTask',
    description: 'Schedules a follow-up task or reminder for a prospect or client.',
    inputSchema: z.object({
        entityType: z.enum(['prospect', 'client']).describe("The type of entity the task is for."),
        entityName: z.string().describe("The name of the prospect company or client."),
        observation: z.string().describe("The description of the task or what needs to be done."),
        dueDate: z.string().describe("The due date and time for the task in ISO 8601 format."),
    }),
    outputSchema: z.string(),
  },
  async (input, context) => {
    const { currentUser, userId, userName } = context as unknown as CommanderContext;
    
    let entityId = '';
    let entityName = '';

    if (input.entityType === 'prospect') {
      const prospects = await getCommanderProspects();
      const match = findBestNamedMatch(input.entityName, prospects, prospect => [prospect.companyName]);
      if (match) {
        entityId = match.item.id;
        entityName = match.item.companyName;
      }
    } else {
      const clients = await getCommanderClients();
      const match = findBestNamedMatch(input.entityName, clients, client => [
        client.denominacion,
        client.razonSocial,
        client.razonSocialTango || '',
      ]);
      if (match) {
        entityId = match.item.id;
        entityName = match.item.denominacion || match.name;
      }
    }
    
    if (!entityId) {
      throw new Error(`Could not find a ${input.entityType} named "${input.entityName}".`);
    }

    const activityPayload: Partial<ClientActivity> = {
        observation: input.observation,
        isTask: true,
        dueDate: input.dueDate,
        userId: userId,
        userName: userName,
        completed: false,
        type: 'Otra', // Default type for AI-created tasks
    };

    if (input.entityType === 'prospect') {
        activityPayload.prospectId = entityId;
        activityPayload.prospectName = entityName;
    } else {
        activityPayload.clientId = entityId;
        activityPayload.clientName = entityName;
    }

    await createCommanderClientActivity(activityPayload as any, currentUser);
    return `Task scheduled successfully for ${entityName}.`;
  }
);

// Define the main commander prompt

const commanderPrompt = ai.definePrompt({
    name: 'commanderPrompt',
    tools: [createClientTool, createProspectTool, scheduleTaskTool],
    system: `You are an assistant for the "AIRE CRM".
Your goal is to help users perform actions by calling the provided tools.
Distinguish between a "client" (a formal business entity) and a "prospect" (a potential, unqualified lead) and use the correct tool.
You can call multiple tools in parallel.
When a date is mentioned like "tomorrow" or "next week", calculate the exact date and time based on the current date. The current date is {{currentDate}}.
If you create an entity and then schedule a task for it in the same command, use the name of the entity you just created in the 'entityName' field for the scheduleTask tool.
After executing the tools, provide a concise and friendly confirmation message to the user summarizing what you have done. Do not just repeat the tool output.
If you cannot fulfill a request, explain why clearly and politely.
`,
});

// Define the flow that uses the prompt

const commanderFlow = ai.defineFlow(
    {
        name: 'commanderFlow',
        inputSchema: z.object({
            command: z.string(),
            currentUser: z.any(),
        }),
        outputSchema: z.string(),
    },
    async ({ command, currentUser }) => {
        const llmResponse = await commanderPrompt(
            { command, currentDate: new Date().toString() },
            {
                // Provide the user context to the tools
                context: {
                    currentUser,
                    userId: currentUser.id,
                    userName: currentUser.name,
                },
            }
        );

        return llmResponse.text;
    }
);


const assistantApiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GENAI_API_KEY ??
    process.env.GOOGLE_API_KEY;
const isCommandAssistantConfigured = Boolean(assistantApiKey);
const MISSING_ASSISTANT_MESSAGE = 'El asistente de comandos no está configurado. Por favor, contactá a un administrador para habilitarlo.';
const GENERIC_ASSISTANT_ERROR = 'No pude procesar tu orden en este momento. Intentalo nuevamente en unos minutos.';

// Export a server action to be called from the client
export async function executeCommanderFlow(command: string, currentUser: User): Promise<string> {
    if (!isCommandAssistantConfigured) {
        console.warn('Commander flow attempted to run without GEMINI_API_KEY/GOOGLE_GENAI_API_KEY/GOOGLE_API_KEY configured.');
        return MISSING_ASSISTANT_MESSAGE;
    }

    try {
        return await commanderFlow({ command, currentUser });
    } catch (error) {
        console.error('Commander flow execution failed:', error);
        return GENERIC_ASSISTANT_ERROR;
    }
}
