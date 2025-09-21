import axios from 'axios';

const ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

// helpers to join cleanly
const j = (base: string, p: string) => `${base.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`;

// One client for app APIs
export const api = axios.create({
  baseURL: j(ORIGIN, '/api'),
  withCredentials: true,
});

// A second client for auth endpoints
export const auth = axios.create({
  baseURL: j(ORIGIN, '/auth'),
  withCredentials: true,
});

/* ---------- lookups (unchanged, use /api) ---------- */
export async function getCategories() { return (await api.get('/categories')).data; }
export async function getMerchants()  { return (await api.get('/merchants')).data; }
export async function addMerchant(name: string) { return (await api.post('/merchants', { name })).data; }

/* ---------- income (unchanged) ---------- */
export async function addIncome(payload: any) { return (await api.post('/income', payload)).data; }
export async function listIncome(month: string) { return (await api.get('/income', { params: { month } })).data; }

/* ---------- transactions (unchanged) ---------- */
export async function addTxn(payload: any) { return (await api.post('/transactions', payload)).data; }
export async function listTxns(month: string) { return (await api.get('/transactions', { params: { month } })).data; }

/* ---------- overview + forecast (unchanged) ---------- */
export async function getOverview(month: string) { return (await api.get('/overview', { params: { month } })).data; }
export async function getForecast(start: string) { return (await api.get('/forecast', { params: { start } })).data; }

/* ---------- summary (unchanged) ---------- */
export async function getSummary(month: string): Promise<{month: string; income: number; spending: number; net: number}> {
  return (await api.get('/summary', { params: { month } })).data;
}

/* ---------- auth (SWITCHED to /auth) ---------- */
export async function me() {
  return (await auth.get('/me')).data; // { id, email, username }
}
export async function login(email: string, password: string) {
  return (await auth.post('/login', { email, password })).data;
}
export async function register(email: string, password: string) {
  return (await auth.post('/register', { email, password })).data;
}
export async function logout() {
  return (await auth.post('/logout')).data;
}

/* ---------- settings (unchanged) ---------- */
export async function changePassword(currentPassword: string | undefined, newPassword: string) {
  return (await api.post('/settings/password', { currentPassword, newPassword })).data;
}
export async function getAssumptions() {
  return (await api.get('/settings/assumptions')).data;
}
export async function updateAssumptions(payload: {
  currentSavings: number;
  asOfDate: string;          // YYYY-MM-DD
  apr?: number;
  inflation?: number;
}) {
  return (await api.put('/settings/assumptions', payload)).data;
}
