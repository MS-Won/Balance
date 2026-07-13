# "오늘의" 밸런스 게임 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of "오늘의" 밸런스 게임: a single-page real-time balance-game voting/chat app with endorsements, per-side representative opinions, a KST midnight rollover, and a top-10 hall of fame.

**Architecture:** Next.js (App Router, TypeScript) deployed to Vercel, backed by Supabase (Postgres + Realtime + pg_cron). Users are identified anonymously via a `device_id` UUID persisted in `localStorage` plus a one-time nickname — no account system. All live data (votes, chat, endorsements) is read via Supabase client queries and kept in sync with `postgres_changes` Realtime subscriptions. A Postgres function scheduled by `pg_cron` performs the daily 00:00 KST rollover (tally votes, pick hall-of-fame entrant, activate the next game). Admin question management is a password-gated `/admin` route using server actions with the Supabase service-role key.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS), `@supabase/supabase-js`, Supabase Postgres + Realtime + `pg_cron`, Vitest for unit tests, Vercel for hosting.

## Global Constraints

- No user accounts: identity = `device_id` (UUID in `localStorage`) + nickname entered once, persisted in `localStorage`. (spec §2 아키텍처)
- Abuse prevention (duplicate voting via cleared cookies, etc.) is explicitly out of scope for this phase. (spec §7)
- Vote changes immediately flip the device's chat "진영" tag for future messages; past messages keep their original tag. (spec §4.1, §4.3)
- One endorsement per `(message_id, device_id)`. (spec §4.2)
- Representative opinion = highest-endorsement message per side, computed live, not cached permanently. (spec §4.3)
- Rollover runs daily at 00:00 KST (`15:00 UTC`). (spec §4.4)
- Hall of Fame shows at most 10 entries, ranked by endorsement count all-time (from day 11 on, a new entrant only appears if it outranks the current #10). (spec §4.5)
- Admin question management is a password-protected `/admin` route, no separate account system. (spec §6)
- Kakao share, real ad integration, and user-submitted questions are explicitly out of scope for this plan. (spec §7)

---

## File Structure

```
supabase/
  config.toml
  migrations/
    0001_init_schema.sql        # tables + RLS + realtime publication
    0002_rollover_function.sql  # perform_midnight_rollover() + pg_cron schedule
  verify/
    rollover_check.sql          # manual assertion script for the rollover function

src/
  types/database.ts             # BalanceGame, Vote, ChatMessage, Endorsement, HallOfFameEntry
  lib/
    supabase/client.ts          # browser (anon key) client singleton
    supabase/admin.ts           # server-only (service role key) client, for admin actions
    deviceIdentity.ts           # device_id + nickname in localStorage
    countdown.ts                # msUntilNextMidnightKST, formatCountdown
    voteTally.ts                # computeVoteTally
    representativeOpinion.ts    # computeRepresentativeOpinions
    __tests__/
      deviceIdentity.test.ts
      countdown.test.ts
      voteTally.test.ts
      representativeOpinion.test.ts
  hooks/
    useActiveGame.ts
    useVotes.ts
    useChatMessages.ts
    useEndorsements.ts
    useHallOfFame.ts
  components/
    Header.tsx
    Countdown.tsx
    VoteGraph.tsx
    NicknamePrompt.tsx
    RepresentativeOpinionBar.tsx
    ChatFeed.tsx
    ChatMessageItem.tsx
    ChatInput.tsx
    HallOfFame.tsx
    YesterdayResult.tsx
    AdPlaceholder.tsx
  app/
    layout.tsx
    page.tsx
    admin/
      login/page.tsx
      page.tsx
      actions.ts
  middleware.ts
```

---

### Task 1: Project scaffolding

**Files:**
- Create: Next.js project at repo root via `create-next-app` (package.json, tsconfig.json, tailwind config, `src/app/layout.tsx`, `src/app/page.tsx`, eslint config)
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `src/app/`, `src/` alias `@/*`, Tailwind CSS available globally, `npm test` running Vitest.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd "D:\Balance Game"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

When prompted, accept defaults. `create-next-app` allows running in a non-empty directory as long as it only contains `.git`, `.gitignore`, or `docs` — which is all this repo has.

- [ ] **Step 2: Install test tooling**

```bash
npm install -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Add Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Add the test script**

Edit `package.json` `"scripts"` to add:

```json
"test": "vitest run"
```

- [ ] **Step 5: Verify the toolchain**

```bash
npm run test
```

Expected: `No test files found` (passes with 0 tests) — confirms Vitest runs.

```bash
npm run build
```

Expected: build succeeds against the default `create-next-app` starter page.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript, Tailwind, Vitest"
```

---

### Task 2: Supabase project setup and client singletons

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `.env.local.example`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/admin.ts`
- Modify: `.gitignore` (ensure `.env.local` stays ignored — already present)

**Interfaces:**
- Produces: `getBrowserSupabaseClient(): SupabaseClient` (anon key, safe for client components), `getAdminSupabaseClient(): SupabaseClient` (service role key, server-only, throws if imported client-side).

- [ ] **Step 1: Install the Supabase client and CLI**

```bash
npm install @supabase/supabase-js
npm install -D supabase
```

- [ ] **Step 2: Initialize the Supabase project config and link it to a hosted project**

```bash
npx supabase init
```

This project targets a hosted Supabase project for both development and production — there is no local Docker-based Supabase in this workflow. Create a project at supabase.com (or reuse an existing one), then link this repo to it:

```bash
npx supabase link --project-ref <PROJECT_REF> --password '<DB_PASSWORD>'
```

`link` requires a Supabase personal access token in `SUPABASE_ACCESS_TOKEN` (generate one at https://supabase.com/dashboard/account/tokens; `supabase login` also works if the terminal is interactive). `<PROJECT_REF>` is the subdomain segment of the project URL (e.g. `https://<PROJECT_REF>.supabase.co`).

- [ ] **Step 3: Add environment variable template**

```bash
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

Copy this to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from the Supabase dashboard's Project Settings → API page. `SUPABASE_ACCESS_TOKEN` (from Step 2) is a separate, CLI-only credential — export it in the shell, don't put it in `.env.local` (the app never reads it).

- [ ] **Step 4: Add the browser client singleton**

```typescript
// src/lib/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  browserClient = createClient<Database>(url, anonKey);
  return browserClient;
}
```

- [ ] **Step 5: Add the server-only admin client**

```typescript
// src/lib/supabase/admin.ts
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let adminClient: SupabaseClient<Database> | undefined;

export function getAdminSupabaseClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return adminClient;
}
```

```bash
npm install server-only
```

- [ ] **Step 6: Placeholder database types (real types land in Task 3)**

```typescript
// src/types/database.ts
export type Database = Record<string, unknown>;
```

- [ ] **Step 7: Verify it builds**

```bash
npm run build
```

Expected: succeeds (the admin/browser clients aren't invoked at build time since they lazily read `process.env`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add Supabase client singletons and local project config"
```

---

### Task 3: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`
- Modify: `src/types/database.ts` (real generated types)

**Interfaces:**
- Produces: tables `balance_games`, `votes`, `chat_messages`, `endorsements`, `hall_of_fame`; `Database` type used by both Supabase clients from Task 2.

- [ ] **Step 1: Write the schema migration**

