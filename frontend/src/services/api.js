// Single place that talks to the backend. The token lives in localStorage; the JWT secret never reaches the browser.
export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('ww_token');
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem('ww_token'); localStorage.removeItem('ww_user');
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}
