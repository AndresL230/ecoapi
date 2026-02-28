# EcoAPI

REST API for analyzing codebase API usage, estimating cost, detecting inefficiencies, and generating optimization suggestions.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

EcoAPI turns parsed API call data into actionable diagnostics:
- Cost analytics
- Endpoint-level risk/status
- Optimization suggestions with estimated savings
- D3.js-ready graph data

## Tech Stack

- **Cloudflare Workers** — serverless runtime
- **Hono** — web framework (Workers-compatible, Express-like)
- **Cloudflare D1** — SQLite database (persistent)
- **TypeScript** — strict mode

## Project Structure

```
src/
  index.ts              # Workers entry point (Hono app)
  env.ts                # Shared Env/Variables/AppContext types
  config/
    pricing.ts          # Provider pricing & keyword detection
  middleware/
    cors.ts
    content-type.ts
    logging.ts
    request-id.ts
    error-handler.ts
  models/
    types.ts            # TypeScript domain types
  routes/
    health.ts
    projects.ts
    providers.ts
  services/
    analysis-service.ts     # Core analysis engine (pure, sync)
    project-service.ts      # All CRUD via D1 (async)
    provider-service.ts     # Provider config lookups
    validation-service.ts   # Input validation
  utils/
    app-error.ts
    pagination.ts
    sort.ts
migrations/
  0001_schema.sql       # D1 table definitions
  0002_seed.sql         # Demo project seed data
```

## Setup

```bash
npm install
npx wrangler d1 create eco-db          # create D1 database
# paste the returned database_id into wrangler.toml
npm run db:migrate:local                # apply schema + seed data
npm run dev                             # start local dev server
```

The app seeds one project + scan via migration for immediate exploration.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server (`wrangler dev`) |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run typecheck` | TypeScript type check |
| `npm run db:migrate:local` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to production |

## Core Behavior

- CORS headers on all responses
- `X-Request-Id` on every response
- JSON validation with `422` field-level errors
- `400` for malformed JSON or missing/invalid `Content-Type`
- Consistent error shape:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Project with id 'abc123' not found",
    "status": 404
  }
}
```

## Frequency Heuristics

| Input | Calls/day |
|-------|-----------|
| `per-request` | 1000 |
| `per-session` | 300 |
| `hourly` | 24 |
| `daily` | 1 |
| `weekly` | 1/7 |
| `N/day` | N |
| unknown | 100 |

## Pricing Table

Defined in `src/config/pricing.ts`:

| Provider | Cost per call (USD) |
|----------|-------------------|
| Stripe | $0.01 |
| OpenAI | $0.006 |
| Twilio | $0.0075 |
| SendGrid | $0.001 |
| AWS S3 | $0.0004 |
| Google Maps | $0.005 |
| Internal/fallback | $0.0001 |

## Example Scan Payload

```json
{
  "apiCalls": [
    {
      "file": "src/checkout.ts",
      "line": 47,
      "method": "GET",
      "url": "/api/users/:id",
      "library": "axios",
      "frequency": "per-request"
    }
  ]
}
```

## API Reference

### Health

```
GET /health
```

### Projects

```
POST   /projects
GET    /projects?page=1&limit=20&name=my-app&sort=created_at&order=desc
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
```

### Scans

```
POST   /projects/:id/scans
GET    /projects/:id/scans?page=1&limit=20&sort=created_at&order=desc
GET    /projects/:id/scans/latest
GET    /projects/:id/scans/:scanId
```

### Endpoints

```
GET    /projects/:id/endpoints?provider=stripe&status=cacheable&method=GET&sort=monthly_cost&order=desc
GET    /projects/:id/endpoints/:endpointId
```

### Suggestions

```
GET    /projects/:id/suggestions?type=cache,batch&severity=high&sort=estimated_savings&order=desc
GET    /projects/:id/suggestions/:suggestionId
```

### Graph

```
GET    /projects/:id/graph?cluster_by=provider|file|cost
```

### Cost Analytics

```
GET    /projects/:id/cost
GET    /projects/:id/cost/by-provider?page=1&limit=20
GET    /projects/:id/cost/by-file?page=1&limit=20
```

### Providers

```
GET    /providers?page=1&limit=20
GET    /providers/:name
```

## Response Formats

**Single resource:**
```json
{ "data": { "...": "resource" } }
```

**Paginated list:**
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**DELETE:** `204 No Content`

## Example Workflow

```bash
# 1. Create project
curl -s -X POST https://your-worker.workers.dev/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app"}'

# 2. Trigger scan
curl -s -X POST https://your-worker.workers.dev/projects/{projectId}/scans \
  -H "Content-Type: application/json" \
  -d '{"apiCalls":[{"file":"src/main.ts","line":21,"method":"GET","url":"https://api.stripe.com/v1/customers","library":"fetch","frequency":"1200/day"}]}'

# 3. View endpoints
curl -s https://your-worker.workers.dev/projects/{projectId}/endpoints

# 4. View suggestions
curl -s https://your-worker.workers.dev/projects/{projectId}/suggestions

# 5. View cost breakdown
curl -s https://your-worker.workers.dev/projects/{projectId}/cost/by-provider
```
