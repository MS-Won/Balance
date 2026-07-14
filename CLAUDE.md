# 오늘의 밸런스 게임 — 작업 재개 가이드

다른 PC에서 이어서 작업할 때 참고할 문서입니다.

## 프로젝트 개요

- 설계 문서: `docs/superpowers/specs/2026-07-13-balance-game-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-13-balance-game-mvp-implementation.md` (19개 태스크)
- 진행 방식: `superpowers:subagent-driven-development` 스킬로, 태스크마다 구현 서브에이전트 → 리뷰 서브에이전트를 붙여서 진행 중.
- 진행 원장: `.superpowers/sdd/progress.md` (완료된 태스크와 커밋 범위 기록. `.gitignore`에 의해 이 파일 자체는 git에는 안 올라가므로, 최신 상태는 아래 "현재 진행 상황" 섹션과 `git log`를 기준으로 판단할 것)

## 현재 진행 상황 (2026-07-14 갱신 — 날짜기반 롤오버 구현·라이브 적용·검증 완료)

**이번 세션: 날짜기반 롤오버 구현 계획(Task 1~3)을 `superpowers:subagent-driven-development`로 전부 실행 완료.
운영 DB(usqxzkggksqoceileqbt)에 마이그레이션 0007 적용 완료, 라이브 검증 통과(exit 0), 타입 반영,
최종 전체 브랜치 리뷰(opus) 통과. 전부 커밋되어 origin main에 푸시 완료
(`3fef3fb..376cd57`, 4개 커밋: 검증SQL→마이그레이션→타입→stale 검증스크립트 정리).**

**hall_of_fame 집계 정지 버그는 이제 라이브에서 수정된 상태.** 다음 자정(KST) 크론 실행부터
정상 동작해야 함 (사람이 며칠 뒤 hall_of_fame에 새 행이 쌓이는지 확인해볼 것 — 자동 확인 불가한 항목).

### 이번 세션 실행 요약
- Task 1: `supabase/verify/date_based_rollover_check.sql` 작성 — 리뷰 clean.
- Task 2: `supabase/migrations/0007_date_based_rollover.sql` 작성 — 리뷰 clean, Task 1 스크립트와 시나리오별 교차검증 통과.
- Task 3: 컨트롤러가 직접 실행(라이브 시크릿이 필요해 서브에이전트에 토큰을 넘기지 않기 위함) — 사용자 확인 후 `db push` 적용,
  라이브 검증 exit 0, `src/types/database.ts`에 `aggregated_at` 수동 반영, tsc/test 그린. 리뷰어가 tsc/test 독립 재실행으로 확인.
- 최종 전체 브랜치 리뷰(opus): Important 1건 발견 — 구 status 기반 `supabase/verify/rollover_check.sql`이
  삭제된 로직을 테스트하는 채로 남아있어 실행 시 무조건 실패하는 상태였음 → 삭제 커밋(`376cd57`)으로 수정 완료.
  Minor 3건(top-10 트림 축출 시나리오 미검증 등)은 병합 차단 아님, 후속 과제로 남김.

### 다음 세션에서 할 일 (여기서부터 이어서)
1. **앱을 실제 URL로 배포** (사용자 요청 "롤오버 완료 후 url 실제 배포"). 아직 배포 인프라(Vercel 등) 미설정 — 방식 논의 필요.
2. (선택/후속) 최종 리뷰의 Minor 항목: top-10 트림 축출 시나리오를 검증 스크립트에 추가할지 결정.
3. (선택/후속) admin의 stale한 status 표시 정리 — 이번 롤오버 작업 범위 밖으로 명시적으로 미룸.

### 왜 하는가 (확정된 문제 진단)
- 메인은 날짜기반 모델로 전환됨: `useActiveGame`(`src/hooks/useActiveGame.ts:31-37`)이 "현재 게임"을 `date <= 오늘(KST)` 중 최신으로 고름. `status` 미사용.
- 게임은 `status='scheduled'`로만 생성(`src/app/admin/actions.ts:56`)되고 앱은 status를 절대 안 바꿈.
- 그런데 롤오버 함수(`supabase/migrations/0002_rollover_function.sql:19`)는 여전히 `where status='active'` → 항상 not found → early return → **명예의전당(hall_of_fame) 집계가 영구 정지 상태**. 이걸 고치는 작업.

