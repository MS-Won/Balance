# 날짜기반 롤오버 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `perform_midnight_rollover()`를 날짜기반 게임 모델에 맞게 재설계하여, 멈춰 있던 명예의전당(hall_of_fame) 집계를 복구한다.

**Architecture:** `balance_games`에 `aggregated_at timestamptz` 멱등성 마커를 추가한다. 롤오버는 "현재 게임(`date <= 오늘 KST` 중 최신)보다 이전 날짜이면서 아직 집계 안 된 게임"을 순회하며 승자·대표의견을 hall_of_fame에 넣고 마커를 찍는다. `status` 기반 로직은 전부 제거한다. 기존 cron 잡은 같은 함수명을 계속 호출하므로 건드리지 않는다.

**Tech Stack:** Supabase (PostgreSQL + pg_cron), plpgsql, supabase CLI(`db push`/`db query --linked`), TypeScript 타입.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-14-date-based-rollover-design.md` (모든 로직/엣지케이스의 근거).
- KST 오늘 날짜는 **항상** `(now() at time zone 'Asia/Seoul')::date`로 계산 (프론트 `useActiveGame`의 `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'})`와 동일한 캘린더 날짜).
- 승자 규칙: `coalesce(a_count,0) >= coalesce(b_count,0)` → `'A'`, 아니면 `'B'` (동점은 A승, 기존과 동일).
- 대표의견: 승자측 채팅 중 `count(endorsements) desc, created_at asc` 최상위 1건.
- 이 프로젝트는 로컬 Docker Supabase를 쓰지 않는다. dev/prod가 **하나의 호스팅 Supabase 프로젝트**(ref `usqxzkggksqoceileqbt`)를 공유한다. 검증 SQL은 반드시 `begin; … rollback;`으로 감싸 라이브 데이터를 변경하지 않는다.
- 마이그레이션은 `create or replace function`만 하고 `cron.schedule`을 다시 호출하지 않는다(중복 등록 방지).
- CLI(`db push`/`db query --linked`)는 `SUPABASE_ACCESS_TOKEN` 환경변수가 필요하다. 이 PC는 HTTPS 가로채기가 있어 필요 시 `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE`(README 참고)를 설정한다.

## File Structure

- Create: `supabase/migrations/0007_date_based_rollover.sql` — 컬럼 추가 + 백필 + 함수 재작성.
- Create: `supabase/verify/date_based_rollover_check.sql` — 격리 fixture 라이브 검증(begin/rollback).
- Modify: `src/types/database.ts` — `balance_games`에 `aggregated_at` 필드 반영.

---

### Task 1: 검증 SQL 작성 (테스트)

날짜기반 롤오버가 만족해야 할 동작을 인코딩하는 격리 fixture 검증 스크립트. 이 스크립트가 Task 2 마이그레이션의 "테스트"다. 새 함수가 배포되기 전에는 통과할 수 없고(구 함수는 `status='active'` 기준), 배포 후 통과하면 그것이 green 신호다.

**Files:**
- Create: `supabase/verify/date_based_rollover_check.sql`

**Interfaces:**
- Consumes: 배포된 `perform_midnight_rollover()` (Task 2 산출물), 기존 테이블 `balance_games`/`votes`/`chat_messages`/`endorsements`/`hall_of_fame`, 새 컬럼 `balance_games.aggregated_at`.
- Produces: `npx supabase db query --linked --file supabase/verify/date_based_rollover_check.sql` 실행 시 어서션 통과면 exit 0, 실패면 `raise exception`으로 exit 1.

- [ ] **Step 1: 검증 SQL 작성**

`supabase/verify/date_based_rollover_check.sql`에 정확히 아래 내용:

