import type { Env } from '../types';

/**
 * Thin PostgREST client. The worker holds the service role key, so every call
 * here bypasses RLS -- keep it server-side and never proxy it raw to the
 * browser.
 */
export class Db {
  constructor(private env: Env) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`supabase ${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  async select<T>(table: string, query = ''): Promise<T[]> {
    const res = await this.request(`${table}?${query}`);
    return (await res.json()) as T[];
  }

  async selectOne<T>(table: string, query = ''): Promise<T | null> {
    const rows = await this.select<T>(table, `${query}&limit=1`);
    return rows[0] ?? null;
  }

  async insert<T>(table: string, row: unknown): Promise<T> {
    const res = await this.request(table, {
      method: 'POST',
      body: JSON.stringify(row),
      headers: { Prefer: 'return=representation' },
    });
    const rows = (await res.json()) as T[];
    if (!rows[0]) throw new Error(`insert into ${table} returned no row`);
    return rows[0];
  }

  async insertMany(table: string, rows: unknown[]): Promise<void> {
    if (rows.length === 0) return;
    await this.request(table, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { Prefer: 'return=minimal' },
    });
  }

  async update<T>(table: string, query: string, patch: unknown): Promise<T[]> {
    const res = await this.request(`${table}?${query}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: { Prefer: 'return=representation' },
    });
    return (await res.json()) as T[];
  }
}
