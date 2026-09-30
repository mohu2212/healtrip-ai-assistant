# HealTrip AI Patient Decision Assistant

> Prototype — work in progress. Full documentation (architecture, agent design, decisions) lands in a later step.

## Structure

```
apps/api         NestJS backend (agent, tools, catalog, chat API)
apps/web         Next.js chat UI (English / Arabic, RTL)
packages/shared  Shared zod schemas & TypeScript types (API contract)
docs/            Architecture notes & decision records
```

## Quick start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev          # api → http://localhost:4000/api  ·  web → http://localhost:3000
```