```sql
-- supabase/verify/date_based_rollover_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/date_based_rollover_check.sql
--
-- SAFE AGAINST LIVE DATA. dev/prod share ONE hosted Supabase project, so this
-- runs against the live DB. The whole script is wrapped in begin; … rollback;
-- so NOTHING is committed: the clean-slate delete, the fixtures, and every side
-- effect of perform_midnight_rollover() are all discarded. On success the server
-- emits `NOTICE: PASS …`; any assertion failure raises an exception (exit 1).
--
-- Scenarios (all in one run):
--   * Normal: a past game with votes+chat+endorsements is aggregated (winner A,
--     representative = most-endorsed A message).
--   * Catch-up loop: two past games behind one current game both get aggregated.
--   * No representative: a past game whose winning side has no chat gets NO
--     hall_of_fame row but IS marked aggregated (no infinite retry).
--   * Idempotent: a second rollover() call changes nothing.

begin;

-- Clean slate so assertions are deterministic. Cascades to votes/chat/
-- endorsements/hall_of_fame (FKs are on delete cascade). Rolled back below.
delete from balance_games;

do $$
declare
  c_id uuid;   -- current game (newest date <= today)
  p1_id uuid;  -- past game with a valid representative
  p0_id uuid;  -- past game whose winner side has no chat
  m1 uuid;
  m2 uuid;
  hof_total int;
  hof_p1 int;
  hof_p1_nick text;
  hof_p1_choice text;
  hof_p1_count int;
  hof_p0 int;
  p0_marked timestamptz;
  c_marked timestamptz;
begin
  -- Current game: newest date <= today, so rollover treats it as "current"
  -- and never aggregates it. 2000-01-10 is safely <= today.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-10', 'CUR_A', 'CUR_B') returning id into c_id;

  -- Past game P1 (normal): winner A (2 A vs 1 B); A-side messages m1/m2,
  -- m1 most endorsed (2 vs 1) -> representative = winner_nick.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-05', 'P1_A', 'P1_B') returning id into p1_id;
  insert into votes (game_id, device_id, choice) values
    (p1_id, 'd1', 'A'), (p1_id, 'd2', 'A'), (p1_id, 'd3', 'B');
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd1', 'winner_nick', 'A', 'best A') returning id into m1;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd2', 'other_a', 'A', 'weaker A') returning id into m2;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd3', 'b_nick', 'B', 'a B');
  insert into endorsements (message_id, device_id) values
    (m1, 'd2'), (m1, 'd3'), (m2, 'd3');

  -- Past game P0 (no representative): winner A (1 A vs 0 B) but only a B-side
  -- chat message exists -> no A-side message -> no hall_of_fame row expected.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-01', 'P0_A', 'P0_B') returning id into p0_id;
  insert into votes (game_id, device_id, choice) values (p0_id, 'd4', 'A');
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p0_id, 'd4', 'lonely_b', 'B', 'only a B msg');

  perform perform_midnight_rollover();

  -- P1 aggregated: exactly one HoF row, winner_nick, choice A, count 2.
  select count(*), max(nickname), max(winning_choice), max(endorsement_count)
    into hof_p1, hof_p1_nick, hof_p1_choice, hof_p1_count
    from hall_of_fame where game_id = p1_id;
  if hof_p1 <> 1 or hof_p1_nick <> 'winner_nick'
     or hof_p1_choice <> 'A' or hof_p1_count <> 2 then
    raise exception 'FAIL P1: got count=% nick=% choice=% endorse=%',
      hof_p1, hof_p1_nick, hof_p1_choice, hof_p1_count;
  end if;

  -- P0: no HoF row, but marked aggregated.
  select count(*) into hof_p0 from hall_of_fame where game_id = p0_id;
  if hof_p0 <> 0 then
    raise exception 'FAIL P0: expected 0 hall_of_fame rows, got %', hof_p0;
  end if;
  select aggregated_at into p0_marked from balance_games where id = p0_id;
  if p0_marked is null then
    raise exception 'FAIL P0: expected aggregated_at set, got NULL';
  end if;

  -- Current game must NOT be aggregated.
  select aggregated_at into c_marked from balance_games where id = c_id;
  if c_marked is not null then
    raise exception 'FAIL current: current game was aggregated (should not be)';
  end if;

  -- Total HoF rows from our fixtures = 1 (only P1).
  select count(*) into hof_total from hall_of_fame;
  if hof_total <> 1 then
    raise exception 'FAIL total: expected 1 hall_of_fame row, got %', hof_total;
  end if;

  -- Idempotency: a second rollover changes nothing.
  perform perform_midnight_rollover();
  select count(*) into hof_total from hall_of_fame;
  if hof_total <> 1 then
    raise exception 'FAIL idempotent: expected 1 row after re-run, got %', hof_total;
  end if;

  raise notice 'PASS: date-based rollover aggregated past games once, skipped current, idempotent';
end;
$$;

rollback;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/verify/date_based_rollover_check.sql
git commit -m "test: add date-based rollover verification (isolated fixtures)"
```

