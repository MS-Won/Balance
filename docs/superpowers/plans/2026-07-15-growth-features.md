# Growth Features (Kakao Channel Button + Personalized Share Card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two code-facing pieces of the growth/marketing spec — a Kakao Channel "채널 추가" button (retention hook) and a personalized Kakao share card that shows the sharer's own vote and its percentage (viral hook).

**Architecture:** Two independent client-visible additions on top of existing hooks. The channel button is a standalone presentational component reading a public env var. The personalized share card is built from data `HomeClient` already computes (`useVotes`'s `tally`/`myChoice`), passed into `ShareBar`, which builds a personalized Kakao feed description and points `imageUrl` at a new lightweight image-rendering route (`/api/share-image`) instead of the existing generic `/opengraph-image`. Both new "which text/query to build" decisions are pure functions, unit-tested the same way `voteTally.ts` already is in this codebase — the image-rendering route itself is smoke-tested manually (same as the existing `opengraph-image.tsx`, which also has no automated test).

**Tech Stack:** Next.js App Router (route handlers, `next/og` `ImageResponse`), React (client components), Vitest.

## Global Constraints

- Follow existing code style: no default `React` import in component files (JSX runtime), double-quoted strings, `@/` path alias for `src/`.
- No new test dependencies — this project has no `@testing-library/react`; test pure functions with Vitest, not rendered components (see `src/lib/__tests__/voteTally.test.ts` for the existing pattern).
- Don't touch `src/app/opengraph-image.tsx` — it stays as the generic, non-personalized fallback card.
- Don't add error-handling/fallback branches beyond what's specified in each task.

---

### Task 1: Kakao Channel "채널 추가" button

**Files:**
- Create: `src/lib/kakaoChannel.ts`
- Test: `src/lib/__tests__/kakaoChannel.test.ts`
- Create: `src/components/KakaoChannelButton.tsx`
- Modify: `src/components/HomeClient.tsx:85` (render the button next to `ShareBar`)
- Modify: `src/app/globals.css:456-463` (add a `.share.channel` style, matching the existing `.share.kakao`/`.share.copy` pattern)
- Modify: `.env.local.example` (document the new env var)

**Interfaces:**
- Produces: `buildKakaoChannelUrl(channelId: string): string` — used only inside `KakaoChannelButton`.
- Produces: `<KakaoChannelButton />` — a self-contained component with no props, rendered in `HomeClient`.

- [ ] **Step 1: Write the failing test for the URL builder**

Create `src/lib/__tests__/kakaoChannel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildKakaoChannelUrl } from "@/lib/kakaoChannel";

describe("buildKakaoChannelUrl", () => {
  it("builds a pf.kakao.com friend-add URL from a channel id", () => {
    expect(buildKakaoChannelUrl("_abcDE")).toBe("https://pf.kakao.com/_abcDE/friend");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- kakaoChannel`
Expected: FAIL with "Cannot find module '@/lib/kakaoChannel'" (or similar module-not-found error).

- [ ] **Step 3: Implement the URL builder**

Create `src/lib/kakaoChannel.ts`:

```ts
export function buildKakaoChannelUrl(channelId: string): string {
  return `https://pf.kakao.com/${channelId}/friend`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- kakaoChannel`
Expected: PASS (1 test).

- [ ] **Step 5: Create the button component**

Create `src/components/KakaoChannelButton.tsx`:

```tsx
import { buildKakaoChannelUrl } from "@/lib/kakaoChannel";

export function KakaoChannelButton() {
  const channelId = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_ID;
  if (!channelId) return null;

  return (
    <a
      className="share channel"
      href={buildKakaoChannelUrl(channelId)}
      target="_blank"
      rel="noopener noreferrer"
    >
      채널 추가하고 매일 알림받기
    </a>
  );
}
```

- [ ] **Step 6: Add the CSS rule**

In `src/app/globals.css`, right after the existing `.share.copy` rule (around line 463):

```css
.share.copy {
  background: var(--line);
  color: var(--ink);
}
.share.channel {
  background: #1a1a1a;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  text-align: center;
}
```

- [ ] **Step 7: Render the button in HomeClient**

In `src/components/HomeClient.tsx`, add the import near the other component imports (after the `ShareBar` import on line 15):

```ts
import { KakaoChannelButton } from "@/components/KakaoChannelButton";
```

Then change line 85 from:

```tsx
          <ShareBar question={game.question} />
```

to:

```tsx
          <ShareBar question={game.question} />
          <KakaoChannelButton />
```

- [ ] **Step 8: Document the env var**

In `.env.local.example`, add a new line at the end:

```
NEXT_PUBLIC_KAKAO_CHANNEL_ID=
```

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: all tests pass, 0 type errors.

- [ ] **Step 10: Manual smoke check**

Run `npm run dev`, open `http://localhost:3000`. With `NEXT_PUBLIC_KAKAO_CHANNEL_ID` unset in `.env.local`, confirm the button does NOT render. Then set it to any placeholder value (e.g. `_test`), restart `npm run dev`, and confirm a black "채널 추가하고 매일 알림받기" button appears below the share buttons and links to `https://pf.kakao.com/_test/friend` in a new tab.

- [ ] **Step 11: Commit**

```bash
git add src/lib/kakaoChannel.ts src/lib/__tests__/kakaoChannel.test.ts src/components/KakaoChannelButton.tsx src/components/HomeClient.tsx src/app/globals.css .env.local.example
git commit -m "feat: add Kakao Channel add-friend button for retention"
```

---

### Task 2: Personalized share text (`buildShareContent`)

**Files:**
- Create: `src/lib/shareContent.ts`
- Test: `src/lib/__tests__/shareContent.test.ts`

**Interfaces:**
- Consumes: `VoteTally` type from `src/lib/voteTally.ts` (`{ aCount, bCount, aPct, bPct, total }`).
- Produces: `buildShareContent(myChoice: "A" | "B" | null, tally: VoteTally, aLabel: string, bLabel: string): { description: string; imageQuery: string } | null` — used by Task 5's `ShareBar` changes.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/shareContent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildShareContent } from "@/lib/shareContent";
import type { VoteTally } from "@/lib/voteTally";

const tally: VoteTally = { aCount: 62, bCount: 38, aPct: 62, bPct: 38, total: 100 };

describe("buildShareContent", () => {
  it("returns null when the sharer hasn't voted", () => {
    expect(buildShareContent(null, tally, "초코", "바닐라")).toBeNull();
  });

  it("returns null when there are no votes yet", () => {
    const empty: VoteTally = { aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 };
    expect(buildShareContent("A", empty, "초코", "바닐라")).toBeNull();
  });

  it("builds personalized content for an A voter", () => {
    expect(buildShareContent("A", tally, "초코", "바닐라")).toEqual({
      description: "나는 초코파! 오늘 62%가 나와 같은 선택을 했어요",
      imageQuery: "c=A&pct=62",
    });
  });

  it("builds personalized content for a B voter", () => {
    expect(buildShareContent("B", tally, "초코", "바닐라")).toEqual({
      description: "나는 바닐라파! 오늘 38%가 나와 같은 선택을 했어요",
      imageQuery: "c=B&pct=38",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- shareContent`
Expected: FAIL with "Cannot find module '@/lib/shareContent'".

- [ ] **Step 3: Implement `buildShareContent`**

Create `src/lib/shareContent.ts`:

```ts
import type { VoteTally } from "@/lib/voteTally";

export interface ShareContent {
  description: string;
  imageQuery: string;
}

export function buildShareContent(
  myChoice: "A" | "B" | null,
  tally: VoteTally,
  aLabel: string,
  bLabel: string
): ShareContent | null {
  if (!myChoice || tally.total === 0) return null;

  const label = myChoice === "A" ? aLabel : bLabel;
  const pct = myChoice === "A" ? tally.aPct : tally.bPct;

  return {
    description: `나는 ${label}파! 오늘 ${pct}%가 나와 같은 선택을 했어요`,
    imageQuery: `c=${myChoice}&pct=${pct}`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- shareContent`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareContent.ts src/lib/__tests__/shareContent.test.ts
git commit -m "feat: add buildShareContent for personalized share text"
```

---

### Task 3: Share-image query parsing (`parseShareImageParams`)

**Files:**
- Create: `src/lib/shareImageParams.ts`
- Test: `src/lib/__tests__/shareImageParams.test.ts`

**Interfaces:**
- Produces: `parseShareImageParams(searchParams: URLSearchParams): { choice: "A" | "B"; pct: number } | null` — used by Task 4's `/api/share-image` route.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/shareImageParams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseShareImageParams } from "@/lib/shareImageParams";

describe("parseShareImageParams", () => {
  it("parses a valid choice and percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=62"))).toEqual({
      choice: "A",
      pct: 62,
    });
  });

  it("rejects a missing choice", () => {
    expect(parseShareImageParams(new URLSearchParams("pct=62"))).toBeNull();
  });

  it("rejects an invalid choice", () => {
    expect(parseShareImageParams(new URLSearchParams("c=C&pct=62"))).toBeNull();
  });

  it("rejects a non-integer percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=62.5"))).toBeNull();
  });

  it("rejects a percentage out of range", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=101"))).toBeNull();
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=-1"))).toBeNull();
  });

  it("rejects a missing percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- shareImageParams`
Expected: FAIL with "Cannot find module '@/lib/shareImageParams'".

- [ ] **Step 3: Implement `parseShareImageParams`**

Create `src/lib/shareImageParams.ts`:

```ts
export interface ShareImageParams {
  choice: "A" | "B";
  pct: number;
}

export function parseShareImageParams(searchParams: URLSearchParams): ShareImageParams | null {
  const choice = searchParams.get("c");
  if (choice !== "A" && choice !== "B") return null;

  const pctRaw = searchParams.get("pct");
  if (pctRaw === null) return null;
  const pct = Number(pctRaw);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return null;

  return { choice, pct };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- shareImageParams`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareImageParams.ts src/lib/__tests__/shareImageParams.test.ts
git commit -m "feat: add parseShareImageParams for the personalized share-image route"
```

---

### Task 4: Personalized share-image route

**Files:**
- Create: `src/app/api/share-image/route.tsx`

**Interfaces:**
- Consumes: `getActiveGameServer()` from `src/lib/getActiveGameServer.ts` (existing, returns `BalanceGame | null` with `choice_a_label`/`choice_b_label`).
- Consumes: `parseShareImageParams` from Task 3.
- Produces: a `GET` route at `/api/share-image?c=A|B&pct=<0-100>` returning a 1200x630 PNG, consumed by Task 5's `ShareBar`.

- [ ] **Step 1: Implement the route**

Create `src/app/api/share-image/route.tsx`:

```tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getActiveGameServer } from "@/lib/getActiveGameServer";
import { parseShareImageParams } from "@/lib/shareImageParams";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseShareImageParams(searchParams);

  const [game, fontData] = await Promise.all([
    getActiveGameServer(),
    readFile(path.join(process.cwd(), "src/app/fonts/Pretendard-ExtraBold.ttf")),
  ]);

  const aLabel = game?.choice_a_label ?? "A";
  const bLabel = game?.choice_b_label ?? "B";
  const banner = parsed
    ? `나는 ${parsed.choice === "A" ? aLabel : bLabel}파! 오늘 ${parsed.pct}%가 같은 선택`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Pretendard",
        }}
      >
        {banner && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 40,
              padding: "24px 0",
            }}
          >
            {banner}
          </div>
        )}
        <div style={{ flex: 1, display: "flex" }}>
          <div
            style={{
              flex: 1,
              background: "#ff6b54",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 64,
              textAlign: "center",
              padding: "0 30px",
            }}
          >
            {aLabel}
          </div>
          <div
            style={{
              flex: 1,
              background: "#18be9f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 64,
              textAlign: "center",
              padding: "0 30px",
            }}
          >
            {bLabel}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 800 }],
    }
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 type errors.

