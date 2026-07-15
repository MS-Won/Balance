# 채팅 모더레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin chat-message deletion, per-game device blocking (with a chat-input notice for blocked users), and a client+DB profanity filter to `docs/superpowers/specs/2026-07-15-chat-moderation-design.md`.

**Architecture:** A new `chat_blocks` table + an updated `chat_messages` INSERT RLS policy enforce per-game blocking at the database level. A new `chat_messages_no_profanity` CHECK constraint enforces the profanity filter at the database level. The admin `/admin` page (existing password-gated server-action pattern) gets message-delete and block/unblock controls. The public app gets a `useChatBlockStatus` hook and a `containsProfanity` client-side check wired into `ChatInput`.

**Tech Stack:** Next.js 16 (App Router, TypeScript), `@supabase/supabase-js`, Supabase Postgres + Realtime, Vitest.

## Global Constraints

- Blocks are scoped to `(game_id, device_id)` — never global across games. (spec §2.1)
- `chat_blocks` has no public INSERT/UPDATE/DELETE policy — only the service-role admin client can block/unblock. (spec §2.1)
- Blocked device+game INSERTs into `chat_messages` must be rejected at the RLS level, not just in client code. (spec §2.2)
- The profanity filter is enforced both client-side (for immediate UX) and via a DB CHECK constraint (defense in depth, mirroring the existing 500-char length check). (spec §2.3, §3.4)
- Blocked users see "잠시 채팅을 제한합니다" as the `ChatInput` placeholder — no separate toast/banner. (spec §3.3)
- A profane message shows "부적절한 표현이 포함되어 있어요" and is not sent — no auto-censoring. (spec §3.4)
- Admin delete/block/unblock go through `getAdminSupabaseClient()` (service-role), not the existing public RLS delete path. (spec §1)
- No confirm dialogs, no realtime subscriptions in `/admin` — matches the existing server-component + server-action + `revalidatePath` pattern already used there. (spec §3.1)
- Out of scope: global/permanent blocks, block-reason logging, external profanity APIs, message search/pagination, abuse prevention (device spoofing). (spec §6)

## File Structure

```
supabase/
  migrations/
    0013_chat_moderation.sql       # chat_blocks table + RLS + insert policy + profanity CHECK
  verify/
    chat_block_check.sql           # isolated fixture: block enforcement + profanity constraint

src/
  types/database.ts                # + chat_blocks Table type (manual edit)
  lib/
    profanityFilter.ts              # containsProfanity(text)
    __tests__/
      profanityFilter.test.ts
  hooks/
    useChatBlockStatus.ts           # useChatBlockStatus(gameId): boolean
  components/
    ChatInput.tsx                   # + blocked prop, inline profanity check, error message
    HomeClient.tsx                  # wire useChatBlockStatus into ChatInput
  app/
    globals.css                     # + .chatinput-error
    admin/
      actions.ts                    # + listChatMessages, listBlockedDeviceIds, deleteChatMessage, blockChatter, unblockChatter
      page.tsx                      # + "채팅" link per game, moderation section
```

---

### Task 1: Database schema — `chat_blocks`, blocked-insert policy, profanity constraint

**Files:**
- Create: `supabase/migrations/0013_chat_moderation.sql`
- Create: `supabase/verify/chat_block_check.sql`
- Modify: `src/types/database.ts` (manual — `gen types --linked` may fail on TLS-intercepting networks per `CLAUDE.md`)

**Interfaces:**
- Produces: `chat_blocks` table `{ id: uuid, game_id: uuid, device_id: text, blocked_at: timestamptz }`, unique on `(game_id, device_id)`. `Database["public"]["Tables"]["chat_blocks"]["Row"] = { id: string; game_id: string; device_id: string; blocked_at: string }`.

- [ ] **Step 1: Confirm the next migration number, then write the migration**

The local checkout may lag behind what's actually applied to the live project (this has happened before — see `CLAUDE.md`, where a migration planned as `0008` had to be renamed to `0012`). Before creating the file, run:

```bash
npx supabase migration list --linked
```

If the highest applied remote migration is not `0012_fix_rollover_cutoff.sql`, rename the file below from `0013_...` to the next free number instead.

