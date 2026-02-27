import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTickets, fetchTicketMessages, sendTicketMessage, editTicketMessage, fetchUserProfile, generateTicketSummary } from '../api/tickets';

export const useTickets = () => {
    return useQuery({
        queryKey: ['tickets'],
        queryFn: fetchTickets,
        refetchInterval: 10000,
        refetchIntervalInBackground: true,
        staleTime: 5000,
        placeholderData: prev => prev ?? [],
    });
};

export const useUserProfile = (openerId: string | undefined) => {
    return useQuery({
        queryKey: ['userProfile', openerId],
        queryFn: () => fetchUserProfile(openerId!),
        enabled: !!openerId,
        staleTime: 30000,
    });
};

export const useTicketMessages = (id: string | undefined) => {
    return useQuery({
        queryKey: ['tickets', id, 'messages'],
        queryFn: () => fetchTicketMessages(id!),
        enabled: !!id,
        refetchInterval: 15000,
    });
};

export const useSendTicketMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, content, replyTo }: { id: string; content: string; replyTo?: string }) => sendTicketMessage(id, content, replyTo),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tickets', variables.id, 'messages'] });
        },
    });
};

export const useEditTicketMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ ticketId, msgId, content }: { ticketId: string; msgId: string; content: string }) => editTicketMessage(ticketId, msgId, content),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tickets', variables.ticketId, 'messages'] });
        },
    });
};

export const useTicketSummary = () => {
    return useMutation({
        mutationFn: ({ ticketId }: { ticketId: string }) => generateTicketSummary(ticketId),
    });
};
