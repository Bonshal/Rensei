"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Subject } from "@/lib/database.types";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, BookOpen, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const SUBJECT_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [selectedColor, setSelectedColor] = useState(SUBJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const loadSubjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subjects")
      .select("*")
      .order("created_at", { ascending: false });
    setSubjects(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const createSubject = async () => {
    if (!newSubjectName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("subjects").insert({
        name: newSubjectName.trim(),
        color: selectedColor,
      });
      if (error) throw error;
      toast.success("Subject created");
      setNewSubjectName("");
      setSelectedColor(SUBJECT_COLORS[0]);
      setDialogOpen(false);
      loadSubjects();
    } catch (err) {
      toast.error("Failed to create subject");
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const deleteSubject = async (id: string) => {
    if (!confirm("Delete this subject and all its chapters, topics, and sessions?")) return;
    try {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
      toast.success("Subject deleted");
      loadSubjects();
    } catch (err) {
      toast.error("Failed to delete subject");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subjects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your subjects and their content
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/subjects/new">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload Syllabus
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Subject</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Subject Name</Label>
                  <Input
                    placeholder="e.g., Mathematics, Physics"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createSubject()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECT_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          selectedColor === color
                            ? "border-foreground scale-110"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={createSubject}
                  disabled={creating || !newSubjectName.trim()}
                >
                  Create Subject
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {subjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No subjects yet</h2>
            <p className="text-sm text-muted-foreground">
              Create a subject manually or upload a syllabus to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Link key={subject.id} href={`/subjects/${subject.id}`}>
              <Card className="group cursor-pointer transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: subject.color }}
                    />
                    <CardTitle className="text-lg">{subject.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteSubject(subject.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(subject.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
