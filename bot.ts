// Kapso WhatsApp Bot Configuration
// Docs: https://docs.kapso.ai

import { Kapso } from "@kapso/ai";

const kapso = new Kapso({
  apiKey: process.env.KAPSO_API_KEY!,
});

// Conversation state management
interface UserSession {
  step: "welcome" | "maker" | "year" | "model_selection" | "region" | "resident_check" | "complete";
  maker?: string;
  year?: number;
  cars?: Array<{ id: string; model: string; year: number; fiscalValue: number; fiscalPower: number; maker?: string }>;
  selectedCarId?: string;
  region?: string;
}

const sessions = new Map<string, UserSession>();

// Spanish regions ordered by tax rate (lowest first for user convenience)
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

export default kapso.webhook({
  onMessage: async (message, { reply }) => {
    const phoneNumber = message.from;
    const text = message.text?.toLowerCase().trim() || "";
    
    // Get or create session
    let session = sessions.get(phoneNumber) || { step: "welcome" };
    
    // Handle reset command
    if (text === "reset" || text === "inicio" || text === "restart" || text === "empezar") {
      sessions.delete(phoneNumber);
      return reply(
        `🚗 *CALCULADORA DE TRANSFERENCIA DE COCHES*\n\n` +
        `Te ayudo a calcular el ITP (Impuesto de Transmisiones Patrimoniales) para vehículos de segunda mano en España.\n\n` +
        `ℹ️ *Info:* Uso tasas actualizadas a 2026\n` +
        `💰 Desde 3% en Galicia hasta 8% en Cantabria\n\n` +
        `¿Qué marca de coche te interesa?` +
        `\n_Ejemplo: Toyota, Seat, BMW..._`
      );
    }
    
    // Handle help command
    if (text === "ayuda" || text === "help") {
      return reply(
        `📋 *COMANDOS DISPONIBLES*\n\n` +
        `• *inicio* - Nueva consulta\n` +
        `• *tasas* - Ver tasas por región\n` +
        `• *ayuda* - Este mensaje\n\n` +
        `💡 Durante la consulta, responde a las preguntas paso a paso.`
      );
    }
    
    // Show tax rates
    if (text === "tasas" || text === "precios" || text === "tarifas") {
      const ratesList = SPANISH_REGIONS
        .map((r, i) => `${i + 1}. *${r.name}*: ${r.rate} ${r.note}`)
        .join("\n");
      
      return reply(
        `📊 *TASAS DE ITP POR COMUNIDAD (2026)*\n` +
        `_Ordenado de más barato a más caro_\n\n` +
        ratesList +
        `\n\n⚠️ Algunas regiones aplican recargo para vehículos de alta potencia (>15 CV)`
      );
    }
    
    switch (session.step) {
      case "welcome":
      case "maker":
        sessions.set(phoneNumber, { step: "year", maker: text });
        return reply(
          `✅ Marca: *${text.toUpperCase()}*\n\n` +
          `¿De qué año es el vehículo?\n` +
          `_Ejemplo: 2020, 2019..._\n\n` +
          `💡 Escribe *saltar* para ver todos los modelos`
        );
        
      case "year":
        const year = text === "saltar" ? undefined : parseInt(text);
        
        if (text !== "saltar" && (isNaN(year!) || year! < 1990 || year! > 2026)) {
          return reply("❌ Por favor, introduce un año válido (1990-2026) o escribe \"saltar\"");
        }
        
        // Search cars via Convex
        const searchParams = new URLSearchParams();
        searchParams.append("maker", session.maker!);
        if (year) searchParams.append("year", year.toString());
        
        try {
          const response = await fetch(`${process.env.CONVEX_SITE_URL}/api/searchCars?${searchParams}`);
          const cars = await response.json();
          
          if (cars.length === 0) {
            sessions.set(phoneNumber, { step: "maker" });
            return reply(
              `❌ No encontré coches *${session.maker}* ${year ? `del año ${year}` : ""}\n\n` +
              `¿Quieres intentar con otra marca?`
            );
          }
          
          if (cars.length === 1) {
            // Auto-select if only one result
            sessions.set(phoneNumber, { 
              ...session, 
              step: "region", 
              selectedCarId: cars[0].id,
              year: year || cars[0].year
            });
            
            return reply(
              `🚗 *${cars[0].maker.toUpperCase()} ${cars[0].model}* (${cars[0].year})\n` +
              `💪 ${cars[0].fiscalPower} CV fiscales\n` +
              `💰 Valor fiscal: ${cars[0].fiscalValue.toLocaleString()}€\n\n` +
              `¿En qué comunidad autónoma se hará la transferencia?\n\n` +
              `_Escribe el nombre o número (1-${SPANISH_REGIONS.length})_`
            );
          }
          
          // Show options
          let carList = cars.slice(0, 10).map((car: any, idx: number) => 
            `${idx + 1}. *${car.model}* (${car.year}) - ${car.fiscalValue.toLocaleString()}€`
          ).join("\n");
          
          if (cars.length > 10) {
            carList += `\n\n_Y ${cars.length - 10} modelos más..._`;
          }
          
          sessions.set(phoneNumber, { 
            ...session, 
            step: "model_selection", 
            cars: cars.slice(0, 10),
            year: year || cars[0].year
          });
          
          return reply(
            `🚗 Encontré *${cars.length}* modelos de *${session.maker?.toUpperCase()}* ${year ? `del ${year}` : ""}:\n\n` +
            carList +
            `\n\n_Escribe el número del modelo que te interese_`
          );
          
        } catch (error) {
          return reply("❌ Error al buscar coches. Por favor, intenta de nuevo más tarde.");
        }
        
      case "model_selection":
        const selection = parseInt(text);
        
        if (isNaN(selection) || selection < 1 || selection > (session.cars?.length || 0)) {
          return reply(`❌ Por favor, escribe un número del 1 al ${session.cars?.length || 0}`);
        }
        
        const selectedCar = session.cars![selection - 1];
        sessions.set(phoneNumber, { 
          ...session, 
          step: "region", 
          selectedCarId: selectedCar.id
        });
        
        return reply(
          `🚗 *${selectedCar.maker?.toUpperCase() || session.maker?.toUpperCase()} ${selectedCar.model}* (${selectedCar.year})\n` +
          `💪 ${selectedCar.fiscalPower} CV fiscales\n` +
          `💰 Valor fiscal: ${selectedCar.fiscalValue.toLocaleString()}€\n\n` +
          `¿En qué comunidad autónoma se hará la transferencia?\n\n` +
          `_Escribe el nombre o número (1-${SPANISH_REGIONS.length})_`
        );
        
      case "region":
        let region = "";
        let regionIndex = -1;
        
        // Handle numeric selection
        const regionNum = parseInt(text);
        if (!isNaN(regionNum) && regionNum >= 1 && regionNum <= SPANISH_REGIONS.length) {
          region = SPANISH_REGIONS[regionNum - 1].name;
          regionIndex = regionNum - 1;
        } else {
          // Try to match region name
          regionIndex = SPANISH_REGIONS.findIndex(r => 
            r.name.toLowerCase().includes(text) || text.includes(r.name.toLowerCase())
          );
          if (regionIndex >= 0) {
            region = SPANISH_REGIONS[regionIndex].name;
          }
        }
        
        if (!region) {
          return reply(
            "❌ No reconocí esa comunidad. Por favor, escribe el nombre o el número:\n\n" +
            SPANISH_REGIONS.slice(0, 10).map((r, i) => `${i + 1}. ${r.name}`).join("\n") +
            `\n... y ${SPANISH_REGIONS.length - 10} más`
          );
        }
        
        // Check if Ceuta or Melilla for resident discount
        if (region === "Ceuta" || region === "Melilla") {
          sessions.set(phoneNumber, { ...session, step: "resident_check", region });
          return reply(
            `📍 Comunidad: *${region}*\n\n` +
            `¿Eres residente en ${region}?\n` +
            `(Los residentes tienen 50% de descuento: 2% en vez de 4%)\n\n` +
            `_Responde: *si* o *no*_`
          );
        }
        
        return await calculateAndReply(phoneNumber, session, region, false, reply);
        
      case "resident_check":
        const isResident = text === "si" || text === "sí" || text === "yes" || text === "s";
        return await calculateAndReply(phoneNumber, session, session.region!, isResident, reply);
        
      default:
        sessions.set(phoneNumber, { step: "maker" });
        return reply(
          `🚗 *CALCULADORA DE TRANSFERENCIA*\n\n` +
          `¿Qué marca de coche te interesa?` +
          `\n_Ejemplo: Toyota, Seat, BMW..._`
        );
    }
  },
});

