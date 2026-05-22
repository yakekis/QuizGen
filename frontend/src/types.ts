export type UUID = string;

export type QuestionType = 'single' | 'multiple' | 'true_false';
export type QuizStatus = 'draft' | 'published' | 'archived';

export interface User {
  id: UUID;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Answer {
  id: UUID;
  question_id: UUID;
  position: number;
  text: string;
  is_correct: boolean;
}

export interface Question {
  id: UUID;
  quiz_id: UUID;
  position: number;
  type: QuestionType;
  text: string;
  explanation: string;
  time_limit_secs: number | null;
  answers: Answer[];
}

export interface Quiz {
  id: UUID;
  user_id: UUID;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  description: string;
  source_filename: string;
  time_limit_secs: number | null;
  attempt_limit: number;
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  status: QuizStatus;
  questions?: Question[];
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: UUID;
  quiz_id: UUID;
  token: string;
  student_name: string;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
  attempt_num: number;
}

export interface QuizStats {
  quiz_id: UUID;
  title: string;
  total_sessions: number;
  completed: number;
  avg_score: number;
  questions: {
    question_id: UUID;
    text: string;
    correct_count: number;
    total_count: number;
  }[];
  sessions: SessionStat[] | null;
}

export interface SessionStat {
  session_id: UUID;
  student_name: string;
  score: number | null;
  started_at: string | null;
  finished_at: string | null;
  attempt_num: number;
}

export interface SessionAnswer {
  id: UUID;
  session_id: UUID;
  question_id: UUID;
  selected_answer_ids: UUID[];
  is_correct: boolean | null;
  answered_at: string;
}

export interface SessionDetails {
  session: Session;
  questions: Question[];
  answers: SessionAnswer[] | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type Tone = 'formal' | 'neutral' | 'playful';
export type Language = 'ru' | 'en';
export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create' | 'mixed';

export interface GenerateRequest {
  subject: string;
  grade: string;
  topic: string;
  question_count: number;
  question_types: QuestionType[];
  time_limit_secs?: number | null;
  attempt_limit: number;
  difficulty?: Difficulty;
  tone?: Tone;
  language?: Language;
  blooms_level?: BloomsLevel;
  file?: File | null;
}
