"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StudySession, Subject, Topic } from "@/lib/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, BarChart3, Target } from "lucide-react";
import { format, startOfDay, addDays, isSameDay } from "date-fns";
import { getExamReadiness } from "@/lib/planner/exam-planner";

interface SessionWithTopic extends StudySession {
  topicName: string;
  subjectName: string;
  subjectColor: string;
}

interface ExamReadinessData {
  exam: { name: string; date: string };
  daysUntilExam: number;
  totalTopics: number;
  reviewedTopics: number;
  avgConfidence: number;
  atRiskTopics: Topic[];
}

export default function PlannerPage() {
  const [sessions, setSessions] = useState<SessionWithTopic[]>([]);
  const [readinessData, setReadinessData] = useState<
    { subjectName: string; readiness: ExamReadinessData }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all subjects
      const { data: subjects } = await supabase
        .from("subjects")
        .select("*");

      if (!subjects) {
        setLoading(false);
        return;
      }

      // Load upcoming sessions with topic and subject info
      const allSessions: SessionWithTopic[] = [];
      const allReadiness: { subjectName: string; readiness: ExamReadinessData }[] = [];

      for (const subject of subjects) {
        const { data: chapters } = await supabase
          .from("chapters")
          .select("id")
          .eq("subject_id", subject.id);

        if (!chapters || chapters.length === 0) continue;

        const chapterIds = chapters.map((c) => c.id);
        const { data: topics } = await supabase
          .from("topics")
          .select("*")
          .in("chapter_id", chapterIds);

        if (!topics) continue;

        const topicIds = topics.map((t) => t.id);
        const { data: sessionsData } = await supabase
          .from("study_sessions")
          .select("*")
          .in("topic_id", topicIds)
          .eq("status", "pending")
          .order("scheduled_at", { ascending: true })
          .limit(50);

        for (const session of sessionsData || []) {
          const topic = topics.find((t) => t.id === session.topic_id);
          allSessions.push({
            ...session,
            topicName: topic?.name || "Unknown",
            subjectName: subject.name,
            subjectColor: subject.color,
          });
        }

        // Get exam readiness
        const readiness = await getExamReadiness(subject.id);
        if (readiness) {
          allReadiness.push({
            subjectName: subject.name,
            readiness: readiness as ExamReadinessData,
          });
        }
      }

      allSessions.sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
      );

      setSessions(allSessions);
      setReadinessData(allReadiness);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Group sessions by day
  const groupedByDay = sessions.reduce<
    Record<string, SessionWithTopic[]>
  >((acc, session) => {
    const dayKey = format(new Date(session.scheduled_at), "yyyy-MM-dd");
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(session);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Planner
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View your upcoming study schedule and exam readiness
        </p>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">
            <Calendar className="mr-2 h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="readiness">
            <Target className="mr-2 h-4 w-4" />
            Exam Readiness
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4 space-y-4">
          {Object.keys(groupedByDay).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No upcoming sessions scheduled.
                </p>
                <p className="text-sm text-muted-foreground">
                  Add subjects and topics to generate a study plan.
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedByDay).map(([day, daySessions]) => {
              const dayDate = new Date(day);
              const isToday = isSameDay(dayDate, new Date());
              const isTomorrow = isSameDay(dayDate, addDays(new Date(), 1));

              return (
                <Card key={day}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {isToday ? (
                        <Badge>Today</Badge>
                      ) : isTomorrow ? (
                        <Badge variant="secondary">Tomorrow</Badge>
                      ) : null}
                      {format(dayDate, "EEEE, MMMM d, yyyy")}
                      <Badge variant="outline" className="ml-auto">
                        {daySessions.length} session
                        {daySessions.length !== 1 ? "s" : ""}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {daySessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: session.subjectColor,
                              }}
                            />
                            <div>
                              <p className="text-sm font-medium">
                                {session.topicName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {session.subjectName}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {session.source}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="readiness" className="mt-4 space-y-4">
          {readinessData.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No upcoming exams found.
                </p>
                <p className="text-sm text-muted-foreground">
                  Add an exam to a subject to see readiness tracking.
                </p>
              </CardContent>
            </Card>
          ) : (
            readinessData.map((item) => (
              <Card key={item.subjectName}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>
                      {item.subjectName} — {item.readiness.exam.name}
                    </span>
                    <Badge
                      variant={
                        item.readiness.daysUntilExam <= 3
                          ? "destructive"
                          : item.readiness.daysUntilExam <= 7
                          ? "secondary"
                          : "default"
                      }
                    >
                      {item.readiness.daysUntilExam} days left
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {item.readiness.reviewedTopics}/
                        {item.readiness.totalTopics}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Topics Reviewed
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {item.readiness.avgConfidence}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Avg Confidence
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-500">
                        {item.readiness.atRiskTopics.length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        At-Risk Topics
                      </p>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        item.readiness.avgConfidence >= 70
                          ? "bg-green-500"
                          : item.readiness.avgConfidence >= 40
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{
                        width: `${item.readiness.avgConfidence}%`,
                      }}
                    />
                  </div>

                  {/* At-risk topics */}
                  {item.readiness.atRiskTopics.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">
                        At-Risk Topics:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {item.readiness.atRiskTopics.map((topic) => (
                          <Badge
                            key={topic.id}
                            variant="destructive"
                            className="text-xs"
                          >
                            {topic.name} (
                            {Math.round(topic.confidence * 100)}%)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
