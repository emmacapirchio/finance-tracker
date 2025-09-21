import axios from 'axios';

// Use VITE_API_ORIGIN in production; fallback to relative '/api' in dev
const ORIGIN = import.meta.env.VITE_API_ORIGIN ?? '';
const BASE   = ORIGIN ? `${ORIGIN.replace(/\/+$/, '')}/api` : '/api';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

/* ---------- Lookups ---------- */
export async function getCategories() {
  return (await api.get('/categories')).data;
}
export async function getMerchants() {
  return (await api.get('/merchants')).data;
}
export async function addMerchant(name: string) {
  return (await api.post('/merchants', { name })).data;
}

/* ---------- Income ---------- */
export async function addIncome(payload: any) {
  return (await api.post('/income', payload)).data;
}
export async function listIncome(month: string) {
  return (await api.get('/income', { params: { month } })).data;
}

/* ---------- Transactions ---------- */
export async function addTxn(payload: any) {
  return (await api.post('/transactions', payload)).data;
}
export async function listTxns(month: string) {
  return (await api.get('/transactions', { params: { month } })).data;
}

/* ---------- Overview & Forecast ---------- */
export async function getOverview(month: string) {
  return (await api.get('/overview', { params: { month } })).data;
}
export async function getForecast(start: string) {
  return (await api.get('/forecast', { params: { start } })).data;
}

/* ---------- Monthly Summary ---------- */
export async function getSummary(month: string): Promise<{month: string; income: number; spending: number; net: number}> {
  return (await api.get('/summary', { params: { month } })).data;
}

/* ---------- Authentication ---------- */
export async function me() {
  return (await api.get('/me')).data;  // { id, email, username }
}
export async function login(email: string, password: string) {
  return (await api.post('/login', { email, password })).data;
}
export async function register(email: string, password: string) {
  return (await api.post('/register', { email, password })).data;
}
export async function logout() {
  return (await api.post('/logout')).data;
}

/* ---------- Settings ---------- */
export async function changePassword(currentPassword: string | undefined, newPassword: string) {
  return (await api.post('/settings/password', { currentPassword, newPassword })).data;
}
export async function getAssumptions() {
  return (await api.get('/settings/assumptions')).data;
}
export async function updateAssumptions(payload: {
  currentSavings: number;
  asOfDate: string;   // YYYY-MM-DD
  apr?: number;
  inflation?: number;
}) {
  return (await api.put('/settings/assumptions', payload)).data;
}
