You are an AI product engineer and UX architect tasked with designing and delivering StudyPlanner, an autonomous AI-powered study planning desktop application. The end product target is a full desktop/mac app, but the immediate goal is a complete, hackathon-ready prototype that clearly demonstrates intelligence, adaptability, and student value.

The defining principle of this product is:

The student studies. The AI plans.

The AI is fully responsible for deciding what to study next and when, based on syllabus structure, exams (if any), revision history, and student feedback. The user is never required to plan sessions manually or specify availability.

1. Product mission

Automate study planning using learning science (spaced repetition) and exam urgency.

Remove planning overhead and decision fatigue for students.

Adapt continuously based on missed sessions, quiz performance, and revision behavior.

Preserve academic integrity: assist learning, not cheating.

2. Core product behavior (non-negotiable)

The student never decides when or what to revise next.

The AI always provides a next action (“Study this topic now”).

Planning adapts automatically when:

an exam is added or modified

a session is missed or aborted

quiz performance is poor or strong

If no exams are provided, the AI plans a balanced, long-term mastery schedule.

If exams are provided, the AI restructures the entire plan around exam urgency.

The system must always be explainable: the AI can justify why a session is scheduled.

3.1 Onboarding

User creates a subject OR uploads/pastes a syllabus.

AI parses syllabus into chapters and topics, estimating:

study session duration

relative importance

User can edit topics and durations.

3.2 Optional exam entry
User may add zero or more exams per subject.
Each exam has:
name
date
Exams immediately trigger a global replanning pass.

3.3 Daily usage

App shows a single CTA:

“Study this now”

User opens topic → studies → closes.

System prompts:

“Did you revise?” (Yes / No)

Optional quiz (quick or comprehensive).

Planner updates future sessions automatically.


4. Functional requirements
4.1 Content hierarchy

Subject → Chapter → Topic → Topic Notes 
subject -> topics ->notes

Topic notes may be user-written or AI-assisted summaries (clearly labeled).


4.2 Syllabus ingestion (AI-assisted)

Accept pasted text or PDF syllabus. Syllabus must be accompanied with an exam

AI outputs:

topic list

1-line summaries

estimated session time per topic

User can approve or edit before plan generation.

4.3 Autonomous planning logic
Without exams

Planner creates:

initial learning session for each topic

spaced revision sessions using SM-2 baseline

Topics are interleaved to avoid burnout.

No topic is marked “done”; mastery is gradual.

With exams

Planner reorders and compresses sessions based on:

days until exam

topic importance

student confidence

past performance

Ensures multiple passes on important topics before exam.

Low-importance topics may be deprioritized automatically.

4.4 Missed sessions & replanning

If a session is:

abruptly closed

explicitly marked “not revised”

skipped for too long

Then:

topic is flagged as weak

next revision is pulled closer

retention history updated

future sessions replanned

This must happen automatically without user intervention.


4.5 Study session flow

User opens topic.

Pomodoro-style timer runs (default, adjustable globally).

User closes topic.

Prompt:

“Did you revise?” Yes / No

If Yes → Offer quiz.

Quiz outcome updates planner.

4.6 Quizzes & flashcards

Generated from topic notes using constrained AI prompts.

Two types:

Quick test (small no of items, depends on the size of notes)

Comprehensive quiz (covers all the parts of the notes, detailed)

Quiz results map to a 0–5 quality score for planner logic.

Quizzes never give full assignment answers.


5. Dashboard & UI requirements
5.1 Main dashboard

Topic table with columns:

Subject / Topic

Time since last revised

Last 7 revision outcomes (green / amber / red)

Next 3 planned revisions

Total time spent

Entire row tinted red if consecutive misses exceed threshold.

5.2 Topic page

Notes viewer/editor

Retention history strip

“Why am I studying this now?” explanation

Manual overrides (rare, optional)

5.3 Planner views

Timeline view showing upcoming sessions (AI-generated).

Exam-focused view highlighting readiness per subject.

6. Planning & scheduling spec (conceptual)

Before you start building ,You must define:

Priority calculation formula (importance × urgency × confidence gap).

SM-2 baseline and how quiz outcomes map to quality scores.

Interval compression rules near exams.

Rules for:

consecutive misses

abrupt closures

repeated poor quiz results

A replanning pass that:

recalculates all future sessions

updates “next 3 revisions” per topic

maintains explainability.


11. Acceptance criteria

The product-prototype is complete when:

it has two modes:
1)exam centric:
A student can upload a syllabus and instantly get a study plan.
2) Base:
Students adds subjects -> chapters -> topic notes and the system automatically plans revision study sessions

The UI must be neat and clean and intuitive


Adding an exam visibly restructures future sessions.

Missing a session causes automatic replanning.

The “next 3 revisions” column updates correctly.

