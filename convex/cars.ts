import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Spanish transfer tax rates by autonomous community (simplified)
const REGIONAL_TAX_RATES: Record<string, number> = {
  "Andalucía": 0.04,
  "Aragón": 0.04,
  "Asturias": 0.04,
  "Baleares": 0.04,
  "Canarias": 0.00, // No transfer tax in Canarias, has IGIC instead
  "Cantabria": 0.05,
  "Castilla-La Mancha": 0.04,
  "Castilla y León": 0.04,
  "Cataluña": 0.05,
  "Comunidad Valenciana": 0.04,
  "Extremadura": 0.06,
  "Galicia": 0.04,
  "La Rioja": 0.04,
  "Madrid": 0.04,
  "Murcia": 0.04,
  "Navarra": 0.04,
  "País Vasco": 0.04,
  "Ceuta": 0.00,
  "Melilla": 0.00,
};

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
  },
  handler: async (ctx, args) => {
    const car = await ctx.db.get(args.carId);
    if (!car) {
      throw new Error("Car not found");
    }

    const region = args.region || "Madrid";
    const taxRate = REGIONAL_TAX_RATES[region] || DEFAULT_TAX_RATE;
    
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

    return {
      car,
      region,
      taxRate: `${(taxRate * 100).toFixed(0)}%`,
      calculatedTax,
      fiscalValue: car.fiscalValue,
    };
  },
});

// Mutation to seed mock data
export const seedMockData = mutation({
  args: {},
  handler: async (ctx) => {
    const mockCars = [
      { maker: "toyota", model: "Corolla", year: 2020, fiscalPower: 120, fiscalValue: 18000, fuelType: "gasoline" },
      { maker: "toyota", model: "Yaris", year: 2019, fiscalPower: 90, fiscalValue: 14000, fuelType: "hybrid" },
      { maker: "toyota", model: "RAV4", year: 2021, fiscalPower: 150, fiscalValue: 28000, fuelType: "hybrid" },
      { maker: "seat", model: "Ibiza", year: 2018, fiscalPower: 95, fiscalValue: 12000, fuelType: "gasoline" },
      { maker: "seat", model: "León", year: 2020, fiscalPower: 130, fiscalValue: 20000, fuelType: "gasoline" },
      { maker: "seat", model: "Ateca", year: 2021, fiscalPower: 150, fiscalValue: 26000, fuelType: "diesel" },
      { maker: "volkswagen", model: "Golf", year: 2019, fiscalPower: 115, fiscalValue: 19000, fuelType: "gasoline" },
      { maker: "volkswagen", model: "Polo", year: 2020, fiscalPower: 95, fiscalValue: 15000, fuelType: "gasoline" },
      { maker: "volkswagen", model: "Tiguan", year: 2021, fiscalPower: 150, fiscalValue: 32000, fuelType: "diesel" },
      { maker: "renault", model: "Clio", year: 2019, fiscalPower: 90, fiscalValue: 13000, fuelType: "gasoline" },
      { maker: "renault", model: "Captur", year: 2020, fiscalPower: 110, fiscalValue: 18000, fuelType: "gasoline" },
      { maker: "renault", model: "Megane", year: 2018, fiscalPower: 130, fiscalValue: 16000, fuelType: "diesel" },
      { maker: "bmw", model: "Serie 1", year: 2020, fiscalPower: 140, fiscalValue: 28000, fuelType: "gasoline" },
      { maker: "bmw", model: "Serie 3", year: 2021, fiscalPower: 184, fiscalValue: 42000, fuelType: "diesel" },
      { maker: "bmw", model: "X1", year: 2019, fiscalPower: 150, fiscalValue: 35000, fuelType: "diesel" },
      { maker: "mercedes", model: "Clase A", year: 2020, fiscalPower: 136, fiscalValue: 32000, fuelType: "gasoline" },
      { maker: "mercedes", model: "Clase C", year: 2021, fiscalPower: 170, fiscalValue: 45000, fuelType: "diesel" },
      { maker: "audi", model: "A3", year: 2019, fiscalPower: 150, fiscalValue: 29000, fuelType: "gasoline" },
      { maker: "audi", model: "A4", year: 2020, fiscalPower: 190, fiscalValue: 38000, fuelType: "diesel" },
      { maker: "audi", model: "Q3", year: 2021, fiscalPower: 150, fiscalValue: 40000, fuelType: "gasoline" },
    ];

    const inserted = [];
    for (const car of mockCars) {
      const id = await ctx.db.insert("cars", car);
      inserted.push({ id, ...car });
    }

    return { count: inserted.length, cars: inserted };
  },
});
