export type UUID = string;

export type QuestionType = 'single' | 'multiple' | 'true_false';
export type QuizStatus = 'draft' | 'published' | 'archived';
export type QuizMode = 'solo' | 'group';

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
  image_url: string;
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
  mode: QuizMode;
  group_session_id?: UUID;
  student_name: string;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
  attempt_num: number;
  tab_switches: number;
}

export interface OptionStat {
  answer_id: UUID;
  text: string;
  is_correct: boolean;
  selected_count: number;
}

export interface QuestionStat {
  question_id: UUID;
  text: string;
  type: QuestionType;
  position: number;
  correct_count: number;
  total_count: number;
  avg_time_sec: number;
  options: OptionStat[] | null;
}

export interface QuizStats {
  quiz_id: UUID;
  title: string;
  total_sessions: number;
  completed: number;
  avg_score: number;
  questions: QuestionStat[];
  sessions: SessionStat[] | null;
}

export interface SessionAnswerBrief {
  question_id: UUID;
  is_correct: boolean | null;
}

export interface SessionStat {
  session_id: UUID;
  student_name: string;
  score: number | null;
  started_at: string | null;
  finished_at: string | null;
  attempt_num: number;
  tab_switches: number;
  correct_count: number;
  answered_count: number;
  total_time_ms: number;
  answers: SessionAnswerBrief[] | null;
}

export interface SessionAnswer {
  id: UUID;
  session_id: UUID;
  question_id: UUID;
  selected_answer_ids: UUID[];
  is_correct: boolean | null;
  time_spent_ms: number;
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

export interface UpdateProfileRequest {
  name: string;
  email: string;
  current_password?: string;
  new_password?: string;
}

// Ответ GET /api/sessions/:token — сессия, вопросы и параметры квиза для плеера.
export interface SessionLoad {
  session: Session;
  questions: Question[];
  time_limit_secs: number | null;
  attempt_limit: number;
  attempts_used: number;
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

// ── Group Mode Types ──────────────────────────────────────────────────────

export interface GroupSession {
  id: UUID;
  quiz_id: UUID;
  created_by: UUID;
  access_code: string;
  max_participants: number;
  start_time?: string;
  end_time?: string;
  is_active: boolean;
  show_leaderboard: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateGroupSessionRequest {
  max_participants: number;
  start_in_minutes: number;
  duration_minutes: number;
  access_code?: string;
  show_leaderboard: boolean;
}

export interface JoinGroupSessionRequest {
  student_name: string;
}

export interface GroupSessionInfo {
  access_code: string;
  quiz_title: string;
  is_active: boolean;
  show_leaderboard: boolean;
  max_participants: number;
  start_time?: string;
  starts_in?: number;
  end_time?: string;
  ends_in?: number;
}

export interface LeaderboardEntry {
  rank: number;
  student_name: string;
  score: number;
  total_questions: number;
  completed_at?: string;
}

export interface LeaderboardResponse {
  updated_at: string;
  entries: LeaderboardEntry[];
}

// ── Live (Kahoot-style) Mode Types ────────────────────────────────────────

export type LivePhase = 'lobby' | 'question' | 'waiting' | 'reveal' | 'game_over';

export interface LiveCreateResponse {
  pin: string;
  host_token: string;
  quiz_title: string;
  total: number;
}

export interface LiveJoinResponse {
  player_id: string;
  pin: string;
  quiz_title: string;
  name: string;
}

export interface LiveOption {
  id: string;
  text: string;
  is_correct?: boolean;
  count?: number;
}

export interface LiveLeaderRow {
  rank: number;
  name: string;
  score: number;
}

export interface LiveYou {
  correct?: boolean;
  points?: number;
  total_score: number;
  rank: number;
  streak?: number;
  name?: string;
}

// Decoded `data` payload of a live SSE event (fields present depend on type).
export interface LiveEvent {
  pin?: string;
  quiz_title?: string;
  players?: string[];
  count?: number;
  total?: number;
  index?: number;
  text?: string;
  image?: string;
  type?: QuestionType;
  time_limit?: number;
  deadline_unix?: number;
  options?: LiveOption[];
  answered?: number | boolean;
  correct_ids?: string[];
  leaderboard?: LiveLeaderRow[];
  is_last?: boolean;
  you?: LiveYou;
  podium?: LiveLeaderRow[];
}

export interface JoinGroupResponse {
  status: 'waiting' | 'started';
  starts_in?: number;
  session_id?: UUID;
  quiz_id?: UUID;
  session_token?: string;
  ends_in?: number;
  show_leaderboard?: boolean;
}