---
description: Save current session progress to CLAUDE.md so work survives /clear and can resume on another machine
---

Persist the current session's progress so it survives `/clear` and can be picked up on a different machine after `git pull`. This project already uses a running "작업 재개 가이드" log at the root of this repo (`CLAUDE.md`) — follow that existing convention, don't invent a new file or format.

1. Find `CLAUDE.md` at the root of the current git repository. If it doesn't exist yet, create one with a short project overview section followed by the dated log format used below.
2. Prepend a new section titled `## 현재 진행 상황 (<오늘 날짜> 갱신 — <한 줄 요약>)` right after the intro/overview heading (top of the dated log, before older entries). Never delete or rewrite older dated sections — this file is an append-only running log, older entries are historical record.
3. In the new section, write in the same dense, factual Korean style as existing entries:
   - **배경** (why this work is happening, if not already obvious from prior entries)
   - What was accomplished this session — concrete, with file paths and commit hashes where relevant
   - Anything currently blocked or unresolved, and *why* (not just "didn't work" — the actual diagnostic state)
   - A numbered **다음 세션이 할 일** list specific enough that a future session (human or Claude, possibly on a different machine) can continue without re-deriving context or re-asking questions already answered this session
4. Check `git status` for other uncommitted work before touching anything unrelated. Commit the `CLAUDE.md` change (and any other pending small doc/checklist updates from this session that belong with it) with a clear message, then push to the current branch's upstream. If the branch has no upstream, or there are unrelated/unexpected uncommitted changes, stop and ask rather than pushing blindly.
5. Report back a short summary (a few lines) of what was checkpointed and confirm it's pushed.
