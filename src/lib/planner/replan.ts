import { supabase } from "@/lib/supabase";
import { calculateSM2, NOT_REVISED_QUALITY } from "./sm2";
import { Topic, StudySession } from "@/lib/database.types";
import { formatISO, addDays, isBefore, startOfDay } from "date-fns";

/**
 * Core replanning engine for Base mode (no exams).
 *
 * Responsibilities:
 *   - Update a topic's SM-2 fields after a session
 *   - Schedule the next pending session
 *   - Detect & handle missed sessions
 *   - Log all changes for explainability
 */

/** Update a topic after a study session with a given quality score */
export async function completeSession(
  sessionId: string,
  qualityScore: number,
  durationSec?: number
) {
  // 1. Get the session + topic
  const { data: session } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", session.topic_id)
    .single();

  if (!topic) throw new Error("Topic not found");

  // 2. Run SM-2
  const sm2Result = calculateSM2({
    easinessFactor: topic.sm2_easiness_factor,
    interval: topic.sm2_interval,
    repetitionCount: topic.sm2_repetition_count,
    qualityScore,
  });

  // 3. Update the topic's SM-2 fields
  const oldNextReview = topic.sm2_next_review;
  await supabase
    .from("topics")
    .update({
      sm2_easiness_factor: sm2Result.easinessFactor,
      sm2_interval: sm2Result.interval,
      sm2_repetition_count: sm2Result.repetitionCount,
      sm2_next_review: sm2Result.nextReview,
      confidence: computeConfidence(qualityScore, topic.confidence),
    })
    .eq("id", topic.id);

  // 4. Mark the current session as completed
  await supabase
    .from("study_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      quality_score: qualityScore,
      duration_sec: durationSec ?? null,
    })
    .eq("id", sessionId);

  // 5. Schedule the next revision session
  await supabase.from("study_sessions").insert({
    topic_id: topic.id,
    scheduled_at: new Date(sm2Result.nextReview).toISOString(),
    status: "pending",
    source: "revision",
  });

  // 6. Log the event
  await supabase.from("planner_logs").insert({
    topic_id: topic.id,
    event_type: "interval_update",
    reason: `Session completed with quality ${qualityScore}. Interval: ${topic.sm2_interval}→${sm2Result.interval} days. EF: ${topic.sm2_easiness_factor}→${sm2Result.easinessFactor}.`,
    old_next_review: oldNextReview,
    new_next_review: sm2Result.nextReview,
  });

  return sm2Result;
}

/** Mark a session as missed and replan */
export async function missSession(sessionId: string) {
  const { data: session } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", session.topic_id)
    .single();

  if (!topic) return;

  // Run SM-2 with quality 0
  const sm2Result = calculateSM2({
    easinessFactor: topic.sm2_easiness_factor,
    interval: topic.sm2_interval,
    repetitionCount: topic.sm2_repetition_count,
    qualityScore: NOT_REVISED_QUALITY,
  });

  const oldNextReview = topic.sm2_next_review;
  // Pull next review to tomorrow
  const tomorrow = formatISO(addDays(new Date(), 1), {
    representation: "date",
  });

  await supabase
    .from("topics")
    .update({
      sm2_easiness_factor: sm2Result.easinessFactor,
      sm2_interval: 1,
      sm2_repetition_count: 0,
      sm2_next_review: tomorrow,
      confidence: Math.max(0, topic.confidence - 0.15),
    })
    .eq("id", topic.id);

  // Mark session as missed
  await supabase
    .from("study_sessions")
    .update({
      status: "missed",
      quality_score: 0,
    })
    .eq("id", sessionId);

  // Schedule next session for tomorrow
  await supabase.from("study_sessions").insert({
    topic_id: topic.id,
    scheduled_at: new Date(tomorrow).toISOString(),
    status: "pending",
    source: "replan",
  });

  // Log
  await supabase.from("planner_logs").insert({
    topic_id: topic.id,
    event_type: "session_missed",
    reason: `Session missed. Topic reset — next review pulled to tomorrow.`,
    old_next_review: oldNextReview,
    new_next_review: tomorrow,
  });
}

/** Detect overdue sessions and mark them as missed */
export async function detectAndHandleMissedSessions() {
  const now = new Date().toISOString();

  const { data: overdueSessions } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("status", "pending")
    .lt("scheduled_at", now);

  if (!overdueSessions || overdueSessions.length === 0) return [];

  const missedIds: string[] = [];
  for (const session of overdueSessions) {
    await missSession(session.id);
    missedIds.push(session.id);
  }

  return missedIds;
}

/** Create initial study sessions for all topics in a subject (base mode) */
export async function createInitialSessions(subjectId: string) {
  // Get all topics for this subject via chapters
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("subject_id", subjectId);

  if (!chapters || chapters.length === 0) return;

  const chapterIds = chapters.map((c) => c.id);
  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .in("chapter_id", chapterIds);

  if (!topics || topics.length === 0) return;

  // Schedule initial sessions: interleave topics across upcoming days
  const today = startOfDay(new Date());
  const sessionsToInsert = topics.map((topic, index) => ({
    topic_id: topic.id,
    scheduled_at: addDays(today, Math.floor(index / 3)).toISOString(), // ~3 topics per day
    status: "pending" as const,
    source: "initial" as const,
  }));

  await supabase.from("study_sessions").insert(sessionsToInsert);
}

/** Ensure a topic has at least one pending (or active) study session */
export async function ensurePendingSessionForTopic(topicId: string) {
  const [{ data: pendingSessions }, { data: activeSessions }] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id")
      .eq("topic_id", topicId)
      .eq("status", "pending")
      .limit(1),
    supabase
      .from("study_sessions")
      .select("id")
      .eq("topic_id", topicId)
      .not("started_at", "is", null)
      .is("completed_at", null)
      .limit(1),
  ]);

  if ((pendingSessions?.length ?? 0) > 0 || (activeSessions?.length ?? 0) > 0) {
    return false;
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("id, sm2_next_review")
    .eq("id", topicId)
    .single();

  if (!topic) {
    throw new Error("Topic not found");
  }

  const now = new Date();
  const nextReview = topic.sm2_next_review ? new Date(topic.sm2_next_review) : now;
  const scheduledAt = nextReview < now ? now.toISOString() : nextReview.toISOString();

  await supabase.from("study_sessions").insert({
    topic_id: topicId,
    scheduled_at: scheduledAt,
    status: "pending",
    source: "initial",
  });

  await supabase.from("planner_logs").insert({
    topic_id: topicId,
    event_type: "replan",
    reason: "Created pending session automatically after notes were saved.",
    old_next_review: null,
    new_next_review: scheduledAt,
  });

  return true;
}

/** Get the next topic to study (most overdue pending session) */
export async function getNextStudyTopic(): Promise<{
  session: StudySession;
  topic: Topic;
} | null> {
  const { data } = await supabase
    .from("study_sessions")
    .select("*, topics(*)")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .single();

  if (!data) return null;

  const { topics: topic, ...session } = data as StudySession & {
    topics: Topic;
  };
  return { session, topic };
}

/** Compute a rolling confidence value (0-1) */
function computeConfidence(
  latestQuality: number,
  currentConfidence: number
): number {
  // Exponential moving average with alpha = 0.3
  const alpha = 0.3;
  const newSignal = latestQuality / 5; // normalize 0-5 → 0-1
  const updated = alpha * newSignal + (1 - alpha) * currentConfidence;
  return Math.round(updated * 100) / 100;
}
