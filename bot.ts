// Kapso WhatsApp Bot Configuration
// Docs: https://docs.kapso.ai

import { Kapso } from "@kapso/ai";

const kapso = new Kapso({
  apiKey: process.env.KAPSO_API_KEY!,
});

// Conversation state management
interface UserSession {
  step: "welcome" | "maker" | "year" | "model_selection" | "region" | "complete";
  maker?: string;
  year?: number;
  cars?: Array<{ id: string; model: string; year: number; fiscalValue: number }>;
  selectedCarId?: string;
}

const sessions = new Map<string, UserSession>();

// Spanish regions for tax calculation
const SPANISH_REGIONS = [
  "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias",
  "Cantabria", "Castilla-La Mancha", "Castilla y León", "Cataluña",
  "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja",
  "Madrid", "Murcia", "Navarra", "País Vasco", "Ceuta", "Melilla"
];

export default kapso.webhook({
  onMessage: async (message, { reply }) => {
    const phoneNumber = message.from;
    const text = message.text?.toLowerCase().trim() || "";
    
    // Get or create session
    let session = sessions.get(phoneNumber) || { step: "welcome" };
    
    // Handle reset command
    if (text === "reset" || text === "inicio" || text === "restart") {
      sessions.delete(phoneNumber);
      return reply("🔄 *Nueva consulta iniciada*\n\n¡Hola! Soy tu asistente para calcular el coste de transferencia de vehículos en España.\n\n¿Qué marca de coche te interesa? (Ejemplo: Toyota, Seat, BMW)");
    }
    
    switch (session.step) {
      case "welcome":
      case "maker":
        sessions.set(phoneNumber, { step: "year", maker: text });
        return reply(`✅ Marca: *${text.toUpperCase()}*\n\n¿De qué año es el vehículo? (Ejemplo: 2020)\n\n_O escribe "saltar" para ver todos los modelos_`);
        
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
            return reply(`❌ No encontré coches *${session.maker}* ${year ? `del año ${year}` : ""}\n\n¿Quieres intentar con otra marca?`);
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
              `💰 Valor fiscal: ${cars[0].fiscalValue.toLocaleString()}€\n\n` +
              `¿En qué comunidad autónoma se va a hacer la transferencia?\n\n` +
              `_Escribe el nombre o el número:\n1. Madrid\n2. Cataluña\n3. Andalucía\n4. Valencia\n5. Otra..._`
            );
          }
          
          // Show options
          let carList = cars.slice(0, 10).map((car: any, idx: number) => 
            `${idx + 1}. *${car.model}* (${car.year}) - ${car.fiscalValue.toLocaleString()}€`
          ).join("\n");
          
          if (cars.length > 10) {
            carList += `\n\n_Y ${cars.length - 10} modelos más... escribe el número del que te interese_`;
          }
          
          sessions.set(phoneNumber, { 
            ...session, 
            step: "model_selection", 
            cars: cars.slice(0, 10),
            year: year || cars[0].year
          });
          
          return reply(
            `🚗 Encontré *${cars.length}* modelos de *${session.maker}* ${year ? `del ${year}` : ""}:\n\n` +
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
          `🚗 *${selectedCar.maker || session.maker} ${selectedCar.model}* (${selectedCar.year})\n` +
          `💰 Valor fiscal: ${selectedCar.fiscalValue.toLocaleString()}€\n\n` +
          `¿En qué comunidad autónoma se va a hacer la transferencia?\n\n` +
          `_Escribe el nombre o el número:\n1. Madrid\n2. Cataluña\n3. Andalucía\n4. Valencia\n5. Otra..._`
        );
        
      case "region":
        let region = "";
        
        // Handle numeric selection
        const regionNum = parseInt(text);
        if (!isNaN(regionNum) && regionNum >= 1 && regionNum <= SPANISH_REGIONS.length) {
          region = SPANISH_REGIONS[regionNum - 1];
        } else {
          // Try to match region name
          region = SPANISH_REGIONS.find(r => 
            r.toLowerCase().includes(text) || text.includes(r.toLowerCase())
          ) || "";
        }
        
        if (!region) {
          return reply(
            "❌ No reconocí esa comunidad. Por favor, escribe el nombre o el número:\n\n" +
            SPANISH_REGIONS.map((r, i) => `${i + 1}. ${r}`).join("\n")
          );
        }
        
        try {
          // Calculate tax via Convex
          const response = await fetch(`${process.env.CONVEX_SITE_URL}/api/calculateTransferTax`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carId: session.selectedCarId, region })
          });
          
          const result = await response.json();
          
          // Complete the session
          sessions.delete(phoneNumber);
          
          return reply(
            `📊 *RESULTADO DE LA TRANSFERENCIA*\n\n` +
            `🚗 Vehículo: *${result.car.maker.toUpperCase()} ${result.car.model}* (${result.car.year})\n` +
            `💰 Valor fiscal: ${result.fiscalValue.toLocaleString()}€\n` +
            `📍 Comunidad: *${result.region}*\n` +
            `📈 Tipo impositivo: *${result.taxRate}*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💵 *IMPUESTO DE TRANSFERENCIAS: ${result.calculatedTax.toLocaleString()}€*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `⚠️ Este cálculo es orientativo. Pueden aplicarse otros gastos (gestoría, ITV, etc.)\n\n` +
            `_Escribe \"inicio\" para una nueva consulta_`
          );
          
        } catch (error) {
          return reply("❌ Error al calcular el impuesto. Por favor, intenta de nuevo más tarde.");
        }
        
      default:
        sessions.set(phoneNumber, { step: "maker" });
        return reply("¡Hola! Soy tu asistente para calcular el coste de transferencia de vehículos en España.\n\n¿Qué marca de coche te interesa? (Ejemplo: Toyota, Seat, BMW)");
    }
  },
});
