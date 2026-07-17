# 밸런스게임 결과카드 SNS 자동 배포 — 설계 (2026-07-17)

## 배경 및 목표

`docs/superpowers/specs/2026-07-15-growth-marketing-design.md`에서 Track A(커뮤니티 집중 발사)는 "코드 아님, 운영 루틴"으로 명시적으로 범위 밖에 두었다. 이번 스펙은 그 결정을 뒤집지 않는다 — 대신 **공식 API가 실제로 열려 있는 채널(인스타그램, Threads)만 자동화**하고, API가 없거나 자동 게시가 이용약관 위반 리스크가 큰 채널(에펨코리아 등 커뮤니티, X)은 계속 수동/범위 밖으로 둔다.

- **목표**: 매일 두 종류의 SNS 게시물을 사람 개입 없이 자동 발행해서, 커뮤니티 발사(Track A)와 병행되는 상시 유입 채널을 만든다.
- **성공 기준**: 크론이 실패 없이 매일 게시하고, 실패 시에도 admin 게임 등록이나 롤오버 자체는 절대 막히지 않는다(소셜 게시는 항상 best-effort).
- **전제**: 이 시점엔 인스타그램/Threads 계정이 아예 없다. 계정 생성·비즈니스 전환·API 앱 심사는 이번 스펙의 "코드 아닌 준비 작업" 섹션에 별도로 정리하고, 구현 계획에는 포함하지 않는다(사람이 먼저 해야 진행 가능한 선행 조건).

## 조사된 사실 (설계의 근거)

Meta 공식 문서를 확인한 결과:

- **인스타그램 Content Publishing API**는 FEED/STORIES/REELS/CAROUSEL 미디어 업로드와 캡션만 지원한다. 투표·퀴즈·슬라이더 같은 인터랙티브 스티커를 붙이는 파라미터는 존재하지 않는다 — 이건 인스타그램 앱에서 사람이 직접 만들 때만 가능한 기능이다. 따라서 "인스타그램에 자동으로 투표 스티커를 올린다"는 요구는 공식 API로 원천 불가능하다.
- **Threads API**는 `POST /threads`에 `poll_attachment` 객체(`option_a`~`option_d`, 2~4개, 각 1~25자)를 넣으면 실제 네이티브 투표 게시물을 만들 수 있다. 단, 텍스트 전용(`media_type=TEXT`) 게시물에만 첨부 가능하다. `link_attachment`(외부 링크, 텍스트 전용 게시물 한정, 최대 5개)도 지원한다.

이 비대칭 때문에 두 플랫폼의 자동화 내용이 서로 다르다: 인스타그램은 결과 이미지 카드만, Threads는 결과 이미지 카드 + (텍스트 전용) 오늘의 질문 투표 두 가지를 모두 받는다.

## 기능 1 — 자정 결과카드 자동 배포 (인스타그램 + Threads)

**트리거**: Vercel Cron이 KST 00:05(=UTC 15:05, 전날 기준)에 `/api/cron/daily-result-post`를 호출한다. pg_cron 자정 롤오버(`0 15 * * *`, KST 자정)가 `aggregated_at`을 마킹하고 난 뒤 여유를 두고 실행되도록 5분 뒤로 잡는다.

**로직**:
1. `balance_games`에서 `aggregated_at IS NOT NULL`이고 `ig_posted_at IS NULL`(또는 `threads_result_posted_at IS NULL`)인 가장 최근 게임을 조회한다.
2. 결과 이미지를 만드는 새 라우트 `/api/result-card-image?date=<date>`를 통해 카드 이미지를 공개 URL로 노출한다(아래 "결과카드 디자인" 참고).
3. 인스타그램 Graph API: 미디어 컨테이너 생성(`image_url` + 캡션) → 발행, 2단계 호출.
4. Threads API: `media_type=IMAGE`로 컨테이너 생성(`image_url` + `text`) → 발행, 2단계 호출.
5. 각 플랫폼 호출은 독립된 `try/catch`로 감싼다 — 한쪽이 실패해도 다른 쪽 게시는 계속 진행한다. 성공한 플랫폼만 해당 `_posted_at` 컬럼을 마킹한다.

