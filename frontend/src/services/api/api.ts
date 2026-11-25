import axios from "axios";
import { getApiBaseUrl } from "@/config/env";
import { createTokenRefresher, isSessionRejected } from "@/lib/token-refresh";

export const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true,
});

export const refreshClient = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true,
});

let inMemoryToken: string | null = null;
type TokenListener = (token: string | null) => void;
const tokenListeners = new Set<TokenListener>();

export const setToken = (token: string | null) => {
    inMemoryToken = token;
    tokenListeners.forEach((listener) => listener(token));
};

export const getToken = () => inMemoryToken;

// Lets the socket follow login / refresh / logout without copying the token into React state
export const onTokenChange = (listener: TokenListener) => {
    tokenListeners.add(listener);
    return () => {
        tokenListeners.delete(listener);
    };
};

// Shared by the 401 interceptor, app start and the socket
export const refreshToken = createTokenRefresher({
    requestRefresh: async () => (await refreshClient.post('/auth/refresh')).data.accessToken,
    getToken,
    setToken,
});

api.interceptors.request.use((config) => {
    if (inMemoryToken) {
        config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/logout')) {
                return Promise.reject(error);
            }

            // Retried at most once
            originalRequest._retry = true;
            try {
                await refreshToken();
            } catch (err) {
                if (isSessionRejected(err) && typeof window !== "undefined" && !window.location.pathname.includes('/auth/login')) {
                    window.location.replace("/auth/login");
                }
                return Promise.reject(err);
            }
            // The request interceptor adds the new token
            return api(originalRequest);
        }

        return Promise.reject(error);
    }
);

export default api;
