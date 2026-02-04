import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * ITP (Impuesto de Transmisiones Patrimoniales) rates for vehicle transfers in Spain (2026)
 * 
 * Sources:
 * - https://www.traficgestion.es/itp-transferencia-vehiculo/
 * - https://www.gestoriavehiculos.com/transferencia/precio-cambio-titularidad-coche/
 * 
 * Note: Some regions have special conditions:
 * - Andalucía, Asturias, Baleares, Castilla y León: 8% if >15 CV fiscal
 * - Ceuta & Melilla: 4% but 50% bonification for residents (effectively 2%)
 * - Cataluña: Exempt if >10 years old and value <€40,000
 * - Galicia: Reduced to 3% in 2024 (was higher before)
 * - Aragón, Canarias: Fixed fees for vehicles >10 years old
 */

// Base tax rates by autonomous community
const REGIONAL_TAX_RATES: Record<string, number> = {
  "Andalucía": 0.04,        // 4% general, 8% if >15 CV
  "Aragón": 0.04,           // 4% general, fixed fees if >10 years
  "Asturias": 0.04,         // 4% general, 8% if >15 CV
  "Baleares": 0.04,         // 4% general, 8% if >15 CV, ciclomotores exempt
  "Canarias": 0.055,        // 5.5% general (IGIC doesn't apply to used vehicles)
  "Cantabria": 0.08,        // 8% general
  "Castilla-La Mancha": 0.06, // 6% general
  "Castilla y León": 0.05,  // 5% general, 8% if >15 CV
  "Cataluña": 0.05,         // 5% general, exempt if >10 years & <€40k
  "Ceuta": 0.04,            // 4% general, 2% for residents (50% bonif.)
  "Comunidad Valenciana": 0.06, // 6% general, 8% if >2000cc
  "Extremadura": 0.06,      // 6% general, 4% for commercial vehicles
  "Galicia": 0.03,          // 3% general (reduced in 2024), 0% zero emissions
  "La Rioja": 0.04,         // 4% general
  "Madrid": 0.04,           // 4% general
  "Melilla": 0.04,          // 4% general, 2% for residents (50% bonif.)
  "Murcia": 0.04,           // 4% general, fixed fees if >12 years
  "Navarra": 0.04,          // 4% general
  "País Vasco": 0.04,       // 4% general
};

// Regions with higher rates for high-power vehicles (>15 CV)
const HIGH_POWER_REGIONS = ["Andalucía", "Asturias", "Baleares", "Castilla y León"];
const HIGH_POWER_TAX_RATE = 0.08; // 8%
const HIGH_POWER_CV_THRESHOLD = 15;

// Default rate if region not specified
const DEFAULT_TAX_RATE = 0.04;

export const searchCars = query({
  args: { maker: v.string(), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const normalizedMaker = args.maker.toLowerCase().trim();
    
    if (args.year) {
      return await ctx.db
        .query("cars")
        .withIndex("by_maker_year", (q) => 
          q.eq("maker", normalizedMaker).eq("year", args.year!)
        )
        .collect();
    }
    
    return await ctx.db
      .query("cars")
      .withIndex("by_maker", (q) => q.eq("maker", normalizedMaker))
      .collect();
  },
});

export const getCarById = query({
  args: { carId: v.id("cars") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.carId);
  },
});

export const calculateTransferTax = mutation({
  args: { 
    carId: v.id("cars"), 
    region: v.optional(v.string()),
    isResident: v.optional(v.boolean()), // For Ceuta/Melilla resident discount
  },
  handler: async (ctx, args) => {
    const car = await ctx.db.get(args.carId);
    if (!car) {
      throw new Error("Car not found");
    }

    const region = args.region || "Madrid";
    let taxRate = REGIONAL_TAX_RATES[region] || DEFAULT_TAX_RATE;
    
    // Apply high-power vehicle surcharge in certain regions
    if (HIGH_POWER_REGIONS.includes(region) && car.fiscalPower > HIGH_POWER_CV_THRESHOLD) {
      taxRate = HIGH_POWER_TAX_RATE;
    }
    
    // Apply Ceuta/Melilla resident discount (50% bonification)
    if ((region === "Ceuta" || region === "Melilla") && args.isResident) {
      taxRate = taxRate * 0.5; // 2% effective rate
    }
    
    // Calculate transfer tax based on fiscal value
    const calculatedTax = Math.round(car.fiscalValue * taxRate * 100) / 100;

    // Record the transfer calculation
    await ctx.db.insert("transfers", {
      carId: args.carId,
      buyerRegion: region,
      calculatedTax,
      taxRate,
      timestamp: Date.now(),
    });

    // Build response with notes
    const notes: string[] = [];
    if (HIGH_POWER_REGIONS.includes(region) && car.fiscalPower > HIGH_POWER_CV_THRESHOLD) {
      notes.push(`⚠️ Aplica tarifa alta (>15 CV): ${car.fiscalPower} CV fiscales`);
    }
    if ((region === "Ceuta" || region === "Melilla") && args.isResident) {
      notes.push("✅ Aplicado descuento del 50% por residencia");
    }

    return {
      car,
      region,
      taxRate: `${(taxRate * 100).toFixed(1)}%`,
      calculatedTax,
      fiscalValue: car.fiscalValue,
      notes: notes.length > 0 ? notes : undefined,
    };
  },
});