### 확정된 설계 결정 (다시 물어볼 필요 없음)
- **멱등성 마커**: `balance_games`에 `aggregated_at timestamptz` 컬럼 추가. 집계 시 마킹, 마킹된 게임은 스킵. (hall_of_fame 행 존재 여부 방식은 top-10 트림에 밀리면 재집계되는 약점이 있어 기각.)
- **백필**: 마이그레이션 시점에 `date < 오늘(KST)`인 기존 게임을 `aggregated_at=now()`로 설정 → 짜장면/짬뽕 등 과거 데이터 소급 재집계 방지.
- **알고리즘**: 현재 게임(`date<=오늘` 중 최신)보다 이전 날짜 + `aggregated_at IS NULL`인 게임을 date 오름차순 순회 집계(보통 0~1건, 크론 다운 시 밀린 것 따라잡음). 대표의견 유무와 무관하게 항상 마킹(무한 재시도 방지).
- **status 로직 전부 제거**(active/ended 전환·다음 게임 승격 삭제). status 컬럼 자체는 레거시로 방치. **admin의 stale한 status 표시 개선은 이번 범위 밖(별도 후속).**
- **cron 미변경**: `create or replace function`만. 크론 잡 `midnight-rollover`(`0 15 * * *`=KST자정)는 같은 함수명 계속 호출.
- KST 오늘 날짜 식: `(now() at time zone 'Asia/Seoul')::date` (프론트 `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'})`와 동일).

### 산출물 (이번 세션 커밋됨, origin 푸시 완료)
- 스펙: `docs/superpowers/specs/2026-07-14-date-based-rollover-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-14-date-based-rollover.md` (3개 태스크, 각 스텝에 완전한 SQL 포함)

### 다음 세션에서 할 일 (여기서부터 이어서)
1. **구현 계획 실행** — `docs/superpowers/plans/2026-07-14-date-based-rollover.md`의 Task 1→2→3.
   - Task 1: `supabase/verify/date_based_rollover_check.sql` 작성(격리 fixture, begin/rollback, 4시나리오: 정상·멱등·빈날·대표없음). 계획서에 전체 SQL 있음.
   - Task 2: `supabase/migrations/0007_date_based_rollover.sql` 작성(컬럼+백필+함수 재작성). 계획서에 전체 SQL 있음.
   - Task 3: `npx supabase db push` → `npx supabase db query --linked --file supabase/verify/date_based_rollover_check.sql`(exit 0=통과) → `src/types/database.ts`에 `aggregated_at` 수동 추가(gen types가 이 PC TLS로 실패 가능) → tsc/test 확인 → 커밋.
   - **실행 방식 미정(사용자 결정 대기)**: subagent-driven(프로젝트 관행) vs inline(제 추천 — 규모 작고 라이브 CLI에 묶여 있음). 다음 세션 시작 시 이 하나만 확인하면 됨.
2. **그 다음: 앱을 실제 URL로 배포** (사용자 요청 "1번 진행 후 url 실제 배포"). 아직 배포 인프라(Vercel 등) 미설정 — 방식 논의 필요.

### 그 외 남은 일 (사람 확인, 기존)
- 브라우저에서 새 디자인 육안 확인(폰트/색/선택 토글/ㅇㅈ), admin에서 질문+선택지별 상세가정으로 게임 생성 → 메인 노출 확인.
- 마이그레이션 0005(question)·0006(choice descriptions)는 이미 운영 DB(usqxzkggksqoceileqbt) 적용 완료. (0007은 아직 미적용 — 위 Task 3에서 적용)

---

## (이전) MVP 구현 상황 (2026-07-13)

**Task 1~19 전부 구현 완료 + 태스크별 리뷰 통과 + 최종 전체 브랜치 리뷰 통과.**
전부 `main`에 커밋되어 origin(MS-Won/Balance)에 푸시됨. 정적 검증 전부 그린:
`npm run lint` 0 에러 · `npx tsc --noEmit` 0 에러 · `npm run test` 12/12 통과.

이번 세션 커밋 범위: `cc88862`..`15269ec` (Task 13 검증 수정 → Task 19 + 최종 리뷰 수정).
최종 리뷰(opus)에서 나온 Important 1건(hall_of_fame FK cascade 누락 → `deleteGame` FK 위반)은
마이그레이션 `0004_hall_of_fame_cascade.sql`로 수정 완료.

### ✅ 라이브 검증 완료 (2026-07-14, 운영 프로젝트 usqxzkggksqoceileqbt)
DB 측 게이트 전부 통과. 실행 결과:
1. ✅ `supabase link` — access token으로 링크 성공 (비밀번호 없이 Management API 연결).
2. ✅ `supabase db push` — 0003·0004 원격 적용 완료 (0001·0002는 이미 적용돼 있었음).
   `migration list --linked`에서 0001~0004 전부 remote 확인.
3. ✅ `db query --linked --file supabase/verify/rollover_check.sql` — 예외 없이 exit 0 = PASS.
   (Management API는 `RAISE NOTICE`를 반환 안 하므로, 의도적 `raise exception` 테스트로 실패 시
   exit 1 + 에러 표면화됨을 검증 → exit 0 이 곧 모든 어서션 통과임을 확인. 전체 `begin;…rollback;`
   이라 라이브 데이터 미변경.)
4. ✅ `cron.job`에 `midnight-rollover` 존재, `active=true`, schedule `0 15 * * *` (= KST 자정).
   `hall_of_fame` 두 FK 모두 `confdeltype='c'`(cascade) 확인 → 라이브에서 `deleteGame` 안전.
   `supabase_realtime` publication에 `hall_of_fame` 포함(0003) 확인.
