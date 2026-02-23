import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

let socketInstance: Socket | null = null;

export const useSocket = () => {
    const { token } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(socketInstance);

    useEffect(() => {
        if (token && !socketInstance) {
            socketInstance = io('/', {
                auth: { token },
            });
            setSocket(socketInstance);
        }

        return () => {
            // Disconnecting immediately on unmount prevents reuse across pages
            // but if we logout, we should disconnect it.
            if (!token && socketInstance) {
                socketInstance.disconnect();
                socketInstance = null;
                setSocket(null);
            }
        };
    }, [token]);

    return socket;
};
