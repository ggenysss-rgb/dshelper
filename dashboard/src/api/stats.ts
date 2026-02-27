import client from './client';

export type ShiftStatus = 'idle' | 'active' | 'closed_today';

export interface ShiftUser {
    id: string;
    name: string;
    shiftActive: boolean;
    shiftStatus: ShiftStatus;
    canStartShift: boolean;
    canEndShift: boolean;
    shiftMarkedToday: boolean;
    shiftClosedToday: boolean;
    lastShiftDate: string | null;
    lastShiftClosed: boolean;
}

export const fetchStats = async () => {
    const { data } = await client.get('/stats');
    return data;
};

export const fetchBinds = async () => {
    const { data } = await client.get('/binds');
    return data;
};

export const addBind = async (name: string, message: string) => {
    const { data } = await client.post('/binds', { name, message });
    return data;
};

export const deleteBind = async (name: string) => {
    const { data } = await client.delete(`/binds/${name}`);
    return data;
};

export const fetchUsers = async () => {
    const { data } = await client.get<ShiftUser[]>('/users');
    return data;
};

export const startShift = async (userId: string) => {
    const { data } = await client.post('/smena', { userId });
    return data;
};

export const endShift = async (userId: string) => {
    const { data } = await client.post('/smenoff', { userId });
    return data;
};

export const fetchMembers = async () => {
    const { data } = await client.get('/members');
    return data;
};

export const fetchLogs = async (limit = 50) => {
    const { data } = await client.get(`/logs?limit=${limit}`);
    return data;
};

export const fetchProfiles = async () => {
    const { data } = await client.get('/profiles');
    return data;
};

// ── Settings ──────────────────────────────────────────────────
export const fetchSettings = async () => {
    const { data } = await client.get('/settings');
    return data;
};

export const updateSettings = async (settings: Record<string, any>) => {
    const { data } = await client.post('/settings', settings);
    return data;
};

// ── Auto-Replies ──────────────────────────────────────────────
export const fetchAutoReplies = async () => {
    const { data } = await client.get('/autoreplies');
    return data;
};

export const updateAutoReplies = async (autoReplies: any[]) => {
    const { data } = await client.post('/autoreplies', { autoReplies });
    return data;
};

export const simulateAutoReply = async (payload: { content: string; guildId?: string; channelId?: string; }) => {
    const { data } = await client.post('/autoreplies/simulate', payload);
    return data;
};

// ── Closed Tickets ────────────────────────────────────────────
export const fetchClosedTickets = async (page = 1, search = '') => {
    const { data } = await client.get(`/closed-tickets?page=${page}&limit=50&search=${encodeURIComponent(search)}`);
    return data;
};

export const fetchArchivedMessages = async (channelId: string) => {
    const { data } = await client.get(`/closed-tickets/${channelId}/messages`);
    return data;
};

// ── Conversation Log (AI Learning) ────────────────────────────
export const fetchConversationLog = async (limit = 100, type = 'all') => {
    const { data } = await client.get(`/conversation-log?limit=${limit}&type=${type}`);
    return data;
};

// ── Prompt Editor ─────────────────────────────────────────────
export interface PromptPayload {
    prompt: string;
    bytes: number;
    updatedAt: string;
}

export const fetchPrompt = async () => {
    const { data } = await client.get<PromptPayload>('/prompt');
    return data;
};

export const updatePrompt = async (prompt: string) => {
    const { data } = await client.post<PromptPayload & { ok: boolean }>('/prompt', { prompt });
    return data;
};