5. ✅ HTTP 스모크: `npm run dev`(Next 16) → `/` 200(헤더 렌더), `/admin` 미인증 307→`/admin/login`
   (미들웨어 fail-closed 동작), `/admin/login` 200. dev 로그 런타임 에러 없음.
   ⚠️ 남은 **수동 브라우저 E2E** (사람이 직접): 투표/채팅/인정/정렬/명예의전당 인터랙션,
   `/admin` 로그인(비번 `.env.local`의 `ADMIN_PASSWORD`)→문제 생성(scheduled)→삭제.
   서버 사이드/DB는 검증됐고, 남은 건 실제 클릭 인터랙션 확인뿐.

주의: Next 16이 `middleware` 파일 컨벤션을 deprecated(→`proxy`로 리네임 권장)로 경고. 지금 동작엔 문제
없으나(리다이렉트 정상) 추후 `src/middleware.ts`→`src/proxy.ts` 리네임 고려.

### 이월된 minor/plan-mandated 항목 (병합 차단 아님, 상세는 `.superpowers/sdd/progress.md`)
관리자 인증 하드닝(비상수시간 비교·정적 세션 쿠키·rate-limit 없음, spec §6 MVP 의도),
createGame 서버측 입력검증·에러 UX, 롤오버 단일-active 가드, HoF 중복삽입 unique 제약 등.

## 이 프로젝트의 특이한 인프라 결정

- **로컬 Docker Supabase 미사용.** 개발 환경에 Docker가 없어서, 로컬/운영 모두 **호스팅된 Supabase 프로젝트 하나**를 공유해서 씁니다. `supabase link` + `supabase db push` + `supabase gen types --linked` 조합만 사용 (`supabase start`/`db reset`는 이 프로젝트에서 안 씀).
- **Supabase 프로젝트:** ref `usqxzkggksqoceileqbt` (URL: `https://usqxzkggksqoceileqbt.supabase.co`). 이미 실제 활성 밸런스 게임 데이터(짜장면 vs 짬뽕)가 들어있는 상태이니, 마이그레이션/롤오버 테스트 시 라이브 데이터를 건드리지 않도록 주의 (Task 13 검증 스크립트처럼 격리된 fixture로 테스트할 것).
- **CLI 인증:** `supabase link`/`db push`/`gen types --linked`/`db query --linked`는 `SUPABASE_ACCESS_TOKEN` 환경변수(개인 액세스 토큰, https://supabase.com/dashboard/account/tokens 에서 발급)가 필요합니다. 이 토큰은 어디에도 커밋하지 않습니다 — 새 PC에서는 새로 발급하거나 안전하게 전달받아야 합니다.
- **`.env.local`은 git에 없습니다** (당연히 gitignore 대상). 새 PC에서 작업하려면 `.env.local.example`을 복사해서 Supabase 대시보드(Project Settings → API)에서 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`를 다시 채워야 합니다.
- **네트워크 특이사항 (이 PC에서만 해당):** 현재 개발 PC의 네트워크가 일부 HTTPS 트래픽을 자체 루트 인증서로 가로챕니다 (Node/Go 바이너리가 신뢰 안 함). 이 문제가 있는 PC라면 `README.md`의 "Local development" 섹션에 있는 `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` 안내를 참고하세요. 다른 PC(다른 네트워크)에서는 이 문제가 없을 수 있습니다.
  이 PC에서 가로채는 루트 인증서는 Windows 신뢰 루트 저장소에 `CN=ADD, O=ADD, C=KR`로 이미 설치되어 있습니다.
  PowerShell로 바로 PEM으로 추출 가능: `Get-ChildItem Cert:\LocalMachine\Root | Where-Object {$_.Subject -like '*ADD*'}`로 지문(thumbprint) 확인 후,
  `Export()`한 바이트를 base64로 감싸 PEM 헤더/푸터를 붙이면 됨. 그 PEM 경로를 `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE`에 지정하면
  `supabase link`/`db push`/`db query --linked`가 정상 동작함 (2026-07-14 세션에서 이 방법으로 해결).

## 작업 재개 방법

1. 저장소를 clone/pull 받는다.
2. `npm install`
3. `.env.local` 구성 (위 참고)
4. `SUPABASE_ACCESS_TOKEN` 환경변수 설정 (CLI 작업용, 커밋 안 함)
5. `docs/superpowers/plans/2026-07-13-balance-game-mvp-implementation.md`를 열어 Task 13부터 이어서 진행. `superpowers:subagent-driven-development` 스킬을 다시 invoke해서 같은 방식(태스크별 구현→리뷰)으로 계속하면 됩니다.
6. 모든 태스크가 끝나면 `superpowers:finishing-a-development-branch` 스킬로 브랜치를 정리/머지합니다.

## 이 브랜치에 대해

작업은 `worktree-balance-game-mvp` 브랜치에서 진행 중입니다 (master는 설계/계획 문서만 있고 실제 구현은 이 브랜치에 있음). GitHub에 푸시되어 있다면 이 브랜치를 그대로 체크아웃해서 이어가면 됩니다.
