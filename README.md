# Car Transfer Bot - Spanish Vehicle Transfer Cost Calculator

A WhatsApp bot that helps calculate the cost of transferring vehicle ownership in Spain, including the Impuesto de Transmisiones Patrimoniales (ITP/transfer tax).

## 🚀 Tech Stack

- **WhatsApp Integration**: [Kapso AI](https://kapso.ai) - WhatsApp Business API + Functions (Cloudflare Workers)
- **Backend & Database**: [Convex](https://convex.dev) - Serverless backend with real-time database

## 📋 Features

- 🔍 Search vehicles by make, model, and year
- 💰 Calculate transfer tax based on Spanish autonomous community
- 📊 Shows fiscal value and tax rates
- 🇪🇸 Supports all Spanish regions with their specific tax rates
- ⚡ Handles special cases (high-power vehicles, resident discounts)

## 🏗️ Architecture

```
User (WhatsApp) → Kapso → Kapso Function (bot.ts) → Convex API → Response
```

## 📊 ITP Tax Rates by Region (2026)

| Rank | Region | Tax Rate | Notes |
|------|--------|----------|-------|
| 🥇 | Galicia | **3%** | Reduced in 2024 |
| 🥈 | Andalucía | **4%** | 8% if >15 CV |
| 🥈 | Aragón | **4%** | Fixed fees if >10 years old |
| 🥈 | Asturias | **4%** | 8% if >15 CV |
| 🥈 | Baleares | **4%** | 8% if >15 CV, ciclomotores exempt |
| 🥈 | La Rioja | **4%** | - |
| 🥈 | Madrid | **4%** | - |
| 🥈 | Murcia | **4%** | Fixed fees if >12 years old |
| 🥈 | Navarra | **4%** | - |
| 🥈 | País Vasco | **4%** | - |
| 🥈 | Ceuta | **4%** (2% residents) | 50% discount for residents |
| 🥈 | Melilla | **4%** (2% residents) | 50% discount for residents |
| - | Castilla y León | **5%** | 8% if >15 CV |
| - | Cataluña | **5%** | Exempt if >10 years & <€40k |
| - | Canarias | **5.5%** | - |
| - | Castilla-La Mancha | **6%** | - |
| - | Comunidad Valenciana | **6%** | 8% if >2000cc |
| - | Extremadura | **6%** | - |
| ⚠️ | Cantabria | **8%** | Most expensive |

### Special Cases

- **High-power vehicles (>15 CV)**: Andalucía, Asturias, Baleares, Castilla y León apply 8%
- **Ceuta & Melilla residents**: 50% discount (effectively 2%)
- **Cataluña**: Vehicles >10 years old with value <€40,000 are exempt
- **Galicia**: Zero emissions vehicles are exempt
- **Canarias, Aragón, Murcia, Galicia**: Fixed fees for old vehicles (>10-15 years)

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
- Generate the `_generated` types
- Start a local dev server

### 3. Seed the Database

```bash
# Get your Convex site URL from the dashboard
curl -X POST https://<your-convex-site>.convex.site/api/seed
```

This populates the database with 45 mock vehicles.

### 4. Configure Kapso

#### 4.1 Install Kapso CLI

```bash
npm install -g kapso
```

#### 4.2 Login to Kapso

```bash
kapso login
# Enter your API key from https://kapso.ai/dashboard
```

#### 4.3 Set up Function Secrets

Deploy the function first (it will fail without secrets, but creates the function):

```bash
kapso functions push bot.ts
```

Then add secrets in the Kapso dashboard (Functions → bot → Secrets tab):

| Secret | Value |
|--------|-------|
| `CONVEX_SITE_URL` | `https://your-project.convex.site` |
| `KAPSO_API_KEY` | Your Kapso API key (optional, for sending replies) |

### 5. Configure WhatsApp Webhook

In your Kapso dashboard:
1. Go to your WhatsApp number settings
2. Set the webhook URL to your deployed function:
   ```
   https://your-function.kapso.workers.dev
   ```
3. Select events: `whatsapp.message.received`

## 💡 How to Use

1. **Start a conversation**: Send any message to the WhatsApp number
2. **Enter car brand**: Example: "Toyota"
3. **Enter year**: Example: "2020" (or type "saltar" to skip)
4. **Select model**: Choose from the list
5. **Enter region**: Select your autonomous community
6. **Resident check** (Ceuta/Melilla only): Confirm if you're a resident
7. **Get results**: Receive the calculated transfer tax

### Commands

- `inicio` / `empezar` - Start a new query
- `tasas` / `precios` - View all regional tax rates
- `ayuda` / `help` - Show help message

### Example Conversation

```
User: Hola
Bot: 👋 ¡Hola! Bienvenido a la Calculadora de Transferencia de Coches.
     Te ayudo a calcular el ITP para vehículos de segunda mano en España.

User: Toyota
Bot: ✅ Marca: TOYOTA
      ¿De qué año es el vehículo?

User: 2020
Bot: 🚗 Encontré 4 modelos de TOYOTA del 2020:
      1. Corolla (2020) - 18,000€
      2. Yaris (2020) - 14,000€
      3. RAV4 (2020) - 32,000€
      4. Land Cruiser (2020) - 55,000€
      
User: 1
Bot: 🚗 TOYOTA Corolla (2020)
      💪 12 CV fiscales
      💰 Valor fiscal: 18,000€
      ¿En qué comunidad autónoma?

User: Madrid
Bot: 📊 RESULTADO DE LA TRANSFERENCIA
      🚗 Vehículo: TOYOTA Corolla (2020)
      💪 12 CV fiscales
      💰 Valor fiscal: 18,000€
      📍 Comunidad: Madrid
      📈 Tipo impositivo: 4.0%
      
      ━━━━━━━━━━━━━━━━━━━━━━
      💵 IMPUESTO DE TRANSFERENCIAS: 720€
      ━━━━━━━━━━━━━━━━━━━━━━
      
      ⚠️ Este cálculo es orientativo...
```

## 🗂️ Project Structure

```
car-transfer-bot/
├── convex/
│   ├── schema.ts      # Database schema
│   ├── cars.ts        # Queries, mutations, and tax calculation logic
│   └── http.ts        # HTTP actions for external API
├── bot.ts             # Kapso Function - WhatsApp bot handler
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
└── README.md
```

## 🧪 Development

### Type Check

```bash
npm run typecheck
```

### Update Kapso Function

```bash
kapso functions push bot.ts
```

### View Function Logs

```bash
kapso functions logs bot
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
  fiscalPower: 12,        // CV (Caballos Fiscales)
  fiscalValue: 18000,     // Valor fiscal en euros (from BOE tables)
  fuelType: "hybrid"      // gasoline | diesel | electric | hybrid
}
```

## 🔍 Data Sources

Tax rates verified from:
- https://www.traficgestion.es/itp-transferencia-vehiculo/
- https://www.gestoriavehiculos.com/transferencia/

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ in Spain 🇪🇸 | Data updated for 2026
