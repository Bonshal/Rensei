"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGeminiKey } from "@/hooks/use-gemini-key";
import { toast } from "sonner";
import { Upload, FileText, Sparkles, Check, X, Plus, Trash2 } from "lucide-react";

interface ParsedChapter {
  name: string;
  topics: string[];
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#0ea5e9",
];

export default function NewSubjectPage() {
  const router = useRouter();
  const { key: geminiKey } = useGeminiKey();
  const [subjectName, setSubjectName] = useState("");
  const [subjectColor, setSubjectColor] = useState(COLORS[0]);
  const [mode, setMode] = useState<"manual" | "upload">("upload");

  // Upload state
  const [syllabusText, setSyllabusText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);

  // Parsed chapters state (editable approval table)
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);
  const [showApproval, setShowApproval] = useState(false);

  // Manual state
  const [manualChapters, setManualChapters] = useState<ParsedChapter[]>([
    { name: "", topics: [""] },
  ]);

  const [saving, setSaving] = useState(false);

  const handleParseSyllabus = async () => {
    if (!geminiKey) {
      toast.error("Set your Gemini API key in Settings first.");
      return;
    }
    const textToParse = syllabusText.trim();
    if (!textToParse && !pdfFile) {
      toast.error("Paste syllabus text or upload a PDF.");
      return;
    }

    setParsing(true);
    try {
      let content = textToParse;

      // If PDF is uploaded, extract text from it
      if (pdfFile && !content) {
        const formData = new FormData();
        formData.append("file", pdfFile);
        const extractRes = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });
        if (!extractRes.ok) throw new Error("Failed to extract PDF text.");
        const extracted = await extractRes.json();
        content = extracted.text;
      }

      // Send to Gemini via our API route
      const res = await fetch("/api/parse-syllabus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": geminiKey,
        },
        body: JSON.stringify({ text: content }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to parse syllabus");
      }

      const data = await res.json();
      setParsedChapters(data.chapters);
      setShowApproval(true);
      toast.success("Syllabus parsed! Review the chapters below.");
    } catch (err: any) {
      toast.error(err.message || "Error parsing syllabus");
    } finally {
      setParsing(false);
    }
  };

  // Approval table edit handlers
  const updateChapterName = (idx: number, name: string) => {
    setParsedChapters((prev) =>
      prev.map((ch, i) => (i === idx ? { ...ch, name } : ch))
    );
  };

  const updateTopicName = (chIdx: number, tIdx: number, name: string) => {
    setParsedChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx
          ? {
              ...ch,
              topics: ch.topics.map((t, j) => (j === tIdx ? name : t)),
            }
          : ch
      )
    );
  };

  const addTopic = (chIdx: number) => {
    setParsedChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx ? { ...ch, topics: [...ch.topics, ""] } : ch
      )
    );
  };

  const removeTopic = (chIdx: number, tIdx: number) => {
    setParsedChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx
          ? { ...ch, topics: ch.topics.filter((_, j) => j !== tIdx) }
          : ch
      )
    );
  };

  const addChapter = () => {
    setParsedChapters((prev) => [...prev, { name: "", topics: [""] }]);
  };

  const removeChapter = (idx: number) => {
    setParsedChapters((prev) => prev.filter((_, i) => i !== idx));
  };

  // Manual chapter handlers
  const updateManualChapterName = (idx: number, name: string) => {
    setManualChapters((prev) =>
      prev.map((ch, i) => (i === idx ? { ...ch, name } : ch))
    );
  };

  const updateManualTopicName = (chIdx: number, tIdx: number, name: string) => {
    setManualChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx
          ? {
              ...ch,
              topics: ch.topics.map((t, j) => (j === tIdx ? name : t)),
            }
          : ch
      )
    );
  };

  const addManualTopic = (chIdx: number) => {
    setManualChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx ? { ...ch, topics: [...ch.topics, ""] } : ch
      )
    );
  };

  const removeManualTopic = (chIdx: number, tIdx: number) => {
    setManualChapters((prev) =>
      prev.map((ch, i) =>
        i === chIdx
          ? { ...ch, topics: ch.topics.filter((_, j) => j !== tIdx) }
          : ch
      )
    );
  };

  const addManualChapter = () => {
    setManualChapters((prev) => [...prev, { name: "", topics: [""] }]);
  };

  const removeManualChapter = (idx: number) => {
    setManualChapters((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const chapters = mode === "upload" ? parsedChapters : manualChapters;

    if (!subjectName.trim()) {
      toast.error("Subject name is required.");
      return;
    }

    const validChapters = chapters.filter((ch) => ch.name.trim());
    if (validChapters.length === 0) {
      toast.error("Add at least one chapter.");
      return;
    }

    setSaving(true);
    try {
      // Create subject
      const { data: subject, error: subjectErr } = await supabase
        .from("subjects")
        .insert({ name: subjectName.trim(), color: subjectColor })
        .select()
        .single();

      if (subjectErr) throw subjectErr;

      // Create chapters and topics
      for (let i = 0; i < validChapters.length; i++) {
        const ch = validChapters[i];
        const { data: chapter, error: chErr } = await supabase
          .from("chapters")
          .insert({
            subject_id: subject.id,
            name: ch.name.trim(),
            position: i,
          })
          .select()
          .single();

        if (chErr) throw chErr;

        const validTopics = ch.topics.filter((t) => t.trim());
        if (validTopics.length > 0) {
          const topicInserts = validTopics.map((t, j) => ({
            chapter_id: chapter.id,
            name: t.trim(),
            position: j,
            importance: 0.5,
            confidence: 0,
          }));

          const { error: tErr } = await supabase
            .from("topics")
            .insert(topicInserts);

          if (tErr) throw tErr;
        }
      }

      toast.success(`Subject "${subjectName}" created!`);
      router.push(`/subjects/${subject.id}`);
    } catch (err: any) {
      toast.error(err.message || "Error saving subject");
    } finally {
      setSaving(false);
    }
  };

  const chaptersToRender = mode === "upload" ? parsedChapters : manualChapters;
  const chapterHandlers =
    mode === "upload"
      ? {
          updateName: updateChapterName,
          updateTopic: updateTopicName,
          addTopic,
          removeTopic,
          addChapter,
          removeChapter,
        }
      : {
          updateName: updateManualChapterName,
          updateTopic: updateManualTopicName,
          addTopic: addManualTopic,
          removeTopic: removeManualTopic,
          addChapter: addManualChapter,
          removeChapter: removeManualChapter,
        };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Subject</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add manually or upload a syllabus for AI-powered parsing
        </p>
      </div>

      {/* Subject name & color */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subject Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              placeholder="e.g. Mathematics"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSubjectColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    subjectColor === c
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode tabs */}
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "manual" | "upload")}
      >
        <TabsList className="w-full">
          <TabsTrigger value="upload" className="flex-1">
            <Sparkles className="mr-2 h-4 w-4" />
            Upload Syllabus
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex-1">
            <FileText className="mr-2 h-4 w-4" />
            Add Manually
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4 space-y-4">
          {!showApproval ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Paste or Upload Syllabus
                </CardTitle>
                <CardDescription>
                  The AI will extract chapters and topics from your syllabus
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Paste syllabus text here..."
                  rows={8}
                  value={syllabusText}
                  onChange={(e) => setSyllabusText(e.target.value)}
                />
                <div className="flex items-center gap-4">
                  <div>
                    <Label
                      htmlFor="pdf-upload"
                      className="cursor-pointer flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Upload className="h-4 w-4" />
                      Upload PDF instead
                    </Label>
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPdfFile(file);
                          toast.info(`Selected: ${file.name}`);
                        }
                      }}
                    />
                  </div>
                  {pdfFile && (
                    <Badge variant="secondary">
                      {pdfFile.name}
                      <button
                        className="ml-1"
                        onClick={() => setPdfFile(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>

                <Button
                  onClick={handleParseSyllabus}
                  disabled={parsing || (!syllabusText.trim() && !pdfFile)}
                  className="w-full"
                >
                  {parsing ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Parse with AI
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* Approval table for parsed chapters */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Review Parsed Chapters
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApproval(false)}
                >
                  Re-parse
                </Button>
              </div>
              <ChapterEditor
                chapters={parsedChapters}
                handlers={chapterHandlers}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual" className="mt-4 space-y-4">
          <ChapterEditor
            chapters={manualChapters}
            handlers={chapterHandlers}
          />
        </TabsContent>
      </Tabs>

      {/* Save button */}
      {(mode === "manual" || showApproval) && (
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full"
          size="lg"
        >
          {saving ? "Saving..." : "Create Subject"}
        </Button>
      )}
    </div>
  );
}

function ChapterEditor({
  chapters,
  handlers,
}: {
  chapters: ParsedChapter[];
  handlers: {
    updateName: (idx: number, name: string) => void;
    updateTopic: (chIdx: number, tIdx: number, name: string) => void;
    addTopic: (chIdx: number) => void;
    removeTopic: (chIdx: number, tIdx: number) => void;
    addChapter: () => void;
    removeChapter: (idx: number) => void;
  };
}) {
  return (
    <div className="space-y-4">
      {chapters.map((ch, chIdx) => (
        <Card key={chIdx}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                Ch {chIdx + 1}
              </Badge>
              <Input
                placeholder="Chapter name"
                value={ch.name}
                onChange={(e) => handlers.updateName(chIdx, e.target.value)}
                className="font-medium"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handlers.removeChapter(chIdx)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            <div className="pl-10 space-y-2">
              {ch.topics.map((topic, tIdx) => (
                <div key={tIdx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">
                    {tIdx + 1}.
                  </span>
                  <Input
                    placeholder="Topic name"
                    value={topic}
                    onChange={(e) =>
                      handlers.updateTopic(chIdx, tIdx, e.target.value)
                    }
                    className="text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlers.removeTopic(chIdx, tIdx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlers.addTopic(chIdx)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Topic
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" className="w-full" onClick={handlers.addChapter}>
        <Plus className="mr-2 h-4 w-4" />
        Add Chapter
      </Button>
    </div>
  );
}
