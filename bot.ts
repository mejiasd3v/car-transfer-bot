/**
 * Kapso Function: WhatsApp Bot for Spanish Car Transfer Tax Calculator
 * 
 * Deploy with: kapso functions push bot.ts
 * 
 * This function handles incoming WhatsApp webhooks from Kapso,
 * queries the Convex backend for vehicle data, and calculates
 * the ITP (Impuesto de Transmisiones Patrimoniales) for vehicle transfers.
 */

// Type definitions for Kapso webhook events
type WebhookEvent = 
  | 'whatsapp.message.received'
  | 'whatsapp.conversation.created'
  | 'whatsapp.message.sent'
  | 'whatsapp.message.failed';

interface KapsoMessage {
  id: string;
  phone_number: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  whatsapp_message_id: string;
  timestamp: string;
}

interface KapsoConversation {
  id: string;
  phone_number: string;
  status: 'active' | 'inactive' | 'archived';
}

interface KapsoWebhookPayload {
  message?: KapsoMessage;
  conversation?: KapsoConversation;
  whatsapp_config?: {
    id: string;
    name: string;
  };
}

// Session management using KV storage
interface UserSession {
  step: "welcome" | "maker" | "year" | "model_selection" | "region" | "resident_check" | "complete";
  maker?: string;
  year?: number;
  cars?: Array<{ id: string; model: string; year: number; fiscalValue: number; fiscalPower: number; maker?: string }>;
  selectedCarId?: string;
  region?: string;
}

// Spanish regions ordered by tax rate (lowest first)
const SPANISH_REGIONS = [
  { name: "Galicia", rate: "3%", note: "⭐ ¡Más barato!" },
  { name: "Andalucía", rate: "4%", note: "(8% si >15 CV)" },
  { name: "Aragón", rate: "4%", note: "" },
  { name: "Asturias", rate: "4%", note: "(8% si >15 CV)" },
  { name: "Baleares", rate: "4%", note: "(8% si >15 CV)" },
  { name: "La Rioja", rate: "4%", note: "" },
  { name: "Madrid", rate: "4%", note: "" },
  { name: "Murcia", rate: "4%", note: "" },
  { name: "Navarra", rate: "4%", note: "" },
  { name: "País Vasco", rate: "4%", note: "" },
  { name: "Ceuta", rate: "4%", note: "(2% residentes)" },
  { name: "Melilla", rate: "4%", note: "(2% residentes)" },
  { name: "Castilla y León", rate: "5%", note: "(8% si >15 CV)" },
  { name: "Canarias", rate: "5.5%", note: "" },
  { name: "Cataluña", rate: "5%", note: "" },
  { name: "Castilla-La Mancha", rate: "6%", note: "" },
  { name: "Comunidad Valenciana", rate: "6%", note: "(8% si >2000cc)" },
  { name: "Extremadura", rate: "6%", note: "" },
  { name: "Cantabria", rate: "8%", note: "⚠️ Más caro" },
];

// Environment interface
interface Env {
  KV: KVNamespace;
  WEBHOOK_SECRET?: string;
  CONVEX_SITE_URL: string;
  KAPSO_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Optional: Verify webhook signature
      // const signature = request.headers.get('X-Webhook-Signature');
      // if (env.WEBHOOK_SECRET && signature) { ... }

      // Parse the webhook payload
      const webhook: KapsoWebhookPayload = await request.json();
      const eventType = request.headers.get('X-Webhook-Event') as WebhookEvent;

      switch (eventType) {
        case 'whatsapp.message.received':
          return await handleIncomingMessage(webhook, env);
        
        case 'whatsapp.conversation.created':
          // Send welcome message for new conversations
          return await sendWelcomeMessage(webhook, env);
        
        case 'whatsapp.message.failed':
          console.error(`Message failed: ${webhook.message?.id}`);
          return new Response('OK', { status: 200 });
        
        default:
          return new Response('OK', { status: 200 });
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      return new Response('Error logged', { status: 200 });
    }
  }
};

