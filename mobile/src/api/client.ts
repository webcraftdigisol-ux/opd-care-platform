import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOKEN_KEY = 'opd_token';

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api',
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
