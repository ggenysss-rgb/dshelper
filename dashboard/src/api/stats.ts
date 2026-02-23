import client from './client';

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
    const { data } = await client.get('/users');
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
