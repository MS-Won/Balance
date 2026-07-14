# 날짜기반 롤오버 재설계 (Hall of Fame 집계 복구)

- 작성일: 2026-07-14
- 상태: 승인됨 (구현 대기)
- 관련: `supabase/migrations/0002_rollover_function.sql`, `src/hooks/useActiveGame.ts`, `src/app/admin/actions.ts`

## 배경 / 문제

메인 페이지는 날짜기반 모델로 전환되었다. `useActiveGame`(`src/hooks/useActiveGame.ts:31-37`)은
"현재 게임"을 **`date <= 오늘(KST)` 중 가장 최신 게임**으로 고른다. `status` 플래그에 의존하지 않는다.
게임은 `status='scheduled'`로만 생성되고(`src/app/admin/actions.ts:56`), 앱은 `status`를 절대 바꾸지 않는다.

그런데 자정 롤오버 함수 `perform_midnight_rollover()`(`0002_rollover_function.sql:19`)는 여전히
`where status = 'active'`로 대상 게임을 찾는다. 어떤 게임도 `'active'`가 되지 않으므로 이 조회는 항상
`not found` → early return → **명예의전당(hall_of_fame) 집계가 영구히 멈춘다.**

목표: 롤오버를 날짜기반 모델에 맞게 재설계하여 명예의전당 집계를 복구한다. 매일 자정마다 "방금 끝난
게임"을 **정확히 한 번만** 집계한다. 재실행·빈 날(그날 예약된 새 게임이 없는 경우)에 중복 집계되지 않는다.

## 핵심 개념: "끝난 게임"과 멱등성

날짜기반 모델에서 게임은 며칠간 "현재"로 남을 수 있다(그날 새 게임이 없으면). 게임이 끝나는 시점은
**더 최신 날짜의 게임이 "현재"가 되는 순간**이다. 따라서 집계 대상은:

> **현재 게임(`date <= 오늘` 중 최신)보다 이전 날짜이면서, 아직 집계되지 않은 게임.**

멱등성은 `balance_games.aggregated_at` 타임스탬프 마커로 보장한다. 집계된 게임에는 마커를 찍고, 마커가
있는 게임은 건너뛴다. 이 방식은 명예의전당 top-10 트림에서 밀려나 hall_of_fame 행이 사라진 게임도
재집계하지 않는다(hall_of_fame 행 존재 여부로 판단하는 방식의 약점을 회피).

## 스키마 변경

`balance_games`에 컬럼 추가:

```sql
alter table balance_games add column aggregated_at timestamptz;
```

