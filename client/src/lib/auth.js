export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}
export function isAuthed() {
  return !!getToken();
}
export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
}
