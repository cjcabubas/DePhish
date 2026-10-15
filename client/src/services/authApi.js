const apiBase = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

export async function authRequest(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${apiBase}/api/auth/${path}`, {
      method: payload === undefined ? 'GET' : 'POST', credentials: 'include',
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: controller.signal,
    });
    if (path === 'me' && response.status === 401) return { user: null };
    if ([502, 503, 504].includes(response.status)) {
      const unavailable = await response.json().catch(() => null);
      throw new Error(unavailable?.message || 'Accounts are not available yet. Please try again later.');
    }
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
  verifySignup: fields => authRequest('signup/verify', fields), resendSignup: fields => authRequest('signup/resend', fields),
  requestPasswordReset: fields => authRequest('forgot-password', fields), verifyPasswordReset: fields => authRequest('forgot-password/verify', fields),
  completePasswordReset: fields => authRequest('reset-password', fields), verifyMfaLogin: fields => authRequest('mfa-login/verify', fields), resendMfaLogin: fields => authRequest('mfa-login/resend', fields),
  security: () => authRequest('security'), requestMfa: fields => authRequest('security/mfa', fields), verifyMfaSetting: fields => authRequest('security/mfa/verify', fields),
  me: () => authRequest('me'), logout: () => authRequest('logout', {}),
};