**캡션 템플릿**:
```
어제 밸런스 결과! {question}
{aLabel} {aPct}% vs {bLabel} {bPct}%
{headline}

오늘의 새 대결은 프로필 링크에서 👉
#오늘의밸런스게임 #밸런스게임 #투표
```

`headline`은 득표율 격차 기반 자동 선택 문구다 (순수 함수 `getMarginHeadline(aPct, bPct)`로 구현해서 카드 이미지와 캡션이 같은 로직을 공유한다):
- 격차 60%p 이상: "압도적 승리!"
- 격차 20~59%p: "확실한 승부!"
- 격차 20%p 미만: "팽팽한 접전!"

## 기능 2 — Threads 오늘의 질문 투표 자동 게시

**트리거**: Vercel Cron이 KST 09:00과 09:15에 `/api/cron/daily-poll-post`를 호출한다(같은 라우트를 두 번 스케줄 — 멱등 마커 덕분에 09:00에 이미 성공했으면 09:15 호출은 즉시 스킵되므로, 09:00 시점에 관리자가 아직 게임을 등록하지 않았을 때를 위한 안전 재시도로만 동작한다).

**로직**:
1. `useActiveGame`과 동일한 기준(`date <= 오늘(KST)` 중 최신)으로 오늘의 게임을 조회한다. `threads_poll_posted_at IS NULL`인 경우만 진행.
2. 게임이 없으면(관리자가 아직 등록 전) 조용히 종료한다 — 에러 아님, 09:15 재시도에서 다시 시도.
3. `choice_a_label`/`choice_b_label`이 둘 다 25자 이하면 `poll_attachment: {option_a, option_b}` + `link_attachment: <앱 URL>`로 텍스트 전용 게시물을 만든다.
4. 25자를 넘는 라벨이 하나라도 있으면 `poll_attachment` 없이 질문 텍스트 + 링크만 담은 일반 텍스트 게시물로 폴백한다(API가 poll 유효성 검사에서 요청 전체를 거부하는 것을 방지).
5. 성공 시 `threads_poll_posted_at`을 마킹한다.

**게시 텍스트 템플릿**:
```
오늘의 밸런스: {question}
투표하고 실시간 결과 확인 👇
```

**운영 전제(코드 아님)**: 관리자가 오전 9시 전까지 admin에서 오늘 게임을 등록해두는 루틴이 필요하다. 기존에도 "매일 admin에서 게임을 수동 등록"하는 루틴이 있으므로 그 시간대를 오전으로 당기는 것뿐이며, 새로운 운영 부담을 추가하는 게 아니다.

## 결과카드 디자인

브레인스토밍 세션에서 시각적으로 확정한 "매거진 포스터형"을 그대로 구현한다:
- 1080×1080 정사각형. 대각선 배경 분할(왼쪽 코랄 그라디언트 `#ff8a73→#ff6b54`, 오른쪽 민트 그라디언트 `#3fd6b8→#18be9f`, 득표율과 무관한 고정 50:50 장식) + 미세한 대각선 텍스처 패턴.
- 상단 리본: 브랜드명("오늘의 밸런스 게임") + `headline` 문구.
- 중앙: 질문 텍스트(Jua 폰트), 중앙 원형 "VS" 뱃지(흰 테두리 링).
- 좌하단/우하단: 각 선택지 라벨 + 큰 퍼센트 숫자(Black Han Sans 폰트), 승자 쪽에 🥇 표시. **퍼센트 텍스트는 항상 카드 모서리의 고정 위치**에 배치하고 배경 분할선(50:50 고정)과 무관하므로, 9:1처럼 극단적으로 쏠린 득표율에서도 텍스트가 겹치거나 잘리지 않는다.
- 하단 배너: CTA 문구("👉 오늘의 대결은 프로필 링크에서") + 브랜드/URL 한 줄.
- 폰트: 기존 `opengraph-image.tsx`는 Pretendard만 서버에 번들되어 있다. Jua·Black Han Sans는 현재 `layout.tsx`에서 Google Fonts CDN `<link>`로만 로드되는데, 이는 브라우저 렌더링 전용이라 서버 사이드 `next/og` `ImageResponse`에는 쓸 수 없다. 두 폰트의 정적 TTF/OTF 파일(OFL 라이선스, Google Fonts에서 다운로드 가능)을 `src/app/fonts/`에 새로 추가해서 `ImageResponse`의 `fonts` 옵션에 전달해야 한다 — 이번 구현 계획에 태스크로 포함한다.

