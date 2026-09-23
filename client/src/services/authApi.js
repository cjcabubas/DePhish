const apiBase = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

export async function authRequest(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiBase}/api/auth/${path}`, {
      method: payload === undefined ? 'GET' : 'POST', credentials: 'include',
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: controller.signal,
    });
    if (path === 'me' && response.status === 401) return { user: null };
    if ([502, 503, 504].includes(response.status)) throw new Error('Accounts are not available yet. Please try again later.');
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Account request failed. Please try again.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The account request timed out. Please try again.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Cannot reach the account service. Please try again later.');
    throw error;
  } finally { clearTimeout(timer); }
}
export const authApi = {
  login: credentials => authRequest('login', credentials), signup: fields => authRequest('signup', fields),
  me: () => authRequest('me'), logout: () => authRequest('logout', {}),
};