```sql
-- supabase/migrations/0001_init_schema.sql

create table balance_games (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  choice_a_label text not null,
  choice_b_label text not null,
  description text,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  created_at timestamptz not null default now()
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  choice text not null check (choice in ('A', 'B')),
  updated_at timestamptz not null default now(),
  unique (game_id, device_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  nickname text not null,
  choice text not null check (choice in ('A', 'B')),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create table endorsements (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, device_id)
);

create table hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id),
  date date not null,
  winning_choice text not null check (winning_choice in ('A', 'B')),
  message_id uuid not null references chat_messages(id),
  nickname text not null,
  endorsement_count int not null,
  created_at timestamptz not null default now()
);

create index votes_game_id_idx on votes(game_id);
create index chat_messages_game_id_idx on chat_messages(game_id);
create index endorsements_message_id_idx on endorsements(message_id);

-- Anonymous, device_id-based app: no Supabase Auth, so RLS only guards
-- against cross-table mischief, not identity spoofing (see spec §7 — abuse
-- prevention is explicitly out of scope for this phase).
alter table balance_games enable row level security;
alter table votes enable row level security;
alter table chat_messages enable row level security;
alter table endorsements enable row level security;
alter table hall_of_fame enable row level security;

create policy "public can read games" on balance_games for select using (true);
create policy "public can read votes" on votes for select using (true);
create policy "public can upsert own vote" on votes for insert with check (true);
create policy "public can update own vote" on votes for update using (true);
create policy "public can read chat" on chat_messages for select using (true);
create policy "public can post chat" on chat_messages for insert with check (true);
create policy "public can read endorsements" on endorsements for select using (true);
create policy "public can endorse" on endorsements for insert with check (true);
create policy "public can read hall of fame" on hall_of_fame for select using (true);

-- balance_games has no public insert/update/delete policy: only the
-- service-role admin client (Task 2 admin.ts) can manage questions.

alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table endorsements;
alter publication supabase_realtime add table balance_games;
```

- [ ] **Step 2: Push the migration to the linked hosted project**

```bash
npx supabase db push
```

Expected: output lists `0001_init_schema.sql` as applied with no errors. Confirm the 5 tables exist via the Supabase dashboard's Table Editor, or `npx supabase db query --linked "select table_name from information_schema.tables where table_schema = 'public';"`.

- [ ] **Step 3: Generate TypeScript types from the schema**

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Expected: `src/types/database.ts` now contains a real `Database` type with `Tables: { balance_games: ...; votes: ...; chat_messages: ...; endorsements: ...; hall_of_fame: ... }`.

- [ ] **Step 4: Verify the app still builds against the new types**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add core database schema (games, votes, chat, endorsements, hall of fame)"
```

---

### Task 4: Device identity (anonymous device_id + nickname)

**Files:**
- Create: `src/lib/deviceIdentity.ts`
- Test: `src/lib/__tests__/deviceIdentity.test.ts`

**Interfaces:**
- Produces:
  - `getDeviceId(): string`
  - `getNickname(): string | null`
  - `setNickname(nickname: string): void`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/deviceIdentity.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { getDeviceId, getNickname, setNickname } from "@/lib/deviceIdentity";

describe("deviceIdentity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and persists a device id on first call", () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns null nickname when never set", () => {
    expect(getNickname()).toBeNull();
  });

  it("persists a nickname once set", () => {
    setNickname("논쟁왕");
    expect(getNickname()).toBe("논쟁왕");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- deviceIdentity
```

Expected: FAIL — `Cannot find module '@/lib/deviceIdentity'`.

- [ ] **Step 3: Implement `deviceIdentity.ts`**

```typescript
// src/lib/deviceIdentity.ts
const DEVICE_ID_KEY = "balance-game:device-id";
const NICKNAME_KEY = "balance-game:nickname";

export function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getNickname(): string | null {
  return window.localStorage.getItem(NICKNAME_KEY);
}

export function setNickname(nickname: string): void {
  window.localStorage.setItem(NICKNAME_KEY, nickname);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- deviceIdentity
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add anonymous device identity (device_id + nickname)"
```

---

### Task 5: Countdown to next KST midnight

**Files:**
- Create: `src/lib/countdown.ts`
- Test: `src/lib/__tests__/countdown.test.ts`

**Interfaces:**
- Produces:
  - `msUntilNextMidnightKST(now?: Date): number`
  - `formatCountdown(ms: number): string` (e.g. `"05:12:33"`)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/countdown.test.ts
import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilNextMidnightKST } from "@/lib/countdown";