```sql
-- supabase/migrations/0013_chat_moderation.sql

create table chat_blocks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  blocked_at timestamptz not null default now(),
  unique (game_id, device_id)
);

alter table chat_blocks enable row level security;

-- Public read so a blocked device's own client can detect its block status
-- (device_id is already visible to anyone via chat_messages, so this adds
-- no new exposure). No public insert/update/delete: only the service-role
-- admin client (src/app/admin/actions.ts) can block/unblock.
create policy "public can read chat blocks" on chat_blocks for select using (true);

-- Replace the wide-open chat post policy with one that rejects INSERTs from
-- a device blocked in this specific game.
drop policy "public can post chat" on chat_messages;
create policy "public can post chat" on chat_messages for insert
  with check (
    not exists (
      select 1 from chat_blocks
      where chat_blocks.game_id = chat_messages.game_id
        and chat_blocks.device_id = chat_messages.device_id
    )
  );

-- Profanity filter, enforced at the DB level in addition to the client-side
-- check in src/lib/profanityFilter.ts (keep both lists in sync manually --
-- this is a small, hand-curated starting list, not exhaustive detection).
alter table chat_messages
  add constraint chat_messages_no_profanity
  check (content !~* '(씨발|씨팔|씨불|개새끼|개새꺄|병신|지랄|좆|좇|존나|니미럴|느금마|걸레년|창녀|미친놈|미친년)');
```

- [ ] **Step 2: Write the verify script**

```sql
-- supabase/verify/chat_block_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/chat_block_check.sql
--
-- SAFE AGAINST LIVE DATA. Wrapped in begin; … rollback; so nothing is
-- committed. On success the server emits `NOTICE: PASS …`; any assertion
-- failure raises an exception (exit 1).
--
-- Scenarios:
--   * Normal: an unblocked device can post to a game.
--   * Blocked: once (game, device) is in chat_blocks, that device's INSERT
--     into chat_messages for that game is rejected by RLS.
--   * Scoped: a different device in the same game is unaffected.
--   * Per-game: the blocked device can still post to a DIFFERENT game.
--   * Profanity: a message containing a filtered term is rejected by the
--     chat_messages_no_profanity check constraint.

begin;

delete from balance_games;

do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  g1_id uuid;
  g2_id uuid;
  v_count int;
  v_failed boolean;
begin
  insert into balance_games (date, choice_a_label, choice_b_label)
    values (v_today, 'A', 'B') returning id into g1_id;
  insert into balance_games (date, choice_a_label, choice_b_label)
    values (v_today - 1, 'A', 'B') returning id into g2_id;

  -- Normal: unblocked device can post.
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g1_id, 'd1', 'nick1', 'A', 'hello');
  select count(*) into v_count from chat_messages where game_id = g1_id and device_id = 'd1';
  if v_count <> 1 then
    raise exception 'FAIL normal: expected 1 message from d1, got %', v_count;
  end if;

  -- Block d1 for g1.
  insert into chat_blocks (game_id, device_id) values (g1_id, 'd1');

  -- Blocked: d1 can no longer post to g1.
  v_failed := false;
  begin
    insert into chat_messages (game_id, device_id, nickname, choice, content)
      values (g1_id, 'd1', 'nick1', 'A', 'should be blocked');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL blocked: d1 was able to post to g1 after being blocked';
  end if;

  -- Scoped: a different device (d2) in the same game is unaffected.
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g1_id, 'd2', 'nick2', 'B', 'still fine');
  select count(*) into v_count from chat_messages where game_id = g1_id and device_id = 'd2';
  if v_count <> 1 then
    raise exception 'FAIL scoped: expected 1 message from d2, got %', v_count;
  end if;

  -- Per-game: d1 (blocked in g1) can still post to g2.
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g2_id, 'd1', 'nick1', 'A', 'different game, fine');
  select count(*) into v_count from chat_messages where game_id = g2_id and device_id = 'd1';
  if v_count <> 1 then
    raise exception 'FAIL per-game: expected d1 to post to g2, got % rows', v_count;
  end if;

  -- Profanity: a filtered term is rejected.
  v_failed := false;
  begin
    insert into chat_messages (game_id, device_id, nickname, choice, content)
      values (g1_id, 'd3', 'nick3', 'A', '이 씨발 진짜');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL profanity: profane message was accepted';
  end if;

  raise notice 'PASS: chat_blocks enforcement (blocked/scoped/per-game) and profanity constraint all behave as expected';
end;
$$;

rollback;
```

- [ ] **Step 3 (controller-run, needs live secrets — do not hand `SUPABASE_ACCESS_TOKEN` to a subagent): Apply and verify against the live project**

```bash
npx supabase db push
npx supabase db query --linked --file supabase/verify/chat_block_check.sql
```

