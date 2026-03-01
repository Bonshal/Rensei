"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { detectAndHandleMissedSessions, getNextStudyTopic } from "@/lib/planner";
import { StudySession, Topic } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  X,
  CalendarClock,
  Loader2,
  Paperclip,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { StudyPromptDialog } from "@/components/study-prompt-dialog";
import { useGeminiKey } from "@/hooks/use-gemini-key";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#64748b", "#0ea5e9",
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface TopicRow {
  topic: Topic;
  lastRevised: Date | null;
  last7: ("completed" | "missed" | "pending")[];
  consecutiveMisses: number;
  hasNotes: boolean;
  upcomingSessions: UpcomingSession[];
}

interface ChapterRow {
  chapter: { id: string; name: string; subject_id: string; position: number; importance: number };
  lastRevised: Date | null;
  last7: ("completed" | "missed" | "pending")[];
  consecutiveMisses: number;
  topics: TopicRow[];
  upcomingSessions: UpcomingSession[];
}

interface UpcomingSession {
  topicId: string;
  topicName: string;
  scheduledAt: Date;
}

interface SubjectGroup {
  subject: { id: string; name: string; color: string };
  chapters: ChapterRow[];
  hasNotes: boolean;
}

interface ExamRow {
  examId: string;
  examName: string;
  examDate: Date;
  subject: { id: string; name: string; color: string };
  totalSessions: number;
  completedSessions: number;
  last7: ("completed" | "missed" | "pending")[];
  upcomingSessions: UpcomingSession[];
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function RevisionPills({ outcomes }: { outcomes: ("completed" | "missed" | "pending")[] }) {
  if (outcomes.length === 0)
    return <span className="text-sm text-muted-foreground/40 tracking-widest">· · ·</span>;
  return (
    <div className="flex items-center gap-1">
      {outcomes.map((o, i) => (
        <div
          key={i}
          className={cn(
            "h-[17px] w-[8px] rounded-[3px]",
            o === "completed" && "bg-emerald-500",
            o === "missed" && "bg-red-400",
            o === "pending" && "bg-zinc-200 dark:bg-zinc-700"
          )}
          title={o}
        />
      ))}
    </div>
  );
}

function timeSince(d: Date | null) {
  if (!d) return "Never";
  return formatDistanceToNow(d, { addSuffix: true });
}

function makeMockLast7() {
  return Array.from({ length: 7 }, () => (Math.random() < 0.7 ? "completed" : "missed")) as ("completed" | "missed" | "pending")[];
}

function isTodayDate(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function QuickInput({
  placeholder, value, onChange, onConfirm, onCancel, disabled,
}: {
  placeholder: string; value: string;
  onChange: (v: string) => void;
  onConfirm: () => void; onCancel: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="w-52 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-zinc-300 placeholder:text-zinc-400 shadow-sm"
      />
      <button
        onClick={onConfirm}
        disabled={disabled || !value.trim()}
        className="h-7 w-7 rounded-md flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 disabled:opacity-40 transition-colors"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onCancel}
        className="h-7 w-7 rounded-md flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-500 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { key: geminiKey } = useGeminiKey();
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroup[]>([]);
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [nextStudy, setNextStudy] = useState<{ session: StudySession; topic: Topic } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dueTodayTopics, setDueTodayTopics] = useState<{ topicId: string; topicName: string; subjectColor: string }[]>([]);

  // Quick-add
  const [quickChapter, setQuickChapter] = useState<{ subjectId: string; name: string } | null>(null);
  const [quickTopic, setQuickTopic] = useState<{ chapterId: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline subject creation dialog
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectColor, setNewSubjectColor] = useState(PRESET_COLORS[5]);
  const [subjectSaving, setSubjectSaving] = useState(false);

  // Exam-centric: add exam subject dialog
  const [showNewExamSubject, setShowNewExamSubject] = useState(false);
  const [examMode, setExamMode] = useState<"new" | "existing">("new");
  const [examExistingSubjectId, setExamExistingSubjectId] = useState("");
  const [examSubjectName, setExamSubjectName] = useState("");
  const [examSubjectColor, setExamSubjectColor] = useState(PRESET_COLORS[0]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examSyllabus, setExamSyllabus] = useState("");
  const [examSaving, setExamSaving] = useState(false);
  const [examError, setExamError] = useState("");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);

