export const API = process.env.NEXT_PUBLIC_API_URL!;

export async function postJSON<T>(path: string, body: any, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}
