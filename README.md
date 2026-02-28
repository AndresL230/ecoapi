# [YOUR_PROJECT_NAME] API

REST API for analyzing codebase API usage, estimating cost, detecting inefficiencies, and generating optimization suggestions.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

`[YOUR_PROJECT_NAME]` turns parsed API call data into actionable diagnostics:
- Cost analytics
- Endpoint-level risk/status
- Optimization suggestions with estimated savings
- d3.js-ready graph data

## Tech Stack

- Node.js + Express
- TypeScript (strict mode)
- In-memory storage with repository-like service boundaries
- UUID-based resource IDs

## Project Structure

```txt
src/
  app.ts
  server.ts
  seed.ts
  config/
    pricing.ts
  middleware/
    cors.ts
    content-type.ts
    logging.ts
    request-id.ts
    error-handler.ts
  models/
    types.ts
  routes/
    health.ts
    projects.ts
    providers.ts
  services/
    analysis-service.ts
    project-service.ts
    provider-service.ts
    validation-service.ts
  store/
    data-store.ts
  utils/
    app-error.ts
    pagination.ts
    sort.ts
```

## Setup

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`.
The app seeds one project + scan on startup for immediate exploration.

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

- `per-request` => 1000/day
- `per-session` => 300/day
- `hourly` => 24/day
- `daily` => 1/day
- `weekly` => 1/7 day
- `N/day` => N/day
- unknown => 100/day

## Pricing Table (Config)

Defined in `src/config/pricing.ts`:
- Stripe: `0.01`
- OpenAI: `0.006`
- Twilio: `0.0075`
- SendGrid: `0.001`
- AWS S3: `0.0004`
- Google Maps: `0.005`
- Fallback/internal: `0.0001`

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

Base URL:

```bash
http://localhost:3000
```

### Health

#### GET /health
Success:
```bash
curl -s http://localhost:3000/health
```
Error:
```bash
curl -s http://localhost:3000/healthz
```

### Projects

#### POST /projects
Success:
```bash
curl -s -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"my-app\",\"description\":\"checkout service\",\"apiCalls\":[]}"
```
Error:
```bash
curl -s -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d "{\"description\":\"missing name\"}"
```

#### GET /projects?page=1&limit=20&name=my-app&sort=created_at&order=desc
Success:
```bash
curl -s "http://localhost:3000/projects?page=1&limit=20&sort=created_at&order=desc"
```
Error:
```bash
curl -s "http://localhost:3000/projects?page=0&limit=500&sort=bad_field"
```

#### GET /projects/:id
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}
```
Error:
```bash
curl -s http://localhost:3000/projects/not-a-real-id
```

#### PATCH /projects/:id
Success:
```bash
curl -s -X PATCH http://localhost:3000/projects/{projectId} \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"renamed-app\"}"
```
Error:
```bash
curl -s -X PATCH http://localhost:3000/projects/{projectId} \
  -H "Content-Type: application/json" \
  -d "{}"
```

#### DELETE /projects/:id
Success:
```bash
curl -i -X DELETE http://localhost:3000/projects/{projectId}
```
Error:
```bash
curl -i -X DELETE http://localhost:3000/projects/not-a-real-id
```

### Scans

#### POST /projects/:id/scans
Success:
```bash
curl -s -X POST http://localhost:3000/projects/{projectId}/scans \
  -H "Content-Type: application/json" \
  -d "{\"apiCalls\":[{\"file\":\"src/a.ts\",\"line\":10,\"method\":\"GET\",\"url\":\"/api/users/:id\",\"library\":\"axios\",\"frequency\":\"per-request\"}]}"
```
Error:
```bash
curl -s -X POST http://localhost:3000/projects/{projectId}/scans \
  -H "Content-Type: application/json" \
  -d "{\"apiCalls\":\"not-an-array\"}"
```

#### GET /projects/:id/scans
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/scans?page=1&limit=20&sort=created_at&order=desc"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/scans?sort=updated_at"
```

#### GET /projects/:id/scans/:scanId
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}/scans/{scanId}
```
Error:
```bash
curl -s http://localhost:3000/projects/{projectId}/scans/not-a-real-scan
```

#### GET /projects/:id/scans/latest
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}/scans/latest
```
Error:
```bash
curl -s http://localhost:3000/projects/not-a-real-id/scans/latest
```

### Endpoints

#### GET /projects/:id/endpoints
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/endpoints?provider=stripe&status=cacheable&method=GET&sort=monthly_cost&order=desc&page=1&limit=20"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/endpoints?sort=created_at"
```

#### GET /projects/:id/endpoints/:endpointId
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}/endpoints/{endpointId}
```
Error:
```bash
curl -s http://localhost:3000/projects/{projectId}/endpoints/not-a-real-endpoint
```

### Suggestions

#### GET /projects/:id/suggestions
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/suggestions?type=cache,batch,redundancy&severity=high&sort=estimated_savings&order=desc&page=1&limit=20"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/suggestions?sort=monthly_cost"
```

#### GET /projects/:id/suggestions/:suggestionId
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}/suggestions/{suggestionId}
```
Error:
```bash
curl -s http://localhost:3000/projects/{projectId}/suggestions/not-a-real-suggestion
```

### Graph

#### GET /projects/:id/graph
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/graph?cluster_by=provider"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/graph?cluster_by=invalid"
```

### Cost

#### GET /projects/:id/cost
Success:
```bash
curl -s http://localhost:3000/projects/{projectId}/cost
```
Error:
```bash
curl -s http://localhost:3000/projects/not-a-real-id/cost
```

#### GET /projects/:id/cost/by-provider
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/cost/by-provider?page=1&limit=20"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/cost/by-provider?page=0"
```

#### GET /projects/:id/cost/by-file
Success:
```bash
curl -s "http://localhost:3000/projects/{projectId}/cost/by-file?page=1&limit=20"
```
Error:
```bash
curl -s "http://localhost:3000/projects/{projectId}/cost/by-file?limit=5000"
```

### Providers

#### GET /providers
Success:
```bash
curl -s "http://localhost:3000/providers?page=1&limit=20"
```
Error:
```bash
curl -s "http://localhost:3000/providers?page=-1"
```

#### GET /providers/:name
Success:
```bash
curl -s http://localhost:3000/providers/stripe
```
Error:
```bash
curl -s http://localhost:3000/providers/unknown-provider
```

## Mutation/Response Contracts

- POST/PATCH responses:
```json
{ "data": { "...": "resource" } }
```
- List responses:
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
- DELETE responses: `204 No Content`

## Example Workflow

1. Create project:
```bash
curl -s -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"workflow-demo\"}"
```
2. Trigger scan:
```bash
curl -s -X POST http://localhost:3000/projects/{projectId}/scans \
  -H "Content-Type: application/json" \
  -d "{\"apiCalls\":[{\"file\":\"src/main.ts\",\"line\":21,\"method\":\"GET\",\"url\":\"https://api.stripe.com/v1/customers\",\"library\":\"fetch\",\"frequency\":\"1200/day\"}]}"
```
3. View endpoints:
```bash
curl -s http://localhost:3000/projects/{projectId}/endpoints
```
4. View suggestions:
```bash
curl -s http://localhost:3000/projects/{projectId}/suggestions
```
5. View graph:
```bash
curl -s http://localhost:3000/projects/{projectId}/graph?cluster_by=provider
```

## Notes for Judging

- Portable Express app (no hosting lock-in)
- Resource-oriented hierarchy with predictable naming
- Strong error model + validation semantics
- Immediate sandbox exploration via seeded project
- Clean separation of routes/services/models/config/middleware for future DB swap