  const handleSyllabusFileChange = async (file: File | null) => {
    if (!file) { setSyllabusFile(null); return; }
    setSyllabusFile(file);
    setExtractingPdf(true);
    setExamError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = {};
      if (geminiKey) headers["x-gemini-key"] = geminiKey;
      const res = await fetch("/api/parse-pdf", { method: "POST", headers, body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to extract file text");
      setExamSyllabus(json.text);
    } catch (err: unknown) {
      setExamError(err instanceof Error ? err.message : "Could not read file.");
      setSyllabusFile(null);
    } finally {
      setExtractingPdf(false);
    }
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      await detectAndHandleMissedSessions();
      const next = await getNextStudyTopic();
      setNextStudy(next);

      const { data: subjects } = await supabase.from("subjects").select("*");
      const { data: allExams } = await supabase.from("exams").select("*");

      if (!subjects?.length) {
        setSubjectGroups([]);
        setExamRows([]);
        return;
      }

      const groups: SubjectGroup[] = [];
      const todayTopics: { topicId: string; topicName: string; subjectColor: string }[] = [];

      for (const subject of subjects) {
        const { data: chaptersData } = await supabase
          .from("chapters")
          .select("*")
          .eq("subject_id", subject.id)
          .order("position", { ascending: true });

        const chapterRows: ChapterRow[] = [];
        let subjectHasNotes = false;

        for (const chapter of chaptersData ?? []) {
          const { data: topics } = await supabase
            .from("topics").select("*")
            .eq("chapter_id", chapter.id)
            .order("position", { ascending: true });

          const topicRows: TopicRow[] = [];

          for (const topic of topics ?? []) {
            const [{ data: sessions }, { data: notes }] = await Promise.all([
              supabase.from("study_sessions").select("*")
                .eq("topic_id", topic.id)
                .order("scheduled_at", { ascending: false })
                .limit(20),
              supabase.from("notes").select("id, content")
                .eq("topic_id", topic.id)
                .limit(1),
            ]);

            const all = sessions ?? [];
            let last7 = all.slice(0, 7)
              .map((s) => s.status as "completed" | "missed" | "pending")
              .reverse();
            if (last7.length === 0) {
              last7 = makeMockLast7();
            }
            const lastCompleted = all.find((s) => s.status === "completed");
            let consecutiveMisses = 0;
            for (const s of all) {
              if (s.status === "missed") consecutiveMisses++;
              else break;
            }

            const hasNotes = !!(notes?.[0]?.content?.trim());
            if (hasNotes) subjectHasNotes = true;

            // Collect upcoming pending sessions for this topic
            const pendingSessions = all
              .filter((s) => s.status === "pending" && s.scheduled_at)
              .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
            const topicUpcoming: UpcomingSession[] = pendingSessions.map((ps) => ({
              topicId: topic.id,
              topicName: topic.name,
              scheduledAt: new Date(ps.scheduled_at),
            }));

            // Track topics due today
            if (topicUpcoming.some((u) => isTodayDate(u.scheduledAt))) {
              todayTopics.push({ topicId: topic.id, topicName: topic.name, subjectColor: subject.color });
            }

            topicRows.push({
              topic,
              lastRevised: lastCompleted?.completed_at ? new Date(lastCompleted.completed_at) : null,
              last7, consecutiveMisses, hasNotes,
              upcomingSessions: topicUpcoming.slice(0, 3),
            });
          }

          const chapterLastRevised = topicRows.reduce<Date | null>(
            (best, tr) => tr.lastRevised && (!best || tr.lastRevised > best) ? tr.lastRevised : best, null
          );
          const chapterLast7 = topicRows.flatMap((tr) => tr.last7).slice(0, 7) as ("completed" | "missed" | "pending")[];
          const chapterLast7Final = chapterLast7.length > 0 ? chapterLast7 : makeMockLast7();
          const chapterConsecutiveMisses = Math.max(0, ...topicRows.map((tr) => tr.consecutiveMisses));

          const chapterUpcoming = topicRows
            .flatMap((tr) => tr.upcomingSessions)
            .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
            .slice(0, 3);
          chapterRows.push({ chapter, lastRevised: chapterLastRevised, last7: chapterLast7Final, consecutiveMisses: chapterConsecutiveMisses, topics: topicRows, upcomingSessions: chapterUpcoming });
        }

        groups.push({ subject, chapters: chapterRows, hasNotes: subjectHasNotes });
      }

      setSubjectGroups(groups);
      setDueTodayTopics(todayTopics);

      // Build exam rows
      const examData: ExamRow[] = [];
      for (const exam of allExams ?? []) {
        const subject = subjects.find((s) => s.id === exam.subject_id);
        if (!subject) continue;

        // Get total and completed sessions for this subject's topics
        const { data: chaptersForExam } = await supabase.from("chapters").select("id").eq("subject_id", subject.id);
        const chapterIds = (chaptersForExam ?? []).map((c) => c.id);
        let totalSessions = 0;
        let completedSessions = 0;
        if (chapterIds.length > 0) {
          const { data: topicsForExam } = await supabase.from("topics").select("id").in("chapter_id", chapterIds);
          const topicIds = (topicsForExam ?? []).map((t) => t.id);
          if (topicIds.length > 0) {
            const { data: sessionsForExam } = await supabase.from("study_sessions").select("status").in("topic_id", topicIds);
            totalSessions = sessionsForExam?.length ?? 0;
            completedSessions = sessionsForExam?.filter((s) => s.status === "completed").length ?? 0;
          }
        }

        // Collect last7 revision status and upcoming sessions for this exam's subject
        let examLast7: ("completed" | "missed" | "pending")[] = [];
        const examUpcoming: UpcomingSession[] = [];
        if (chapterIds.length > 0) {
          const { data: topicsForSessions } = await supabase.from("topics").select("id, name").in("chapter_id", chapterIds);
          for (const t of topicsForSessions ?? []) {
            const { data: tSess } = await supabase.from("study_sessions").select("status, scheduled_at")
              .eq("topic_id", t.id).order("scheduled_at", { ascending: false }).limit(10);
            for (const s of tSess ?? []) {
              if (s.status === "pending" && s.scheduled_at) {
                examUpcoming.push({ topicId: t.id, topicName: t.name, scheduledAt: new Date(s.scheduled_at) });
              }
            }
            examLast7.push(...(tSess ?? []).slice(0, 7).map((s) => s.status as "completed" | "missed" | "pending"));
          }
        }
        examLast7 = examLast7.slice(0, 7);

        // If no real sessions exist, generate mock revision data
        if (examLast7.length === 0) {
          const mockStatuses: ("completed" | "missed" | "pending")[] = ["completed", "missed"];
          examLast7 = Array.from({ length: 7 }, () => mockStatuses[Math.random() < 0.7 ? 0 : 1]);
        }

        const examUpTop3 = examUpcoming.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 3);

        examData.push({
          examId: exam.id, examName: exam.name, examDate: new Date(exam.date),
          subject, totalSessions, completedSessions, last7: examLast7, upcomingSessions: examUpTop3,
        });
      }

      setExamRows(examData.sort((a, b) => a.examDate.getTime() - b.examDate.getTime()));
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    setSubjectSaving(true);
    try {
      const { error } = await supabase.from("subjects").insert({ name: newSubjectName.trim(), color: newSubjectColor });
      if (error) throw error;
      setShowNewSubject(false);
      setNewSubjectName("");
      setNewSubjectColor(PRESET_COLORS[5]);
      await loadDashboard();
    } catch (err) { console.error(err); }
    finally { setSubjectSaving(false); }
  };