async function handleIncomingMessage(
  webhook: KapsoWebhookPayload, 
  env: Env
): Promise<Response> {
  const message = webhook.message!;
  const conversation = webhook.conversation!;
  const phoneNumber = conversation.phone_number;
  const text = message.content.toLowerCase().trim();

  // Get or create session
  const sessionKey = `session:${phoneNumber}`;
  let session: UserSession | null = await env.KV.get(sessionKey, { type: 'json' });
  if (!session) {
    session = { step: 'welcome' };
  }

  // Handle reset command
  if (text === 'reset' || text === 'inicio' || text === 'restart' || text === 'empezar') {
    await env.KV.delete(sessionKey);
    await sendWhatsAppReply(phoneNumber, 
      `🚗 *CALCULADORA DE TRANSFERENCIA DE COCHES*\n\n` +
      `Te ayudo a calcular el ITP (Impuesto de Transmisiones Patrimoniales) para vehículos de segunda mano en España.\n\n` +
      `ℹ️ *Info:* Uso tasas actualizadas a 2026\n` +
      `💰 Desde 3% en Galicia hasta 8% en Cantabria\n\n` +
      `¿Qué marca de coche te interesa?` +
      `\n_Ejemplo: Toyota, Seat, BMW..._`,
      env
    );
    return new Response('OK', { status: 200 });
  }

  // Handle help command
  if (text === 'ayuda' || text === 'help') {
    await sendWhatsAppReply(phoneNumber,
      `📋 *COMANDOS DISPONIBLES*\n\n` +
      `• *inicio* - Nueva consulta\n` +
      `• *tasas* - Ver tasas por región\n` +
      `• *ayuda* - Este mensaje\n\n` +
      `💡 Durante la consulta, responde a las preguntas paso a paso.`,
      env
    );
    return new Response('OK', { status: 200 });
  }

  // Show tax rates
  if (text === 'tasas' || text === 'precios' || text === 'tarifas') {
    const ratesList = SPANISH_REGIONS
      .map((r, i) => `${i + 1}. *${r.name}*: ${r.rate} ${r.note}`)
      .join('\n');
    
    await sendWhatsAppReply(phoneNumber,
      `📊 *TASAS DE ITP POR COMUNIDAD (2026)*\n` +
      `_Ordenado de más barato a más caro_\n\n` +
      ratesList +
      `\n\n⚠️ Algunas regiones aplican recargo para vehículos de alta potencia (>15 CV)`,
      env
    );
    return new Response('OK', { status: 200 });
  }

  // Process conversation flow
  switch (session.step) {
    case 'welcome':
    case 'maker':
      session = { step: 'year', maker: text };
      await env.KV.put(sessionKey, JSON.stringify(session));
      await sendWhatsAppReply(phoneNumber,
        `✅ Marca: *${text.toUpperCase()}*\n\n` +
        `¿De qué año es el vehículo?\n` +
        `_Ejemplo: 2020, 2019..._\n\n` +
        `💡 Escribe *saltar* para ver todos los modelos`,
        env
      );
      return new Response('OK', { status: 200 });

    case 'year': {
      const year = text === 'saltar' ? undefined : parseInt(text);
      
      if (text !== 'saltar' && (isNaN(year!) || year! < 1990 || year! > 2026)) {
        await sendWhatsAppReply(phoneNumber,
          '❌ Por favor, introduce un año válido (1990-2026) o escribe "saltar"',
          env
        );
        return new Response('OK', { status: 200 });
      }
      
      // Search cars via Convex
      try {
        const searchParams = new URLSearchParams();
        searchParams.append('maker', session.maker!);
        if (year) searchParams.append('year', year.toString());
        
        const response = await fetch(`${env.CONVEX_SITE_URL}/api/searchCars?${searchParams}`);
        const cars = await response.json() as any[];
        
        if (cars.length === 0) {
          await env.KV.delete(sessionKey);
          await sendWhatsAppReply(phoneNumber,
            `❌ No encontré coches *${session.maker}* ${year ? `del año ${year}` : ''}\n\n` +
            `¿Quieres intentar con otra marca?`,
            env
          );
          return new Response('OK', { status: 200 });
        }
        
        if (cars.length === 1) {
          // Auto-select if only one result
          session = { 
            ...session, 
            step: 'region', 
            selectedCarId: cars[0].id,
            year: year || cars[0].year
          };
          await env.KV.put(sessionKey, JSON.stringify(session));
          
          await sendWhatsAppReply(phoneNumber,
            `🚗 *${cars[0].maker.toUpperCase()} ${cars[0].model}* (${cars[0].year})\n` +
            `💪 ${cars[0].fiscalPower} CV fiscales\n` +
            `💰 Valor fiscal: ${Number(cars[0].fiscalValue).toLocaleString()}€\n\n` +
            `¿En qué comunidad autónoma se hará la transferencia?\n\n` +
            `_Escribe el nombre o número (1-${SPANISH_REGIONS.length})_`,
            env
          );
          return new Response('OK', { status: 200 });
        }
        
        // Show options
        let carList = cars.slice(0, 10).map((car: any, idx: number) => 
          `${idx + 1}. *${car.model}* (${car.year}) - ${Number(car.fiscalValue).toLocaleString()}€`
        ).join('\n');
        
        if (cars.length > 10) {
          carList += `\n\n_Y ${cars.length - 10} modelos más..._`;
        }
        
        session = { 
          ...session, 
          step: 'model_selection', 
          cars: cars.slice(0, 10),
          year: year || cars[0].year
        };
        await env.KV.put(sessionKey, JSON.stringify(session));
        
        await sendWhatsAppReply(phoneNumber,
          `🚗 Encontré *${cars.length}* modelos de *${session.maker?.toUpperCase()}* ${year ? `del ${year}` : ''}:\n\n` +
          carList +
          `\n\n_Escribe el número del modelo que te interese_`,
          env
        );
        return new Response('OK', { status: 200 });
        
      } catch (error) {
        await sendWhatsAppReply(phoneNumber,
          '❌ Error al buscar coches. Por favor, intenta de nuevo más tarde.',
          env
        );
        return new Response('OK', { status: 200 });
      }
    }

    case 'model_selection': {
      const selection = parseInt(text);
      
      if (isNaN(selection) || selection < 1 || selection > (session.cars?.length || 0)) {
        await sendWhatsAppReply(phoneNumber,
          `❌ Por favor, escribe un número del 1 al ${session.cars?.length || 0}`,
          env
        );
        return new Response('OK', { status: 200 });
      }
      
      const selectedCar = session.cars![selection - 1];
      session = { 
        ...session, 
        step: 'region', 
        selectedCarId: selectedCar.id
      };
      await env.KV.put(sessionKey, JSON.stringify(session));
      
      await sendWhatsAppReply(phoneNumber,
        `🚗 *${selectedCar.maker?.toUpperCase() || session.maker?.toUpperCase()} ${selectedCar.model}* (${selectedCar.year})\n` +
        `💪 ${selectedCar.fiscalPower} CV fiscales\n` +
        `💰 Valor fiscal: ${Number(selectedCar.fiscalValue).toLocaleString()}€\n\n` +
        `¿En qué comunidad autónoma se hará la transferencia?\n\n` +
        `_Escribe el nombre o número (1-${SPANISH_REGIONS.length})_`,
        env
      );
      return new Response('OK', { status: 200 });
    }

    case 'region': {
      let region = '';
      
      // Handle numeric selection
      const regionNum = parseInt(text);
      if (!isNaN(regionNum) && regionNum >= 1 && regionNum <= SPANISH_REGIONS.length) {
        region = SPANISH_REGIONS[regionNum - 1].name;
      } else {
        // Try to match region name
        const regionIndex = SPANISH_REGIONS.findIndex(r => 
          r.name.toLowerCase().includes(text) || text.includes(r.name.toLowerCase())
        );
        if (regionIndex >= 0) {
          region = SPANISH_REGIONS[regionIndex].name;
        }
      }
      
      if (!region) {
        await sendWhatsAppReply(phoneNumber,
          '❌ No reconocí esa comunidad. Por favor, escribe el nombre o el número:\n\n' +
          SPANISH_REGIONS.slice(0, 10).map((r, i) => `${i + 1}. ${r.name}`).join('\n') +
          `\n... y ${SPANISH_REGIONS.length - 10} más`,
          env
        );
        return new Response('OK', { status: 200 });
      }
      
      // Check if Ceuta or Melilla for resident discount
      if (region === 'Ceuta' || region === 'Melilla') {
        session = { ...session, step: 'resident_check', region };
        await env.KV.put(sessionKey, JSON.stringify(session));
        await sendWhatsAppReply(phoneNumber,
          `📍 Comunidad: *${region}*\n\n` +
          `¿Eres residente en ${region}?\n` +
          `(Los residentes tienen 50% de descuento: 2% en vez de 4%)\n\n` +
          `_Responde: *si* o *no*_`,
          env
        );
        return new Response('OK', { status: 200 });
      }
      
      return await calculateAndReply(phoneNumber, session, region, false, env, sessionKey);
    }

    case 'resident_check': {
      const isResident = text === 'si' || text === 'sí' || text === 'yes' || text === 's';
      return await calculateAndReply(phoneNumber, session, session.region!, isResident, env, sessionKey);
    }

    default:
      session = { step: 'maker' };
      await env.KV.put(sessionKey, JSON.stringify(session));
      await sendWhatsAppReply(phoneNumber,
        `🚗 *CALCULADORA DE TRANSFERENCIA*\n\n` +
        `¿Qué marca de coche te interesa?` +
        `\n_Ejemplo: Toyota, Seat, BMW..._`,
        env
      );
      return new Response('OK', { status: 200 });
  }
}