(아직 실행하지 않는다 — 새 함수가 배포되기 전이라 실패한다. Task 3에서 배포 후 실행한다.)

---

### Task 2: 마이그레이션 0007 작성 (컬럼 + 백필 + 함수)

**Files:**
- Create: `supabase/migrations/0007_date_based_rollover.sql`

**Interfaces:**
- Consumes: 기존 스키마(`balance_games`, `votes`, `chat_messages`, `endorsements`, `hall_of_fame`), 기존 cron 잡 `midnight-rollover`.
- Produces: 컬럼 `balance_games.aggregated_at timestamptz`(nullable); 재작성된 함수 `perform_midnight_rollover() returns void`.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0007_date_based_rollover.sql`에 정확히 아래 내용:

```sql
-- supabase/migrations/0007_date_based_rollover.sql
-- Redesign perform_midnight_rollover() for the date-based game model.
-- The app selects the "current" game by date (useActiveGame: newest date <= today
-- KST), never by status. The old rollover keyed off status='active', which no
-- game ever becomes, so hall_of_fame aggregation had silently stopped. This
-- rewrite aggregates each ended game exactly once, guarded by an aggregated_at
-- marker. See docs/superpowers/specs/2026-07-14-date-based-rollover-design.md.

-- 1. Idempotency marker.
alter table balance_games add column if not exists aggregated_at timestamptz;

-- 2. Backfill: mark already-past games aggregated so the first run does NOT
--    retroactively re-aggregate existing production data. Today's game and
--    future scheduled games stay NULL (eligible once they end).
update balance_games
   set aggregated_at = now()
 where aggregated_at is null
   and date < (now() at time zone 'Asia/Seoul')::date;

-- 3. Date-based rollover. NOTE: create-or-replace only — the existing
--    'midnight-rollover' cron job (0 15 * * * = KST midnight) already calls
--    this function name, so we do NOT re-schedule it here.
create or replace function perform_midnight_rollover()
returns void
language plpgsql
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  current_game balance_games%rowtype;
  ended_game balance_games%rowtype;
  a_count int;
  b_count int;
  winner text;
  rep_message_id uuid;
  rep_nickname text;
  rep_count int;
begin
  -- The current game is the newest one whose date has arrived. Games strictly
  -- older than it have "ended" and are eligible for aggregation.
  select * into current_game
    from balance_games
    where date <= today
    order by date desc
    limit 1;
  if not found then
    return;
  end if;

  -- Aggregate every ended, not-yet-aggregated game (usually 0-1; the loop also
  -- catches up if cron was down for several days). Oldest first.
  for ended_game in
    select * from balance_games
     where date < current_game.date
       and aggregated_at is null
     order by date asc
  loop
    select count(*) filter (where choice = 'A'),
           count(*) filter (where choice = 'B')
      into a_count, b_count
      from votes
      where game_id = ended_game.id;

    winner := case when coalesce(a_count, 0) >= coalesce(b_count, 0)
                   then 'A' else 'B' end;

    -- Reset so a game with no winning-side chat leaves rep_message_id NULL.
    rep_message_id := null;
    rep_nickname := null;
    rep_count := null;

    select cm.id, cm.nickname, count(e.id)
      into rep_message_id, rep_nickname, rep_count
      from chat_messages cm
      left join endorsements e on e.message_id = cm.id
      where cm.game_id = ended_game.id and cm.choice = winner
      group by cm.id, cm.nickname
      order by count(e.id) desc, cm.created_at asc
      limit 1;

    if rep_message_id is not null then
      insert into hall_of_fame
        (game_id, date, winning_choice, message_id, nickname, endorsement_count)
      values
        (ended_game.id, ended_game.date, winner, rep_message_id, rep_nickname,
         coalesce(rep_count, 0));
    end if;

    -- Always mark aggregated, even with no representative, so we never retry.
    update balance_games set aggregated_at = now() where id = ended_game.id;
  end loop;

  -- Keep only the top 10 leaderboard entries (unchanged from prior design).
  delete from hall_of_fame
   where id not in (
     select id from hall_of_fame
      order by endorsement_count desc, created_at asc
      limit 10
   );