async function calculateAndReply(
  phoneNumber: string, 
  session: UserSession, 
  region: string, 
  isResident: boolean,
  reply: (text: string) => Promise<void>
) {
  try {
    // Calculate tax via Convex
    const response = await fetch(`${process.env.CONVEX_SITE_URL}/api/calculateTransferTax`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        carId: session.selectedCarId, 
        region,
        isResident
      })
    });
    
    const result = await response.json();
    
    // Complete the session
    sessions.delete(phoneNumber);
    
    let message = 
      `📊 *RESULTADO DE LA TRANSFERENCIA*\n\n` +
      `🚗 Vehículo: *${result.car.maker.toUpperCase()} ${result.car.model}* (${result.car.year})\n` +
      `💪 ${result.car.fiscalPower} CV fiscales\n` +
      `💰 Valor fiscal: ${result.fiscalValue.toLocaleString()}€\n` +
      `📍 Comunidad: *${result.region}*\n` +
      `📈 Tipo impositivo: *${result.taxRate}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 *IMPUESTO DE TRANSFERENCIAS*\n` +
      `   *${result.calculatedTax.toLocaleString()}€*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`;
    
    // Add notes if any
    if (result.notes && result.notes.length > 0) {
      message += `\n\n${result.notes.join("\n")}`;
    }
    
    message += `\n\n⚠️ Este cálculo es orientativo. Pueden aplicarse otros gastos:\n` +
      `   • Tasas DGT: ~55,70€\n` +
      `   • Gestoría (si la usas)\n\n` +
      `_Escribe \"inicio\" para una nueva consulta_`;
    
    return reply(message);
    
  } catch (error) {
    return reply("❌ Error al calcular el impuesto. Por favor, intenta de nuevo más tarde.");
  }
}
