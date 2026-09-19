import axios from 'axios';

// A deliberately separate axios instance and localStorage key from
// api/client.ts's clinic apiClient -- a platform-admin session and a
// clinic session are different actors (see server's
// middleware/platformAuth.ts) and must never share a token, so a browser
// tab logged into one can't accidentally leak into the other's requests.
export const platformClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

platformClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('opd_platform_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

platformClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('opd_platform_token');
      localStorage.removeItem('opd_platform_admin');
      if (window.location.pathname !== '/platform/login') {
        window.location.href = '/platform/login';
      }
    }
    return Promise.reject(error);
  },
);
