import type {
  AuthResponse,
  GenerateRequest,
  Quiz,
  QuizStats,
  Question,
  Session,
  SessionDetails,
  GroupSession,
  CreateGroupSessionRequest,
  JoinGroupSessionRequest,
  GroupSessionInfo,
  LeaderboardResponse,
  JoinGroupResponse,
  LiveCreateResponse,
  LiveJoinResponse,
  User,
  UpdateProfileRequest,
  SessionLoad,
} from '../types';

const TOKEN_KEY = 'quizgen.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const ct = res.headers.get('Content-Type') || '';
  const isJson = ct.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const msg =
      (isJson && (data as any)?.error) ||
      (typeof data === 'string' && data) ||
      `HTTP ${res.status}`;
    if (res.status === 401) setToken(null);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export { ApiError };

export const api = {
  // ── Auth ───────────────────────────────────────
  register: (email: string, name: string, password: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // ── Profile ────────────────────────────────────
  getMe: () => request<User>('/api/me'),
  updateProfile: (body: UpdateProfileRequest) =>
    request<User>('/api/me', { method: 'PUT', body: JSON.stringify(body) }),

  // ── Quizzes ────────────────────────────────────
  listQuizzes: async () => {
    const r = await request<{ quizzes: Quiz[] | null }>('/api/quizzes');
    return r.quizzes ?? [];
  },
  getQuiz: (id: string) => request<Quiz>(`/api/quizzes/${id}`),
  updateQuiz: (id: string, body: Partial<Quiz>) =>
    request<Quiz>(`/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuiz: (id: string) =>
    request<void>(`/api/quizzes/${id}`, { method: 'DELETE' }),
  publishQuiz: (id: string) =>
    request<{ status: string }>(`/api/quizzes/${id}/publish`, { method: 'POST' }),
  quizStats: (id: string) => request<QuizStats>(`/api/quizzes/${id}/stats`),

  sessionDetails: (quizId: string, sessionId: string) =>
    request<SessionDetails>(`/api/quizzes/${quizId}/sessions/${sessionId}`),

  // Загрузка картинки для вопроса → возвращает публичный URL (/static/uploads/...).
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.set('file', file);
    return request<{ url: string }>('/api/uploads/image', { method: 'POST', body: fd });
  },

  regenerateQuestion: (quizId: string, questionId: string) =>
    request<Question>(`/api/quizzes/${quizId}/questions/${questionId}/regenerate`, {
      method: 'POST',
    }),

  statsCSV: (quizId: string): Promise<Blob> =>
    fetch(`/api/quizzes/${quizId}/stats.csv`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then((r) => {
      if (!r.ok) throw new Error('CSV download failed');
      return r.blob();
    }),

  // ── Generation ─────────────────────────────────
  generateQuiz: (req: GenerateRequest) => {
    const fd = new FormData();
    fd.set('subject', req.subject);
    fd.set('grade', req.grade);
    fd.set('topic', req.topic);
    fd.set('question_count', String(req.question_count));
    fd.set('attempt_limit', String(req.attempt_limit));
    if (req.time_limit_secs != null) fd.set('time_limit_secs', String(req.time_limit_secs));
    req.question_types.forEach((t) => fd.append('question_types', t));
    if (req.difficulty) fd.set('difficulty', req.difficulty);
    if (req.tone) fd.set('tone', req.tone);
    if (req.language) fd.set('language', req.language);
    if (req.blooms_level) fd.set('blooms_level', req.blooms_level);
    if (req.file) fd.set('file', req.file);
    return request<Quiz>('/api/quizzes/generate', { method: 'POST', body: fd });
  },

  // ── Sessions (teacher) ─────────────────────────
  createSession: (quizId: string, studentName: string) =>
    request<{ session: Session; link: string }>(`/api/quizzes/${quizId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ student_name: studentName }),
    }),

  // ── Group Sessions (teacher) ───────────────────
  createGroupSession: (quizId: string, req: CreateGroupSessionRequest) =>
    request<GroupSession>(`/api/quizzes/${quizId}/group-sessions`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  finishGroupSession: (accessCode: string) =>
    request<{ status: string }>(`/api/group/${accessCode}/finish`, {
      method: 'POST',
    }),

  // ── Group Sessions (student, public) ───────────
  getGroupSessionInfo: (accessCode: string) =>
    request<GroupSessionInfo>(`/api/group/${accessCode}/info`),

  joinGroupSession: (accessCode: string, req: JoinGroupSessionRequest) =>
    request<JoinGroupResponse>(`/api/group/${accessCode}/join`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getLeaderboard: (accessCode: string) =>
    request<LeaderboardResponse>(`/api/group/${accessCode}/leaderboard`),

  // ── Session (student, public) ──────────────────
  getSession: (token: string) =>
    request<SessionLoad>(`/api/sessions/${token}`),

  retrySession: (token: string) =>
    request<Session>(`/api/sessions/${token}/retry`, { method: 'POST' }),

  identifySession: (token: string, name: string) =>
    request<Session>(`/api/sessions/${token}/identify`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  submitAnswer: (token: string, questionId: string, selectedIds: string[], timeSpentMs = 0) =>
    request<{ ok: boolean }>(`/api/sessions/${token}/answers`, {
      method: 'POST',
      body: JSON.stringify({
        question_id: questionId,
        selected_answer_ids: selectedIds,
        time_spent_ms: timeSpentMs,
      }),
    }),

  finishSession: (token: string) =>
    request<Session>(`/api/sessions/${token}/finish`, { method: 'POST' }),

  reportTabSwitch: (token: string) =>
    request<{ tab_switches: number }>(`/api/sessions/${token}/tab-switch`, { method: 'POST' }),

  // ── Live game (Kahoot-style) ───────────────────
  createLiveGame: (quizId: string) =>
    request<LiveCreateResponse>(`/api/quizzes/${quizId}/live`, { method: 'POST' }),

  liveInfo: (pin: string) =>
    request<{ pin: string; quiz_title: string }>(`/api/live/${pin}`),

  joinLive: (pin: string, name: string) =>
    request<LiveJoinResponse>(`/api/live/${pin}/join`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  answerLive: (pin: string, playerId: string, answerId: string) =>
    request<{ ok: boolean }>(`/api/live/${pin}/answer`, {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, answer_id: answerId }),
    }),

  liveHostAction: (pin: string, action: 'start' | 'next' | 'end', hostToken: string) =>
    request<{ ok: boolean }>(`/api/live/${pin}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ host_token: hostToken }),
    }),
};