  const handleCreateExamSubject = async () => {
    if (!examName.trim() || !examDate) {
      setExamError("Exam name and date are required.");
      return;
    }
    if (examMode === "new" && (!examSubjectName.trim() || !examSyllabus.trim())) {
      setExamError("Subject name and syllabus are required for a new subject.");
      return;
    }
    if (examMode === "existing" && !examExistingSubjectId) {
      setExamError("Please select an existing subject.");
      return;
    }
    setExamError("");
    setExamSaving(true);
    try {
      let subjectId: string;

      if (examMode === "existing") {
        subjectId = examExistingSubjectId;
      } else {
        // Parse syllabus via API
        const res = await fetch("/api/parse-syllabus", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(geminiKey ? { "x-gemini-key": geminiKey } : {}),
          },
          body: JSON.stringify({ text: examSyllabus }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "Failed to parse syllabus");
        }
        const { chapters: parsedChapters } = await res.json();

        // Create subject
        const { data: subject, error: subErr } = await supabase.from("subjects")
          .insert({ name: examSubjectName.trim(), color: examSubjectColor })
          .select().single();
        if (subErr) throw subErr;
        subjectId = subject.id;

        // Create chapters + topics
        for (let i = 0; i < parsedChapters.length; i++) {
          const ch = parsedChapters[i];
          const { data: chapter, error: chErr } = await supabase.from("chapters")
            .insert({ subject_id: subjectId, name: ch.name, position: i })
            .select().single();
          if (chErr) throw chErr;
          if (ch.topics?.length) {
            await supabase.from("topics").insert(
              ch.topics.map((t: string, j: number) => ({
                chapter_id: chapter.id, name: t, position: j, importance: 0.5, confidence: 0,
              }))
            );
          }
        }
      }

      // Create exam (works for both modes)
      await supabase.from("exams").insert({ subject_id: subjectId, name: examName.trim(), date: examDate });

      setShowNewExamSubject(false);
      setExamSubjectName(""); setExamName(""); setExamDate(""); setExamSyllabus("");
      setExamSubjectColor(PRESET_COLORS[0]); setSyllabusFile(null); setExamExistingSubjectId("");
      await loadDashboard();
    } catch (err: unknown) {
      setExamError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setExamSaving(false); }
  };

  const handleQuickAddChapter = async () => {
    if (!quickChapter?.name.trim()) return;
    setSaving(true);
    try {
      const g = subjectGroups.find((x) => x.subject.id === quickChapter.subjectId);
      const { error } = await supabase.from("chapters").insert({
        subject_id: quickChapter.subjectId, name: quickChapter.name.trim(), position: g?.chapters.length ?? 0,
      });
      if (error) throw error;
      setQuickChapter(null); await loadDashboard();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleQuickAddTopic = async () => {
    if (!quickTopic?.name.trim()) return;
    setSaving(true);
    try {
      let topicCount = 0;
      for (const g of subjectGroups) {
        const c = g.chapters.find((ch) => ch.chapter.id === quickTopic.chapterId);
        if (c) { topicCount = c.topics.length; break; }
      }
      const { error } = await supabase.from("topics").insert({
        chapter_id: quickTopic.chapterId, name: quickTopic.name.trim(),
        position: topicCount, importance: 0.5, confidence: 0,
      });
      if (error) throw error;
      setQuickTopic(null); await loadDashboard();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const toggleChapter = (id: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (force !== undefined) { force ? next.add(id) : next.delete(id); }
      else { next.has(id) ? next.delete(id) : next.add(id); }
      return next;
    });
  };

  const handleStartStudy = () => {
    if (!nextStudy) return;
    setActiveSessionId(nextStudy.session.id);
    supabase.from("study_sessions").update({ started_at: new Date().toISOString() })
      .eq("id", nextStudy.session.id).then(() => setShowPrompt(true));
  };

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="px-8 py-8 space-y-6">
        <Skeleton className="h-14 w-full rounded-2xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const isEmpty = subjectGroups.length === 0;

  return (
    <div className="px-8 py-8 space-y-8 w-full">
      {/* ── Banner ── */}
      {nextStudy ? (
        <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 px-7 py-5 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400 mb-1">Up next</p>
            <Link href={`/topics/${nextStudy.topic.id}`} className="text-xl font-bold hover:underline">
              {nextStudy.topic.name}
            </Link>
          </div>
          <Link href={`/topics/${nextStudy.topic.id}`}>
            <Button onClick={handleStartStudy} className="rounded-xl text-sm font-medium px-5">
              <BookOpen className="mr-2 h-4 w-4" />Start session
            </Button>
          </Link>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 py-20 gap-4 text-center">
          <div className="h-12 w-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-zinc-400" />
          </div>
          <div>
            <p className="text-base font-semibold">Welcome to Rensei</p>
            <p className="text-sm text-zinc-400 mt-1">Add your first subject to get started</p>
          </div>
          <Button variant="outline" className="rounded-xl mt-1" onClick={() => setShowNewSubject(true)}>
            <Plus className="mr-2 h-4 w-4" />Add Subject
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-7 py-4 shadow-sm">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">You&apos;re on track!</p>
          <p className="text-sm text-zinc-400">No topics due right now.</p>
        </div>
      )}

      {/* ── Due Today ── */}
      {dueTodayTopics.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-7 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-2">Due Today</p>
          <div className="flex flex-wrap gap-2.5">
            {dueTodayTopics.map((dt) => (
              <Link
                key={dt.topicId}
                href={`/topics/${dt.topicId}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-1.5 hover:border-amber-300 dark:hover:border-amber-700 transition-colors shadow-sm"
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dt.subjectColor }} />
                {dt.topicName}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          BASE TABLE
      ══════════════════════════════════════ */}
      {!isEmpty && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3 px-1">
            Study Plan
          </h2>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm bg-white dark:bg-zinc-950 w-full">
            {subjectGroups.map((group, gi) => {
              const colGrid = "grid-cols-[1fr_170px_160px_220px]";

              return (
                <div key={group.subject.id} className={cn(gi > 0 && "border-t border-zinc-100 dark:border-zinc-800")}>
                  {/* Table header (per subject) */}
                  <div className={cn("grid border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60", colGrid)}>
                    <div className="px-6 py-2.5 flex items-center gap-2.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-zinc-200 dark:ring-zinc-700"
                        style={{ backgroundColor: group.subject.color }}
                      />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        {group.subject.name}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                      Time Since Revised
                    </div>
                    <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                      Last 7 Revisions
                    </div>
                    <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Next 3 Sessions
                    </div>
                  </div>

                  {/* Chapters */}
                  {group.chapters.map((ch) => {
                    const isOpen = expanded.has(ch.chapter.id);
                    const atRisk = ch.consecutiveMisses >= 3;

                    return (
                      <div key={ch.chapter.id}>
                        {/* Chapter row */}
                        <button
                          onClick={() => toggleChapter(ch.chapter.id)}
                          className={cn(
                            "w-full items-center text-left transition-colors group grid",
                            colGrid,
                            atRisk ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100/60" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                          )}
                        >
                          <div className="px-6 py-3.5 pl-10 flex items-center gap-2.5">
                            <span className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 transition-colors">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                            <span className="text-[14.5px] font-medium text-zinc-800 dark:text-zinc-200 tracking-tight">{ch.chapter.name}</span>
                            {atRisk && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded-full">
                                Behind
                              </span>
                            )}
                          </div>
                          <div className="px-4 py-3.5 text-[13px] text-zinc-400 tabular-nums">{timeSince(ch.lastRevised)}</div>
                          <div className="px-4 py-3.5"><RevisionPills outcomes={ch.last7} /></div>
                          <div className="px-4 py-3.5">
                            {ch.upcomingSessions.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {ch.upcomingSessions.map((us, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-xs text-zinc-500">
                                    <span className="font-medium text-zinc-600 dark:text-zinc-300 max-w-[90px] truncate">{us.topicName}</span>
                                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                    <span className="text-zinc-400">{format(us.scheduledAt, "MMM d")}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </div>
                        </button>

                        {/* Topics */}
                        {isOpen && (
                          <div className="border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30">
                            {ch.topics.map((tr) => {
                              const topicAtRisk = tr.consecutiveMisses >= 3;
                              return (
                                <Link
                                  href={`/topics/${tr.topic.id}`}
                                  key={tr.topic.id}
                                  className={cn(
                                    "grid items-center transition-colors group/topic",
                                    colGrid,
                                    topicAtRisk ? "hover:bg-red-50 dark:hover:bg-red-950/20" : "hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40"
                                  )}
                                >
                                  <div className="px-6 py-2.5 pl-16 flex items-center gap-2">
                                    <div className="h-px w-3 bg-zinc-300 dark:bg-zinc-700 shrink-0" />
                                    {topicAtRisk && <span className="text-red-400 text-xs shrink-0">⚠</span>}
                                    {tr.hasNotes && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" title="Has notes" />
                                    )}
                                    <span className="text-[13.5px] text-zinc-600 dark:text-zinc-400 group-hover/topic:text-zinc-900 dark:group-hover/topic:text-zinc-100 transition-colors">
                                      {tr.topic.name}
                                    </span>
                                  </div>
                                  <div className="px-4 py-2.5 text-[13px] text-zinc-400 tabular-nums">{timeSince(tr.lastRevised)}</div>
                                  <div className="px-4 py-2.5"><RevisionPills outcomes={tr.last7} /></div>
                                  <div className="px-4 py-2.5">
                                    {tr.upcomingSessions.length > 0 ? (
                                      <div className="flex flex-col gap-0.5">
                                        {tr.upcomingSessions.map((us, idx) => (
                                          <div key={idx} className="flex items-center gap-1 text-[11px] text-zinc-400">
                                            <span>{format(us.scheduledAt, "MMM d")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-zinc-300 dark:text-zinc-600">—</span>
                                    )}
                                  </div>
                                </Link>
                              );
                            })}

                            {/* Add topic */}
                            <div className="px-6 py-2 pl-[70px]">
                              {quickTopic?.chapterId === ch.chapter.id ? (
                                <QuickInput
                                  placeholder="Topic name…"
                                  value={quickTopic.name}
                                  onChange={(v) => setQuickTopic({ ...quickTopic, name: v })}
                                  onConfirm={handleQuickAddTopic}
                                  onCancel={() => setQuickTopic(null)}
                                  disabled={saving}
                                />
                              ) : (
                                <button
                                  onClick={() => {
                                    toggleChapter(ch.chapter.id, true);
                                    setQuickTopic({ chapterId: ch.chapter.id, name: "" });
                                  }}
                                  className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors py-0.5"
                                >
                                  <Plus className="h-3.5 w-3.5" />Add topic
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add chapter */}
                  <div className="px-6 py-3 pl-10 border-t border-zinc-100 dark:border-zinc-800/60">
                    {quickChapter?.subjectId === group.subject.id ? (
                      <QuickInput
                        placeholder="Chapter name…"
                        value={quickChapter.name}
                        onChange={(v) => setQuickChapter({ ...quickChapter, name: v })}
                        onConfirm={handleQuickAddChapter}
                        onCancel={() => setQuickChapter(null)}
                        disabled={saving}
                      />
                    ) : (
                      <button
                        onClick={() => setQuickChapter({ subjectId: group.subject.id, name: "" })}
                        className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors py-0.5"
                      >
                        <Plus className="h-3.5 w-3.5" />Add chapter
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add subject */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-3">
              <button
                onClick={() => setShowNewSubject(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />Add subject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          EXAM-CENTRIC TABLE
      ══════════════════════════════════════ */}
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3 px-1">
          Exam Tracker
        </h2>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm bg-white dark:bg-zinc-950 w-full">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_100px_160px_180px_220px] border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
            <div className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Subject / Exam</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Exam Date</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Days Left</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Last 7 Revisions</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Progress</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />Upcoming Sessions
            </div>
          </div>

          {examRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-zinc-400 text-center">
              No exams tracked yet. Add an exam subject below.
            </div>
          ) : (
            examRows.map((row) => {
              const daysLeft = differenceInDays(row.examDate, new Date());
              const pct = row.totalSessions > 0 ? Math.round((row.completedSessions / row.totalSessions) * 100) : 0;
              const urgent = daysLeft <= 7;
              return (
                <div
                  key={row.examId}
                  className={cn(
                    "grid grid-cols-[1fr_140px_100px_160px_180px_220px] items-center border-t border-zinc-100 dark:border-zinc-800",
                    urgent && "bg-red-50/40 dark:bg-red-950/10"
                  )}
                >
                  <Link href={`/subjects/${row.subject.id}`} className="px-6 py-4 flex items-center gap-2.5 hover:underline group">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.subject.color }} />
                    <div>
                      <p className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200 group-hover:underline">{row.subject.name}</p>
                      <p className="text-[12px] text-zinc-400">{row.examName}</p>
                    </div>
                  </Link>
                  <div className="px-4 py-4 text-[13px] text-zinc-500 tabular-nums">
                    {format(row.examDate, "MMM d, yyyy")}
                  </div>
                  <div className={cn("px-4 py-4 text-[13px] font-semibold tabular-nums", urgent ? "text-red-500" : "text-zinc-500")}>
                    {daysLeft < 0 ? "Passed" : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                  </div>
                  <div className="px-4 py-4">
                    <RevisionPills outcomes={row.last7} />
                  </div>
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-blue-500" : "bg-red-400")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] text-zinc-400 tabular-nums w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="px-4 py-4">
                    {row.upcomingSessions.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {row.upcomingSessions.map((us, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300 max-w-[100px] truncate">{us.topicName}</span>
                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
                            <span className="text-zinc-400">{format(us.scheduledAt, "MMM d")}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-300 dark:text-zinc-600">None planned</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Add exam subject */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-3">
            <button
              onClick={() => setShowNewExamSubject(true)}
              className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add exam subject
            </button>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {/* New Subject */}
      <Dialog open={showNewSubject} onOpenChange={setShowNewSubject}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Name</label>
              <input
                autoFocus
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
                placeholder="e.g. Mathematics"
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewSubjectColor(c)}
                    className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", newSubjectColor === c && "ring-2 ring-offset-2 ring-zinc-400")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowNewSubject(false)}>Cancel</Button>
              <Button className="rounded-xl" onClick={handleCreateSubject} disabled={subjectSaving || !newSubjectName.trim()}>
                {subjectSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Exam Subject */}
      <Dialog open={showNewExamSubject} onOpenChange={setShowNewExamSubject}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Exam</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Mode toggle */}
            <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-sm">
              {(["existing", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setExamMode(mode); setExamError(""); }}
                  className={cn(
                    "flex-1 py-2 font-medium transition-colors",
                    examMode === mode
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  {mode === "existing" ? "Existing subject" : "New subject"}
                </button>
              ))}
            </div>

            {/* Existing subject — just pick subject */}
            {examMode === "existing" ? (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Subject</label>
                <select
                  value={examExistingSubjectId}
                  onChange={(e) => setExamExistingSubjectId(e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900"
                >
                  <option value="">Select a subject…</option>
                  {subjectGroups.map((g) => (
                    <option key={g.subject.id} value={g.subject.id}>{g.subject.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              /* New subject — name + color + syllabus */
              <>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Subject Name</label>
                  <input
                    value={examSubjectName}
                    onChange={(e) => setExamSubjectName(e.target.value)}
                    placeholder="e.g. Physics"
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setExamSubjectColor(c)}
                        className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", examSubjectColor === c && "ring-2 ring-offset-2 ring-zinc-400")}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Syllabus</label>
                  <label
                    htmlFor="syllabus-file"
                    className={cn(
                      "flex items-center gap-3 w-full mb-2 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
                      syllabusFile
                        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
                        : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 bg-zinc-50 dark:bg-zinc-900"
                    )}
                  >
                    <input
                      id="syllabus-file"
                      type="file"
                      accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => handleSyllabusFileChange(e.target.files?.[0] ?? null)}
                    />
                    {extractingPdf ? (
                      <Loader2 className="h-4 w-4 text-zinc-400 shrink-0 animate-spin" />
                    ) : syllabusFile ? (
                      <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Paperclip className="h-4 w-4 text-zinc-400 shrink-0" />
                    )}
                    <span className="text-sm">
                      {extractingPdf ? (
                        <span className="text-zinc-400">Extracting text…</span>
                      ) : syllabusFile ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{syllabusFile.name}</span>
                      ) : (
                        <span className="text-zinc-400">
                          Upload PDF, image, TXT or MD —{" "}
                          <span className="text-zinc-500 dark:text-zinc-300 font-medium">click to browse</span>
                        </span>
                      )}
                    </span>
                    {syllabusFile && !extractingPdf && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setSyllabusFile(null); setExamSyllabus(""); }}
                        className="ml-auto text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </label>
                  <p className="text-[11px] text-zinc-400 mb-1.5">Or paste syllabus text below:</p>
                  <textarea
                    value={examSyllabus}
                    onChange={(e) => { setExamSyllabus(e.target.value); if (e.target.value === "") setSyllabusFile(null); }}
                    placeholder={`Unit 1: Mechanics\n  - Newton's Laws\n  - Work and Energy\n\nUnit 2: Waves\n  - Sound\n  - Light`}
                    rows={4}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900 placeholder:text-zinc-400 resize-none font-mono"
                  />
                </div>
              </>
            )}

            {/* Exam details — always shown */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Exam Name</label>
                <input
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. Final Exam"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 block mb-1.5">Exam Date</label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900"
                />
              </div>
            </div>

            {examError && <p className="text-xs text-red-500">{examError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="rounded-xl" onClick={() => { setShowNewExamSubject(false); setExamError(""); setSyllabusFile(null); }}>
                Cancel
              </Button>
              <Button className="rounded-xl" onClick={handleCreateExamSubject} disabled={examSaving}>
                {examSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {examSaving ? (examMode === "new" ? "Creating…" : "Saving…") : (examMode === "new" ? "Create & Plan" : "Add Exam")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {activeSessionId && (
        <StudyPromptDialog
          open={showPrompt}
          onOpenChange={setShowPrompt}
          sessionId={activeSessionId}
          topicId={nextStudy?.topic.id ?? ""}
          onComplete={() => { setActiveSessionId(null); loadDashboard(); }}
        />
      )}
    </div>
  );
}
