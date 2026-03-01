import { supabase } from "@/lib/supabase";
import { calculateSM2 } from "./sm2";
import { Topic, Exam } from "@/lib/database.types";
import {
  addDays,
  differenceInDays,
  startOfDay,
  formatISO,
  isBefore,
} from "date-fns";

/**
 * Exam-centric planner.
 *
 * When exams are present, the planner:
 *   1. Compresses SM-2 intervals to fit before the exam
 *   2. Orders sessions by priority (importance × urgency × confidence gap)
 *   3. Ensures high-importance topics get multiple passes
 *   4. Deprioritizes low-importance topics if time is limited
 */

interface TopicWithPriority {
  topic: Topic;
  priority: number;
  daysUntilExam: number;
  compressedInterval: number;
  desiredPasses: number;
}

/** Priority weights */
const W_IMPORTANCE = 0.25;
const W_URGENCY = 0.35;
const W_CONFIDENCE_GAP = 0.25;
const W_OVERDUE = 0.15;

/**
 * Calculate priority score for a topic relative to an exam.
 */
function calculatePriority(
  topic: Topic,
  daysUntilExam: number,
  overdueFactor: number
): number {
  const urgency = daysUntilExam > 0 ? 1 / daysUntilExam : 10;
  const confidenceGap = 1 - topic.confidence;

  return (
    W_IMPORTANCE * topic.importance +
    W_URGENCY * urgency +
    W_CONFIDENCE_GAP * confidenceGap +
    W_OVERDUE * overdueFactor
  );
}

/**
 * Compress an SM-2 interval to fit within exam constraints.
 *
 * compressed_interval = min(SM2_interval, days_until_exam / (R + 1))
 * where R = desired remaining passes
 */
function compressInterval(
  sm2Interval: number,
  daysUntilExam: number,
  desiredPasses: number
): number {
  if (daysUntilExam <= 0) return 1;
  const maxAllowed = Math.floor(daysUntilExam / (desiredPasses + 1));
  return Math.max(1, Math.min(sm2Interval, maxAllowed));
}

/**
 * Determine how many passes a topic needs before exam based on importance.
 */
function getDesiredPasses(importance: number): number {
  if (importance >= 0.8) return 3;
  if (importance >= 0.5) return 2;
  return 1;
}

/**
 * Generate a full study plan for a subject with an exam.
 * Deletes all existing pending sessions and creates new ones.
 */
export async function generateExamPlan(
  subjectId: string,
  examId: string
): Promise<void> {
  // 1. Get the exam
  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (!exam) throw new Error("Exam not found");

  // 2. Get all topics for this subject via chapters
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

  // 3. Delete all existing pending sessions for these topics
  const topicIds = topics.map((t) => t.id);
  await supabase
    .from("study_sessions")
    .delete()
    .in("topic_id", topicIds)
    .eq("status", "pending");

  // 4. Calculate priorities and schedule sessions
  const today = startOfDay(new Date());
  const examDate = startOfDay(new Date(exam.date));
  const totalDays = differenceInDays(examDate, today);

  if (totalDays <= 0) return; // Exam already passed

  // Calculate priority for each topic
  const topicsWithPriority: TopicWithPriority[] = topics.map((topic) => {
    const overdueFactor =
      topic.sm2_interval > 0
        ? Math.max(
            0,
            differenceInDays(
              today,
              new Date(topic.sm2_next_review)
            ) / topic.sm2_interval
          )
        : 0;

    const desiredPasses = getDesiredPasses(topic.importance);
    const compressedInterval = compressInterval(
      topic.sm2_interval || 1,
      totalDays,
      desiredPasses
    );

    return {
      topic,
      priority: calculatePriority(topic, totalDays, overdueFactor),
      daysUntilExam: totalDays,
      compressedInterval,
      desiredPasses,
    };
  });

  // Sort by priority (highest first)
  topicsWithPriority.sort((a, b) => b.priority - a.priority);

  // 5. Distribute sessions across available days
  // Each day gets a slot budget based on total topics and time available
  const sessionsToInsert: Array<{
    topic_id: string;
    scheduled_at: string;
    status: "pending";
    source: "exam_compression";
  }> = [];

  for (const { topic, compressedInterval, desiredPasses } of topicsWithPriority) {
    // Schedule `desiredPasses` sessions, spaced by `compressedInterval` days
    let nextDate = today;

    for (let pass = 0; pass < desiredPasses + 1; pass++) {
      // +1 for initial learning pass
      if (isBefore(examDate, nextDate)) break; // Don't schedule past exam

      sessionsToInsert.push({
        topic_id: topic.id,
        scheduled_at: nextDate.toISOString(),
        status: "pending",
        source: "exam_compression",
      });

      nextDate = addDays(nextDate, compressedInterval);
    }
  }

  // Sort all sessions by date for even distribution
  sessionsToInsert.sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  // 6. Insert all sessions
  if (sessionsToInsert.length > 0) {
    await supabase.from("study_sessions").insert(sessionsToInsert);
  }

  // 7. Log the planning event for each topic
  const logEntries = topics.map((topic) => ({
    topic_id: topic.id,
    event_type: "exam_added" as const,
    reason: `Exam "${exam.name}" on ${exam.date}. Plan generated with ${totalDays} days remaining. Priority-weighted session scheduling applied.`,
    old_next_review: topic.sm2_next_review,
    new_next_review: formatISO(today, { representation: "date" }),
  }));

  await supabase.from("planner_logs").insert(logEntries);
}

/**
 * Replan all sessions for a subject after a change (session completed, missed, etc.)
 * Only replans if there's an active exam for the subject.
 */
export async function replanExamSessions(subjectId: string): Promise<void> {
  // Check if there's an upcoming exam
  const today = formatISO(new Date(), { representation: "date" });
  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("subject_id", subjectId)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(1);

  if (!exams || exams.length === 0) return; // No upcoming exam, base mode handles it

  // Re-generate the plan for the nearest exam
  await generateExamPlan(subjectId, exams[0].id);
}

/**
 * Get exam readiness data for a subject.
 */
export async function getExamReadiness(subjectId: string) {
  const today = formatISO(new Date(), { representation: "date" });

  // Get upcoming exams
  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("subject_id", subjectId)
    .gte("date", today)
    .order("date", { ascending: true });

  if (!exams || exams.length === 0) return null;

  // Get all topics
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("subject_id", subjectId);

  if (!chapters) return null;

  const chapterIds = chapters.map((c) => c.id);
  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .in("chapter_id", chapterIds);

  if (!topics) return null;

  const exam = exams[0];
  const daysUntilExam = differenceInDays(
    new Date(exam.date),
    new Date()
  );
  const avgConfidence =
    topics.reduce((sum, t) => sum + t.confidence, 0) / topics.length;
  const reviewedTopics = topics.filter((t) => t.sm2_repetition_count > 0).length;
  const atRiskTopics = topics.filter(
    (t) => t.confidence < 0.4 || t.sm2_repetition_count === 0
  );

  return {
    exam,
    daysUntilExam,
    totalTopics: topics.length,
    reviewedTopics,
    avgConfidence: Math.round(avgConfidence * 100),
    atRiskTopics,
  };
}
