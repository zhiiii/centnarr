const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8001';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.detail || `HTTP ${res.status}`);
    } catch {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  }
  return res.json() as Promise<T>;
}

export interface StreamEvent {
  type: 'delta' | 'error' | 'done' | 'state' | 'questions' | 'integration' | 'summary' | string;
  content?: string;
  text?: string;
  state?: string;
  message?: string;
  questions?: QuestionItem[];
  delta?: { added?: unknown[]; modified?: unknown[]; confirmed?: unknown[] };
  updated_doc?: DocView;
  completion_percentage?: number;
  user_facing_summary?: string;
  inference?: string;
  scene_analysis?: SceneAnalysis;
  [key: string]: unknown;
}

export async function* streamConversation(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text);
      detail = data.detail || detail;
    } catch {
      if (text) detail = `${detail}: ${text.slice(0, 200)}`;
    }
    yield { type: 'error', message: detail };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const ev of events) {
      const line = ev.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        const data = JSON.parse(line.slice(6));
        yield data as StreamEvent;
      } catch {
        // ignore malformed chunks
      }
    }
  }
  if (buffer.trim()) {
    const line = buffer.split('\n').find((l) => l.startsWith('data: '));
    if (line) {
      try {
        const data = JSON.parse(line.slice(6));
        yield data as StreamEvent;
      } catch {
        // ignore
      }
    }
  }
}

export interface QuestionItem {
  id: string;
  question?: string;
  why_matters?: string;
  my_understanding?: string | null;
}

export interface SceneAnalysis {
  scene: string;
  roles: Array<{ name: string; responsibility?: string; confidence?: string | null; evidence?: { confidence?: string | null } }>;
  pain_points: Array<{
    description: string;
    frequency?: string | null;
    severity?: string | null;
    evidence?: { frequency?: string | null; severity?: string | null };
  }>;
  expected_outcomes: Array<{
    description: string;
    explicit?: boolean | null;
    evidence?: { explicit?: string | null };
  }>;
  emotional_signal?: string;
  urgency?: string;
  summary?: string;
}

export interface QuestionGeneration {
  questions: QuestionItem[];
  should_continue?: boolean;
}

export interface DocView {
  scene: string;
  background: string;
  roles: Array<{
    name: string;
    responsibility?: string;
    confidence?: string | null;
    evidence?: { confidence?: string | null };
  }>;
  pain_points: Array<{
    description: string;
    frequency?: string | null;
    severity?: string | null;
    evidence?: { frequency?: string | null; severity?: string | null };
  }>;
  expected_outcomes: Array<{
    description: string;
    explicit?: boolean | null;
    evidence?: { explicit?: string | null };
  }>;
  key_scenarios: Array<{ description: string; example?: string }>;
  to_confirm: string[];
}

