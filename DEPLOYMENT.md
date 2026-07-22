# Opvoedadvies — Deployment & Portability Guide

## Architecture Overview

The Opvoedadvies platform consists of:

1. **Mobile App** (React Native / Expo) — iOS & Android
2. **API Server** (Express + tRPC) — Node.js backend
3. **Database** (PostgreSQL) — Drizzle ORM
4. **Public Website** — Server-rendered HTML (landing page)
5. **Web Dashboard** — Server-rendered SPA (logged-in users)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |
| `JWT_SECRET` | Yes | Secret for JWT token signing |
| `MANUS_API_KEY` | Yes | API key for AI/LLM features |
| `S3_BUCKET` | No | S3 bucket for file storage |
| `S3_REGION` | No | S3 region |
| `S3_ACCESS_KEY` | No | S3 access key |
| `S3_SECRET_KEY` | No | S3 secret key |

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/assets ./assets

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://opvoedadvies:password@db:5432/opvoedadvies
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - PORT=3000
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=opvoedadvies
      - POSTGRES_USER=opvoedadvies
      - POSTGRES_PASSWORD=password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opvoedadvies"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

---

## API Documentation

### Base URL

```
https://your-domain.com/api
```

### Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### tRPC Endpoints

All tRPC endpoints are available at `/api/trpc/<procedure>`.

#### System

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `system.me` | GET | Yes | Get current user info |
| `system.health` | GET | No | Health check |

#### Family Management

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `family.create` | POST | Yes | Create a new family |
| `family.join` | POST | Yes | Join family with invite code |
| `family.get` | GET | Yes | Get family details |
| `family.members` | GET | Yes | List family members |
| `family.invite` | POST | Yes | Generate invite code |
| `family.updateRole` | POST | Yes | Update member role |
| `family.removeMember` | POST | Yes | Remove a member |

#### Children

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `children.list` | GET | Yes | List children in family |
| `children.create` | POST | Yes | Add a child |
| `children.update` | POST | Yes | Update child info |
| `children.delete` | POST | Yes | Remove a child |

#### Messages

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `messages.list` | GET | Yes | List messages |
| `messages.send` | POST | Yes | Send a message |
| `messages.markRead` | POST | Yes | Mark message as read |

#### Content Management

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `content.list` | GET | Yes | List all content |
| `content.get` | GET | Yes | Get single content item |
| `content.create` | POST | Admin | Create content |
| `content.update` | POST | Admin | Update content |
| `content.delete` | POST | Admin | Delete content |

#### Newsletter

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `newsletter.list` | GET | Yes | List newsletters |
| `newsletter.get` | GET | Yes | Get newsletter detail |
| `newsletter.create` | POST | Admin | Create newsletter |
| `newsletter.update` | POST | Admin | Update newsletter |
| `newsletter.subscribe` | POST | No | Subscribe email |

#### Admin

| Procedure | Method | Auth | Description |
|-----------|--------|------|-------------|
| `admin.dashboard` | GET | Admin | Get dashboard stats |
| `admin.users` | GET | Admin | List all users |

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/advice/weekplan` | POST | Generate weekly plan |
| `/api/advice/general` | POST | Get general advice |
| `/api/advice/treatment` | POST | Generate treatment plan |
| `/site` | GET | Public landing page |
| `/site?lang=en` | GET | Landing page (English) |
| `/site?lang=ar` | GET | Landing page (Arabic) |
| `/site/privacy` | GET | Privacy policy |
| `/site/terms` | GET | Terms of service |
| `/dashboard` | GET | Web dashboard (auth required) |

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts with roles |
| `families` | Family groups |
| `family_members` | Family membership with roles |
| `children` | Children profiles |
| `messages` | In-app messages |
| `content_items` | CMS content (articles, goals, hadith) |
| `newsletters` | Newsletter editions |
| `newsletter_subscribers` | Email subscribers |
| `ai_conversations` | AI chat history |
| `ai_messages` | Individual AI messages |

### Migrations

Run migrations with:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Migrating Away from Manus

To run this backend independently:

1. **Set up PostgreSQL** — Create a database and set `DATABASE_URL`
2. **Clone the repository** — All server code is in the `server/` directory
3. **Install dependencies** — `pnpm install`
4. **Run migrations** — `npx drizzle-kit migrate`
5. **Build** — `pnpm build`
6. **Start** — `NODE_ENV=production node dist/index.js`

Or use Docker:

```bash
docker-compose up -d
```

### AI/LLM Integration

The AI features use the built-in Manus LLM. To migrate:

1. Replace the LLM calls in `server/_core/llm.ts` with your preferred provider (OpenAI, Anthropic, etc.)
2. Update the API key environment variable
3. The prompt templates in `server/advice.ts` remain the same

### File Storage

Replace the S3 storage proxy in `server/_core/storageProxy.ts` with your own S3-compatible storage (AWS S3, MinIO, Cloudflare R2, etc.)

### Authentication

The OAuth flow in `server/_core/oauth.ts` can be replaced with:
- Your own JWT-based auth
- Firebase Auth
- Auth0
- Supabase Auth

---

## Hosting Options

| Provider | Recommended For | Notes |
|----------|----------------|-------|
| Railway | Quick deploy | PostgreSQL add-on available |
| Render | Production | Free tier available |
| Fly.io | Global edge | PostgreSQL included |
| DigitalOcean | Full control | App Platform or Droplet |
| Hetzner | EU data (GDPR) | VPS with Docker |
| Vercel | Serverless | Needs adapter for Express |

---

## Mobile App Build

After migrating the backend:

1. Update `constants/const.ts` with your new API URL
2. Build with EAS: `eas build --platform all`
3. Submit to stores: `eas submit`
