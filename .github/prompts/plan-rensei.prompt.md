## Plan: Rensei — AI Study Planner Web App

**TL;DR**: Build Rensei as a Next.js web app backed by Supabase (Postgres), using the Gemini API for syllabus parsing and quiz generation. The app has two modes: **Exam-centric** (upload syllabus + exam date → AI generates a compressed study plan with session durations) and **Base** (user manually adds subjects/topics/notes → SM-2-based revision scheduling at the user's own pace). The planner runs server-side in Next.js API routes, all state lives in Supabase, and the frontend uses Shadcn/UI for a clean dashboard. Deploy to Vercel.

**Steps**

### Phase 0 — Project Scaffolding
1. Initialize a Next.js 14+ app with App Router, TypeScript, Tailwind CSS, and Shadcn/UI in the workspace root
2. Set up Supabase project (free tier) — create the database, grab the connection URL and anon key
3. Add Supabase client library (`@supabase/supabase-js`) and configure environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Add a settings page/modal where the user enters their Gemini API key, stored in `localStorage` and sent as a header on API calls (never persisted server-side)
5. Configure Vercel deployment with env vars

### Phase 1 — Data Model (Supabase Migrations)
6. Create the following tables via Supabase SQL migrations:

   - **`subjects`** — `id` (UUID PK), `name`, `color`, `created_at`
   - **`chapters`** — `id`, `subject_id` (FK), `name`, `order`, `importance` (float 0–1)
   - **`topics`** — `id`, `chapter_id` (FK), `name`, `summary`, `order`, `importance` (float), `estimated_duration_min` (nullable — only used in exam mode), `sm2_easiness_factor` (default 2.5), `sm2_interval` (float, days), `sm2_repetition_count` (int), `sm2_next_review` (date), `confidence` (float 0–1)
   - **`notes`** — `id`, `topic_id` (FK), `content` (text/markdown), `is_ai_generated` (bool), `created_at`, `updated_at`
   - **`exams`** — `id`, `subject_id` (FK), `name`, `date`, `created_at`
   - **`study_sessions`** — `id`, `topic_id` (FK), `scheduled_at`, `started_at`, `completed_at`, `status` (enum: pending/completed/missed/skipped/aborted), `duration_sec`, `quality_score` (0–5), `source` (enum: initial/revision/replan/exam_compression)
   - **`quiz_results`** — `id`, `topic_id` (FK), `session_id` (FK, nullable), `quiz_type` (quick/comprehensive), `total_questions`, `correct_answers`, `quality_score` (0–5), `taken_at`
   - **`quiz_questions`** — `id`, `topic_id` (FK), `question`, `answer`, `type` (mcq/flashcard/short_answer), `generated_at`
   - **`planner_logs`** — `id`, `topic_id` (FK), `event_type`, `reason`, `old_next_review`, `new_next_review`, `created_at`

7. Set up Row Level Security policies (permissive for now since no auth — allow all operations)
8. Create TypeScript types matching all tables (generate via `supabase gen types typescript`)

### Phase 2 — Base Mode (Manual Entry + SM-2 Revision)
9. **Subject CRUD**: Build a `/subjects` page — list subjects, create/edit/delete with a dialog form
10. **Chapter & Topic CRUD**: Build a `/subjects/[id]` page — nested list of chapters → topics. Allow add/edit/reorder/delete. In base mode, `estimated_duration_min` is hidden (user studies at their own pace)
11. **Notes editor**: Build a `/topics/[id]` page with a Markdown editor for notes (`content` field). Toggle `is_ai_generated` label when notes are AI-assisted
12. **SM-2 engine**: Create a `lib/planner/sm2.ts` module implementing the core algorithm:
    - Input: current `EF`, `interval`, `repetition_count`, `quality_score` (0–5)
    - Output: new `EF`, `interval`, `repetition_count`, `next_review` date
    - If `quality < 3`: reset reps to 0, interval to 1 day, keep EF
    - EF formula: $EF' = EF + (0.1 - (5 - q)(0.08 + (5 - q) \times 0.02))$, clamped to min 1.3
    - Intervals: $I(1) = 1$, $I(2) = 6$, $I(n) = I(n-1) \times EF$ for $n > 2$
13. **Replanning engine**: Create `lib/planner/replan.ts`:
    - On session completion: update topic's SM-2 fields, compute next review date, insert a new `study_sessions` row with status `pending`
    - On session missed/aborted: set quality to 0, pull next review closer, log in `planner_logs`
    - Compute "next 3 revisions" per topic as a derived query (3 nearest pending sessions)
14. **Study flow (base mode)**:
    - Dashboard shows the **single CTA**: "Study this now" — the topic with the most overdue `sm2_next_review` date
    - User clicks → opens the topic page with notes
    - User closes/navigates away → prompt: "Did you revise?" (Yes / No)
    - If Yes → optional quiz offer → quiz result maps to quality 0–5 → SM-2 updates → next session scheduled
    - If No → quality = 0 → topic flagged weak → next review pulled to tomorrow
    - All of this triggers `replan()`

### Phase 3 — Exam-Centric Mode (Syllabus Parsing + AI Planning)
15. **Syllabus upload UI**: On the `/subjects/new` page, add a mode toggle: "Add manually" vs "Upload syllabus". Upload mode accepts pasted text or PDF file
16. **PDF text extraction**: Use `pdf-parse` (or a WASM-based equivalent like `unpdf`) in a Next.js API route (`/api/parse-pdf`) to extract raw text from uploaded PDFs
17. **Gemini syllabus parsing**: Create `/api/parse-syllabus` API route:
    - Takes extracted text + Gemini API key (from request header)
    - Sends a structured prompt to Gemini asking it to return JSON: `{ chapters: [{ name, topics: [{ name, summary, importance, estimated_duration_min }] }] }`
    - Returns parsed structure to the frontend
18. **Approval UI**: Show the parsed chapters/topics in an editable table. User can rename, delete, reorder, adjust importance and duration before confirming
19. **Exam entry**: Require an exam (name + date) to accompany syllabus upload. Stored in `exams` table
20. **Exam-aware planning engine**: Create `lib/planner/exam-planner.ts`:
    - **Priority formula**: $\text{priority} = 0.25 \times \text{importance} + 0.35 \times \frac{1}{\text{days\_until\_exam}} + 0.25 \times (1 - \text{confidence}) + 0.15 \times \text{overdue\_factor}$
    - **Interval compression**: $\text{compressed\_interval} = \min(SM2\_interval, \frac{\text{days\_until\_exam}}{R + 1})$ where $R$ = remaining desired passes (2–3 for high-importance)
    - AI decides `estimated_duration_min` per session; user can edit afterwards
    - Generate all sessions between now and exam date, ordered by priority
    - Ensure multiple passes on high-importance topics, deprioritize low-importance ones
    - Log all decisions in `planner_logs` with reasons
21. **Replanning triggers (exam mode)**: Replan the entire subject's schedule when:
    - Exam added, modified, or deleted
    - Session completed, missed, or aborted
    - Quiz performance recorded
    - Each replan recalculates all future pending sessions

### Phase 4 — Quizzes & Flashcards
22. **Quiz generation API**: Create `/api/generate-quiz` route:
    - Input: topic notes content + quiz type (quick/comprehensive) + Gemini key
    - Prompt Gemini to generate questions strictly from the provided notes (no external knowledge), output as JSON array of `{ question, answer, type }`
    - Quick: small number of items (3–5 based on note length)
    - Comprehensive: cover all key points in the notes (8–15 items)
    - Cache generated questions in `quiz_questions` table; only regenerate when notes change
23. **Quiz UI**: Build a quiz modal/page:
    - Show questions one at a time (MCQ with radio buttons, short answer with text input, flashcard with reveal toggle)
    - Score at the end → map to quality 0–5:  ≥90% → 5, 70–89% → 4, 50–69% → 3, 30–49% → 2, 10–29% → 1, <10% → 0
    - Save `quiz_results`, feed quality score into SM-2/planner
24. **Academic integrity guardrail**: Prompt engineering — instruct Gemini to never produce full assignment answers, only generate review/recall questions

### Phase 5 — Dashboard & UI
25. **Main dashboard** (`/` route):
    - **CTA card** at the top: "Study this now" with the highest-priority topic
    - **Topic table** below with columns: Subject/Topic, Time since last revised, Last 7 revision outcomes (green/amber/red dots), Next 3 planned revisions, Total time spent
    - Rows tinted red if consecutive misses exceed threshold (3+)
    - Filter/group by subject
26. **Topic detail page** (`/topics/[id]`):
    - Notes viewer/editor (Markdown)
    - Retention history strip (visual timeline of past sessions with color-coded outcomes)
    - "Why am I studying this now?" card — template-driven explanation from `planner_logs` data (e.g., "This topic is due for revision. Your last quiz scored 60%. Exam in 5 days.")
    - Manual override button (rare) — let user manually trigger a session or push a topic to tomorrow
27. **Planner views**:
    - **Timeline view**: Calendar/Gantt-style view of upcoming sessions (use a library like `react-big-calendar` or a custom timeline component)
    - **Exam readiness view**: Per-subject card showing % topics reviewed, average confidence, days until exam, at-risk topics
28. **Pomodoro timer** : Lightweight timer component shown during study sessions. Default 25 min, adjustable globally in settings. Timer matches the session's `estimated_duration_min` rounded to Pomodoro blocks. Abrupt close (navigating away before timer ends) → marks session as aborted

### Phase 6 — Polish & Edge Cases
29. **Missed session detection**: On app load (or via a cron-like check), scan for `study_sessions` where `scheduled_at` < now and `status` = pending → auto-mark as missed → run `replan()`
30. **"All caught up" state**: When no topics are overdue, show a positive state ("You're on track!") with optional deep-review suggestions
31. **Multi-subject interleaving**: When multiple subjects have upcoming exams, distribute sessions proportionally to $\text{urgency} \times \text{remaining\_topics}$
32. **Error handling**: Graceful fallbacks when Gemini API fails (retry with backoff, show user-friendly error, queue for later)
33. **Responsive design**: Ensure the dashboard works on tablet/mobile (students use phones)
34. **Loading states & optimistic updates**: Skeleton loaders for data fetching, optimistic UI for session completion

### Verification
- **Unit tests**: Test SM-2 engine with known inputs/outputs (e.g., quality 5 on a fresh topic → interval = 1, then 6, then 6×2.5=15). Test exam compression with a topic 10 days from exam
- **Integration test**: Create a subject with 5 topics → complete 2 sessions with varying quiz scores → verify `sm2_next_review` dates are correct and "next 3 revisions" column reflects changes
- **Exam mode E2E**: Upload a sample syllabus text → verify parsed output → add exam → verify sessions are generated with compressed intervals → complete a session → verify replan fires and future sessions shift
- **Edge case tests**: Miss 3 consecutive sessions → verify topic turns red and is prioritized. Delete an exam → verify plan reverts to base SM-2 intervals
- **Manual check**: Deploy to Vercel, walk through both modes end-to-end as a student would

### Decisions
- **Web app over desktop**: faster iteration, no binary distribution, accessible from any device
- **Gemini over OpenAI**: cost savings, upgrade path if quality insufficient
- **Supabase over Firebase**: relational model fits the Subject→Chapter→Topic hierarchy better; SQL queries for scheduling logic are simpler than Firestore
- **No auth for prototype**: reduces scope, single-user model is fine for demo
- **Template-based explanations over LLM**: "Why am I studying this?" uses planner data directly — zero API cost, instant, always accurate
- **Base mode has no timer/duration**: user studies at own pace, system only tracks whether they revised and quiz outcomes
- **Exam mode has AI-determined durations**: AI estimates session length per topic, user can edit; Pomodoro timer enforces it
