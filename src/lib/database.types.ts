export type Database = {
  public: {
    Tables: {
      subjects: {
        Row: {
          id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          subject_id: string;
          name: string;
          position: number;
          importance: number;
        };
        Insert: {
          id?: string;
          subject_id: string;
          name: string;
          position?: number;
          importance?: number;
        };
        Update: {
          id?: string;
          subject_id?: string;
          name?: string;
          position?: number;
          importance?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          }
        ];
      };
      topics: {
        Row: {
          id: string;
          chapter_id: string;
          name: string;
          summary: string | null;
          position: number;
          importance: number;
          estimated_duration_min: number | null;
          sm2_easiness_factor: number;
          sm2_interval: number;
          sm2_repetition_count: number;
          sm2_next_review: string;
          confidence: number;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          name: string;
          summary?: string | null;
          position?: number;
          importance?: number;
          estimated_duration_min?: number | null;
          sm2_easiness_factor?: number;
          sm2_interval?: number;
          sm2_repetition_count?: number;
          sm2_next_review?: string;
          confidence?: number;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          name?: string;
          summary?: string | null;
          position?: number;
          importance?: number;
          estimated_duration_min?: number | null;
          sm2_easiness_factor?: number;
          sm2_interval?: number;
          sm2_repetition_count?: number;
          sm2_next_review?: string;
          confidence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "topics_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          }
        ];
      };
      notes: {
        Row: {
          id: string;
          topic_id: string;
          content: string;
          is_ai_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          content: string;
          is_ai_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          content?: string;
          is_ai_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          }
        ];
      };
      exams: {
        Row: {
          id: string;
          subject_id: string;
          name: string;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          subject_id: string;
          name: string;
          date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          subject_id?: string;
          name?: string;
          date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exams_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          }
        ];
      };
      study_sessions: {
        Row: {
          id: string;
          topic_id: string;
          scheduled_at: string;
          started_at: string | null;
          completed_at: string | null;
          status: "pending" | "completed" | "missed" | "skipped" | "aborted";
          duration_sec: number | null;
          quality_score: number | null;
          source: "initial" | "revision" | "replan" | "exam_compression";
        };
        Insert: {
          id?: string;
          topic_id: string;
          scheduled_at: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: "pending" | "completed" | "missed" | "skipped" | "aborted";
          duration_sec?: number | null;
          quality_score?: number | null;
          source?: "initial" | "revision" | "replan" | "exam_compression";
        };
        Update: {
          id?: string;
          topic_id?: string;
          scheduled_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: "pending" | "completed" | "missed" | "skipped" | "aborted";
          duration_sec?: number | null;
          quality_score?: number | null;
          source?: "initial" | "revision" | "replan" | "exam_compression";
        };
        Relationships: [
          {
            foreignKeyName: "study_sessions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          }
        ];
      };
      quiz_results: {
        Row: {
          id: string;
          topic_id: string;
          session_id: string | null;
          quiz_type: "quick" | "comprehensive";
          total_questions: number;
          correct_answers: number;
          quality_score: number;
          taken_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          session_id?: string | null;
          quiz_type: "quick" | "comprehensive";
          total_questions: number;
          correct_answers: number;
          quality_score: number;
          taken_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          session_id?: string | null;
          quiz_type?: "quick" | "comprehensive";
          total_questions?: number;
          correct_answers?: number;
          quality_score?: number;
          taken_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_results_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_results_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      quiz_questions: {
        Row: {
          id: string;
          topic_id: string;
          question: string;
          answer: string;
          type: "mcq" | "flashcard" | "short_answer";
          options: string[] | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          question: string;
          answer: string;
          type: "mcq" | "flashcard" | "short_answer";
          options?: string[] | null;
          generated_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          question?: string;
          answer?: string;
          type?: "mcq" | "flashcard" | "short_answer";
          options?: string[] | null;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_questions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          }
        ];
      };
      planner_logs: {
        Row: {
          id: string;
          topic_id: string;
          event_type: "replan" | "exam_added" | "session_missed" | "interval_update" | "exam_deleted";
          reason: string;
          old_next_review: string | null;
          new_next_review: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          event_type: "replan" | "exam_added" | "session_missed" | "interval_update" | "exam_deleted";
          reason: string;
          old_next_review?: string | null;
          new_next_review?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          event_type?: "replan" | "exam_added" | "session_missed" | "interval_update" | "exam_deleted";
          reason?: string;
          old_next_review?: string | null;
          new_next_review?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planner_logs_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      session_status: "pending" | "completed" | "missed" | "skipped" | "aborted";
      session_source: "initial" | "revision" | "replan" | "exam_compression";
      quiz_type: "quick" | "comprehensive";
      question_type: "mcq" | "flashcard" | "short_answer";
      planner_event_type: "replan" | "exam_added" | "session_missed" | "interval_update" | "exam_deleted";
    };
    CompositeTypes: {};
  };
};

// Convenience types
export type Subject = Database["public"]["Tables"]["subjects"]["Row"];
export type Chapter = Database["public"]["Tables"]["chapters"]["Row"];
export type Topic = Database["public"]["Tables"]["topics"]["Row"];
export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Exam = Database["public"]["Tables"]["exams"]["Row"];
export type StudySession = Database["public"]["Tables"]["study_sessions"]["Row"];
export type QuizResult = Database["public"]["Tables"]["quiz_results"]["Row"];
export type QuizQuestion = Database["public"]["Tables"]["quiz_questions"]["Row"];
export type PlannerLog = Database["public"]["Tables"]["planner_logs"]["Row"];

export type SubjectInsert = Database["public"]["Tables"]["subjects"]["Insert"];
export type ChapterInsert = Database["public"]["Tables"]["chapters"]["Insert"];
export type TopicInsert = Database["public"]["Tables"]["topics"]["Insert"];
export type NoteInsert = Database["public"]["Tables"]["notes"]["Insert"];
export type ExamInsert = Database["public"]["Tables"]["exams"]["Insert"];
export type StudySessionInsert = Database["public"]["Tables"]["study_sessions"]["Insert"];
export type QuizResultInsert = Database["public"]["Tables"]["quiz_results"]["Insert"];
export type QuizQuestionInsert = Database["public"]["Tables"]["quiz_questions"]["Insert"];
export type PlannerLogInsert = Database["public"]["Tables"]["planner_logs"]["Insert"];
