export const SESSION_COOKIE = 'dashboard_session';
export const SESSION_VALUE = 'authenticated';

export function isAuthenticated(cookies: { get(name: string): { value: string } | undefined }): boolean {
  return cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}