Expected: `db push` reports migration `0013_chat_moderation.sql` applied; the verify query exits 0 with `NOTICE: PASS: chat_blocks enforcement (blocked/scoped/per-game) and profanity constraint all behave as expected`.

- [ ] **Step 4: Manually add the `chat_blocks` type to `src/types/database.ts`**

Insert this entry into `Database["public"]["Tables"]` between `balance_games` and `chat_messages` (alphabetical, matching existing order):

```typescript
      chat_blocks: {
        Row: {
          blocked_at: string
          device_id: string
          game_id: string
          id: string
        }
        Insert: {
          blocked_at?: string
          device_id: string
          game_id: string
          id?: string
        }
        Update: {
          blocked_at?: string
          device_id?: string
          game_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_blocks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "balance_games"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 5: Verify the toolchain still passes**

```bash
npx tsc --noEmit
npm run test
```

Expected: both succeed (no test yet references `chat_blocks`, so this just confirms the type edit didn't break anything).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_chat_moderation.sql supabase/verify/chat_block_check.sql src/types/database.ts
git commit -m "feat: add chat_blocks table, blocked-insert RLS policy, profanity CHECK constraint"
```

---

### Task 2: `containsProfanity` — client-side profanity check

**Files:**
- Create: `src/lib/profanityFilter.ts`
- Test: `src/lib/__tests__/profanityFilter.test.ts`

**Interfaces:**
- Produces: `containsProfanity(text: string): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/profanityFilter.test.ts
import { describe, expect, it } from "vitest";
import { containsProfanity } from "@/lib/profanityFilter";

describe("containsProfanity", () => {
  it("returns false for a normal message", () => {
    expect(containsProfanity("짜장면이 더 맛있어요")).toBe(false);
  });

  it("detects a profane term", () => {
    expect(containsProfanity("이 씨발 진짜")).toBe(true);
  });

  it("detects a profane term embedded in a longer word", () => {
    expect(containsProfanity("병신같은 소리하네")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(containsProfanity("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- profanityFilter
```

Expected: FAIL — `Cannot find module '@/lib/profanityFilter'`.

- [ ] **Step 3: Implement `profanityFilter.ts`**

```typescript
// src/lib/profanityFilter.ts
// Hand-curated starting list, kept in sync manually with the
// chat_messages_no_profanity CHECK constraint in
// supabase/migrations/0013_chat_moderation.sql. Not exhaustive detection --
// a pragmatic first filter, not a complete solution.
const PROFANITY_TERMS = [
  "씨발",
  "씨팔",
  "씨불",
  "개새끼",
  "개새꺄",
  "병신",
  "지랄",
  "좆",
  "좇",
  "존나",
  "니미럴",
  "느금마",
  "걸레년",
  "창녀",
  "미친놈",
  "미친년",
];

const PROFANITY_PATTERN = new RegExp(PROFANITY_TERMS.join("|"), "i");

export function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERN.test(text);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- profanityFilter
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profanityFilter.ts src/lib/__tests__/profanityFilter.test.ts
git commit -m "feat: add client-side profanity check"
```

---

### Task 3: `useChatBlockStatus` hook

