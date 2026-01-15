import { google } from 'googleapis';

// Inicializamos la autenticación con la cuenta de servicio
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Corrige saltos de línea en entornos como Vercel
  },
  // Scopes necesarios para enviar mensajes y buscar usuarios
  scopes: [
    'https://www.googleapis.com/auth/chat.bot', 
    'https://www.googleapis.com/auth/chat.messages',
    'https://www.googleapis.com/auth/chat.spaces',
    'https://www.googleapis.com/auth/chat.memberships.readonly' // Para buscar DMs
  ],
});

// Cliente oficial de Google Chat
const chat = google.chat({ version: 'v1', auth });

/**
 * Encuentra o crea un espacio de mensaje directo (DM) con un usuario específico.
 */
export async function findDMParent(userEmail: string) {
  try {
    // Para cuentas de servicio (Bots), usamos findDirectMessage
    const res = await chat.spaces.findDirectMessage({
        name: `users/${userEmail}` // Formato requerido por la API antigua, a veces requiere IDs.
        // Nota: Si falla con email, la API de Chat a veces requiere el ID numérico de usuario.
        // Sin embargo, para apps instaladas, esto suele funcionar si el usuario interactuó antes.
    } as any); 

    return res.data.name; // Retorna "spaces/AAAA..."
  } catch (error) {
    console.error(`Error buscando DM para ${userEmail}:`, error);
    return null;
  }
}

/**
 * Envía un mensaje a un espacio (Grupo o DM) usando la cuenta de servicio.
 */
export async function sendServerMessage(spaceName: string, text: string, threadKey?: string) {
  try {
    const res = await chat.spaces.messages.create({
      parent: spaceName,
      messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD', // Si el hilo no existe, crea uno nuevo
      requestBody: {
        text: text,
        thread: threadKey ? { threadKey } : undefined,
      },
    });
    return res.data;
  } catch (error) {
    console.error('Error enviando mensaje servidor:', error);
    throw error;
  }
}