export interface MessageTurn {
  role: string;
  content: string;
  input_type?: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface CommunicationCard {
  id: string;
  round: number;
  communication_kind: string;
  created_at: string;
  delta?: Record<string, unknown> | null;
}

export interface ConversationView {
  conversation_id: string;
  state: string;
  title: string | null;
  current_round: number;
  completion: number;
  messages: MessageTurn[];
  doc: DocView;
  communication_cards: CommunicationCard[];
  has_prd?: boolean;
  requirement_id?: string | null;
  requirement_status?: string | null;
}

export interface DeltaItem {
  field: string;
  content?: unknown;
  old?: unknown;
  new?: unknown;
}

export interface DeltaSet {
  added?: DeltaItem[];
  modified?: DeltaItem[];
  confirmed?: DeltaItem[];
  edited?: DeltaItem[];
}

export interface EditDocResponse {
  doc: DocView;
  completion: number;
  version_id: string;
}

export interface StartResponse {
  conversation_id: string;
  state: string;
  title: string | null;
  created_at: string;
}

export interface FirstMessageResponse {
  conversation_id: string;
  state: string;
  round: number;
  scene_analysis: SceneAnalysis;
  questions: QuestionGeneration;
  doc: DocView;
  completion: number;
  user_facing_summary: string;
}

export interface RespondResponse {
  conversation_id: string;
  state: string;
  round: number;
  completion: number;
  delta: { added?: unknown[]; modified?: unknown[]; confirmed?: unknown[] };
  user_facing_summary: string;
  questions: QuestionItem[];
  doc: DocView;
  should_continue: boolean;
}

export interface ConfirmResponse {
  conversation_id: string;
  requirement_id: string;
  state: string;
  doc: DocView;
}

export interface PrdResponse {
  prd_id: string;
  requirement_id: string;
  content: string;
  title: string;
  version: string;
  created_at: string;
}

export interface RequirementListItem {
  id: string;
  conversation_id: string;
  title: string;
  status: string;
  updated_at: string;
}

export interface PrdEditResponse {
  prd_id: string;
  content: string;
  version: string;
  updated_at: string;
}

export interface PrdAcceptanceResponse {
  prd_id: string;
  acceptance_state: Record<string, boolean>;
  updated_at: string;
}

export interface RequirementListResponse {
  items: RequirementListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadResponse {
  file_id: string;
  file_url: string;
  file_type: string;
  extracted_text: string;
  size: number;
}

export const api = {
  startConversation: (project_id?: string) =>
    request<StartResponse>('/api/conversation/start', {
      method: 'POST',
      body: JSON.stringify({ project_id: project_id || null }),
    }),
  uploadFile: async (conversation_id: string, file: File | Blob, filename?: string): Promise<UploadResponse> => {
    const form = new FormData();
    const name = filename || (file instanceof File ? file.name : 'paste.png');
    form.append('file', file, name);
    const res = await fetch(`${API_BASE}/api/conversation/${conversation_id}/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        throw new Error(data.detail || `HTTP ${res.status}`);
      } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
    }
    return (await res.json()) as UploadResponse;
  },
  confirm: (conversation_id: string) =>
    request<ConfirmResponse>('/api/conversation/confirm', {
      method: 'POST',
      body: JSON.stringify({ conversation_id }),
    }),
  generatePrd: (conversation_id: string) =>
    request<PrdResponse>('/api/prd/generate', {
      method: 'POST',
      body: JSON.stringify({ conversation_id }),
    }),
  exportPrd: (prd_id: string, format = 'markdown') =>
    request<{ filename: string; content: string; mime_type: string }>('/api/prd/export', {
      method: 'POST',
      body: JSON.stringify({ prd_id, format }),
    }),
  getConversation: (id: string) => request<ConversationView>(`/api/conversation/${id}`),
  editDoc: (id: string, field_path: string, value: unknown) =>
    request<EditDocResponse>(`/api/conversation/${id}/doc`, {
      method: 'PATCH',
      body: JSON.stringify({ field_path, value }),
    }),
  listRequirements: (params: { q?: string; status?: string; page?: number; page_size?: number } = {}) => {
    const usp = new URLSearchParams();
    if (params.q) usp.set('q', params.q);
    if (params.status) usp.set('status', params.status);
    if (params.page) usp.set('page', String(params.page));
    if (params.page_size) usp.set('page_size', String(params.page_size));
    return request<RequirementListResponse>(`/api/requirements?${usp.toString()}`);
  },
  getRequirement: (id: string) =>
    request<{
      id: string;
      conversation_id: string;
      project_id: string | null;
      project_name: string | null;
      title: string;
      status: string;
      confirmed_doc: DocView;
      prds: Array<{
        id: string;
        version: string;
        content: string;
        created_at: string;
        acceptance_state?: Record<string, boolean>;
        spec_content?: string | null;
        spec_version?: string | null;
        spec_updated_at?: string | null;
      }>;
      updated_at: string;
    }>(`/api/requirement/${id}`),
  editPrd: (prd_id: string, content: string) =>
    request<PrdEditResponse>(`/api/prd/${prd_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  editPrdAcceptance: (prd_id: string, checks: Record<string, boolean>) =>
    request<PrdAcceptanceResponse>(`/api/prd/${prd_id}/acceptance`, {
      method: 'PATCH',
      body: JSON.stringify({ checks }),
    }),
  archiveRequirement: (id: string) =>
    request<{ id: string; status: string; updated_at: string }>(`/api/requirement/${id}/archive`, {
      method: 'POST',
    }),
  unarchiveRequirement: (id: string) =>
    request<{ id: string; status: string; updated_at: string }>(`/api/requirement/${id}/unarchive`, {
      method: 'POST',
    }),
  deleteRequirement: (id: string) =>
    request<{ id: string; deleted: boolean; prd_count: number }>(`/api/requirement/${id}`, {
      method: 'DELETE',
    }),
  listProjects: () =>
    request<
      Array<{
        id: string;
        name: string;
        description: string | null;
        requirement_count: number;
        prd_count: number;
        created_at: string;
        updated_at: string;
      }>
    >('/api/projects'),
  createProject: (name: string, description?: string) =>
    request<{ id: string; name: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  getProject: (id: string) =>
    request<{
      id: string;
      name: string;
      description: string | null;
      requirement_count: number;
      prd_count: number;
      created_at: string;
      updated_at: string;
      requirements: Array<{
        id: string;
        conversation_id: string;
        title: string;
        status: string;
        updated_at: string;
        prd_count: number;
        scene?: string | null;
        background?: string | null;
        pain_point_count?: number;
        kind?: 'requirement' | 'in_progress';
      }>;
      in_progress?: Array<{
        id: string;
        conversation_id: string;
        title: string;
        status: string;
        updated_at: string;
        prd_count: number;
        completion: number;
        round: number;
        first_message: string;
      }>;
    }>(`/api/project/${id}`),
  updateProject: (id: string, patch: { name?: string; description?: string }) =>
    request<{ id: string; name: string }>(`/api/project/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteProject: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/api/project/${id}`, {
      method: 'DELETE',
    }),
  assignRequirementToProject: (requirement_id: string, project_id: string | null) =>
    request<{ id: string; project_id: string | null }>(`/api/requirement/${requirement_id}/project`, {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }),
  generateSpec: (prd_id: string) =>
    request<{ prd_id: string; spec_content: string; spec_version: string; updated_at: string }>(
      `/api/prd/${prd_id}/spec`,
      { method: 'POST' }
    ),
  deleteSpec: (prd_id: string) =>
    request<{ prd_id: string; spec_deleted: boolean }>(`/api/prd/${prd_id}/spec`, {
      method: 'DELETE',
    }),
  streamFirstMessage: (
    conversation_id: string,
    content: string,
    options: { input_type?: string; meta?: Record<string, unknown> } = {},
    signal?: AbortSignal,
  ) =>
    streamConversation(
      '/api/conversation/message/stream',
      {
        conversation_id,
        content,
        input_type: options.input_type || 'text',
        meta: options.meta || null,
      },
      signal,
    ),
  streamRespond: (
    conversation_id: string,
    content: string,
    is_async_supplement = false,
    options: { input_type?: string; meta?: Record<string, unknown> } = {},
    signal?: AbortSignal,
  ) =>
    streamConversation(
      '/api/conversation/respond/stream',
      {
        conversation_id,
        content,
        is_async_supplement,
        input_type: options.input_type || 'text',
        meta: options.meta || null,
      },
      signal,
    ),
  finishConversation: (conversation_id: string) =>
    request<{
      conversation_id: string;
      state: string;
      doc: DocView;
      completion: number;
    }>('/api/conversation/finish', {
      method: 'POST',
      body: JSON.stringify({ conversation_id }),
    }),
};