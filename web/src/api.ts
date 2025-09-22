// // src/api.ts
// import axios from 'axios';

// // In dev, we rely on Vite proxy and use relative '/api'.
// // In prod, set VITE_API_ORIGIN (e.g. https://your-frontend-host) and we'll call `${ORIGIN}/api`.
// const ORIGIN = import.meta.env.VITE_API_ORIGIN ?? '';
// const BASE = ORIGIN ? `${ORIGIN.replace(/\/+$/, '')}/api` : '/api';

// export const api = axios.create({
//   baseURL: BASE,
//   withCredentials: true, // send/receive the fin_auth cookie
// });

// // Make API errors readable across the app
// api.interceptors.response.use(
//   (r) => r,
//   (err) => {
//     const msg =
//       err?.response?.data?.error ??
//       err?.response?.data?.message ??
//       err?.message ??
//       'Request failed';
//     return Promise.reject(new Error(msg));
//   }
// );

// /* ---------- Lookups ---------- */
// export async function getCategories() {
//   return (await api.get('/categories')).data;
// }
// export async function getMerchants() {
//   return (await api.get('/merchants')).data;
// }
// export async function addMerchant(name: string) {
//   return (await api.post('/merchants', { name })).data;
// }

// /* ---------- Bills ---------- */
// export async function listBills(type: 'bill' | 'subscription' | 'all' = 'all') {
//   return (await api.get('/bills', { params: { type } })).data;
// }
// export async function updateBill(
//   id: string,
//   patch: Partial<{ type: 'bill' | 'subscription' }>
// ) {
//   return (await api.patch(`/bills/${id}`, patch)).data;
// }

// /* ---------- Income ---------- */
// export async function addIncome(payload: any) {
//   return (await api.post('/income', payload)).data;
// }
// export async function listIncome(month: string) {
//   return (await api.get('/income', { params: { month } })).data;
// }

// /* ---------- Transactions ---------- */
// export async function addTxn(payload: any) {
//   return (await api.post('/transactions', payload)).data;
// }
// export async function listTxns(month: string) {
//   return (await api.get('/transactions', { params: { month } })).data;
// }

// /* ---------- Overview & Forecast ---------- */
// export async function getOverview(month: string) {
//   return (await api.get('/overview', { params: { month } })).data;
// }
// export async function getForecast(start: string) {
//   return (await api.get('/forecast', { params: { start } })).data;
// }

// /* ---------- Monthly Summary ---------- */
// export async function getSummary(
//   month: string
// ): Promise<{ month: string; income: number; spending: number; net: number }> {
//   return (await api.get('/summary', { params: { month } })).data;
// }

// /* ---------- Authentication ---------- */
// export async function me() {
//   return (await api.get('/me')).data; // { id, email, username }
// }
// export async function login(email: string, password: string) {
//   return (await api.post('/login', { email, password })).data;
// }
// export async function register(email: string, password: string) {
//   return (await api.post('/register', { email, password })).data;
// }
// export async function logout() {
//   return (await api.post('/logout')).data;
// }

// /* ---------- Settings ---------- */
// export async function changePassword(
//   currentPassword: string | undefined,
//   newPassword: string
// ) {
//   return (await api.post('/settings/password', { currentPassword, newPassword })).data;
// }
// export async function getAssumptions() {
//   return (await api.get('/settings/assumptions')).data;
// }
// export async function updateAssumptions(payload: {
//   currentSavings: number;
//   asOfDate: string; // YYYY-MM-DD
//   apr?: number;
//   inflation?: number;
// }) {
//   return (await api.put('/settings/assumptions', payload)).data;
// }

// src/api.ts
import axios from 'axios';

// --- Base URL choice ---------------------------------------------------------
// In local dev, the Vite proxy handles "/api" → http://localhost:4000.
// In production (Netlify), we want to hit the Render backend directly so the
// cookie domain matches the API host.
//
// Set VITE_API_ORIGIN on Netlify to your Render URL, e.g.:
//   VITE_API_ORIGIN=https://finance-tracker-w6yu.onrender.com
//
// As a safety net, we also hard-fallback to the Render URL below if the env
// var is missing.
const ENV_ORIGIN = import.meta.env.VITE_API_ORIGIN?.trim();
const FALLBACK_ORIGIN = 'https://finance-tracker-w6yu.onrender.com';

const ORIGIN =
  ENV_ORIGIN && ENV_ORIGIN !== '' ? ENV_ORIGIN : (import.meta.env.DEV ? '' : FALLBACK_ORIGIN);

// When ORIGIN === '' (dev), we rely on the Vite proxy with relative "/api".
const BASE = ORIGIN ? `${ORIGIN.replace(/\/+$/, '')}/api` : '/api';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true, // send/receive HTTP-only fin_auth cookie
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response) {
      const { status, data, headers } = err.response;
      console.error(
        'API error:',
        status,
        headers['content-type'],
        typeof data === 'object' ? JSON.stringify(data, null, 2) : data
      );
    } else {
      console.error('Network/other error:', err.message);
    }
    return Promise.reject(err);
  }
);

// Make API errors readable across the app
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err?.response?.data?.error ??
      err?.response?.data?.message ??
      err?.message ??
      'Request failed';
    return Promise.reject(new Error(msg));
  }
);

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

/* ---------- Bills ---------- */
export async function listBills(type: 'bill' | 'subscription' | 'all' = 'all') {
  return (await api.get('/bills', { params: { type } })).data;
}
export async function createBill(payload: any) {
  return (await api.post('/bills', payload)).data;
}
export async function deleteBill(id: string) {
  return (await api.delete(`/bills/${id}`)).data;
}
export async function updateBill(
  id: string,
  patch: Partial<{ type: 'bill' | 'subscription' }>
) {
  return (await api.patch(`/bills/${id}`, patch)).data;
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
export async function getSummary(
  month: string
): Promise<{ month: string; income: number; spending: number; net: number }> {
  return (await api.get('/summary', { params: { month } })).data;
}

/* ---------- Authentication ---------- */
export async function me() {
  return (await api.get('/me')).data; // { id, email, username }
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
export async function changePassword(
  currentPassword: string | undefined,
  newPassword: string
) {
  return (await api.post('/settings/password', { currentPassword, newPassword })).data;
}
export async function getAssumptions() {
  return (await api.get('/settings/assumptions')).data;
}
export async function updateAssumptions(payload: {
  currentSavings: number;
  asOfDate: string; // YYYY-MM-DD
  apr?: number;
  inflation?: number;
}) {
  return (await api.put('/settings/assumptions', payload)).data;
}

// // --- Soft delete + restore ---
// export async function deleteTransaction(id: string) {
//   await api.delete(`/transactions/${id}`);
// }

// export async function restoreTransaction(id: string) {
//   await api.post(`/transactions/${id}/restore`, {});
// }

// export async function deleteIncome(id: string) {
//   await api.delete(`/income/${id}`);
// }

// export async function restoreIncome(id: string) {
//   await api.post(`/income/${id}/restore`, {});
// }