## 데이터 모델 변경

`balance_games`에 컬럼 3개 추가 (기존 `aggregated_at` 멱등 마커와 동일한 패턴):
- `ig_posted_at timestamptz null`
- `threads_result_posted_at timestamptz null`
- `threads_poll_posted_at timestamptz null`

세 컬럼을 분리하는 이유: 기능 1(인스타/Threads 결과카드)과 기능 2(Threads 투표)가 서로 다른 트리거·다른 실패 모드를 가지므로, 플랫폼/기능 단위로 독립적으로 재시도·추적할 수 있어야 한다.

## 인증 및 보안

- 새 Cron API 라우트(`/api/cron/daily-result-post`, `/api/cron/daily-poll-post`)는 Vercel Cron이 요청에 실어 보내는 시크릿(예: `Authorization: Bearer $CRON_SECRET` 헤더, Vercel Cron 설정에서 지정)을 검증해서, 외부에서 URL을 알아도 함부로 호출해 중복 게시를 유발하지 못하게 막는다.
- 신규 환경변수(Vercel + `.env.local.example`): `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID`, `CRON_SECRET`. 전부 커밋 금지, 기존 `SUPABASE_SERVICE_ROLE_KEY`와 동일한 취급.

## 코드 아닌 준비 작업 (구현 계획 범위 밖, 사람이 먼저 해야 함)

1. 인스타그램 계정을 비즈니스/크리에이터 계정으로 전환하고 페이스북 페이지에 연결.
2. Meta 개발자 앱 생성 → 인스타그램 Graph API + Threads API 권한 신청/심사.
3. 장기(long-lived) 액세스 토큰 발급. **주의**: 약 60일 후 만료되며 이번 스펙엔 자동 갱신이 포함되지 않는다 — 만료 전 사람이 수동 재발급해야 한다(후속 과제로 자동 갱신 크론을 고려할 수 있으나 이번 범위 밖).
4. 위 환경변수를 Vercel 프로젝트 설정에 입력.

## 에러 처리 및 관측

- 모든 소셜 게시 실패는 **best-effort**로 처리한다 — admin의 게임 등록, pg_cron 롤오버 등 핵심 기능은 소셜 게시 성공 여부와 무관하게 항상 정상 동작해야 한다.
- 실패는 Vercel 함수 로그에 플랫폼·게임 날짜·에러 메시지를 남기는 것으로 충분하다(이 프로젝트 규모에서 별도 알림/모니터링 인프라는 과함). 사람이 주기적으로 로그를 확인하는 것은 운영 루틴으로 남긴다.

## 테스트 전략

- `getMarginHeadline` 순수 함수: 경계값(60%p, 20%p) 포함 유닛 테스트.
- Threads poll 라벨 25자 초과 시 폴백 로직: 유닛 테스트.
- 크론 라우트의 멱등성(이미 `_posted_at`이 찍힌 게임은 재호출해도 API를 다시 호출하지 않음): 유닛 테스트(Supabase/외부 API 모킹).
- 인스타그램/Threads 실제 API 호출은 라이브 스모크 테스트 불가(각자 계정·심사가 끝난 뒤에만 가능) — 사람이 준비 작업을 마친 뒤 브라우저/API 클라이언트로 직접 확인해야 하는 항목으로 남긴다.

## 범위 밖

- X(트위터) 자동화 — 쓰기 권한이 유료(Basic 티어 기준 월 $200 수준)라 기존 마케팅 예산(수만 원)과 맞지 않아 제외.
- 에펨코리아 등 커뮤니티 자동/반자동 게시 — 공식 포스팅 API가 없고 자동 게시는 이용약관 위반/계정 밴 리스크가 크다. `2026-07-15-growth-marketing-design.md`의 Track A(수동 운영 루틴) 결정을 유지한다.
- 액세스 토큰 자동 갱신.
- 인스타그램 스토리/인터랙티브 스티커 — API 미지원.
- 오늘의 질문을 인스타그램에도 올리는 것 — 인스타그램은 투표 인터랙션을 못 주므로 이번 스펙에서는 결과카드(사후 확정 결과)만 다루고, "오늘의 질문 예고" 이미지 게시는 후속 과제로 남긴다.
