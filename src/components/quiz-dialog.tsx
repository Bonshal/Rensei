"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGeminiKey } from "@/hooks/use-gemini-key";
import { quizScoreToQuality } from "@/lib/planner/sm2";
import { toast } from "sonner";
import {
  Brain,
  CheckCircle2,
  XCircle,
  ChevronRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface MCQQuestion {
  question: string;
  type: "mcq";
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface FlashcardQuestion {
  question: string;
  type: "flashcard";
  answer: string;
  explanation: string;
}

interface ShortAnswerQuestion {
  question: string;
  type: "short_answer";
  answer: string;
  explanation: string;
}

type QuizQuestion = MCQQuestion | FlashcardQuestion | ShortAnswerQuestion;

interface QuizDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicName: string;
  topicNotes?: string;
  onComplete: (score: number, total: number, qualityScore: number) => void;
}

export function QuizDialog({
  open,
  onOpenChange,
  topicName,
  topicNotes,
  onComplete,
}: QuizDialogProps) {
  const { key: geminiKey } = useGeminiKey();
  const [quizType, setQuizType] = useState<"mcq" | "flashcard" | "short_answer">("mcq");
  const [questionCount, setQuestionCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selfAssessment, setSelfAssessment] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);

  const reset = () => {
    setQuestions([]);
    setCurrentIdx(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setSelfAssessment(null);
    setFinished(false);
  };

  const generateQuiz = async () => {
    if (!geminiKey) {
      toast.error("Set your Gemini API key in Settings first.");
      return;
    }

    setLoading(true);
    reset();
    try {
      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": geminiKey,
        },
        body: JSON.stringify({
          topicName,
          notes: topicNotes,
          quizType,
          questionCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate quiz");
      }

      const data = await res.json();
      setQuestions(data.questions);
    } catch (err: any) {
      toast.error(err.message || "Error generating quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleMCQAnswer = (optionIdx: number) => {
    if (showAnswer) return;
    setSelectedAnswer(optionIdx);
    setShowAnswer(true);
    const q = questions[currentIdx] as MCQQuestion;
    if (optionIdx === q.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleFlashcardReveal = () => {
    setShowAnswer(true);
  };

  const handleSelfAssess = (correct: boolean) => {
    setSelfAssessment(correct);
    if (correct) setScore((s) => s + 1);
  };

  const nextQuestion = () => {
    if (currentIdx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setCurrentIdx((i) => i + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
      setSelfAssessment(null);
    }
  };

  const handleFinish = () => {
    const total = questions.length;
    const quality = quizScoreToQuality(score, total);
    onComplete(score, total, quality);
    onOpenChange(false);
    reset();
  };

  const currentQ = questions[currentIdx];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Quiz: {topicName}
          </DialogTitle>
        </DialogHeader>

        {/* Setup screen */}
        {questions.length === 0 && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Question Type</Label>
                <Select
                  value={quizType}
                  onValueChange={(v) =>
                    setQuizType(v as "mcq" | "flashcard" | "short_answer")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">Multiple Choice</SelectItem>
                    <SelectItem value="flashcard">Flashcards</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Questions</Label>
                <Select
                  value={String(questionCount)}
                  onValueChange={(v) => setQuestionCount(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={generateQuiz} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Quiz
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {/* Quiz in progress */}
        {questions.length > 0 && !finished && currentQ && (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Question {currentIdx + 1} of {questions.length}
              </span>
              <span>Score: {score}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{
                  width: `${((currentIdx + 1) / questions.length) * 100}%`,
                }}
              />
            </div>

            {/* Question */}
            <p className="text-base font-medium">{currentQ.question}</p>

            {/* MCQ options */}
            {currentQ.type === "mcq" && (
              <div className="space-y-2">
                {(currentQ as MCQQuestion).options.map((opt, i) => {
                  const mcq = currentQ as MCQQuestion;
                  let variant: "outline" | "default" | "destructive" = "outline";
                  if (showAnswer) {
                    if (i === mcq.correctIndex) variant = "default";
                    else if (i === selectedAnswer) variant = "destructive";
                  }
                  return (
                    <Button
                      key={i}
                      variant={variant}
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => handleMCQAnswer(i)}
                      disabled={showAnswer}
                    >
                      <span className="font-mono mr-2 text-xs">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                      {showAnswer && i === mcq.correctIndex && (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />
                      )}
                      {showAnswer &&
                        i === selectedAnswer &&
                        i !== mcq.correctIndex && (
                          <XCircle className="ml-auto h-4 w-4" />
                        )}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Flashcard */}
            {currentQ.type === "flashcard" && (
              <div className="space-y-3">
                {!showAnswer ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleFlashcardReveal}
                  >
                    Reveal Answer
                  </Button>
                ) : (
                  <>
                    <div className="rounded-lg border bg-muted p-4">
                      <p className="text-sm font-medium">
                        {(currentQ as FlashcardQuestion).answer}
                      </p>
                    </div>
                    {selfAssessment === null && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleSelfAssess(false)}
                        >
                          <XCircle className="mr-2 h-4 w-4 text-red-500" />
                          Got it wrong
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleSelfAssess(true)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                          Got it right
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Short answer */}
            {currentQ.type === "short_answer" && (
              <div className="space-y-3">
                {!showAnswer ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowAnswer(true)}
                  >
                    Show Answer
                  </Button>
                ) : (
                  <>
                    <div className="rounded-lg border bg-muted p-4">
                      <p className="text-sm font-medium">
                        {(currentQ as ShortAnswerQuestion).answer}
                      </p>
                    </div>
                    {selfAssessment === null && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleSelfAssess(false)}
                        >
                          <XCircle className="mr-2 h-4 w-4 text-red-500" />
                          Wrong
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleSelfAssess(true)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                          Correct
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Explanation */}
            {showAnswer && currentQ.explanation && (
              <p className="text-xs text-muted-foreground italic">
                {currentQ.explanation}
              </p>
            )}

            {/* Next button */}
            {showAnswer &&
              (currentQ.type === "mcq" || selfAssessment !== null) && (
                <Button onClick={nextQuestion} className="w-full">
                  {currentIdx + 1 >= questions.length ? (
                    "See Results"
                  ) : (
                    <>
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
          </div>
        )}

        {/* Results screen */}
        {finished && (
          <div className="space-y-4 text-center py-4">
            <div className="text-4xl font-bold">
              {score}/{questions.length}
            </div>
            <p className="text-muted-foreground">
              {score === questions.length
                ? "Perfect score! 🎉"
                : score >= questions.length * 0.7
                ? "Great job! 👏"
                : score >= questions.length * 0.5
                ? "Not bad, keep practicing! 📚"
                : "Keep studying, you'll get there! 💪"}
            </p>
            <Badge
              variant={
                score >= questions.length * 0.7
                  ? "default"
                  : score >= questions.length * 0.5
                  ? "secondary"
                  : "destructive"
              }
            >
              Quality Score: {quizScoreToQuality(score, questions.length)}/5
            </Badge>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  reset();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button className="flex-1" onClick={handleFinish}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
