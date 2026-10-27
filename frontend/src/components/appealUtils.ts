import { authFetch } from './authFetch';

// Label + colour for an appeal's state (an accepted appeal means the absence is excused).
export const appealLabel = (status?: string) =>
  status === 'ACCEPTED' ? 'Appeal accepted (excused)' : status === 'REJECTED' ? 'Appeal declined' : 'Appeal pending';
export const appealColor = (status?: string) =>
  status === 'ACCEPTED' ? 'green' : status === 'REJECTED' ? 'red' : 'yellow';

export async function reviewAppeal(id: string, decision: 'ACCEPTED' | 'REJECTED'): Promise<{ ok: boolean; message: string }> {
  const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment/${id}/appeal`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, message: data.message || data.error || '' };
}