describe("msUntilNextMidnightKST", () => {
  it("returns close to 24h when it is just past KST midnight", () => {
    // 2026-07-13 00:00:01 KST == 2026-07-12 15:00:01 UTC
    const now = new Date("2026-07-12T15:00:01.000Z");
    const ms = msUntilNextMidnightKST(now);
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("returns a small value just before KST midnight", () => {
    // 2026-07-12 23:59:50 KST == 2026-07-12 14:59:50 UTC
    const now = new Date("2026-07-12T14:59:50.000Z");
    const ms = msUntilNextMidnightKST(now);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10 * 1000);
  });
});

describe("formatCountdown", () => {
  it("formats milliseconds as HH:MM:SS", () => {
    expect(formatCountdown(5 * 3600_000 + 12 * 60_000 + 33_000)).toBe("05:12:33");
  });

  it("clamps negative values to 00:00:00", () => {
    expect(formatCountdown(-1000)).toBe("00:00:00");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- countdown
```

Expected: FAIL — `Cannot find module '@/lib/countdown'`.

- [ ] **Step 3: Implement `countdown.ts`**

```typescript
// src/lib/countdown.ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function msUntilNextMidnightKST(now: Date = new Date()): number {
  const kstNow = now.getTime() + KST_OFFSET_MS;
  const msSinceKstMidnight = kstNow % DAY_MS;
  return DAY_MS - msSinceKstMidnight;
}

export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- countdown
```

Expected: PASS (4 tests).

- [ ] **Step 5: Build the `Countdown` and `Header` components**

```typescript
// src/components/Countdown.tsx
"use client";

import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextMidnightKST } from "@/lib/countdown";

export function Countdown() {
  const [label, setLabel] = useState(() => formatCountdown(msUntilNextMidnightKST()));

  useEffect(() => {
    const interval = setInterval(() => {
      setLabel(formatCountdown(msUntilNextMidnightKST()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className="font-mono text-sm">⏰ {label}</span>;
}
```

```typescript
// src/components/Header.tsx
import { Countdown } from "@/components/Countdown";

export function Header() {
  return (
    <header className="flex items-center justify-between bg-neutral-800 text-white rounded-md px-4 py-2">
      <h1 className="text-base font-bold">오늘의 밸런스 게임</h1>
      <Countdown />
    </header>
  );
}
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Open `http://localhost:3000`, confirm the header renders and the countdown ticks down every second.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add KST midnight countdown and page header"
```

---

### Task 6: Active game hook and page skeleton

**Files:**
- Create: `src/hooks/useActiveGame.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()` (Task 2), `Database` (Task 3).
- Produces: `useActiveGame(): { game: BalanceGame | null; loading: boolean }` where `BalanceGame = Database["public"]["Tables"]["balance_games"]["Row"]`.

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useActiveGame.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type BalanceGame = Database["public"]["Tables"]["balance_games"]["Row"];

export function useActiveGame() {
  const [game, setGame] = useState<BalanceGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("balance_games")
        .select("*")
        .eq("status", "active")
        .maybeSingle();
      if (!cancelled) {
        setGame(data ?? null);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel("balance_games:active")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balance_games" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { game, loading };
}
```

- [ ] **Step 2: Wire the page skeleton**

```typescript
// src/app/page.tsx
"use client";

import { Header } from "@/components/Header";
import { useActiveGame } from "@/hooks/useActiveGame";

export default function Home() {
  const { game, loading } = useActiveGame();

  return (
    <main className="mx-auto max-w-md p-3 space-y-3">
      <Header />
      {loading && <p className="text-center text-sm text-neutral-500">불러오는 중...</p>}
      {!loading && !game && (
        <p className="text-center text-sm text-neutral-500">
          오늘의 밸런스 게임이 아직 준비되지 않았습니다.
        </p>
      )}
      {game && (
        <div className="text-center text-sm font-bold">
          🅰 {game.choice_a_label} vs {game.choice_b_label} 🅱
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Seed a local test game and verify manually**

```bash
npx supabase db query --linked "insert into balance_games (date, choice_a_label, choice_b_label, description, status) values (current_date, '짜장면', '짬뽕', '평생 하나만 먹어야 한다면?', 'active');"
```

```bash
npm run dev
```

Open `http://localhost:3000`, confirm "🅰 짜장면 vs 짬뽕 🅱" renders.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: fetch and display the active balance game"
```

---

### Task 7: Vote tally logic and graph

**Files:**
- Create: `src/lib/voteTally.ts`
- Test: `src/lib/__tests__/voteTally.test.ts`
- Create: `src/components/VoteGraph.tsx`

**Interfaces:**
- Produces:
  - `computeVoteTally(votes: { choice: "A" | "B" }[]): { aCount: number; bCount: number; aPct: number; bPct: number; total: number }`
  - `<VoteGraph aLabel bLabel tally />` component

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/voteTally.test.ts
import { describe, expect, it } from "vitest";
import { computeVoteTally } from "@/lib/voteTally";

describe("computeVoteTally", () => {
  it("computes counts and rounded percentages", () => {
    const votes = [
      ...Array(62).fill({ choice: "A" as const }),
      ...Array(38).fill({ choice: "B" as const }),
    ];
    const tally = computeVoteTally(votes);
    expect(tally).toEqual({ aCount: 62, bCount: 38, aPct: 62, bPct: 38, total: 100 });
  });

  it("defaults to a 50/50 split with zero votes", () => {
    expect(computeVoteTally([])).toEqual({ aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -- voteTally
```

Expected: FAIL — `Cannot find module '@/lib/voteTally'`.

- [ ] **Step 3: Implement `voteTally.ts`**

```typescript
// src/lib/voteTally.ts
export interface VoteTally {
  aCount: number;
  bCount: number;
  aPct: number;
  bPct: number;
  total: number;
}

export function computeVoteTally(votes: { choice: "A" | "B" }[]): VoteTally {
  const aCount = votes.filter((v) => v.choice === "A").length;
  const bCount = votes.filter((v) => v.choice === "B").length;
  const total = aCount + bCount;

  if (total === 0) {
    return { aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 };
  }

  const aPct = Math.round((aCount / total) * 100);
  return { aCount, bCount, aPct, bPct: 100 - aPct, total };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- voteTally
```

Expected: PASS (2 tests).

- [ ] **Step 5: Build the `VoteGraph` component**

```typescript
// src/components/VoteGraph.tsx
import type { VoteTally } from "@/lib/voteTally";

export function VoteGraph({
  aLabel,
  bLabel,
  tally,
}: {
  aLabel: string;
  bLabel: string;
  tally: VoteTally;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-rose-600">
          🅰 {aLabel} {tally.aPct}% ({tally.aCount.toLocaleString()}표)
        </span>
        <span className="text-blue-600">
          {bLabel} {tally.bPct}% ({tally.bCount.toLocaleString()}표) 🅱
        </span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden">
        <div className="bg-rose-500" style={{ width: `${tally.aPct}%` }} />
        <div className="bg-blue-500" style={{ width: `${tally.bPct}%` }} />
      </div>
      <p className="text-center text-[10px] text-neutral-500 mt-1">
        총 {tally.total.toLocaleString()}표 참여 · 실시간 집계
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add vote tally logic and vote graph component"
```

---

### Task 8: Vote casting hook wired to the page

**Files:**
- Create: `src/hooks/useVotes.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()`, `getDeviceId()` (Task 4), `computeVoteTally` (Task 7), `VoteGraph` (Task 7).
- Produces: `useVotes(gameId: string | undefined): { tally: VoteTally; myChoice: "A" | "B" | null; castVote: (choice: "A" | "B") => Promise<void> }`

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useVotes.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";
import { computeVoteTally, type VoteTally } from "@/lib/voteTally";
import type { Database } from "@/types/database";

type Vote = Database["public"]["Tables"]["votes"]["Row"];

export function useVotes(gameId: string | undefined) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myChoice, setMyChoice] = useState<"A" | "B" | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    let cancelled = false;

    async function load() {
      const { data } = await supabase.from("votes").select("*").eq("game_id", gameId!);
      if (cancelled || !data) return;
      setVotes(data);
      setMyChoice((data.find((v) => v.device_id === deviceId)?.choice as "A" | "B") ?? null);
    }
    load();

    const channel = supabase
      .channel(`votes:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `game_id=eq.${gameId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function castVote(choice: "A" | "B") {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    await supabase
      .from("votes")
      .upsert(
        { game_id: gameId, device_id: deviceId, choice, updated_at: new Date().toISOString() },
        { onConflict: "game_id,device_id" }
      );
    setMyChoice(choice);
  }

  const tally: VoteTally = computeVoteTally(votes as { choice: "A" | "B" }[]);

  return { tally, myChoice, castVote };
}
```

- [ ] **Step 2: Wire it into the page**

```typescript
// src/app/page.tsx
"use client";

import { Header } from "@/components/Header";
import { VoteGraph } from "@/components/VoteGraph";
import { useActiveGame } from "@/hooks/useActiveGame";
import { useVotes } from "@/hooks/useVotes";

export default function Home() {
  const { game, loading } = useActiveGame();
  const { tally, myChoice, castVote } = useVotes(game?.id);

  return (
    <main className="mx-auto max-w-md p-3 space-y-3">
      <Header />
      {loading && <p className="text-center text-sm text-neutral-500">불러오는 중...</p>}
      {!loading && !game && (
        <p className="text-center text-sm text-neutral-500">
          오늘의 밸런스 게임이 아직 준비되지 않았습니다.
        </p>
      )}
      {game && (
        <>
          <div className="text-center text-sm font-bold">
            🅰 {game.choice_a_label} vs {game.choice_b_label} 🅱
          </div>
          {game.description && (
            <p className="text-center text-[11px] text-neutral-500">{game.description}</p>
          )}
          <VoteGraph aLabel={game.choice_a_label} bLabel={game.choice_b_label} tally={tally} />
          <div className="flex gap-2">
            <button
              onClick={() => castVote("A")}
              className={`flex-1 rounded-md py-2 text-sm font-bold border ${
                myChoice === "A" ? "bg-rose-500 text-white" : "border-rose-500 text-rose-600"
              }`}
            >
              🅰 {game.choice_a_label}
            </button>
            <button
              onClick={() => castVote("B")}
              className={`flex-1 rounded-md py-2 text-sm font-bold border ${
                myChoice === "B" ? "bg-blue-500 text-white" : "border-blue-500 text-blue-600"
              }`}
            >
              {game.choice_b_label} 🅱
            </button>
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify manually with two browser tabs**

```bash
npm run dev
```

Open `http://localhost:3000` in two tabs. Vote A in tab 1; confirm the graph updates in both tabs within ~1s via Realtime. Vote B in tab 1; confirm `myChoice` button highlight and tally move accordingly.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: cast and change votes with realtime tally updates"
```

---

### Task 9: Nickname prompt gating

**Files:**
- Create: `src/components/NicknamePrompt.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getNickname()`, `setNickname()` (Task 4).
- Produces: `<NicknamePrompt onSet={(nickname: string) => void} />`; page-level `nickname` state gating vote/chat actions.

- [ ] **Step 1: Build the prompt component**

```typescript
// src/components/NicknamePrompt.tsx
"use client";

import { useState } from "react";

export function NicknamePrompt({ onSet }: { onSet: (nickname: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 20) return;
    onSet(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-md p-4 w-full max-w-xs space-y-3">
        <h2 className="font-bold text-sm">닉네임을 입력해주세요</h2>
        <input
          className="border rounded-md w-full px-2 py-1 text-sm"
          value={value}
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="최대 20자"
        />
        <button
          onClick={submit}
          className="w-full bg-neutral-800 text-white rounded-md py-2 text-sm font-bold"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire nickname state into the page**

Add to `src/app/page.tsx`:

```typescript
// additions to src/app/page.tsx
import { useEffect, useState } from "react";
import { getNickname, setNickname as persistNickname } from "@/lib/deviceIdentity";
import { NicknamePrompt } from "@/components/NicknamePrompt";
```

Inside the `Home` component, before the `return`:

```typescript
  const [nickname, setNicknameState] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setNicknameState(getNickname());
  }, []);
```

At the top of the returned JSX (as the first child of `<main>`):

```typescript
      {nickname === null && (
        <NicknamePrompt
          onSet={(value) => {
            persistNickname(value);
            setNicknameState(value);
          }}
        />
      )}
```

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

Open `http://localhost:3000` in a private/incognito window. Confirm the nickname prompt appears, submitting sets it and the modal closes, and reloading the page does not show the prompt again.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: prompt for a nickname on first visit"
```

---

### Task 10: Chat feed (messages, list, input)

**Files:**
- Create: `src/hooks/useChatMessages.ts`
- Create: `src/components/ChatFeed.tsx`
- Create: `src/components/ChatMessageItem.tsx`
- Create: `src/components/ChatInput.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()`, `getDeviceId()`, `getNickname()`.
- Produces:
  - `useChatMessages(gameId: string | undefined): { messages: ChatMessage[]; sendMessage: (content: string, choice: "A" | "B") => Promise<void> }` where `ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"]`.
  - `<ChatFeed messages aLabel bLabel />`, `<ChatMessageItem message />`, `<ChatInput onSend={(content: string) => void} disabled />`

- [ ] **Step 1: Implement the chat hook**

```typescript
// src/hooks/useChatMessages.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId, getNickname } from "@/lib/deviceIdentity";
import type { Database } from "@/types/database";

export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];

export function useChatMessages(gameId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("game_id", gameId!)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setMessages(data);
    }
    load();

    const channel = supabase
      .channel(`chat_messages:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function sendMessage(content: string, choice: "A" | "B") {
    if (!gameId) return;
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 500) return;

    const supabase = getBrowserSupabaseClient();
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      device_id: getDeviceId(),
      nickname: getNickname() ?? "익명",
      choice,
      content: trimmed,
    });
  }

  return { messages, sendMessage };
}
```

- [ ] **Step 2: Build `ChatMessageItem`, `ChatFeed`, `ChatInput`**

```typescript
// src/components/ChatMessageItem.tsx
import type { ChatMessage } from "@/hooks/useChatMessages";

export function ChatMessageItem({
  message,
  endorsementCount,
  endorsed,
  onEndorse,
}: {
  message: ChatMessage;
  endorsementCount: number;
  endorsed: boolean;
  onEndorse: () => void;
}) {
  const isA = message.choice === "A";
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs border-l-4 ${
        isA ? "bg-rose-50 border-rose-500" : "bg-blue-50 border-blue-500"
      }`}
    >
      <div>
        <span className="font-bold mr-1">{isA ? "🅰" : "🅱"} {message.nickname}</span>
        <span>{message.content}</span>
      </div>
      <button
        onClick={onEndorse}
        disabled={endorsed}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          endorsed ? "bg-amber-400 text-white" : "bg-neutral-200 text-neutral-700"
        }`}
      >
        인정 {endorsementCount}
      </button>
    </div>
  );
}
```

```typescript
// src/components/ChatFeed.tsx
"use client";

import { useState } from "react";
import type { ChatMessage } from "@/hooks/useChatMessages";
import { ChatMessageItem } from "@/components/ChatMessageItem";

export function ChatFeed({
  messages,
  endorsementCounts,
  myEndorsedIds,
  onEndorse,
}: {
  messages: ChatMessage[];
  endorsementCounts: Record<string, number>;
  myEndorsedIds: Set<string>;
  onEndorse: (messageId: string) => void;
}) {
  const [sortByEndorsements, setSortByEndorsements] = useState(false);

  const sorted = sortByEndorsements
    ? [...messages].sort(
        (a, b) => (endorsementCounts[b.id] ?? 0) - (endorsementCounts[a.id] ?? 0)
      )
    : messages;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-bold text-neutral-600">전체 채팅</span>
        <button
          onClick={() => setSortByEndorsements((v) => !v)}
          className="text-[10px] bg-neutral-200 rounded-full px-2 py-0.5"
        >
          {sortByEndorsements ? "🔥 인정순 보기" : "🕒 최신순 보기"}
        </button>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {sorted.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            endorsementCount={endorsementCounts[message.id] ?? 0}
            endorsed={myEndorsedIds.has(message.id)}
            onEndorse={() => onEndorse(message.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

```typescript
// src/components/ChatInput.tsx
"use client";

import { useState } from "react";

export function ChatInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (disabled || value.trim().length === 0) return;
    onSend(value);
    setValue("");
  }

  return (
    <div className="flex gap-1">
      <input
        className="flex-1 border rounded-md px-2 py-1 text-sm"
        value={value}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="💬 채팅 입력..."
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="bg-neutral-800 text-white rounded-md px-3 text-sm font-bold disabled:opacity-40"
      >
        전송
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page (endorsement counts stubbed until Task 11)**

Add to `src/app/page.tsx`:

```typescript
  import { useChatMessages } from "@/hooks/useChatMessages";
  import { ChatFeed } from "@/components/ChatFeed";
  import { ChatInput } from "@/components/ChatInput";
```

```typescript
  const { messages, sendMessage } = useChatMessages(game?.id);
```

Below the vote buttons in the JSX:

```typescript
          <ChatFeed
            messages={messages}
            endorsementCounts={{}}
            myEndorsedIds={new Set()}
            onEndorse={() => {}}
          />
          <ChatInput
            disabled={!myChoice || !nickname}
            onSend={(content) => myChoice && sendMessage(content, myChoice)}
          />
```

- [ ] **Step 4: Verify manually with two browser tabs**

```bash
npm run dev
```

Vote and set a nickname in both tabs, send a message from tab 1, confirm it appears in tab 2 within ~1s.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: real-time chat feed with sorting toggle"
```

---

### Task 11: Endorsements ("인정" button)

**Files:**
- Create: `src/hooks/useEndorsements.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()`, `getDeviceId()`, `ChatMessage[]` (Task 10).
- Produces: `useEndorsements(messageIds: string[]): { counts: Record<string, number>; myEndorsedIds: Set<string>; endorse: (messageId: string) => Promise<void> }`

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useEndorsements.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";
import type { Database } from "@/types/database";

type Endorsement = Database["public"]["Tables"]["endorsements"]["Row"];

export function useEndorsements(gameId: string | undefined) {
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("endorsements")
        .select("*, chat_messages!inner(game_id)")
        .eq("chat_messages.game_id", gameId!);
      if (!cancelled && data) setEndorsements(data as unknown as Endorsement[]);
    }
    load();

    const channel = supabase
      .channel(`endorsements:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "endorsements" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function endorse(messageId: string) {
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    await supabase.from("endorsements").insert({ message_id: messageId, device_id: deviceId });
  }

  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";
  const counts: Record<string, number> = {};
  const myEndorsedIds = new Set<string>();
  for (const e of endorsements) {
    counts[e.message_id] = (counts[e.message_id] ?? 0) + 1;
    if (e.device_id === deviceId) myEndorsedIds.add(e.message_id);
  }

  return { counts, myEndorsedIds, endorse };
}
```

- [ ] **Step 2: Wire into the page**

Replace the stubbed props from Task 10 in `src/app/page.tsx`:

```typescript
  import { useEndorsements } from "@/hooks/useEndorsements";
```

```typescript
  const { counts, myEndorsedIds, endorse } = useEndorsements(game?.id);
```

```typescript
          <ChatFeed
            messages={messages}
            endorsementCounts={counts}
            myEndorsedIds={myEndorsedIds}
            onEndorse={endorse}
          />
```

- [ ] **Step 3: Verify manually with two browser tabs**

Send a message in tab 1, click "인정" on it from tab 2, confirm the count updates to 1 in both tabs and the button becomes disabled/highlighted in tab 2. Confirm tab 1 (message author) can also endorse other users' messages but the unique constraint prevents a second endorsement of the same message from the same device (clicking again should no-op since the button disables after the realtime update lands).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add endorsements with realtime counts"
```

---

### Task 12: Representative opinion (진영별 대표의견)

**Files:**
- Create: `src/lib/representativeOpinion.ts`
- Test: `src/lib/__tests__/representativeOpinion.test.ts`
- Create: `src/components/RepresentativeOpinionBar.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `ChatMessage[]` (Task 10), `Record<string, number>` endorsement counts (Task 11).
- Produces: `computeRepresentativeOpinions(messages, counts): { a: RepresentativeOpinion | null; b: RepresentativeOpinion | null }` where `RepresentativeOpinion = { id: string; nickname: string; content: string; endorsementCount: number }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/representativeOpinion.test.ts
import { describe, expect, it } from "vitest";
import { computeRepresentativeOpinions } from "@/lib/representativeOpinion";

const baseMessage = (overrides: Partial<{
  id: string;
  choice: "A" | "B";
  nickname: string;
  content: string;
  created_at: string;
}>) => ({
  id: "m1",
  choice: "A" as const,
  nickname: "user",
  content: "hello",
  created_at: "2026-07-13T00:00:00.000Z",
  ...overrides,
});

describe("computeRepresentativeOpinions", () => {
  it("picks the highest-endorsement message per side", () => {
    const messages = [
      baseMessage({ id: "a1", choice: "A", content: "짜장이 최고" }),
      baseMessage({ id: "a2", choice: "A", content: "면발 쫄깃" }),
      baseMessage({ id: "b1", choice: "B", content: "매콤함이 진리" }),
    ];
    const counts = { a1: 5, a2: 34, b1: 28 };

    const result = computeRepresentativeOpinions(messages, counts);

    expect(result.a?.id).toBe("a2");
    expect(result.a?.endorsementCount).toBe(34);
    expect(result.b?.id).toBe("b1");
  });

  it("returns null for a side with no messages", () => {
    const messages = [baseMessage({ id: "a1", choice: "A" })];
    const result = computeRepresentativeOpinions(messages, {});
    expect(result.a?.id).toBe("a1");
    expect(result.b).toBeNull();
  });

  it("breaks ties by earliest message", () => {
    const messages = [
      baseMessage({ id: "a1", choice: "A", created_at: "2026-07-13T00:00:02.000Z" }),
      baseMessage({ id: "a2", choice: "A", created_at: "2026-07-13T00:00:01.000Z" }),
    ];
    const counts = { a1: 3, a2: 3 };
    const result = computeRepresentativeOpinions(messages, counts);
    expect(result.a?.id).toBe("a2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -- representativeOpinion
```

Expected: FAIL — `Cannot find module '@/lib/representativeOpinion'`.

- [ ] **Step 3: Implement `representativeOpinion.ts`**

```typescript
// src/lib/representativeOpinion.ts
export interface RepresentativeOpinionMessage {
  id: string;
  choice: "A" | "B";
  nickname: string;
  content: string;
  created_at: string;
}

export interface RepresentativeOpinion {
  id: string;
  nickname: string;
  content: string;
  endorsementCount: number;
}

export function computeRepresentativeOpinions(
  messages: RepresentativeOpinionMessage[],
  counts: Record<string, number>
): { a: RepresentativeOpinion | null; b: RepresentativeOpinion | null } {
  function pickBest(choice: "A" | "B"): RepresentativeOpinion | null {
    const candidates = messages.filter((m) => m.choice === choice);
    if (candidates.length === 0) return null;

    const best = candidates.reduce((top, current) => {
      const topCount = counts[top.id] ?? 0;
      const currentCount = counts[current.id] ?? 0;
      if (currentCount > topCount) return current;
      if (currentCount === topCount && current.created_at < top.created_at) return current;
      return top;
    });

    return {
      id: best.id,
      nickname: best.nickname,
      content: best.content,
      endorsementCount: counts[best.id] ?? 0,
    };
  }

  return { a: pickBest("A"), b: pickBest("B") };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- representativeOpinion
```

Expected: PASS (3 tests).

- [ ] **Step 5: Build the `RepresentativeOpinionBar` component**

```typescript
// src/components/RepresentativeOpinionBar.tsx
import type { RepresentativeOpinion } from "@/lib/representativeOpinion";

function Slot({ side, opinion }: { side: "A" | "B"; opinion: RepresentativeOpinion | null }) {
  const isA = side === "A";
  return (
    <div
      className={`flex-1 rounded-md border px-2 py-1 text-xs bg-amber-50 ${
        isA ? "border-rose-500" : "border-blue-500"
      }`}
    >
      <div className={`font-bold ${isA ? "text-rose-600" : "text-blue-600"}`}>
        {isA ? "🅰" : "🅱"} 대표의견{opinion ? ` (인정 ${opinion.endorsementCount})` : ""}
      </div>
      <div className="truncate">{opinion ? opinion.content : "아직 없음"}</div>
    </div>
  );
}

export function RepresentativeOpinionBar({
  a,
  b,
}: {
  a: RepresentativeOpinion | null;
  b: RepresentativeOpinion | null;
}) {
  return (
    <div className="flex gap-1">
      <Slot side="A" opinion={a} />
      <Slot side="B" opinion={b} />
    </div>
  );
}
```

- [ ] **Step 6: Wire into the page**

```typescript
  import { computeRepresentativeOpinions } from "@/lib/representativeOpinion";
  import { RepresentativeOpinionBar } from "@/components/RepresentativeOpinionBar";
```

```typescript
  const { a: repA, b: repB } = computeRepresentativeOpinions(messages, counts);
```

Place `<RepresentativeOpinionBar a={repA} b={repB} />` between `<VoteGraph .../>` and the vote buttons.

- [ ] **Step 7: Verify manually**

Send messages from both sides, endorse one, confirm the corresponding bar slot updates to show that message and its count in real time.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: show live per-side representative opinion"
```

---

### Task 13: Midnight rollover function and schedule

**Files:**
- Create: `supabase/migrations/0002_rollover_function.sql`
- Create: `supabase/verify/rollover_check.sql`

**Interfaces:**
- Produces: Postgres function `perform_midnight_rollover()`, `pg_cron` job `midnight-rollover` running daily at `15:00 UTC` (00:00 KST).

- [ ] **Step 1: Write the rollover function migration**

```sql
-- supabase/migrations/0002_rollover_function.sql

create extension if not exists pg_cron with schema extensions;

create or replace function perform_midnight_rollover()
returns void
language plpgsql
as $$
declare
  active_game balance_games%rowtype;
  next_game balance_games%rowtype;
  a_count int;
  b_count int;
  winner text;
  rep_message_id uuid;
  rep_nickname text;
  rep_count int;
begin
  select * into active_game from balance_games where status = 'active' limit 1;
  if not found then
    return;
  end if;

  select count(*) filter (where choice = 'A'), count(*) filter (where choice = 'B')
    into a_count, b_count
    from votes
    where game_id = active_game.id;

  winner := case when coalesce(a_count, 0) >= coalesce(b_count, 0) then 'A' else 'B' end;

  select cm.id, cm.nickname, count(e.id)
    into rep_message_id, rep_nickname, rep_count
    from chat_messages cm
    left join endorsements e on e.message_id = cm.id
    where cm.game_id = active_game.id and cm.choice = winner
    group by cm.id, cm.nickname
    order by count(e.id) desc, cm.created_at asc
    limit 1;

  if rep_message_id is not null then
    insert into hall_of_fame (game_id, date, winning_choice, message_id, nickname, endorsement_count)
    values (active_game.id, active_game.date, winner, rep_message_id, rep_nickname, coalesce(rep_count, 0));

    delete from hall_of_fame
    where id not in (
      select id from hall_of_fame order by endorsement_count desc, created_at asc limit 10
    );
  end if;

  update balance_games set status = 'ended' where id = active_game.id;

  select * into next_game
    from balance_games
    where status = 'scheduled'
    order by date asc
    limit 1;

  if found then
    update balance_games set status = 'active' where id = next_game.id;
  end if;
end;
$$;

select cron.schedule(
  'midnight-rollover',
  '0 15 * * *',
  $$select perform_midnight_rollover();$$
);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: no errors; `npx supabase db query --linked "select jobname from cron.job;"` shows `midnight-rollover`.

- [ ] **Step 3: Write a manual verification script**

```sql
-- supabase/verify/rollover_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/rollover_check.sql
-- Expects the fixtures below to result in the 'A' side winning with the
-- highest-endorsed 'A' message going to the hall of fame.

do $$
declare
  g_id uuid;
  m1 uuid;
  m2 uuid;
  m3 uuid;
  result_status text;
  hof_count int;
  hof_nickname text;
begin
  insert into balance_games (date, choice_a_label, choice_b_label, status)
    values ('2000-01-01', 'A_TEST', 'B_TEST', 'active') returning id into g_id;

  insert into votes (game_id, device_id, choice) values
    (g_id, 'dev-1', 'A'), (g_id, 'dev-2', 'A'), (g_id, 'dev-3', 'B');

  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-1', 'winner_nick', 'A', 'best A argument') returning id into m1;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-2', 'other_a', 'A', 'weaker A argument') returning id into m2;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-3', 'b_nick', 'B', 'B argument') returning id into m3;

  insert into endorsements (message_id, device_id) values
    (m1, 'dev-2'), (m1, 'dev-3'), (m2, 'dev-3');

  perform perform_midnight_rollover();

  select status into result_status from balance_games where id = g_id;
  if result_status <> 'ended' then
    raise exception 'FAIL: expected game status ended, got %', result_status;
  end if;

  select count(*), max(nickname) into hof_count, hof_nickname
    from hall_of_fame where game_id = g_id;
  if hof_count <> 1 or hof_nickname <> 'winner_nick' then
    raise exception 'FAIL: expected 1 hall_of_fame row for winner_nick, got % / %', hof_count, hof_nickname;
  end if;

  raise notice 'PASS: rollover picked the correct winner and hall of fame entrant';

  -- cleanup
  delete from hall_of_fame where game_id = g_id;
  delete from chat_messages where game_id = g_id;
  delete from votes where game_id = g_id;
  delete from balance_games where id = g_id;
end;
$$;
```

- [ ] **Step 4: Run the verification script and confirm it fails first (no function yet would fail differently — instead confirm current logic passes)**

```bash
npx supabase db query --linked --file supabase/verify/rollover_check.sql
```

Expected: `NOTICE: PASS: rollover picked the correct winner and hall of fame entrant`. If it raises `FAIL: ...`, fix `perform_midnight_rollover()` and rerun until it passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add midnight KST rollover function and pg_cron schedule"
```

---

### Task 14: Hall of Fame display

**Files:**
- Create: `src/hooks/useHallOfFame.ts`
- Create: `src/components/HallOfFame.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()`.
- Produces: `useHallOfFame(): { entries: HallOfFameEntry[] }` where `HallOfFameEntry = Database["public"]["Tables"]["hall_of_fame"]["Row"]`; `<HallOfFame entries />`

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useHallOfFame.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type HallOfFameEntry = Database["public"]["Tables"]["hall_of_fame"]["Row"];

export function useHallOfFame() {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("hall_of_fame")
        .select("*")
        .order("endorsement_count", { ascending: false })
        .limit(10);
      if (!cancelled && data) setEntries(data);
    }
    load();

    const channel = supabase
      .channel("hall_of_fame")
      .on("postgres_changes", { event: "*", schema: "public", table: "hall_of_fame" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { entries };
}
```

- [ ] **Step 2: Build the `HallOfFame` component**

```typescript
// src/components/HallOfFame.tsx
import type { HallOfFameEntry } from "@/hooks/useHallOfFame";

export function HallOfFame({ entries }: { entries: HallOfFameEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-amber-50 rounded-md p-2 text-center text-xs text-neutral-500">
        🏆 명예의 전당 (아직 없음)
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-md p-2">
      <div className="text-xs font-bold mb-1">🏆 명예의 전당</div>
      <div className="flex gap-2 overflow-x-auto">
        {entries.map((entry, i) => (
          <div key={entry.id} className="shrink-0 w-24 bg-white rounded-md p-1 text-center text-[10px]">
            <div className="font-bold">#{i + 1}</div>
            <div className="truncate">{entry.nickname}</div>
            <div className="text-amber-600">인정 {entry.endorsement_count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page**

```typescript
  import { useHallOfFame } from "@/hooks/useHallOfFame";
  import { HallOfFame } from "@/components/HallOfFame";
```

```typescript
  const { entries } = useHallOfFame();
```

Add `<HallOfFame entries={entries} />` at the bottom of `<main>`, after the chat input, outside the `{game && (...)}` block so it always renders.

- [ ] **Step 4: Verify manually**

```bash
npx supabase db query --linked "insert into hall_of_fame (game_id, date, winning_choice, message_id, nickname, endorsement_count) select id, date, 'A', (select id from chat_messages limit 1), 'test_winner', 42 from balance_games limit 1;"
```

Reload `http://localhost:3000`, confirm the hall of fame card shows `test_winner` with `인정 42`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: display top-10 hall of fame"
```

---

### Task 15: Yesterday's result summary

**Files:**
- Create: `src/components/YesterdayResult.tsx`
- Modify: `src/hooks/useActiveGame.ts` (also expose the most recently ended game)
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["balance_games"]["Row"]`, `HallOfFameEntry`.
- Produces: `useActiveGame(): { game: BalanceGame | null; lastEndedGame: BalanceGame | null; loading: boolean }`; `<YesterdayResult game hallOfFameEntry />`

- [ ] **Step 1: Extend `useActiveGame` to also fetch the most recently ended game**

```typescript
// src/hooks/useActiveGame.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type BalanceGame = Database["public"]["Tables"]["balance_games"]["Row"];

export function useActiveGame() {
  const [game, setGame] = useState<BalanceGame | null>(null);
  const [lastEndedGame, setLastEndedGame] = useState<BalanceGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const [{ data: active }, { data: ended }] = await Promise.all([
        supabase.from("balance_games").select("*").eq("status", "active").maybeSingle(),
        supabase
          .from("balance_games")
          .select("*")
          .eq("status", "ended")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setGame(active ?? null);
        setLastEndedGame(ended ?? null);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel("balance_games:active")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balance_games" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { game, lastEndedGame, loading };
}
```

- [ ] **Step 2: Build the `YesterdayResult` component**

```typescript
// src/components/YesterdayResult.tsx
import type { VoteTally } from "@/lib/voteTally";
import type { BalanceGame } from "@/hooks/useActiveGame";
import type { HallOfFameEntry } from "@/hooks/useHallOfFame";

export function YesterdayResult({
  game,
  tally,
  winner,
}: {
  game: BalanceGame;
  tally: VoteTally;
  winner: HallOfFameEntry | null;
}) {
  const winningLabel = tally.aCount >= tally.bCount ? game.choice_a_label : game.choice_b_label;
  return (
    <div className="bg-neutral-100 rounded-md p-2 text-xs space-y-1">
      <div className="font-bold">📊 어제의 결과: {game.choice_a_label} vs {game.choice_b_label}</div>
      <div>
        🏅 승리 진영: {winningLabel} ({Math.max(tally.aPct, tally.bPct)}%)
      </div>
      {winner && (
        <div>👑 명예의 전당 등극: {winner.nickname} (인정 {winner.endorsement_count})</div>
      )}
    </div>
  );
}
```

Note: the summary `tally` is computed by the caller in Step 3, from the `votes` table for `lastEndedGame.id`, the same way Task 8's `useVotes` does. Reuse `useVotes(lastEndedGame?.id)` for this.

- [ ] **Step 3: Wire into the page**

```typescript
  import { YesterdayResult } from "@/components/YesterdayResult";
```

```typescript
  const { game, lastEndedGame, loading } = useActiveGame();
  const { tally: yesterdayTally } = useVotes(lastEndedGame?.id);
  const yesterdayWinnerEntry = entries.find((e) => e.game_id === lastEndedGame?.id) ?? null;
```

Add, directly under `<Header />`:

```typescript
      {lastEndedGame && (
        <YesterdayResult game={lastEndedGame} tally={yesterdayTally} winner={yesterdayWinnerEntry} />
      )}
```

(Move this block after the `entries` from `useHallOfFame` are declared, since it depends on them.)

- [ ] **Step 4: Verify manually**

```bash
npx supabase db query --linked "update balance_games set status = 'ended' where status = 'active';"
```

Reload the page, confirm "어제의 결과" renders with the correct winning side and (if present) hall of fame entrant, and that the live game/voting/chat UI is hidden since there's no active game.

Re-activate a game for continued testing:

```bash
npx supabase db query --linked "update balance_games set status = 'active' where status = 'ended' order by date desc limit 1;"
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show yesterday's result summary"
```

---

### Task 16: Admin authentication

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/actions.ts`

**Interfaces:**
- Produces: `login(formData: FormData): Promise<{ error?: string }>` server action; middleware gate on `/admin/*` (except `/admin/login`) checking the `admin_session` cookie against `process.env.ADMIN_SESSION_SECRET`.

- [ ] **Step 1: Write the login server action**

```typescript
// src/app/admin/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const password = formData.get("password");
  if (typeof password !== "string" || password !== process.env.ADMIN_PASSWORD) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Missing ADMIN_SESSION_SECRET");

  (await cookies()).set("admin_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  redirect("/admin");
}
```

- [ ] **Step 2: Write the login page**

```typescript
// src/app/admin/login/page.tsx
"use client";

import { useState } from "react";
import { login } from "@/app/admin/actions";

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-xs p-4">
      <h1 className="font-bold text-sm mb-2">관리자 로그인</h1>
      <form
        action={async (formData) => {
          const result = await login(formData);
          if (result?.error) setError(result.error);
        }}
        className="space-y-2"
      >
        <input
          type="password"
          name="password"
          className="border rounded-md w-full px-2 py-1 text-sm"
          placeholder="비밀번호"
        />
        <button type="submit" className="w-full bg-neutral-800 text-white rounded-md py-2 text-sm">
          로그인
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write the middleware gate**

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");

  if (!isAdminPath || isLoginPage) {
    return NextResponse.next();
  }

  const session = request.cookies.get("admin_session")?.value;
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
```

- [ ] **Step 4: Add a placeholder admin landing page (full CRUD lands in Task 17)**

```typescript
// src/app/admin/page.tsx
export default function AdminPage() {
  return <main className="p-4 text-sm">관리자 페이지 (문제 관리는 다음 단계에서 추가)</main>;
}
```

- [ ] **Step 5: Verify manually**

Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` in `.env.local` (e.g. `ADMIN_PASSWORD=test1234`, `ADMIN_SESSION_SECRET=$(openssl rand -hex 16)`).

```bash
npm run dev
```

Visit `http://localhost:3000/admin`, confirm redirect to `/admin/login`. Enter the wrong password, confirm the error message shows. Enter the correct password, confirm redirect to `/admin` and the placeholder page renders. Reload `/admin` directly, confirm it stays authenticated (cookie persists).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add password-gated admin authentication"
```

---

### Task 17: Admin question management (CRUD)

**Files:**
- Modify: `src/app/admin/actions.ts` (add CRUD actions)
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `getAdminSupabaseClient()` (Task 2).
- Produces: `createGame`, `updateGame`, `deleteGame` server actions.

- [ ] **Step 1: Add CRUD server actions**

Append to `src/app/admin/actions.ts`:

```typescript
import { cookies } from "next/headers";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const session = (await cookies()).get("admin_session")?.value;
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    throw new Error("Not authorized");
  }
}

export async function listGames() {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.from("balance_games").select("*").order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createGame(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from("balance_games").insert({
    date: String(formData.get("date")),
    choice_a_label: String(formData.get("choice_a_label")),
    choice_b_label: String(formData.get("choice_b_label")),
    description: formData.get("description") ? String(formData.get("description")) : null,
    status: "scheduled",
  });
  if (error) throw error;
}

export async function deleteGame(id: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from("balance_games").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Build the admin page UI**

```typescript
// src/app/admin/page.tsx
import { createGame, deleteGame, listGames } from "@/app/admin/actions";
import { revalidatePath } from "next/cache";

export default async function AdminPage() {
  const games = await listGames();

  async function create(formData: FormData) {
    "use server";
    await createGame(formData);
    revalidatePath("/admin");
  }

  async function remove(id: string) {
    "use server";
    await deleteGame(id);
    revalidatePath("/admin");
  }

  return (
    <main className="mx-auto max-w-lg p-4 space-y-4">
      <h1 className="font-bold text-sm">밸런스 게임 문제 관리</h1>

      <form action={create} className="space-y-2 border rounded-md p-2">
        <input type="date" name="date" required className="border rounded-md w-full px-2 py-1 text-sm" />
        <input
          name="choice_a_label"
          placeholder="선택지 A"
          required
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_b_label"
          placeholder="선택지 B"
          required
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <textarea
          name="description"
          placeholder="상세가정 (선택)"
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <button type="submit" className="bg-neutral-800 text-white rounded-md px-3 py-1 text-sm">
          등록
        </button>
      </form>

      <ul className="space-y-1">
        {games.map((g) => (
          <li key={g.id} className="flex justify-between items-center border rounded-md p-2 text-xs">
            <span>
              {g.date} · {g.choice_a_label} vs {g.choice_b_label} · {g.status}
            </span>
            <form action={remove.bind(null, g.id)}>
              <button type="submit" className="text-red-600">
                삭제
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

Log into `/admin`, create a game for tomorrow's date, confirm it appears in the list with `status: scheduled`. Delete it, confirm it disappears. Confirm a signed-out browser (no `admin_session` cookie) hitting `/admin` still redirects to `/admin/login`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add admin CRUD for balance game questions"
```

---

### Task 18: Ad placeholder and final page composition

**Files:**
- Create: `src/components/AdPlaceholder.tsx`
- Modify: `src/app/page.tsx` (final layout ordering per the approved A안 stacked design)

**Interfaces:**
- Produces: `<AdPlaceholder />`

- [ ] **Step 1: Build the placeholder component**

```typescript
// src/components/AdPlaceholder.tsx
export function AdPlaceholder() {
  return (
    <div className="bg-neutral-200 rounded-md p-4 text-center text-[10px] text-neutral-500">
      📢 광고 영역 (Phase 2에서 연동 예정)
    </div>
  );
}
```

- [ ] **Step 2: Finalize `src/app/page.tsx` ordering**

Ensure the JSX inside `<main>` follows this order top to bottom, matching the approved A안 (stacked) layout from the design doc §5:

1. `<Header />`
2. `<YesterdayResult .../>` (if `lastEndedGame`)
3. Loading/empty states (if no active `game`)
4. Game title + description (if `game`)
5. `<VoteGraph .../>`
6. `<RepresentativeOpinionBar .../>`
7. Vote buttons
8. `<ChatFeed .../>`
9. `<ChatInput .../>`
10. `<HallOfFame entries={entries} />`
11. `<AdPlaceholder />`
12. `{nickname === null && <NicknamePrompt .../>}` (rendered last so it overlays everything as a fixed modal)

Add the import and place `<AdPlaceholder />` after `<HallOfFame entries={entries} />`.

- [ ] **Step 3: Verify manually end-to-end**

```bash
npm run dev
```

Walk through the full flow in two browser tabs:
1. Set nicknames in both tabs.
2. Vote A in tab 1, B in tab 2 — confirm the graph shows 50/50 with counts in both tabs.
3. Send a chat message from each tab — confirm both appear tagged to the correct side in both tabs.
4. Endorse each other's messages — confirm counts update and the representative opinion bar reflects the endorsed messages.
5. Change tab 1's vote to B — confirm tab 1's next chat message tags as B.
6. Toggle "인정순 보기" — confirm the chat list re-sorts by endorsement count.
7. Confirm the hall of fame and ad placeholder render below the chat input.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: finalize main page layout with ad placeholder"
```

---

### Task 19: Deployment configuration

**Files:**
- Create: `README.md` (setup + deployment instructions)
- Modify: none (Vercel project linking is a manual dashboard step, documented here)

**Interfaces:**
- N/A — this task documents operational setup, no new code interfaces.

- [ ] **Step 1: Write the README**

```markdown
# 오늘의 밸런스 게임

## Local development

This project develops against a hosted Supabase project (no local Docker-based
Supabase is used).

1. Install dependencies: `npm install`
2. Create a project at supabase.com (or reuse an existing one for this app).
3. Copy `.env.local.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` from the dashboard's Project Settings → API
   page. Set `ADMIN_PASSWORD` and generate `ADMIN_SESSION_SECRET` with
   `openssl rand -hex 16`.
4. Generate a personal access token at
   https://supabase.com/dashboard/account/tokens, export it as
   `SUPABASE_ACCESS_TOKEN`, then link and push the schema:
   ```bash
   npx supabase init
   npx supabase link --project-ref <PROJECT_REF> --password '<DB_PASSWORD>'
   npx supabase db push
   npx supabase gen types typescript --linked > src/types/database.ts
   ```
5. Run the app: `npm run dev`
6. Run tests: `npm run test`

If you're on a network with TLS-inspecting security software (common on some
corporate/institutional networks), Node and the Supabase CLI may reject the
intercepted certificate even though your browser trusts it. If `npm run dev`
or `npx supabase` commands fail with a certificate error, export your
network's root CA as a PEM file and set `NODE_EXTRA_CA_CERTS` (for Node/Next.js)
and `SSL_CERT_FILE` (for the Supabase CLI) to point at it before running these
commands.

## Deployment

1. Reuse the same Supabase project from local development (or create a
   separate production project) and confirm `npx supabase db push` has been
   applied to it.
2. In the Supabase dashboard, confirm the `pg_cron` extension is enabled and
   the `midnight-rollover` job is listed under Database → Cron Jobs.
3. Create a Vercel project linked to this repository.
4. Set the same environment variables from `.env.local` (using the hosted
   Supabase project's values) in the Vercel project settings.
5. Deploy. Use the Supabase dashboard SQL editor (or `/admin`) to schedule
   the first `balance_games` row with `status = 'active'` so the site has
   content on first load.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add local development and deployment instructions"
```

---

## Self-Review Notes

- **Spec coverage:** §4.1 vote/side switching → Tasks 8, 10; §4.2 chat + endorsements → Tasks 10, 11; §4.3 representative opinion → Task 12; §4.4 rollover → Task 13; §4.5 hall of fame cap → Task 13 (SQL) + Task 14 (display); §5 layout → Task 18; §6 admin → Tasks 16, 17; §7 exclusions are intentionally not implemented; §8 verification → manual steps embedded in each task plus Task 19's README.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code or an exact command with expected output.
- **Type consistency:** `BalanceGame`, `Vote`, `ChatMessage`, `Endorsement`, `HallOfFameEntry` are each defined once (Tasks 6, 8, 10, 11, 14 respectively) via `Database["public"]["Tables"][...]["Row"]` and reused by name in every later task that touches them.