async function sendWelcomeMessage(webhook: KapsoWebhookPayload, env: Env): Promise<Response> {
  const conversation = webhook.conversation!;
  
  await sendWhatsAppReply(conversation.phone_number,
    `👋 ¡Hola! Bienvenido a la *Calculadora de Transferencia de Coches*.\n\n` +
    `Te ayudo a calcular el ITP para vehículos de segunda mano en España.\n\n` +
    `ℹ️ Uso tasas actualizadas a 2026\n` +
    `💰 Desde 3% en Galicia hasta 8% en Cantabria\n\n` +
    `¿Qué marca de coche te interesa?\n` +
    `_Escribe: Toyota, Seat, BMW..._`,
    env
  );
  
  return new Response('OK', { status: 200 });
}

async function calculateAndReply(
  phoneNumber: string,
  session: UserSession,
  region: string,
  isResident: boolean,
  env: Env,
  sessionKey: string
): Promise<Response> {
  try {
    // Calculate tax via Convex
    const response = await fetch(`${env.CONVEX_SITE_URL}/api/calculateTransferTax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        carId: session.selectedCarId, 
        region,
        isResident
      })
    });
    
    const result = await response.json() as any;
    
    // Clear session
    await env.KV.delete(sessionKey);
    
    let message = 
      `📊 *RESULTADO DE LA TRANSFERENCIA*\n\n` +
      `🚗 Vehículo: *${result.car.maker.toUpperCase()} ${result.car.model}* (${result.car.year})\n` +
      `💪 ${result.car.fiscalPower} CV fiscales\n` +
      `💰 Valor fiscal: ${Number(result.fiscalValue).toLocaleString()}€\n` +
      `📍 Comunidad: *${result.region}*\n` +
      `📈 Tipo impositivo: *${result.taxRate}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 *IMPUESTO DE TRANSFERENCIAS*\n` +
      `   *${Number(result.calculatedTax).toLocaleString()}€*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`;
    
    // Add notes if any
    if (result.notes && result.notes.length > 0) {
      message += `\n\n${result.notes.join('\n')}`;
    }
    
    message += `\n\n⚠️ Este cálculo es orientativo. Pueden aplicarse otros gastos:\n` +
      `   • Tasas DGT: ~55,70€\n` +
      `   • Gestoría (si la usas)\n\n` +
      `_Escribe \"inicio\" para una nueva consulta_`;
    
    await sendWhatsAppReply(phoneNumber, message, env);
    return new Response('OK', { status: 200 });
    
  } catch (error) {
    console.error('Calculation error:', error);
    await sendWhatsAppReply(phoneNumber,
      '❌ Error al calcular el impuesto. Por favor, intenta de nuevo más tarde.',
      env
    );
    return new Response('OK', { status: 200 });
  }
}

async function sendWhatsAppReply(phoneNumber: string, message: string, env: Env): Promise<void> {
  // If we have Kapso API key, send via Kapso
  if (env.KAPSO_API_KEY) {
    try {
      await fetch('https://app.kapso.ai/api/whatsapp/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.KAPSO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          content: message,
          type: 'text'
        })
      });
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
    }
  } else {
    // Log for testing without Kapso
    console.log(`[WhatsApp to ${phoneNumber}]: ${message}`);
  }
}
