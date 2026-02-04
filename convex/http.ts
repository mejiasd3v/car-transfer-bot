import { httpRouter } from "convex/server";

const http = httpRouter();

// Search cars endpoint (called from Kapso bot)
http.route({
  path: "/api/searchCars",
  method: "GET",
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const maker = url.searchParams.get("maker");
    const year = url.searchParams.get("year");
    
    if (!maker) {
      return new Response(JSON.stringify({ error: "Maker is required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    try {
      const cars = await ctx.runQuery("cars:searchCars", {
        maker,
        year: year ? parseInt(year) : undefined,
      });
      
      return new Response(JSON.stringify(cars), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to search cars" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
});

// Calculate transfer tax endpoint (called from Kapso bot)
http.route({
  path: "/api/calculateTransferTax",
  method: "POST",
  handler: async (ctx, request) => {
    try {
      const body = await request.json();
      const { carId, region } = body;
      
      if (!carId) {
        return new Response(JSON.stringify({ error: "Car ID is required" }), { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const result = await ctx.runMutation("cars:calculateTransferTax", {
        carId,
        region,
      });
      
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to calculate tax" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
});

// Seed endpoint for initial data
http.route({
  path: "/api/seed",
  method: "POST",
  handler: async (ctx) => {
    try {
      const result = await ctx.runMutation("cars:seedMockData");
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to seed data" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
});

export default http;
