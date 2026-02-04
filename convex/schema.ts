import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cars: defineTable({
    maker: v.string(),
    model: v.string(),
    year: v.number(),
    fiscalPower: v.number(), // CV - Caballos Fiscales
    fiscalValue: v.number(), // Valor fiscal en euros
    fuelType: v.union(v.literal("gasoline"), v.literal("diesel"), v.literal("electric"), v.literal("hybrid")),
  })
    .index("by_maker", ["maker"])
    .index("by_year", ["year"])
    .index("by_maker_year", ["maker", "year"]),
    
  transfers: defineTable({
    carId: v.id("cars"),
    buyerRegion: v.string(), // Comunidad autónoma
    calculatedTax: v.number(),
    taxRate: v.number(), // Applied percentage
    timestamp: v.number(),
  }).index("by_car", ["carId"]),
});
