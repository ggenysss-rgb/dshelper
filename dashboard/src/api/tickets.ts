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
    _isMine?: boolean;
    _isStaff?: boolean;
    author: {
        id: string;
        username: string;
        global_name: string;
        avatar: string;
        bot?: boolean;
    };
    embeds?: {
        title?: string;
        description?: string;
        color?: number;
        fields?: { name: string; value: string; inline?: boolean }[];
        footer?: { text: string };
        author?: { name: string };
        url?: string;
        thumbnail?: { url: string };
        image?: { url: string };
    }[];
    attachments: any[];
    timestamp: string;
    member?: {
        roles: string[];
        nick?: string;
    };
    message_reference?: {
        message_id: string;
    };
    referenced_message?: {
        id: string;
        content: string;
        author: {
            username: string;
            global_name?: string;
        };
    };
};

export const fetchTickets = async (): Promise<Ticket[]> => {
    const { data } = await client.get('/tickets');
    return data;
};

export type TicketMessagesResponse = {
    messages: DiscordMessage[];
    mentionMap: Record<string, string>;
};

export const fetchTicketMessages = async (id: string): Promise<TicketMessagesResponse> => {
    const { data } = await client.get(`/tickets/${id}/messages`);
    return data;
};

export const sendTicketMessage = async (id: string, content: string, replyTo?: string): Promise<void> => {
    await client.post(`/tickets/${id}/send`, { content, replyTo });
};

export const editTicketMessage = async (id: string, msgId: string, content: string): Promise<void> => {
    await client.patch(`/tickets/${id}/messages/${msgId}`, { content });
};
