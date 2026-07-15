import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Send cookies (refresh token)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const { isAuthenticated, accessToken } = useAuthStore.getState();

    // Attempt a token refresh if:
    // 1. We got a 401
    // 2. We haven't already retried this request
    // 3. Either the server says TOKEN_EXPIRED, OR we are marked as
    //    authenticated but have no access token in memory (e.g. after a
    //    page refresh — the token is intentionally not persisted to
    //    localStorage, so the very first request always lands here)
    const shouldRefresh =
      error.response?.status === 401 &&
      !originalRequest._retry &&
      (
        error.response?.data?.error?.code === 'TOKEN_EXPIRED' ||
        (isAuthenticated && !accessToken)
      );

    if (shouldRefresh) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = data.data.accessToken as string;
        useAuthStore.getState().setAccessToken(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        // Refresh failed — clear auth and redirect to login
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
