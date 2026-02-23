import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTickets, fetchTicketMessages, sendTicketMessage } from '../api/tickets';

export const useTickets = () => {
    return useQuery({
        queryKey: ['tickets'],
        queryFn: fetchTickets,
    });
};

export const useTicketMessages = (id: string | undefined) => {
    return useQuery({
        queryKey: ['tickets', id, 'messages'],
        queryFn: () => fetchTicketMessages(id!),
        enabled: !!id,
        refetchInterval: false,
    });
};

export const useSendTicketMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, content }: { id: string; content: string }) => sendTicketMessage(id, content),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tickets', variables.id, 'messages'] });
        },
    });
};
