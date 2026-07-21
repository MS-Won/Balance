---
description: Resume previous work — reads the latest checkpoint in CLAUDE.md and continues it directly
---

Resume previous work on this project. This is shorthand for "이전 작업 이어서 진행해줘" — act on it immediately, don't just summarize the plan back.

1. Run `git status` first. If the working tree is clean, `git pull` so you're reading the latest checkpoint (it may have been written from a different machine via `/checkpoint`).
2. Read `CLAUDE.md` at the root of this repository. Find the most recent (topmost) `## 현재 진행 상황` dated section and its `다음 세션이 할 일` list.
3. In one or two sentences, confirm your understanding of where things stand and what you're about to do — not a full restatement, just enough that the user can catch a mistake before you act.
4. Continue directly from the next unfinished step in that list. If a step depends on something only the user can do or decide (e.g. an external action taken outside this session, a choice between approaches), ask about that specific thing rather than guessing — but don't stop to ask permission for the parts that are unambiguous continuations of already-agreed work.
