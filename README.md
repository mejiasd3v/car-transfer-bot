# Car Transfer Bot - Spanish Vehicle Transfer Cost Calculator

A WhatsApp bot that helps calculate the cost of transferring vehicle ownership in Spain, including the Impuesto de Transmisiones Patrimoniales (ITP/transfer tax).

## 🚀 Tech Stack

- **WhatsApp Integration**: [Kapso AI](https://docs.kapso.ai) - WhatsApp Business API wrapper
- **Backend & Database**: [Convex](https://convex.dev) - Serverless backend with real-time database
- **Deployment**: Vercel (for webhook endpoint)

## 📋 Features

- 🔍 Search vehicles by make, model, and year
- 💰 Calculate transfer tax based on Spanish autonomous community
- 📊 Shows fiscal value and tax rates
- 🇪🇸 Supports all Spanish regions with their specific tax rates

## 🏗️ Architecture

```
User (WhatsApp) → Kapso → Vercel Webhook → Convex API → Response
```

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/mejiasd3v/car-transfer-bot.git
cd car-transfer-bot
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will:
- Create a new Convex project
- Set up the database schema
- Start a local dev server

### 3. Seed the Database

```bash
# Get your Convex site URL from the dashboard
curl -X POST https://<your-convex-site>.convex.site/api/seed
```

This populates the database with 20 mock vehicles.

### 4. Configure Environment Variables

Create a `.env` file:

```bash
# Kapso AI (from https://kapso.ai dashboard)
KAPSO_API_KEY=your_kapso_api_key

# Convex (auto-populated by convex dev)
CONVEX_SITE_URL=https://your-project.convex.site
```

### 5. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set the environment variables in Vercel dashboard:
- `KAPSO_API_KEY`
- `CONVEX_SITE_URL`

### 6. Configure Kapso Webhook

In your Kapso dashboard, set the webhook URL to:
```
https://your-vercel-app.vercel.app/webhook
```

## 💡 How to Use

1. **Start a conversation**: Send any message to the WhatsApp number
2. **Enter car brand**: Example: "Toyota"
3. **Enter year**: Example: "2020" (or type "saltar" to skip)
4. **Select model**: Choose from the list
5. **Enter region**: Select your autonomous community
6. **Get results**: Receive the calculated transfer tax

### Example Conversation

```
User: Hola
Bot: ¡Hola! ¿Qué marca de coche te interesa?

User: Toyota
Bot: ✅ Marca: TOYOTA
      ¿De qué año es el vehículo?

User: 2020
Bot: 🚗 Encontré 3 modelos de TOYOTA del 2020:
      1. Corolla (2020) - 18,000€
      2. Yaris (2020) - 14,000€
      3. RAV4 (2020) - 28,000€
      
User: 1
Bot: 🚗 TOYOTA Corolla (2020)
      💰 Valor fiscal: 18,000€
      ¿En qué comunidad autónoma?
      
User: Madrid
Bot: 📊 RESULTADO DE LA TRANSFERENCIA
      🚗 Vehículo: TOYOTA Corolla (2020)
      💰 Valor fiscal: 18,000€
      📍 Comunidad: Madrid
      📈 Tipo impositivo: 4%
      
      💵 IMPUESTO DE TRANSFERENCIAS: 720€
```

## 📊 Tax Rates by Region

| Region | Tax Rate |
|--------|----------|
| Madrid | 4% |
| Cataluña | 5% |
| Andalucía | 4% |
| Comunidad Valenciana | 4% |
| Canarias | 0% (IGIC applies) |
| Extremadura | 6% |
| Cantabria | 5% |
| Rest of Spain | 4% |

## 🗂️ Project Structure

```
car-transfer-bot/
├── convex/
│   ├── schema.ts      # Database schema
│   ├── cars.ts        # Queries and mutations
│   └── http.ts        # HTTP actions for Kapso
├── bot.ts             # Kapso WhatsApp bot logic
├── vercel.json        # Vercel deployment config
├── package.json
└── README.md
```

## 🧪 Development

Run locally:
```bash
# Terminal 1: Start Convex dev server
npx convex dev

# Terminal 2: Start Vercel dev server  
vercel dev
```

## 📝 Adding Real Car Data

To replace mock data with real vehicle data:

1. Modify `convex/cars.ts` → `seedMockData` mutation
2. Import your data from CSV/JSON
3. Re-run the seed endpoint

Example car record:
```typescript
{
  maker: "toyota",        // lowercase, no spaces
  model: "Corolla",       // exact model name
  year: 2020,             // manufacturing year
  fiscalPower: 120,       // CV (Caballos Fiscales)
  fiscalValue: 18000,     // Valor fiscal en euros
  fuelType: "hybrid"      // gasoline | diesel | electric | hybrid
}
```

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ in Spain 🇪🇸
