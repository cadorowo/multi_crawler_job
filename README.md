# Barcelona Internship Discovery & Ranking Bot 🚀

An automated intelligence agent that continuously discovers, normalizes, deduplicates, and ranks internship opportunities across Barcelona's tech ecosystem, specifically tailored for **Politecnico di Torino** design and automation students.

---

## Features

- **6 Public ATS Adapters**: Native REST collectors for Greenhouse, Lever, Ashby, Teamtailor, Factorial, and Workable with automatic rate-limit backoff and jitter.
- **2-Pass Bouncer Filtering**:
  - *Pass 1 (Regex)*: Discards non-student/senior roles in sub-milliseconds.
  - *Pass 2 (OpenCode LLM)*: Structured Zod validation verifying Erasmus+ Traineeship compatibility, English-first working environment, and design/automation tool stack.
- **Hybrid Semantic Retrieval**: PostgreSQL 16 with `pgvector` HNSW indexing combining vector cosine similarity ($40\%$) + LLM Fit Score ($40\%$) + User Preference Weights ($20\%$).
- **Reactive Telegram Bot (`grammY`)**: Long Polling bot (works behind home NAT without public IP/webhooks) featuring two-tier expandable cards, PDF CV upload, and inline application tracking (`[📋 Deep Breakdown]`, `[🔗 Apply Directly]`, `[👍]`, `[👎]`, `[💼 Applied]`).
- **Resilient Worker (`pg-boss`)**: Background ingestion and staleness cleanup scheduled every 2.5 hours, persisting queues directly in PostgreSQL across laptop reboots/sleep.
- **Observability**: Structured **Pino** logging with automated Telegram admin alerts on unhandled errors.

---

## Architecture Overview

```text
packages/
├── db/          # PostgreSQL 16 + pgvector schemas (Drizzle ORM) & BCN seed data
├── adapters/    # Greenhouse, Lever, Ashby, Teamtailor, Factorial, Workable parsers
├── llm/         # OpenCode / OpenAI client, Zod schemas, 2-Pass Bouncer, embedder
├── bot/         # grammY Telegram bot, PDF CV ingestion, two-tier alert cards
└── worker/      # pg-boss queue, recurring crawler, match notifier, Pino logger
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

# AI & Embeddings
OPENCODE_API_KEY="your_opencode_or_openai_api_key"
OPENAI_API_KEY="your_openai_api_key"
```

### 3. Start PostgreSQL with `pgvector`
Launch the database container:

```bash
docker compose up -d
```

### 4. Push Schemas & Seed Companies
Push Drizzle schema migrations to PostgreSQL and seed 30+ top Barcelona tech scaleups (Glovo, Typeform, TravelPerk, Factorial, Wallapop, Adevinta, design agencies in 22@):

```bash
# Push table schemas and pgvector extension
pnpm db:push

# Seed verified Barcelona companies
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
2. Send your **CV as a PDF document** to the bot.
3. The bot will automatically:
   - Extract raw text using `pdf-parse`.
   - Parse your structured design tools, skills, and university background via OpenCode.
   - Generate your candidate vector embedding (`text-embedding-3-small`, 1536 dims).
   - Store your profile in PostgreSQL.
4. When new matching internships in Barcelona are detected, you will receive interactive alert cards with direct application links and match breakdowns.
