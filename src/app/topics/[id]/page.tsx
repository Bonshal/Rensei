"use client";

import { useEffect, useRef, useState, use } from "react";
import { supabase } from "@/lib/supabase";
import { Topic, Note, PlannerLog, StudySession } from "@/lib/database.types";
import { completeSession, DEFAULT_REVISED_QUALITY, ensurePendingSessionForTopic, NOT_REVISED_QUALITY } from "@/lib/planner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Brain,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function normalizeMarkdownToStudyText(content: string) {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: topicId } = use(params);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [logs, setLogs] = useState<PlannerLog[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [pendingSession, setPendingSession] = useState<StudySession | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRevisePrompt, setShowRevisePrompt] = useState(false);
  const hasLoadedInitialNote = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: topicData } = await supabase
        .from("topics")
        .select("*")
        .eq("id", topicId)
        .single();
      setTopic(topicData);

      const { data: noteData } = await supabase
        .from("notes")
        .select("*")
        .eq("topic_id", topicId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      setNote(noteData);
      setNoteContent(normalizeMarkdownToStudyText(noteData?.content || ""));
      hasLoadedInitialNote.current = true;

      const { data: logsData } = await supabase
        .from("planner_logs")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(5);
      setLogs(logsData || []);

      const { data: sessionsData } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("topic_id", topicId)
        .order("scheduled_at", { ascending: false })
        .limit(20);
      setSessions(sessionsData || []);

      // Check for active pending session
      const pending = (sessionsData || []).find(
        (s) => s.status === "pending" || (s.started_at && !s.completed_at)
      );
      setPendingSession(pending || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [topicId]);

  useEffect(() => {
    if (!hasLoadedInitialNote.current) return;
    if (noteContent === (note?.content ?? "")) return;

    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        if (note) {
          await supabase
            .from("notes")
            .update({
              content: noteContent,
              updated_at: new Date().toISOString(),
            })
            .eq("id", note.id);
          setNote((prev) => (prev ? { ...prev, content: noteContent, updated_at: new Date().toISOString() } : prev));
        } else {
          const { data: created } = await supabase
            .from("notes")
            .insert({
              topic_id: topicId,
              content: noteContent,
              is_ai_generated: false,
            })
            .select("*")
            .single();
          if (created) setNote(created);
        }

        if (noteContent.trim()) {
          await ensurePendingSessionForTopic(topicId);
        }
      } catch (err) {
        toast.error("Failed to auto-save notes");
      } finally {
        setSaving(false);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [noteContent, note, topicId]);

  const handleRevised = async (didRevise: boolean) => {
    if (!pendingSession) return;
    try {
      const quality = didRevise ? DEFAULT_REVISED_QUALITY : NOT_REVISED_QUALITY;
      await completeSession(pendingSession.id, quality);
      toast.success(
        didRevise
          ? "Session recorded! Next revision scheduled."
          : "Session marked. Topic will come back sooner."
      );
      setShowRevisePrompt(false);
      loadData();
    } catch (err) {
      toast.error("Failed to record session");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="p-8">
        <p>Topic not found.</p>
        <Link href="/subjects">
          <Button variant="link">Back to subjects</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/subjects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{topic.name}</h1>
          {topic.summary && (
            <p className="text-sm text-muted-foreground">{topic.summary}</p>
          )}
        </div>
        <Badge
          variant={
            topic.confidence >= 0.7
              ? "default"
              : topic.confidence >= 0.4
              ? "secondary"
              : "destructive"
          }
        >
          Confidence: {Math.round(topic.confidence * 100)}%
        </Badge>
      </div>

      {/* Revise prompt */}
      {pendingSession && !showRevisePrompt && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <p className="font-medium">
              You have an active session for this topic.
            </p>
            <Button onClick={() => setShowRevisePrompt(true)}>
              Mark as Done
            </Button>
          </CardContent>
        </Card>
      )}

      {showRevisePrompt && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <p className="font-medium mb-3">Did you revise this topic?</p>
            <div className="flex gap-3">
              <Button onClick={() => handleRevised(true)}>
                Yes, I revised
              </Button>
              <Button variant="outline" onClick={() => handleRevised(false)}>
                No, I didn&apos;t
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Notes</CardTitle>
            <span className="text-xs text-muted-foreground">
              {saving ? "Auto-saving..." : "Auto-save on"}
            </span>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[calc(100vh-220px)] font-mono text-sm"
              placeholder="Write your study notes here..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
            />
            {note?.is_ai_generated && (
              <Badge variant="outline" className="mt-2 text-xs">
                <Brain className="mr-1 h-3 w-3" />
                AI-generated
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
