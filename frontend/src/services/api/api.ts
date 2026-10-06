import axios from "axios";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true,
});

export const refreshClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true,
});

let inMemoryToken: string | null = null;

export const setToken = (token: string | null) => {
    inMemoryToken = token;
};

export const getToken = () => inMemoryToken;

let refreshPromise: Promise<string> | null = null;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

export const refreshToken = async (): Promise<string> => {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const { data } = await refreshClient.post('/auth/refresh');
            const newAccessToken = data.accessToken;
            setToken(newAccessToken);
            return newAccessToken;
        } catch (err) {
            setToken(null);
            throw err;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

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

            if (refreshPromise) {
                return new Promise(function(resolve, reject) {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = 'Bearer ' + token;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;

            try {
                const newAccessToken = await refreshToken();
                processQueue(null, newAccessToken);
                
                originalRequest.headers.Authorization = 'Bearer ' + newAccessToken;
                return api(originalRequest);
            } catch (err) {
                processQueue(err, null);
                
                if (typeof window !== "undefined" && !window.location.pathname.includes('/auth/login')) {
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    window.location.href = "/auth/login";
                }
                return Promise.reject(err);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
