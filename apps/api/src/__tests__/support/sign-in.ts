import type { Server } from '../../server';

export const DASHBOARD_ORIGIN = 'http://localhost:5173';

/** Signs in through Better Auth's own route and returns the `cookie` header to send afterwards. */
export async function signIn(server: Server, email: string, password: string): Promise<string> {
  const response = await server.inject({
    method: 'POST',
    url: '/v1/auth/sign-in/email',
    payload: { email, password },
    headers: { origin: DASHBOARD_ORIGIN },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign-in failed with ${String(response.statusCode)}: ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}
