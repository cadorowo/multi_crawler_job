# JobFinder 🚀

JobFinder discovers, normalizes, deduplicates, ranks, and tracks internships and entry-level opportunities for multiple users, disciplines, locations, and work modes. *Paseo* is the controlled AGY bridge used for natural-language assistance and structured extraction.

---

## Features

- **6 Public ATS Adapters**: Native REST collectors for Greenhouse, Lever, Ashby, Teamtailor, Factorial, and Workable with automatic rate-limit backoff and jitter.
- **2-Pass Bouncer Filtering**:
  - *Pass 1 (Regex)*: Discards non-student/senior roles in sub-milliseconds.
  - *Pass 2 (Paseo / AGY)*: Structured validation extracts eligibility, language, domain and tools without claiming facts that are absent from the posting.
- **Hybrid Semantic Retrieval**: PostgreSQL 16 with `pgvector` HNSW indexing combining vector cosine similarity ($40\%$) + LLM Fit Score ($40\%$) + User Preference Weights ($20\%$).
- **Reactive Telegram Bot (`grammY`)**: Long Polling bot (works behind home NAT without public IP/webhooks) featuring two-tier expandable cards, PDF CV upload, and inline application tracking (`[📋 Deep Breakdown]`, `[🔗 Apply Directly]`, `[👍]`, `[👎]`, `[💼 Applied]`).
- **On-demand multi-source search**: `/search` queries configured ATS Scrapers sources only when a user asks; pg-boss retains stale-record cleanup every 6 hours.
- **Observability**: Structured **Pino** logging with automated Telegram admin alerts on unhandled errors.

---

## Architecture Overview

```text
packages/
├── db/          # PostgreSQL 16 + pgvector schemas, migrations and starter company catalog
├── adapters/    # Greenhouse, Lever, Ashby, Teamtailor, Factorial, Workable parsers
├── llm/         # Shared schemas, matcher, bouncer and optional embedding provider
├── bot/         # JobFinder grammY bot, Paseo/AGY bridge, CV ingestion and cards
└── worker/      # pg-boss cleanup and notification jobs, Pino logger
```

---

## Quickstart Guide

### 1. Prerequisites
- [Node.js 20+](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Docker & Docker Compose](https://www.docker.com/)

### 2. Configure Environment Variables
Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Fill in your API keys and configuration in `.env`:
```ini
# PostgreSQL connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bcn_internships"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your_telegram_bot_token_from_botfather"
ALLOWED_TELEGRAM_IDS="your_telegram_user_id"
TELEGRAM_ADMIN_CHAT_ID="your_telegram_user_id"

# Paseo / AGY bridge
AGY_BIN="agy"
PASEO_AGY_SANDBOX="true"

# Optional embedding provider
OPENAI_API_KEY="your_embedding_provider_key"
```

### 3. Start PostgreSQL with `pgvector`
Launch the database container:

```bash
docker compose up -d
```

### 4. Apply Migrations & Seed a Starter Catalog
Apply the tracked schema migrations, then seed the initial company catalog. The starter catalog is Barcelona-heavy, but JobFinder profiles and matching are location-neutral.

```bash
# Apply versioned schema migrations and pgvector extension
pnpm db:migrate

# Seed starter companies
pnpm db:seed
```

### 5. Start the Telegram Bot & Background Worker

In separate terminal tabs:

```bash
# Start Telegram Bot (Long Polling)
pnpm bot:dev

# Start Background Ingestion Worker (pg-boss scheduler)
pnpm worker:dev
```

---

## Interacting with the Telegram Bot

1. Open your bot in Telegram and send `/start`.
2. Configure roles, locations and work mode with `/setup`, then optionally send your **CV as a PDF document**.
3. The bot will automatically:
   - Extract raw text using `pdf-parse`.
   - Parse your structured tools, skills, education and languages through Paseo/AGY.
   - Generate an embedding when an embedding provider is configured.
   - Store your profile in PostgreSQL.
4. When new opportunities matching your profile are detected, you will receive interactive alert cards with direct application links and match breakdowns.
