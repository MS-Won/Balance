# 채팅 모더레이션 — 설계 문서

- 작성일: 2026-07-15
- 범위: 관리자 메시지 삭제, 기기(device_id) 단위 게임별 채팅 차단(+차단된 사용자에게 입력창 안내), 욕설 필터(클라이언트 차단 + DB 이중 방어). 전역/영구 차단, 차단 사유 기록, 메시지 검색/페이지네이션은 이번 범위 밖.

## 1. 배경 및 목적

`docs/superpowers/specs/2026-07-15-growth-marketing-design.md`의 Track A(커뮤니티 집중 발사)를 실행하기 전에, 외부 커뮤니티(에펨코리아 등)에서 유입되는 낯선 트래픽을 감당할 최소한의 모더레이션 장치가 필요하다.

현재 코드 기준으로 사용자는 **자기 메시지만** 삭제할 수 있고(`src/hooks/useChatMessages.ts`), 관리자가 타인의 메시지를 지우거나 특정 사용자의 추가 채팅을 막을 방법이 전혀 없다. 욕설 필터도 없다. 이 상태로 실제 커뮤니티 트래픽을 받으면 도배·욕설·혐오 발언에 대응할 수단이 DB를 직접 조작하는 것뿐이다.

참고: 기존 "본인 메시지 삭제" 기능은 RLS 정책이 `using (true)`(사실상 전체 허용)이고 `device_id` 필터링은 클라이언트 코드에서만 걸려 있다 — 이 프로젝트의 "계정 없음, 클라이언트가 자기 identity를 자체 신고" 구조상 DB 레벨에서 완전한 소유권 검증은 원래 불가능한 부분이다(`docs/superpowers/specs/2026-07-13-balance-game-mvp-design.md` §2, §7에서 이미 인지된 트레이드오프). 이번 관리자 삭제 기능은 이 허술한 공개 정책에 얹지 않고, `/admin`의 인증된 서버 액션(service-role 키)을 통해 별도 경로로 구현한다.

## 2. 데이터 모델

### 2.1 신규 테이블 `chat_blocks`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| game_id | uuid, FK → balance_games(id) on delete cascade | |
| device_id | text | |
| blocked_at | timestamptz, default now() | |

`unique (game_id, device_id)`. 차단은 **게임 단위**로 스코프된다 — 같은 기기라도 다른 날짜의 게임에는 영향이 없다.

RLS: 활성화하되 **공개 SELECT 정책만** 추가한다 (자기 차단 여부를 클라이언트가 확인해야 하므로). INSERT/UPDATE/DELETE는 공개 정책 없음 — service-role(관리자 서버 액션)만 가능. `device_id`는 이미 `chat_messages` 조회를 통해 누구나 볼 수 있는 값이라, `chat_blocks`를 공개 SELECT로 열어도 새로운 정보 노출은 아니다.

### 2.2 `chat_messages` INSERT 정책 변경

기존 `"public can post chat"` 정책(`with check (true)`)을, 다음 조건이 없을 때만 허용하도록 교체한다:

```sql
not exists (
  select 1 from chat_blocks
  where chat_blocks.game_id = chat_messages.game_id
    and chat_blocks.device_id = chat_messages.device_id
)
```

차단된 기기가 API를 직접 호출해도(클라이언트 우회) DB 레벨에서 INSERT가 거부된다.

### 2.3 욕설 필터 — DB 측 CHECK 제약

`chat_messages.content`에 대해, 큐레이션된 욕설/비속어 목록 기반 정규식으로 `CHECK` 제약을 추가한다 (기존 500자 길이 제약과 같은 이중 방어 패턴 — 클라이언트도 막지만 API 직접 호출도 막음). 예:

```sql
alter table chat_messages
  add constraint chat_messages_no_profanity
  check (content !~* '(욕설패턴1|욕설패턴2|...)');
```

목록은 완전한 탐지를 목표로 하지 않는 시작 세트이며, 이후 확장 가능해야 한다(정규식 패턴 하나로 관리해 마이그레이션으로 갱신하기 쉽게 유지).

## 3. 핵심 기능 흐름

### 3.1 관리자 — 메시지 삭제

- `/admin` 게임 목록의 각 행에 "채팅" 링크 추가 → `/admin?chat=<game_id>`.
- 해당 파라미터가 있으면 하단에 그 게임의 채팅 메시지 목록(닉네임·진영·내용·시간)을 표시하고, 메시지마다 [삭제] 버튼을 둔다.
- 삭제는 `getAdminSupabaseClient()`(service-role)로 `chat_messages.delete().eq("id", messageId)` 수행 → `revalidatePath("/admin")`.
- 기존 admin 페이지와 동일하게 confirm 다이얼로그 없음, 실시간 구독 없음(서버 컴포넌트, 액션 후 재검증 방식).

