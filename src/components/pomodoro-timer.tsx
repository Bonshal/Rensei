"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Timer, Play, Pause, RotateCcw, SkipForward } from "lucide-react";

interface PomodoroTimerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicName: string;
  /** Duration in minutes. If provided, use this instead of default 25. */
  durationMinutes?: number;
  onComplete: (elapsedSeconds: number) => void;
}

type TimerPhase = "focus" | "break" | "done";

export function PomodoroTimer({
  open,
  onOpenChange,
  topicName,
  durationMinutes = 25,
  onComplete,
}: PomodoroTimerProps) {
  const breakMinutes = 5;
  const [phase, setPhase] = useState<TimerPhase>("focus");
  const [totalSeconds, setTotalSeconds] = useState(durationMinutes * 60);
  const [remaining, setRemaining] = useState(durationMinutes * 60);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when dialog opens/closes or duration changes
  useEffect(() => {
    if (open) {
      setPhase("focus");
      setTotalSeconds(durationMinutes * 60);
      setRemaining(durationMinutes * 60);
      setRunning(false);
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, durationMinutes]);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            // Phase complete
            if (phase === "focus") {
              setPhase("break");
              setTotalSeconds(breakMinutes * 60);
              setRunning(false);
              return breakMinutes * 60;
            } else {
              setPhase("done");
              setRunning(false);
              return 0;
            }
          }
          return r - 1;
        });
        if (phase === "focus") {
          setElapsed((e) => e + 1);
        }
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, remaining, phase]);

  const toggleRunning = () => setRunning((r) => !r);

  const resetTimer = () => {
    setRunning(false);
    if (phase === "focus") {
      setRemaining(durationMinutes * 60);
      setTotalSeconds(durationMinutes * 60);
    } else if (phase === "break") {
      setRemaining(breakMinutes * 60);
      setTotalSeconds(breakMinutes * 60);
    }
  };

  const skipPhase = () => {
    setRunning(false);
    if (phase === "focus") {
      setPhase("break");
      setTotalSeconds(breakMinutes * 60);
      setRemaining(breakMinutes * 60);
    } else {
      setPhase("done");
      setRemaining(0);
    }
  };

  const handleDone = () => {
    onComplete(elapsed);
    onOpenChange(false);
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress =
    totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {phase === "focus"
              ? "Focus Time"
              : phase === "break"
              ? "Break Time"
              : "Session Complete"}
          </DialogTitle>
        </DialogHeader>

        <div className="text-center space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{topicName}</p>

          <Badge
            variant={
              phase === "focus"
                ? "default"
                : phase === "break"
                ? "secondary"
                : "outline"
            }
          >
            {phase === "focus"
              ? "🎯 Focus"
              : phase === "break"
              ? "☕ Break"
              : "✅ Done"}
          </Badge>

          {phase !== "done" ? (
            <>
              {/* Circular progress */}
              <div className="relative w-48 h-48 mx-auto">
                <svg
                  className="w-full h-full -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-gray-200"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${
                      2 * Math.PI * 42 * (1 - progress / 100)
                    }`}
                    strokeLinecap="round"
                    className={
                      phase === "focus"
                        ? "text-primary transition-all duration-1000"
                        : "text-green-500 transition-all duration-1000"
                    }
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-mono font-bold tabular-nums">
                    {String(minutes).padStart(2, "0")}:
                    {String(seconds).padStart(2, "0")}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="icon" onClick={resetTimer}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button size="lg" onClick={toggleRunning} className="px-8">
                  {running ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" /> Start
                    </>
                  )}
                </Button>
                <Button variant="outline" size="icon" onClick={skipPhase}>
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">
                {Math.floor(elapsed / 60)}m {elapsed % 60}s studied
              </p>
              <p className="text-sm text-muted-foreground">
                Great work! Time to log your session.
              </p>
              <Button onClick={handleDone} className="w-full">
                Complete Session
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