- [ ] **Step 3: Manual smoke check**

Run `npm run dev`, then in a browser (or `curl -o /tmp/a.png` if you prefer) open:
- `http://localhost:3000/api/share-image?c=A&pct=62` — expect a PNG with a black banner "나는 <A라벨>파! 오늘 62%가 같은 선택" above the usual two-tone A/B split.
- `http://localhost:3000/api/share-image` (no params) — expect the same two-tone split with NO banner (falls back cleanly on invalid/missing params).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/share-image/route.tsx
git commit -m "feat: add personalized share-image route"
```

---

### Task 5: Wire personalization into ShareBar

**Files:**
- Modify: `src/components/ShareBar.tsx`
- Modify: `src/components/HomeClient.tsx:85`

**Interfaces:**
- Consumes: `buildShareContent` (Task 2), `/api/share-image` route (Task 4), `VoteTally` type (existing), `tally`/`myChoice` already computed by `useVotes` in `HomeClient`.

- [ ] **Step 1: Update ShareBar's props and Kakao share call**

In `src/components/ShareBar.tsx`, replace the whole file with:

```tsx
"use client";

import Script from "next/script";
import { useState } from "react";
import { getTodayKST } from "@/lib/kstDate";
import { buildShareContent } from "@/lib/shareContent";
import type { VoteTally } from "@/lib/voteTally";

