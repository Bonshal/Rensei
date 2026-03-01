"use client";

import { useEffect, useState, use } from "react";
import { supabase } from "@/lib/supabase";
import { Subject, Chapter, Topic, Exam } from "@/lib/database.types";
import { createInitialSessions } from "@/lib/planner";
import { generateExamPlan } from "@/lib/planner/exam-planner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Calendar,
  GraduationCap,
  ArrowLeft,
  Play,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface ChapterWithTopics extends Chapter {
  topics: Topic[];
}

export default function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<ChapterWithTopics[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set()
  );

  // Dialog state
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  // Form state
  const [newChapterName, setNewChapterName] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicSummary, setNewTopicSummary] = useState("");
  const [newExamName, setNewExamName] = useState("");
  const [newExamDate, setNewExamDate] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: subjectData } = await supabase
        .from("subjects")
        .select("*")
        .eq("id", subjectId)
        .single();

      setSubject(subjectData);

      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("*")
        .eq("subject_id", subjectId)
        .order("order", { ascending: true });

      const chaptersWithTopics: ChapterWithTopics[] = [];
      for (const chapter of chaptersData || []) {
        const { data: topicsData } = await supabase
          .from("topics")
          .select("*")
          .eq("chapter_id", chapter.id)
          .order("order", { ascending: true });

        chaptersWithTopics.push({
          ...chapter,
          topics: topicsData || [],
        });
      }

      setChapters(chaptersWithTopics);

      // Expand all chapters by default
      setExpandedChapters(
        new Set(chaptersWithTopics.map((c) => c.id))
      );

      const { data: examsData } = await supabase
        .from("exams")
        .select("*")
        .eq("subject_id", subjectId)
        .order("date", { ascending: true });

      setExams(examsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subjectId]);

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const addChapter = async () => {
    if (!newChapterName.trim()) return;
    try {
      const { error } = await supabase.from("chapters").insert({
        subject_id: subjectId,
        name: newChapterName.trim(),
        position: chapters.length,
      });
      if (error) throw error;
      toast.success("Chapter added");
      setNewChapterName("");
      setChapterDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error("Failed to add chapter");
      console.error(err);
    }
  };

  const addTopic = async () => {
    if (!newTopicName.trim() || !activeChapterId) return;
    try {
      const chapter = chapters.find((c) => c.id === activeChapterId);
      const { error } = await supabase.from("topics").insert({
        chapter_id: activeChapterId,
        name: newTopicName.trim(),
        summary: newTopicSummary.trim() || null,
        position: chapter?.topics.length ?? 0,
      });
      if (error) throw error;

      // Also create default empty notes
      const { data: newTopic } = await supabase
        .from("topics")
        .select("id")
        .eq("chapter_id", activeChapterId)
        .eq("name", newTopicName.trim())
        .single();

      if (newTopic) {
        await supabase.from("notes").insert({
          topic_id: newTopic.id,
          content: "",
          is_ai_generated: false,
        });
      }

      toast.success("Topic added");
      setNewTopicName("");
      setNewTopicSummary("");
      setTopicDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error("Failed to add topic");
      console.error(err);
    }
  };

  const addExam = async () => {
    if (!newExamName.trim() || !newExamDate) return;
    try {
      const { data: exam, error } = await supabase
        .from("exams")
        .insert({
          subject_id: subjectId,
          name: newExamName.trim(),
          date: newExamDate,
        })
        .select()
        .single();
      if (error) throw error;

      // Trigger exam plan generation
      if (exam) {
        await generateExamPlan(subjectId, exam.id);
        toast.success("Exam added — study plan generated!");
      }

      setNewExamName("");
      setNewExamDate("");
      setExamDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error("Failed to add exam");
      console.error(err);
    }
  };

  const deleteChapter = async (chapterId: string) => {
    if (!confirm("Delete this chapter and all its topics?")) return;
    try {
      await supabase.from("chapters").delete().eq("id", chapterId);
      toast.success("Chapter deleted");
      loadData();
    } catch (err) {
      toast.error("Failed to delete chapter");
    }
  };

  const deleteTopic = async (topicId: string) => {
    if (!confirm("Delete this topic?")) return;
    try {
      await supabase.from("topics").delete().eq("id", topicId);
      toast.success("Topic deleted");
      loadData();
    } catch (err) {
      toast.error("Failed to delete topic");
    }
  };

  const deleteExam = async (examId: string) => {
    if (!confirm("Delete this exam? This will remove the exam-based schedule.")) return;
    try {
      await supabase.from("exams").delete().eq("id", examId);
      toast.success("Exam deleted");
      loadData();
    } catch (err) {
      toast.error("Failed to delete exam");
    }
  };

  const generateSessions = async () => {
    try {
      await createInitialSessions(subjectId);
      toast.success("Study sessions generated!");
    } catch (err) {
      toast.error("Failed to generate sessions");
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

  if (!subject) {
    return (
      <div className="p-8">
        <p>Subject not found.</p>
        <Link href="/subjects">
          <Button variant="link" className="mt-2">
            Back to subjects
          </Button>
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
        <div className="flex items-center gap-3 flex-1">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
          <h1 className="text-2xl font-bold">{subject.name}</h1>
        </div>
        <Button variant="outline" onClick={generateSessions}>
          <Play className="mr-2 h-4 w-4" />
          Generate Sessions
        </Button>
      </div>

      {/* Exams Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Exams
          </CardTitle>
          <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3 w-3" />
                Add Exam
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Exam</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Exam Name</Label>
                  <Input
                    placeholder="e.g., Midterm, Final Exam"
                    value={newExamName}
                    onChange={(e) => setNewExamName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exam Date</Label>
                  <Input
                    type="date"
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={addExam}
                  disabled={!newExamName.trim() || !newExamDate}
                >
                  Add Exam & Generate Plan
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exams scheduled. Add an exam to enable exam-centric planning.
            </p>
          ) : (
            <div className="space-y-2">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{exam.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(exam.date).toLocaleDateString()} (
                        {formatDistanceToNow(new Date(exam.date), {
                          addSuffix: true,
                        })}
                        )
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteExam(exam.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chapters & Topics */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Chapters & Topics</CardTitle>
          <Dialog open={chapterDialogOpen} onOpenChange={setChapterDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3 w-3" />
                Add Chapter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Chapter</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Chapter Name</Label>
                  <Input
                    placeholder="e.g., Chapter 1: Introduction"
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addChapter()}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={addChapter}
                  disabled={!newChapterName.trim()}
                >
                  Add Chapter
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No chapters yet. Add a chapter to organize your topics.
            </p>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <div key={chapter.id} className="rounded-lg border">
                  {/* Chapter header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expandedChapters.has(chapter.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{chapter.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {chapter.topics.length} topics
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChapterId(chapter.id);
                          setTopicDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Topic
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChapter(chapter.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Topics list */}
                  {expandedChapters.has(chapter.id) &&
                    chapter.topics.length > 0 && (
                      <div className="border-t">
                        {chapter.topics.map((topic) => (
                          <div
                            key={topic.id}
                            className="flex items-center justify-between px-4 py-2.5 pl-10 hover:bg-accent/30 transition-colors"
                          >
                            <Link
                              href={`/topics/${topic.id}`}
                              className="flex-1"
                            >
                              <div>
                                <p className="text-sm font-medium hover:underline">
                                  {topic.name}
                                </p>
                                {topic.summary && (
                                  <p className="text-xs text-muted-foreground">
                                    {topic.summary}
                                  </p>
                                )}
                              </div>
                            </Link>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  topic.confidence >= 0.7
                                    ? "default"
                                    : topic.confidence >= 0.4
                                    ? "secondary"
                                    : "destructive"
                                }
                                className="text-xs"
                              >
                                {Math.round(topic.confidence * 100)}%
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteTopic(topic.id)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Topic Dialog */}
      <Dialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Topic Name</Label>
              <Input
                placeholder="e.g., Newton's Laws of Motion"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Summary (optional)</Label>
              <Input
                placeholder="One-line summary"
                value={newTopicSummary}
                onChange={(e) => setNewTopicSummary(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTopic()}
              />
            </div>
            <Button
              className="w-full"
              onClick={addTopic}
              disabled={!newTopicName.trim()}
            >
              Add Topic
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
