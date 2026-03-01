import { addDays, formatISO } from "date-fns";

export interface SM2Input {
  easinessFactor: number;
  interval: number;
  repetitionCount: number;
  qualityScore: number; // 0-5
}

export interface SM2Output {
  easinessFactor: number;
  interval: number;
  repetitionCount: number;
  nextReview: string; // ISO date string (date only)
}

/**
 * SuperMemo SM-2 Algorithm Implementation
 *
 * Quality scores (0-5):
 *   5 — perfect recall
 *   4 — correct, slight hesitation
 *   3 — correct, serious difficulty
 *   2 — wrong, but recognized answer
 *   1 — wrong, barely recognized
 *   0 — complete blackout
 *
 * Interval calculation:
 *   I(1) = 1 day
 *   I(2) = 6 days
 *   I(n) = I(n-1) × EF for n > 2
 *
 * EF update:
 *   EF' = EF + (0.1 - (5 - q) × (0.08 + (5 - q) × 0.02))
 *   EF' clamped to minimum 1.3
 *
 * If quality < 3: reset repetition count to 0, interval to 1 day, keep EF
 */
export function calculateSM2(input: SM2Input): SM2Output {
  const { easinessFactor, interval, repetitionCount, qualityScore } = input;
  const q = Math.max(0, Math.min(5, Math.round(qualityScore)));

  let newEF = easinessFactor;
  let newInterval: number;
  let newReps: number;

  if (q < 3) {
    // Failed recall — reset repetitions, start over
    newReps = 0;
    newInterval = 1;
    // EF stays unchanged on failure
  } else {
    // Successful recall — advance
    newReps = repetitionCount + 1;

    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easinessFactor);
    }

    // Update easiness factor
    newEF =
      easinessFactor +
      (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }

  // Clamp EF to minimum 1.3
  newEF = Math.max(1.3, newEF);

  // Ensure interval is at least 1
  newInterval = Math.max(1, newInterval);

  const nextReview = formatISO(addDays(new Date(), newInterval), {
    representation: "date",
  });

  return {
    easinessFactor: Math.round(newEF * 100) / 100,
    interval: newInterval,
    repetitionCount: newReps,
    nextReview,
  };
}

/**
 * Map a quiz percentage score to SM-2 quality (0-5)
 *
 *   ≥90% → 5 (perfect)
 *   70-89% → 4 (good)
 *   50-69% → 3 (acceptable)
 *   30-49% → 2 (fail, recognized)
 *   10-29% → 1 (fail, barely)
 *   <10% → 0 (blackout)
 */
export function quizScoreToQuality(
  correctAnswers: number,
  totalQuestions: number
): number {
  if (totalQuestions === 0) return 0;
  const pct = (correctAnswers / totalQuestions) * 100;

  if (pct >= 90) return 5;
  if (pct >= 70) return 4;
  if (pct >= 50) return 3;
  if (pct >= 30) return 2;
  if (pct >= 10) return 1;
  return 0;
}

/**
 * Default quality score when user says "Yes, I revised" but skips the quiz.
 * Neutral — doesn't boost or penalize, just marks as seen.
 */
export const DEFAULT_REVISED_QUALITY = 3;

/**
 * Quality score when user says "No, I didn't revise".
 * Resets the topic as if recall failed completely.
 */
export const NOT_REVISED_QUALITY = 0;
