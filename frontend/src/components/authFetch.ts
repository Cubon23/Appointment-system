// Drop-in replacement for fetch() that attaches the login token.
// Place this file next to the dashboard files (or adjust the import path).
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  // Missing, invalid or expired (8h) token -> back to the login page.
  // 403 (not allowed) is NOT a logout; the caller handles it.
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
  }
  return res;
}
