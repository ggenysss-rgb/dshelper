import axios from 'axios';

const client = axios.create({
    baseURL: '/api',
    timeout: 15000,
});

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('dashboard_token');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default client;