end;
$$;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0007_date_based_rollover.sql
git commit -m "feat: redesign rollover for date-based model (aggregated_at marker)"
```

---

### Task 3: 운영 적용 + 라이브 검증 + 타입 반영

**Files:**
- Modify: `src/types/database.ts` (balance_games Row/Insert/Update에 `aggregated_at` 추가)

**Interfaces:**
- Consumes: Task 1 검증 SQL, Task 2 마이그레이션.
- Produces: 운영 DB에 적용된 컬럼/함수, 통과한 검증, 타입 반영.

- [ ] **Step 1: 마이그레이션을 운영에 적용**

Run: `npx supabase db push`
Expected: `0007_date_based_rollover.sql` applied. (0001~0006은 이미 remote.) 오류 없이 완료.

- [ ] **Step 2: 라이브 검증 실행**

Run: `npx supabase db query --linked --file supabase/verify/date_based_rollover_check.sql`
Expected: exit 0 (전체 `begin;…rollback;`이라 라이브 미변경). exit 0 = 모든 어서션 통과. 실패 시 `FAIL …` 예외로 exit 1 → 원인 수정 후 재실행.

- [ ] **Step 3: 타입에 `aggregated_at` 반영 (수동 편집)**

이 PC의 HTTPS 가로채기로 `gen types`가 실패할 수 있으므로 `src/types/database.ts`를 직접 편집한다. `balance_games`의 세 블록에 각각 추가:

Row 블록(예: `created_at: string` 다음 줄, 알파벳 순 위치):
```ts
          aggregated_at: string | null
```
Insert 블록:
```ts
          aggregated_at?: string | null
```
Update 블록:
```ts
          aggregated_at?: string | null
```

(각 블록에서 알파벳 순서상 `aggregated_at`은 `choice_a_description`보다 앞이다 — 블록 맨 위에 넣으면 gen types 출력과 일치한다.)

- [ ] **Step 4: 정적 게이트 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npm run test`
Expected: 12/12 통과 (기존과 동일).

- [ ] **Step 5: 커밋**

```bash
git add src/types/database.ts
git commit -m "chore: add aggregated_at to balance_games types"
```

---

## Self-Review

- **Spec coverage:** 스키마 변경(컬럼+백필)=Task 2 / 함수 재작성=Task 2 / status 로직 제거=Task 2 / cron 미변경=Task 2 주석 / 검증 4시나리오(정상·멱등·빈날·대표없음)=Task 1 / 타입 반영=Task 3. 스펙의 "범위 밖(admin 표시)"은 의도적으로 계획에 없음. 커버리지 갭 없음.
- **Placeholder scan:** TBD/TODO 없음. 모든 SQL/명령/코드가 전체 내용 포함.
- **Type consistency:** 함수는 `perform_midnight_rollover()`로 일관. 컬럼명 `aggregated_at` 일관. 검증 SQL의 어서션 컬럼(`nickname`,`winning_choice`,`endorsement_count`,`aggregated_at`)이 스키마와 일치.

## Execution Handoff

이 계획을 어떻게 실행할지 후속 메시지에서 선택.
