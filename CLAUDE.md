# 오늘의 밸런스 게임 — 작업 재개 가이드

다른 PC에서 이어서 작업할 때 참고할 문서입니다.

## 프로젝트 개요

- 설계 문서: `docs/superpowers/specs/2026-07-13-balance-game-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-13-balance-game-mvp-implementation.md` (19개 태스크)
- 진행 방식: `superpowers:subagent-driven-development` 스킬로, 태스크마다 구현 서브에이전트 → 리뷰 서브에이전트를 붙여서 진행 중.
- 진행 원장: `.superpowers/sdd/progress.md` (완료된 태스크와 커밋 범위 기록. `.gitignore`에 의해 이 파일 자체는 git에는 안 올라가므로, 최신 상태는 아래 "현재 진행 상황" 섹션과 `git log`를 기준으로 판단할 것)

## 현재 진행 상황 (2026-07-14 갱신 — 디자인 리디자인 v1 완료)

**메인 `/` 전면 리디자인 v1 구현 완료 + origin 푸시.** 디자인 스펙: `design.md`, 목업: `docs/design-mockup.html`.
- 컨셉: 데드팬/부조리 + 라이트&에어리(HydroTrack 무드). 코랄(A)/민트(B).
- 폰트: **Black Han Sans**(선택지·숫자·ㅇㅈ) + **Jua**(질문·라벨) — `src/app/layout.tsx`에서 구글폰트 `<link>`로 로드
  (이 PC는 Node TLS 가로채기 때문에 빌드 시 `next/font`가 실패할 수 있어 `<link>` 채택. lint 경고 1건 `no-page-custom-font`는 무해).
- 신규 `BalanceCard`(질문 + 좌/우 선택지=투표버튼 + 풀블리드 투표바), ㅇㅈ 워드아트로 👍 전면 교체.
- 선택지별 상세가정: `choice_a_description`/`choice_b_description` 컬럼(**마이그레이션 0006, 운영 적용 완료**) + admin 폼/`createGame`/메인 표시.
  질문/선택지 줄바꿈은 CSS `text-wrap:balance`로 자동 처리(admin에서 한 줄 입력).
- 제거: `YesterdayResult`(어제의 결과), `AdPlaceholder`(광고), `VoteGraph`.
- 정적 게이트 그린: tsc 0 · test 12/12 · lint 0 error(경고 1). dev 스모크 `/`·`/admin/login` 200, 런타임 에러 없음.
- **마이그레이션 0005(question)·0006(choice descriptions) 모두 운영 DB(usqxzkggksqoceileqbt)에 적용 완료.**

### 남은 일 (사람 확인)
- 브라우저에서 새 디자인 육안 확인(폰트/색/선택 토글/ㅇㅈ), admin에서 질문+선택지별 상세가정으로 게임 생성 → 메인 노출 확인.
- **후속(별도)**: 날짜기반 모델에 맞춘 롤오버 함수 재설계(현재 `status='active'` 의존 → 명예의전당 집계 정지). 라이브 테스트 필요.

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

## 작업 재개 방법

1. 저장소를 clone/pull 받는다.
2. `npm install`
3. `.env.local` 구성 (위 참고)
4. `SUPABASE_ACCESS_TOKEN` 환경변수 설정 (CLI 작업용, 커밋 안 함)
5. `docs/superpowers/plans/2026-07-13-balance-game-mvp-implementation.md`를 열어 Task 13부터 이어서 진행. `superpowers:subagent-driven-development` 스킬을 다시 invoke해서 같은 방식(태스크별 구현→리뷰)으로 계속하면 됩니다.
6. 모든 태스크가 끝나면 `superpowers:finishing-a-development-branch` 스킬로 브랜치를 정리/머지합니다.

## 이 브랜치에 대해

작업은 `worktree-balance-game-mvp` 브랜치에서 진행 중입니다 (master는 설계/계획 문서만 있고 실제 구현은 이 브랜치에 있음). GitHub에 푸시되어 있다면 이 브랜치를 그대로 체크아웃해서 이어가면 됩니다.
