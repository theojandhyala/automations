import { createClient, type Session } from '@supabase/supabase-js';

export const cloudflareAuthEnabled = import.meta.env.VITE_CLOUDFLARE_AUTH === 'true';
export type OwnerSession = Pick<Session, 'user' | 'access_token'>;
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Dashboard data client configuration is missing');

// Keep the existing typed read builders. On Cloudflare, only their read-only
// HTTP queries are sent to the authenticated same-origin Worker relation API.
const client = createClient(url, anonKey, cloudflareAuthEnabled ? {
  auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
  global: { fetch: async (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!target.pathname.startsWith('/rest/v1/')) throw new Error('Legacy service is disabled for this dashboard');
    const headers = new Headers(init?.headers);
    headers.delete('Authorization'); headers.delete('apikey');
    return fetch(`/api/data/${target.pathname.slice('/rest/v1/'.length)}${target.search}`, {...init,headers,credentials:'same-origin'});
  } },
} : undefined);

const cloudAuth = {
  async getSession():Promise<{data:{session:OwnerSession|null}}> {
    try {
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)return {data:{session:null}};
      const owner=await response.json() as {email:string};
      // UI identity only. The HttpOnly Access cookie remains the credential;
      // this marker is never sent as an authorization token.
      return {data:{session:{access_token:'cloudflare-access',user:{id:'owner',email:owner.email,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:''}}}};
    } catch {return {data:{session:null}};}
  },
  onAuthStateChange(callback:(event:string, session:OwnerSession|null)=>void) {
    let active=true;
    void cloudAuth.getSession().then(({data})=>{if(active)callback('INITIAL_SESSION',data.session);});
    return {data:{subscription:{unsubscribe(){active=false;}}}};
  },
  async signOut(){ window.location.assign('/cdn-cgi/access/logout'); return {error:null}; },
  async signInWithPassword(_input:Parameters<typeof client.auth.signInWithPassword>[0]){ window.location.assign('/api/auth/access');return {error:null}; },
  async signInWithOtp(_input:Parameters<typeof client.auth.signInWithOtp>[0]){ window.location.assign('/api/auth/access');return {error:null}; },
};

export const supabase = { from:client.from.bind(client), channel:client.channel.bind(client), removeChannel:client.removeChannel.bind(client), auth:cloudflareAuthEnabled ? cloudAuth : client.auth };

/** Every write goes through the owner-authenticated Worker API. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!cloudflareAuthEnabled) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('not signed in');
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers, credentials:'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}
