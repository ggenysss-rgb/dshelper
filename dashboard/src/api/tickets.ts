import client from './client';

export type Ticket = {
    channelId: string;
    channelName: string;
    guildId: string;
    guildName: string;
    createdAt: number;
    lastMessage: string;
    lastMessageAt: number;
    firstStaffReplyAt: number | null;
    openerId: string;
    openerUsername: string;
    lastStaffMessageAt: number | null;
    waitingForReply: boolean;
    activityTimerType: string | null;
    priority: 'high' | 'normal';
};

export type DiscordMessage = {
    id: string;
    type: number;
    content: string;
    channel_id: string;
    author: {
        id: string;
        username: string;
        global_name: string;
        avatar: string;
        bot?: boolean;
    };
    attachments: any[];
    timestamp: string;
    member?: {
        roles: string[];
        nick?: string;
    };
};

export const fetchTickets = async (): Promise<Ticket[]> => {
    const { data } = await client.get('/tickets');
    return data;
};

export const fetchTicketMessages = async (id: string): Promise<DiscordMessage[]> => {
    const { data } = await client.get(`/tickets/${id}/messages`);
    return data;
};

export const sendTicketMessage = async (id: string, content: string): Promise<void> => {
    await client.post(`/tickets/${id}/send`, { content });
};
