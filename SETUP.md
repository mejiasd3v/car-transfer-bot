# Project Configuration

## Convex Project
- Project ID: `car-transfer-bot`
- Region: `us-east1`

## Kapso AI Setup
1. Create account at https://kapso.ai
2. Get API key from dashboard
3. Configure WhatsApp Business number
4. Set webhook URL to Vercel deployment

## Environment Variables Required

### Local Development
```bash
# .env.local (auto-created by convex dev)
CONVEX_DEPLOY_KEY=...

# .env
KAPSO_API_KEY=sk_live_...
CONVEX_SITE_URL=https://...convex.site
```

### Production (Vercel)
- `KAPSO_API_KEY`
- `CONVEX_SITE_URL`