// Get all regions and their tax rates (for UI display)
export const getTaxRatesByRegion = query({
  args: {},
  handler: async () => {
    return Object.entries(REGIONAL_TAX_RATES).map(([region, rate]) => ({
      region,
      rate: `${(rate * 100).toFixed(1)}%`,
      specialRules: getSpecialRules(region),
    }));
  },
});

function getSpecialRules(region: string): string | undefined {
  const rules: Record<string, string> = {
    "Andalucía": "8% si >15 CV",
    "Asturias": "8% si >15 CV",
    "Baleares": "8% si >15 CV, ciclomotores exentos",
    "Canarias": "Cuotas fijas si >10 años",
    "Cantabria": "Cuotas fijas €55-115 si antiguo",
    "Castilla y León": "8% si >15 CV",
    "Cataluña": "Exento si >10 años y <€40k",
    "Ceuta": "2% para residentes (50% desc.)",
    "Comunidad Valenciana": "8% si >2000cc",
    "Extremadura": "4% vehículos comerciales",
    "Galicia": "0% emisiones cero, cuotas fijas >15 años",
    "Melilla": "2% para residentes (50% desc.)",
    "Murcia": "Cuotas fijas si >12 años",
  };
  return rules[region];
}

// Mutation to seed mock data
export const seedMockData = mutation({
  args: {},
  handler: async (ctx) => {
    const mockCars = [
      { maker: "toyota", model: "Corolla", year: 2020, fiscalPower: 12, fiscalValue: 18000, fuelType: "hybrid" },
      { maker: "toyota", model: "Yaris", year: 2019, fiscalPower: 9, fiscalValue: 14000, fuelType: "hybrid" },
      { maker: "toyota", model: "RAV4", year: 2021, fiscalPower: 15, fiscalValue: 32000, fuelType: "hybrid" },
      { maker: "toyota", model: "Land Cruiser", year: 2020, fiscalPower: 20, fiscalValue: 55000, fuelType: "diesel" },
      { maker: "seat", model: "Ibiza", year: 2018, fiscalPower: 9.5, fiscalValue: 12000, fuelType: "gasoline" },
      { maker: "seat", model: "León", year: 2020, fiscalPower: 13, fiscalValue: 20000, fuelType: "gasoline" },
      { maker: "seat", model: "Ateca", year: 2021, fiscalPower: 15, fiscalValue: 26000, fuelType: "diesel" },
      { maker: "volkswagen", model: "Golf", year: 2019, fiscalPower: 11.5, fiscalValue: 19000, fuelType: "gasoline" },
      { maker: "volkswagen", model: "Polo", year: 2020, fiscalPower: 9.5, fiscalValue: 15000, fuelType: "gasoline" },
      { maker: "volkswagen", model: "Tiguan", year: 2021, fiscalPower: 15, fiscalValue: 32000, fuelType: "diesel" },
      { maker: "renault", model: "Clio", year: 2019, fiscalPower: 9, fiscalValue: 13000, fuelType: "gasoline" },
      { maker: "renault", model: "Captur", year: 2020, fiscalPower: 11, fiscalValue: 18000, fuelType: "gasoline" },
      { maker: "renault", model: "Megane", year: 2018, fiscalPower: 13, fiscalValue: 16000, fuelType: "diesel" },
      { maker: "bmw", model: "Serie 1", year: 2020, fiscalPower: 14, fiscalValue: 28000, fuelType: "gasoline" },
      { maker: "bmw", model: "Serie 3", year: 2021, fiscalPower: 18.4, fiscalValue: 45000, fuelType: "diesel" },
      { maker: "bmw", model: "X5", year: 2020, fiscalPower: 22, fiscalValue: 65000, fuelType: "diesel" },
      { maker: "bmw", model: "X1", year: 2019, fiscalPower: 15, fiscalValue: 35000, fuelType: "diesel" },
      { maker: "mercedes", model: "Clase A", year: 2020, fiscalPower: 13.6, fiscalValue: 32000, fuelType: "gasoline" },
      { maker: "mercedes", model: "Clase C", year: 2021, fiscalPower: 17, fiscalValue: 45000, fuelType: "diesel" },
      { maker: "mercedes", model: "Clase E", year: 2020, fiscalPower: 19, fiscalValue: 55000, fuelType: "diesel" },
      { maker: "audi", model: "A3", year: 2019, fiscalPower: 15, fiscalValue: 29000, fuelType: "gasoline" },
      { maker: "audi", model: "A4", year: 2020, fiscalPower: 19, fiscalValue: 38000, fuelType: "diesel" },
      { maker: "audi", model: "Q3", year: 2021, fiscalPower: 15, fiscalValue: 40000, fuelType: "gasoline" },
      { maker: "audi", model: "Q5", year: 2020, fiscalPower: 18, fiscalValue: 52000, fuelType: "diesel" },
      { maker: "peugeot", model: "208", year: 2020, fiscalPower: 9, fiscalValue: 15000, fuelType: "gasoline" },
      { maker: "peugeot", model: "3008", year: 2021, fiscalPower: 13, fiscalValue: 28000, fuelType: "diesel" },
      { maker: "ford", model: "Fiesta", year: 2019, fiscalPower: 9, fiscalValue: 14000, fuelType: "gasoline" },
      { maker: "ford", model: "Focus", year: 2020, fiscalPower: 12, fiscalValue: 20000, fuelType: "gasoline" },
      { maker: "ford", model: "Kuga", year: 2021, fiscalPower: 14, fiscalValue: 28000, fuelType: "hybrid" },
      { maker: "hyundai", model: "i30", year: 2020, fiscalPower: 11, fiscalValue: 18000, fuelType: "gasoline" },
      { maker: "hyundai", model: "Tucson", year: 2021, fiscalPower: 13, fiscalValue: 28000, fuelType: "hybrid" },
      { maker: "kia", model: "Ceed", year: 2020, fiscalPower: 11, fiscalValue: 17000, fuelType: "gasoline" },
      { maker: "kia", model: "Sportage", year: 2021, fiscalPower: 13, fiscalValue: 27000, fuelType: "hybrid" },
      { maker: "citroen", model: "C3", year: 2019, fiscalPower: 8.5, fiscalValue: 12000, fuelType: "gasoline" },
      { maker: "citroen", model: "C4", year: 2020, fiscalPower: 11, fiscalValue: 19000, fuelType: "gasoline" },
      { maker: "opel", model: "Corsa", year: 2020, fiscalPower: 9, fiscalValue: 13000, fuelType: "gasoline" },
      { maker: "opel", model: "Astra", year: 2021, fiscalPower: 12, fiscalValue: 22000, fuelType: "gasoline" },
      { maker: "fiat", model: "500", year: 2019, fiscalPower: 7, fiscalValue: 12000, fuelType: "gasoline" },
      { maker: "fiat", model: "Tipo", year: 2020, fiscalPower: 10, fiscalValue: 16000, fuelType: "gasoline" },
      { maker: "dacia", model: "Sandero", year: 2020, fiscalPower: 8, fiscalValue: 10000, fuelType: "gasoline" },
      { maker: "dacia", model: "Duster", year: 2021, fiscalPower: 11, fiscalValue: 16000, fuelType: "gasoline" },
      { maker: "tesla", model: "Model 3", year: 2021, fiscalPower: 0, fiscalValue: 45000, fuelType: "electric" },
      { maker: "tesla", model: "Model Y", year: 2022, fiscalPower: 0, fiscalValue: 52000, fuelType: "electric" },
    ];

    const inserted = [];
    for (const car of mockCars) {
      const id = await ctx.db.insert("cars", car);
      inserted.push({ id, ...car });
    }

    return { count: inserted.length, cars: inserted };
  },
});