// KakaoTalk (and most messengers) cache a URL's link preview the first time
// it's scraped. Appending today's date makes each day's share a "new" URL,
// so the preview is re-scraped (and shows that day's game) instead of
// serving a stale cached image/description from a previous day.
function shareUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("d", getTodayKST());
  return url.toString();
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (settings: {
          objectType: "feed";
          content: {
            title: string;
            description: string;
            imageUrl: string;
            link: { webUrl: string; mobileWebUrl: string };
          };
        }) => void;
      };
    };
  }
}

export function ShareBar({
  question,
  aLabel,
  bLabel,
  myChoice,
  tally,
}: {
  question: string | null;
  aLabel: string;
  bLabel: string;
  myChoice: "A" | "B" | null;
  tally: VoteTally;
}) {
  const [copied, setCopied] = useState(false);
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  function shareKakao() {
    if (!window.Kakao?.isInitialized()) {
      alert("카카오톡 공유 준비 중이에요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const url = shareUrl();
    const personalized = buildShareContent(myChoice, tally, aLabel, bLabel);
    const imageUrl = personalized
      ? new URL(`/api/share-image?${personalized.imageQuery}`, url).toString()
      : new URL("/opengraph-image", url).toString();

    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "오늘의 밸런스",
        description: personalized?.description ?? question ?? "오늘의 밸런스 게임에 참여해보세요",
        imageUrl,
        link: { webUrl: url, mobileWebUrl: url },
      },
    });
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="sharebar">
      {kakaoKey && (
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js"
          onLoad={() => {
            if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(kakaoKey);
          }}
        />
      )}
      <button type="button" className="share kakao" onClick={shareKakao}>
        카카오톡 공유
      </button>
      <button type="button" className="share copy" onClick={copyUrl}>
        {copied ? "복사됨!" : "URL 복사"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Pass the new props from HomeClient**

In `src/components/HomeClient.tsx`, change line 85 from:

```tsx
          <ShareBar question={game.question} />
```

to:

```tsx
          <ShareBar
            question={game.question}
            aLabel={game.choice_a_label}
            bLabel={game.choice_b_label}
            myChoice={myChoice}
            tally={tally}
          />
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: all tests pass, 0 type errors.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev`. Before voting, click "카카오톡 공유" and confirm (via the Kakao share preview, or by temporarily logging `personalized`/`imageUrl` in `shareKakao`) that it falls back to the generic description and `/opengraph-image`. Then cast a vote, click "카카오톡 공유" again, and confirm the description now reads "나는 &lt;라벨&gt;파! 오늘 &lt;pct&gt;%가 나와 같은 선택을 했어요" and the image URL points at `/api/share-image?c=...&pct=...`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShareBar.tsx src/components/HomeClient.tsx
git commit -m "feat: personalize Kakao share card with the sharer's own vote"
```
