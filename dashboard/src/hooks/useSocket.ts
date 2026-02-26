import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

let socketInstance: Socket | null = null;
let socketToken: string | null = null;

export const useSocket = () => {
    const { token } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(socketInstance);

    useEffect(() => {
        if (!token) {
            if (socketInstance) {
                socketInstance.disconnect();
                socketInstance = null;
                socketToken = null;
            }
            setSocket(null);
            return;
        }

        if (!socketInstance || socketToken !== token) {
            if (socketInstance) socketInstance.disconnect();
            socketInstance = io('/', {
                auth: { token },
                transports: ['websocket'],
                timeout: 10000,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            });
            socketToken = token;
        }
        setSocket(socketInstance);

        const current = socketInstance;
        const syncState = () => setSocket(current);
        current.on('connect', syncState);
        current.on('disconnect', syncState);

        return () => {
            current.off('connect', syncState);
            current.off('disconnect', syncState);
        };
    }, [token]);

    return socket;
};
