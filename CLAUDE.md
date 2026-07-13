# 오늘의 밸런스 게임 — 작업 재개 가이드

다른 PC에서 이어서 작업할 때 참고할 문서입니다.

## 프로젝트 개요

- 설계 문서: `docs/superpowers/specs/2026-07-13-balance-game-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-13-balance-game-mvp-implementation.md` (19개 태스크)
- 진행 방식: `superpowers:subagent-driven-development` 스킬로, 태스크마다 구현 서브에이전트 → 리뷰 서브에이전트를 붙여서 진행 중.
- 진행 원장: `.superpowers/sdd/progress.md` (완료된 태스크와 커밋 범위 기록. `.gitignore`에 의해 이 파일 자체는 git에는 안 올라가므로, 최신 상태는 아래 "현재 진행 상황" 섹션과 `git log`를 기준으로 판단할 것)

## 현재 진행 상황 (2026-07-13 기준)

Task 1~12 완료 (스캐폴딩, Supabase 연동, DB 스키마, 익명 사용자 식별, 카운트다운, 투표, 채팅, 인정, 대표의견까지).

Task 13(자정 롤오버 함수)은 구현 완료(커밋 `0fa8bcc`)되었으나, 모델 일시 장애로 리뷰가 중단된 상태. **다음 작업은 Task 13 리뷰 재개**:
1. `scripts/review-package`로 `18fc7da..0fa8bcc` 범위 diff 생성
2. 리뷰 서브에이전트 디스패치 (Task 13은 활성 게임이 실제로 하나 존재하는 상태에서 SELECT 순서 모호성 버그를 발견/수정한 이력이 있으니, 그 수정이 안전한지 재확인 필요)
3. 통과하면 원장에 기록 후 Task 14로 진행

남은 태스크: 14(명예의 전당 표시), 15(어제의 결과), 16(관리자 인증), 17(관리자 CRUD), 18(광고 자리 + 최종 레이아웃), 19(배포 문서).

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