- nullable, 기본 NULL. NULL = 아직 집계 안 됨.
- **백필:** 마이그레이션 시점에 이미 지난 게임을 집계 완료로 표시하여 소급 재집계를 막는다.

  ```sql
  update balance_games
     set aggregated_at = now()
   where date < (now() at time zone 'Asia/Seoul')::date;
  ```

  (KST 오늘 날짜는 `(now() at time zone 'Asia/Seoul')::date`로 구한다 — 이것이
  `useActiveGame`의 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`와 동일한 KST 캘린더
  날짜를 준다.)

  이로써 기존 운영 데이터(짜장면 vs 짬뽕 등)는 다시 집계되지 않는다. 오늘 게임과 미래 예약 게임은
  NULL로 남아 정상 집계 대상이 된다.

## 함수 재작성: `perform_midnight_rollover()`

`create or replace function`으로 교체. 의사 로직:

```
today := (now() at time zone 'Asia/Seoul')::date

current_game := select * from balance_games
                where date <= today
                order by date desc limit 1
if not found: return          -- 게임이 하나도 없음

for g in (
    select * from balance_games
     where date < current_game.date
       and aggregated_at is null
     order by date asc          -- 밀린 것부터 순서대로 (보통 0~1건)
):
    -- 승자 집계 (기존과 동일: A표 >= B표 → 'A', 동점은 A승)
    a_count := count(votes where game_id=g.id and choice='A')
    b_count := count(votes where game_id=g.id and choice='B')
    winner  := case when coalesce(a_count,0) >= coalesce(b_count,0) then 'A' else 'B' end

    -- 대표의견: 승자측 채팅 중 최다 인정, 동점은 created_at 빠른 것
    (rep_message_id, rep_nickname, rep_count) :=
        select cm.id, cm.nickname, count(e.id)
          from chat_messages cm
          left join endorsements e on e.message_id = cm.id
         where cm.game_id = g.id and cm.choice = winner
         group by cm.id, cm.nickname
         order by count(e.id) desc, cm.created_at asc
         limit 1

    if rep_message_id is not null:
        insert into hall_of_fame
            (game_id, date, winning_choice, message_id, nickname, endorsement_count)
        values (g.id, g.date, winner, rep_message_id, rep_nickname, coalesce(rep_count,0))

    -- 대표의견 유무와 무관하게 항상 마킹 → 무한 재시도 방지
    update balance_games set aggregated_at = now() where id = g.id

-- 명예의전당 top-10 유지 (기존과 동일)
delete from hall_of_fame
 where id not in (
     select id from hall_of_fame
      order by endorsement_count desc, created_at asc limit 10
 )
```

### 제거되는 로직 (기존 대비)

- `where status = 'active'` 기반 대상 조회 → 날짜기반으로 교체.
- `update balance_games set status = 'ended'` → 삭제.
- 다음 `scheduled` 게임을 찾아 `status='active'`로 승격 → 삭제.

`status` 컬럼 자체는 남겨둔다(레거시). admin 페이지가 아직 `g.status`를 표시하지만(항상 'scheduled'로
stale하게 보임), 그 표시 개선은 **이번 범위 밖**의 독립 후속 작업이다.

### cron

크론 잡 `midnight-rollover`(schedule `0 15 * * *` = KST 자정)는 이미 등록되어 있고 같은 함수명을
호출한다. 이 마이그레이션은 `create or replace function`만 하므로 `cron.schedule`을 다시 호출하지
않는다(중복 등록 방지).

## 마이그레이션 파일

`supabase/migrations/0007_date_based_rollover.sql` 한 파일에:
1. `alter table ... add column aggregated_at`
2. 백필 `update`
3. `create or replace function perform_midnight_rollover()`

`gen types --linked`로 `src/types/database.ts`에 `aggregated_at` 반영(생성/후속 커밋).

## 엣지 케이스

| 상황 | 동작 |
| --- | --- |
| 게임이 하나도 없음 | current_game not found → return, 아무것도 안 함 |
| 현재 게임이 유일한 게임(이전 게임 없음) | 루프 대상 0건 → 집계 없음 |
| 빈 날(그날 새 게임 없음) | 현재 게임은 그대로, 이전 게임은 이미 aggregated_at 세팅됨 → 루프 0건 |
| 크론이 며칠 다운 후 재가동 | 미집계 과거 게임 여러 건을 date 오름차순으로 따라잡아 집계 |
| 승자측 채팅이 0건(대표의견 없음) | hall_of_fame insert 생략, 하지만 aggregated_at은 세팅 → 무한 재시도 없음 |
| top-10에서 밀려난 게임 | aggregated_at이 이미 세팅됨 → 재집계/재삽입 없음 |
| 투표 0표 | 승자 = 'A'(동점 규칙), 대표의견 로직은 채팅 유무로 판단 |

## 검증 (라이브 테스트)

`supabase/verify/date_based_rollover_check.sql` 작성. 기존 `rollover_check.sql`과 같은 패턴:
전체를 `begin; ... rollback;`으로 감싸 **라이브 데이터를 변경하지 않는다**. 격리된 fixture 게임/투표/
채팅/인정을 삽입하고 `perform_midnight_rollover()`를 호출한 뒤 어서션. 어서션 실패 시 `raise
exception`으로 exit 1이 되도록 하여, Management API로 실행 시 **exit 0 = 전체 통과** 의미를 유지한다.

검증 시나리오:
1. **정상 집계 1건** — 어제 게임(과거 날짜) + 오늘 게임(현재) 구성, 투표/채팅/인정 세팅 후 롤오버 →
   어제 게임이 hall_of_fame에 승자·대표의견과 함께 1건 삽입, `aggregated_at` 세팅 확인.
2. **멱등 재실행** — 롤오버를 두 번 호출 → hall_of_fame 행 수 불변, 중복 삽입 없음.
3. **빈 날** — 오늘 게임만 있고 이전 게임은 이미 `aggregated_at` 세팅 → 롤오버가 아무것도 안 함.
4. **대표의견 없는 게임** — 승자측 채팅 0건인 과거 게임 → hall_of_fame 삽입 없이 `aggregated_at`만
   세팅됨(다음 실행에서 재시도 안 함).

라이브 적용은 `supabase db push` → `db query --linked --file .../date_based_rollover_check.sql` 순.
검증 통과 후 운영 반영으로 간주.

## 범위 밖 (별도 후속)

- admin 페이지의 게임 상태 표시(현재 항상 'scheduled')를 날짜에서 파생하도록 개선.
- `status` 컬럼의 최종 폐기 여부 결정.
