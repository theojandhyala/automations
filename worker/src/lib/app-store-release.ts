import { appStoreToken } from './app-store';
import { appleCredentials } from './hq-apple';
import type { Env } from '../types';
/** Read the existing connected Apple account; never infer public availability from a submitted build. */
export async function connectedAppleRelease(env:Env,id:number,now=Date.now()):Promise<{available:boolean;reason:string}> {
 const credentials=await appleCredentials(env);if(!credentials)throw new Error('App Store Connect is not connected');
 const token=await appStoreToken(credentials);
 const get=async(path:string)=>{
  const url=new URL(path,'https://api.appstoreconnect.apple.com');
  if(url.origin!=='https://api.appstoreconnect.apple.com')throw new Error('Unexpected Apple pagination origin');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error(`App Store Connect availability check HTTP ${r.status}`);
  return await r.json() as {data:any;links?:{next?:string}};
 };
 const versions=await get(`/v1/apps/${id}/appStoreVersions?filter[platform]=IOS&limit=50`);
 const released=Array.isArray(versions.data)&&versions.data.some(v=>['READY_FOR_SALE','READY_FOR_DISTRIBUTION'].includes(v.attributes?.appStoreState)||v.attributes?.appVersionState==='READY_FOR_DISTRIBUTION');
 if(!released)return {available:false,reason:'App Store Connect: '+(Array.isArray(versions.data)?[...new Set(versions.data.map(v=>v.attributes?.appStoreState||v.attributes?.appVersionState||'unknown'))].join(', '):'no released iOS version')+'; publishing waits for release'};
 const availability=await get(`/v1/apps/${id}/appAvailabilityV2`);
 if(!availability.data?.id)throw new Error('Apple territory availability missing');
 let path:string|undefined=`/v2/appAvailabilities/${encodeURIComponent(availability.data.id)}/territoryAvailabilities?include=territory&limit=200`;
 for(let page=0;path&&page<5;page++){
  const result=await get(path);
  const gb=Array.isArray(result.data)?result.data.find(t=>t.relationships?.territory?.data?.id==='GBR'):null;
  if(gb){const a=gb.attributes??{};const date=a.releaseDate?Date.parse(a.releaseDate):null;
   const available=a.available===true && a.preOrderEnabled!==true && (date===null||Number.isFinite(date)&&date<=now);
   return {available,reason:available?'Released iOS version and GB territory verified in App Store Connect':'App Store Connect: GB territory is not currently available; publishing held'};
  }
  path=result.links?.next;
 }
 return {available:false,reason:'App Store Connect did not verify GB territory availability; publishing held'};
}