### 3.2 관리자 — 기기 차단/차단 해제

- 같은 채팅 목록에서 메시지별로 [차단]/[차단해제] 버튼을 둔다(해당 메시지의 `device_id` 기준). 이미 차단된 기기가 쓴 메시지는 [차단해제]로 토글 표시.
- 차단: `chat_blocks`에 `(game_id, device_id)` insert (unique 위반 시 무시).
- 차단 해제: 해당 행 delete.
- 표시를 위해 페이지 로드시 그 게임의 차단된 device_id 집합을 함께 조회해 각 메시지 행에 매핑한다.

### 3.3 사용자 측 — 차단 안내

- 신규 훅 `useChatBlockStatus(gameId): boolean` — 마운트 시 `chat_blocks`에서 `game_id` 일치 행을 조회해 자기 `device_id` 포함 여부를 계산하고, 이후 `chat_blocks`에 대한 Realtime(`postgres_changes`, `filter: game_id=eq.<id>`) 구독으로 차단/해제를 즉시 반영한다.
- 차단 상태면 `ChatInput`이 비활성화되고 기존 placeholder("💬 채팅 입력...") 대신 "잠시 채팅을 제한합니다"를 보여준다. 차단 해제 시 실시간으로 정상 입력창 복귀.
- 별도 토스트/알림 없음 — 입력창 상태 자체가 안내다.

### 3.4 사용자 측 — 욕설 필터

- `src/lib/profanityFilter.ts`: `containsProfanity(text: string): boolean` — DB CHECK 제약과 같은 패턴(또는 동등한 목록)을 클라이언트에도 둔다.
- `sendMessage` 호출 전에 `ChatInput`(또는 페이지 레벨)에서 검사: 욕설 감지 시 전송을 막고 입력창 아래에 "부적절한 표현이 포함되어 있어요" 안내를 보여준다. 감지 안 되면 평소처럼 전송.
- 두 목록(클라이언트 TS, DB 정규식)은 손으로 동기화한다 — 자동 생성/공유 스키마는 이번 범위 밖(목록 규모가 작아 수동 동기화로 충분하다고 판단).

## 4. 관리자 화면 레이아웃

```
[게임 목록]
2026-07-15 · 짜장면 vs 짬뽕 · scheduled   [수정] [채팅] [삭제]
...

--- ?chat=<id> 선택 시 아래 추가 ---

[채팅 모더레이션: 2026-07-15 짜장면 vs 짬뽕]
🅰 홍길동  "짜장이 진리"           [삭제] [차단]
🅱 익명42  "짬뽕 아니면 인정 안 함"  [삭제] [차단해제]
...
```

## 5. 검증 방법

- `supabase/verify/chat_block_check.sql` (기존 `date_based_rollover_check.sql`과 동일한 `begin;...rollback;` 격리 fixture 패턴):
  1. 차단 전: 정상 메시지 삽입 성공.
  2. `chat_blocks`에 (game, deviceX) 삽입 후: 같은 기기·같은 게임에 새 메시지 삽입 시도 → 실패해야 함.
  3. 같은 게임의 다른 기기(deviceY)는 계속 삽입 가능해야 함.
  4. deviceX가 **다른 게임**에는 계속 삽입 가능해야 함(차단이 게임 단위로 스코프됨 확인).
  5. 욕설 패턴이 포함된 content로 삽입 시도 → CHECK 제약 위반으로 실패해야 함.
- 순수 로직 함수(`containsProfanity`)는 vitest 단위 테스트로 커버(정상 문자열 통과, 욕설 패턴 포함 시 차단 케이스).
- 수동 확인: 관리자 화면에서 삭제/차단 클릭 → 실제 사용자 쪽 채팅 목록·입력창이 기대대로 반응하는지 두 브라우저 탭으로 확인.

## 6. 범위 밖

- 전역/영구 차단(현재는 게임 단위 한정).
- 차단 사유 기록, 차단 이력 조회.
- 욕설 목록의 자동 갱신/외부 서비스 연동(예: 외부 프로파니티 API) — 수동 관리 목록으로 충분.
- 메시지 검색, 페이지네이션(게임당 채팅량이 많아지면 후속 과제).
- 어뷰징 방지(기기 조작을 통한 중복 투표 등) — 기존 스펙대로 별도 범위, 이번 작업과 무관.
