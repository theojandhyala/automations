import { useState } from 'react';
import { api } from '../lib/supabase';

type Catalogue={country_code:string;checked_at:string;tracks:Array<{id:string;title:string;artist:string;preview_url:string;genres:string[];rank:string;duration:number}>};
export function CommercialMusic({accounts}:{accounts:Array<{id:string;handle:string}>}) {
  const [account,setAccount]=useState(''); const [genre,setGenre]=useState('ALL');
  const [data,setData]=useState<Catalogue|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function load(){setBusy(true);setError('');setData(null);try{setData(await api<Catalogue>(`/tiktok/accounts/${account}/commercial-music?genre=${encodeURIComponent(genre)}`));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <details className="card" style={{marginBottom:16}}><summary>Commercial music · UK catalogue</summary>
    <p>Preview eligible tracks from TikTok’s commercial library. Loading or playing a preview does not change a post’s soundtrack.</p>
    <div className="row"><label>TikTok music account<select aria-label="TikTok music account" disabled={busy} value={account} onChange={e=>{setAccount(e.target.value);setData(null);}}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>@{a.handle}</option>)}</select></label>
    <label>Music genre<select aria-label="Music genre" disabled={busy} value={genre} onChange={e=>{setGenre(e.target.value);setData(null);}}>{['ALL','POP','ELECTRONIC','TROPICAL_HOUSE','HIP_HOP/RAP'].map(g=><option key={g}>{g}</option>)}</select></label>
    <button disabled={busy||!account} onClick={()=>void load()}>{busy?'Checking music access…':'Load UK commercial tracks'}</button></div>
    {error&&<p role="alert">{error}</p>}
    {data&&<><p>Checked {new Date(data.checked_at).toLocaleString()} · {data.country_code} · last seven days · {data.tracks.length} tracks</p>{data.tracks.map(t=><div key={t.id} style={{padding:'12px 0',borderTop:'1px solid #ffffff22'}}><strong>{t.title} — {t.artist}</strong><p>Sound ID {t.id} · rank {t.rank} · {t.genres?.join(', ')}</p>{/^https:\/\//.test(t.preview_url)&&<audio controls preload="none" aria-label={`Preview ${t.title} by ${t.artist}`} src={t.preview_url}/>}</div>)}</>}
  </details>;
}
