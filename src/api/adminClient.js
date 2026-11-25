const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export function getAdminToken() {
  return localStorage.getItem('band_admin_token') || sessionStorage.getItem('band_admin_token');
}

export function setAdminToken(token, remember) {
  localStorage.removeItem('band_admin_token');
  sessionStorage.removeItem('band_admin_token');
  (remember ? localStorage : sessionStorage).setItem('band_admin_token', token);
}

export function clearAdminToken() {
  localStorage.removeItem('band_admin_token');
  sessionStorage.removeItem('band_admin_token');
}

export async function adminRequest(path, options = {}) {
  const token = getAdminToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    clearAdminToken();
    if (window.location.pathname !== '/admin/login') {
      window.location.assign('/admin/login');
    }
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}