**Files:**
- Create: `src/hooks/useChatBlockStatus.ts`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient()`, `getDeviceId()`, `chat_blocks` table (Task 1).
- Produces: `useChatBlockStatus(gameId: string | undefined): boolean`

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useChatBlockStatus.ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";

export function useChatBlockStatus(gameId: string | undefined): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!gameId) {
      setBlocked(false);
      return;
    }
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("chat_blocks")
        .select("device_id")
        .eq("game_id", gameId!);
      if (cancelled || !data) return;
      setBlocked(data.some((row) => row.device_id === deviceId));
    }
    load();

    const channel = supabase
      .channel(`chat_blocks:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_blocks", filter: `game_id=eq.${gameId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return blocked;
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: succeeds (hook isn't wired into any component yet, but must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChatBlockStatus.ts
git commit -m "feat: add useChatBlockStatus hook"
```

---

### Task 4: `ChatInput` — blocked state and profanity check

**Files:**
- Modify: `src/components/ChatInput.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `containsProfanity` (Task 2).
- Produces: `<ChatInput disabled blocked onSend />` (new `blocked: boolean` prop; existing `disabled`/`onSend` unchanged in meaning).

- [ ] **Step 1: Update `ChatInput.tsx`**

```typescript
// src/components/ChatInput.tsx
"use client";

import { useState } from "react";
import { containsProfanity } from "@/lib/profanityFilter";

export function ChatInput({
  disabled,
  blocked,
  onSend,
}: {
  disabled: boolean;
  blocked: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || blocked;

  function submit() {
    if (isDisabled || value.trim().length === 0) return;
    if (containsProfanity(value)) {
      setError("부적절한 표현이 포함되어 있어요");
      return;
    }
    setError(null);
    onSend(value);
    setValue("");
  }

  function placeholder(): string {
    if (blocked) return "잠시 채팅을 제한합니다";
    if (disabled) return "먼저 투표해야 의견을 쓸 수 있어요";
    return "의견을 써주세요...";
  }

  return (
    <div>
      <div className="chatinput">
        <input
          value={value}
          maxLength={500}
          disabled={isDisabled}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder()}
        />
        <button onClick={submit} disabled={isDisabled}>
          전송
        </button>
      </div>
      {error && <p className="chatinput-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add the error message style to `globals.css`**

Add this rule immediately after the existing `.chatinput button:disabled` rule (around line 441):

```css
.chatinput-error {
  font-size: 12px;
  color: var(--coral-deep);
  margin: 4px 0 0;
}
```

- [ ] **Step 3: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: fails at this point because `HomeClient.tsx` still calls `<ChatInput disabled={...} onSend={...} />` without the new required `blocked` prop — confirms the prop is actually required. This will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatInput.tsx src/app/globals.css
git commit -m "feat: add blocked state and profanity check to ChatInput"
```

---

### Task 5: Wire `useChatBlockStatus` into `HomeClient`

**Files:**
- Modify: `src/components/HomeClient.tsx`

**Interfaces:**
- Consumes: `useChatBlockStatus` (Task 3), updated `ChatInput` (Task 4).

- [ ] **Step 1: Add the hook and pass `blocked` to `ChatInput`**

In `src/components/HomeClient.tsx`, add the import:

```typescript
import { useChatBlockStatus } from "@/hooks/useChatBlockStatus";
```

Add the hook call alongside the other hooks (after `useHallOfFame`):

```typescript
  const blocked = useChatBlockStatus(game?.id);
```

Update the `ChatInput` usage:

```typescript
          <ChatInput
            disabled={!myChoice || !nickname}
            blocked={blocked}
            onSend={(content) => myChoice && sendMessage(content, myChoice)}
          />
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Verify manually with two browser tabs**

```bash
npm run dev
```

In tab 1, vote and send a chat message. In the Supabase dashboard (or via `psql`/SQL editor), manually insert a row into `chat_blocks` for tab 1's `device_id` (visible in `localStorage` under `balance-game:device-id`) and the active game's id. Confirm tab 1's chat input goes disabled with placeholder "잠시 채팅을 제한합니다" within ~1s (Realtime), and re-enables when that row is deleted.

- [ ] **Step 4: Commit**

```bash
git add src/components/HomeClient.tsx
git commit -m "feat: wire chat block status into the chat input"
```

---

### Task 6: Admin actions — delete message, block/unblock chatter

**Files:**
- Modify: `src/app/admin/actions.ts`

**Interfaces:**
- Consumes: `assertAdmin()`, `getAdminSupabaseClient()` (both already defined in this file).
- Produces:
  - `listChatMessages(gameId: string)` → `Database["public"]["Tables"]["chat_messages"]["Row"][]`
  - `listBlockedDeviceIds(gameId: string): Promise<Set<string>>`
  - `deleteChatMessage(id: string): Promise<void>`
  - `blockChatter(gameId: string, deviceId: string): Promise<void>`
  - `unblockChatter(gameId: string, deviceId: string): Promise<void>`

- [ ] **Step 1: Add the new actions to `src/app/admin/actions.ts`**

Append these functions after the existing `deleteGame`:

```typescript
export async function listChatMessages(gameId: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listBlockedDeviceIds(gameId: string): Promise<Set<string>> {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chat_blocks")
    .select("device_id")
    .eq("game_id", gameId);
  if (error) throw error;
  return new Set(data.map((row) => row.device_id));
}

export async function deleteChatMessage(id: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error) throw error;
}

export async function blockChatter(gameId: string, deviceId: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase
    .from("chat_blocks")
    .upsert({ game_id: gameId, device_id: deviceId }, { onConflict: "game_id,device_id" });
  if (error) throw error;
}

export async function unblockChatter(gameId: string, deviceId: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase
    .from("chat_blocks")
    .delete()
    .eq("game_id", gameId)
    .eq("device_id", deviceId);
  if (error) throw error;
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "feat: add admin actions for chat message delete and device blocking"
```

---

### Task 7: Admin page UI — chat moderation section

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `listChatMessages`, `listBlockedDeviceIds`, `deleteChatMessage`, `blockChatter`, `unblockChatter` (Task 6).

- [ ] **Step 1: Update imports and `searchParams` type**

Replace the import line and the `AdminPage` function signature:

```typescript
import {
  createGame,
  deleteGame,
  listGames,
  updateGame,
  listChatMessages,
  listBlockedDeviceIds,
  deleteChatMessage,
  blockChatter,
  unblockChatter,
} from "@/app/admin/actions";
```

```typescript
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; chat?: string }>;
}) {
  const { edit: editId, chat: chatGameId } = await searchParams;
  const games = await listGames();
  const defaultDate = games[0] ? nextDay(games[0].date) : undefined;
  const editingGame = editId ? games.find((g) => g.id === editId) : undefined;
  const chatGame = chatGameId ? games.find((g) => g.id === chatGameId) : undefined;
  const chatMessages = chatGameId ? await listChatMessages(chatGameId) : [];
  const blockedDeviceIds = chatGameId ? await listBlockedDeviceIds(chatGameId) : new Set<string>();
```

- [ ] **Step 2: Add the moderation server actions**

Add these alongside the existing `create`/`update`/`remove` server actions inside `AdminPage`:

```typescript
  async function removeMessage(id: string) {
    "use server";
    await deleteChatMessage(id);
    revalidatePath("/admin");
  }

  async function block(gameId: string, deviceId: string) {
    "use server";
    await blockChatter(gameId, deviceId);
    revalidatePath("/admin");
  }

  async function unblock(gameId: string, deviceId: string) {
    "use server";
    await unblockChatter(gameId, deviceId);
    revalidatePath("/admin");
  }
```

- [ ] **Step 3: Add a "채팅" link to each game row**

In the `games.map((g) => ...)` list item, add a link next to the existing "수정" link:

```typescript
              <a href={`/admin?chat=${g.id}`} className="text-neutral-600">
                채팅
              </a>
```

(Insert this line directly before the existing `<a href={\`/admin?edit=${g.id}\`} ...>수정</a>` line.)

- [ ] **Step 4: Render the moderation section**

Add this section immediately after the closing `</ul>` of the games list, before the closing `</main>`:

```typescript
      {chatGame && (
        <section className="space-y-2 border rounded-md p-2">
          <h2 className="font-bold text-sm">
            채팅 모더레이션 — {chatGame.date}{" "}
            {chatGame.question ?? `${chatGame.choice_a_label} vs ${chatGame.choice_b_label}`}
          </h2>
          <ul className="space-y-1">
            {chatMessages.map((m) => {
              const isBlocked = blockedDeviceIds.has(m.device_id);
              return (
                <li
                  key={m.id}
                  className="flex justify-between items-center gap-2 border rounded-md p-2 text-xs"
                >
                  <span>
                    {m.choice === "A" ? "🅰" : "🅱"} {m.nickname}: {m.content}
                  </span>
                  <span className="flex gap-2 items-center shrink-0">
                    <form action={removeMessage.bind(null, m.id)}>
                      <button type="submit" className="text-red-600">
                        삭제
                      </button>
                    </form>
                    <form
                      action={(isBlocked ? unblock : block).bind(null, chatGame.id, m.device_id)}
                    >
                      <button
                        type="submit"
                        className={isBlocked ? "text-neutral-600" : "text-orange-600"}
                      >
                        {isBlocked ? "차단해제" : "차단"}
                      </button>
                    </form>
                  </span>
                </li>
              );
            })}
            {chatMessages.length === 0 && (
              <li className="text-xs text-neutral-500">채팅이 아직 없습니다.</li>
            )}
          </ul>
        </section>
      )}
```

- [ ] **Step 5: Verify it builds**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three succeed.

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Log into `/admin`, click "채팅" on a game with existing messages, confirm the list renders. Click [삭제] on a message and confirm it disappears from both `/admin` and the live main page (open in a second tab) within the page's normal revalidation. Click [차단] on a message's author, confirm the row now shows [차단해제], and confirm in a third tab (with that device's `device_id` in `localStorage`, or via the Task 5 manual test) that the chat input goes into the blocked state.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add chat moderation UI to the admin page"
```
