import type { ChatResponse, DocumentListResponse, BlobDetail } from './models';

const BASE = '/api';

export async function chat(question: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export async function listDocuments(prefix?: string): Promise<DocumentListResponse> {
  const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  const res = await fetch(`${BASE}/documents${params}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function getDocument(name: string): Promise<BlobDetail> {
  const encodedPath = name.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE}/document/${encodedPath}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
