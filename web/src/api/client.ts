import axios from 'axios';
import { SUBSCRIPTION_INACTIVE_MESSAGE } from '@opd/shared';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('opd_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('opd_token');
      localStorage.removeItem('opd_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // requireAuth (server/src/middleware/auth.ts) 403s every request the
    // instant a clinic's subscription lapses or gets suspended -- an
    // already-logged-in session hits this mid-use, not just at login. Same
    // string-matched redirect-to-login pattern as the 401 branch above, but
    // with a query flag so LoginPage shows the lockout reason instead of a
    // silent bounce.
    if (error.response?.status === 403 && error.response?.data?.message === SUBSCRIPTION_INACTIVE_MESSAGE) {
      localStorage.removeItem('opd_token');
      localStorage.removeItem('opd_user');
      localStorage.removeItem('opd_clinic');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?locked=1';
      }
    }
    return Promise.reject(error);
  },
);
