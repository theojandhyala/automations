import { DEADSET_NATIVE_TEMPLATE } from './creative-photo-templates';
import { z } from 'zod';
import type { Env, Artifact } from '../types';
import { Db } from './db';
import { uploadMedia, publicMediaUrl } from './storage';
import { CREATIVE_DIRECTION_VERSION } from './creative-direction';
import { assessCreativeQuality } from './creative-quality';

export const NATIVE_IMPORT_RENDERER = 'local-native-import-v1';
const source = z.object({ kind: z.enum(['licensed_photo', 'first_party_ui']), source_url: z.string().url().max(2000), creator: z.string().min(1).max(200), licence_url: z.string().url().max(2000).optional() }).strict();
export const nativePostSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), app_slug: z.enum(['cast','deadset']),
  hook: z.string().trim().min(1).max(90), caption: z.string().trim().min(1).max(1500),
  hashtags: z.array(z.string().regex(/^[\p{L}\p{N}_]+$/u).max(80)).min(1).max(8),
  promotional: z.boolean(), feature_key: z.string().max(60).optional(),
  reference_urls: z.array(z.string().url().max(2000)).min(1).max(5),
  slides: z.array(z.object({file: z.string().regex(/^slide-\d{2}\.jpg$/), role: z.enum(['hook','feature','editorial']), overlay: z.string().min(1).max(90), body: z.string().max(120).default(''), source }).strict()).min(2).max(6),
}).strict().superRefine((p,ctx)=>{
  const expected=p.app_slug==='cast'?6:2;
  if(p.slides.length!==expected)ctx.addIssue({code:'custom',message:`${p.app_slug} needs ${expected} slides.`});
  if(p.slides.some((s,i)=>s.file!==`slide-${String(i+1).padStart(2,'0')}.jpg` || s.role!==(i===0?'hook':p.app_slug==='cast'?'editorial':'feature')))ctx.addIssue({code:'custom',message:'Slide roles and filenames must match posting order.'});
  if(p.slides[0]?.overlay!==p.hook)ctx.addIssue({code:'custom',message:'The hook must match slide one.'});
  if(p.app_slug==='deadset' && p.slides[1]?.source.kind!=='first_party_ui')ctx.addIssue({code:'custom',message:'Deadset needs genuine app proof.'});
  if(p.slides.some(s=>s.source.kind==='licensed_photo'&&!s.source.licence_url))ctx.addIssue({code:'custom',message:'Every stock photo needs a licence record.'});
});
const reply=(body:unknown,status=200)=>Response.json(body,{status});
export function jpegDimensions(b:Uint8Array):{width:number;height:number}|null {
  if(b[0]!==255||b[1]!==216)return null;
  let p=2;
  while(p+8<b.length){
    if(b[p++]!==255)return null;
    while(b[p]===255)p++;
    const marker=b[p++];
    if(marker===217||marker===218)return null;
    const length=(b[p]!<<8)|b[p+1]!;
    if(length<2||p+length>b.length)return null;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker!))return {height:(b[p+3]!<<8)|b[p+4]!,width:(b[p+5]!<<8)|b[p+6]!};
    p+=length;
  }
  return null;
}
const digest=async(b:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(v=>v.toString(16).padStart(2,'0')).join('');

/** Called only after the existing owner authentication. Imports never grant approval. */
export async function importNativePost(req:Request,env:Env,db:Db):Promise<Response>{
  const max=20*1024*1024;
  if(Number(req.headers.get('content-length'))>max)return reply({error:'Post package exceeds 20 MB.'},413);
  if(!req.body)return reply({error:'A post package is required.'},400);
  const reader=req.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return reply({error:'Post package exceeds 20 MB.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let form:FormData;
  try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')??''}}).formData();}catch{return reply({error:'Use a multipart post package.'},400);}
  const raw=form.get('post');
  if(typeof raw!=='string'||raw.length>20000)return reply({error:'A bounded post manifest is required.'},400);
  let parsed:ReturnType<typeof nativePostSchema.safeParse>;
  try{parsed=nativePostSchema.safeParse(JSON.parse(raw));}catch{return reply({error:'Invalid post manifest JSON.'},400);}
  if(!parsed.success)return reply({error:parsed.error.issues.map(i=>i.message).join(' ')},400);
  const pack=parsed.data;
  const files=form.getAll('slides');
  if(files.length!==pack.slides.length||files.some((f,i)=>!(f instanceof File)||f.name!==pack.slides[i]!.file||f.type!=='image/jpeg'||f.size<=0||f.size>4*1024*1024))return reply({error:'Supply the ordered JPEG slides; each must be under 4 MB.'},400);
  const images:Uint8Array[]=[];const hashes:string[]=[];
  for(const f of files as File[]){const b=new Uint8Array(await f.arrayBuffer());const d=jpegDimensions(b);if(d?.width!==1080||d.height!==1920)return reply({error:'Every slide must be a 1080×1920 JPEG.'},400);images.push(b);hashes.push(await digest(b));}
  const fingerprint=await digest(new TextEncoder().encode(JSON.stringify({pack,hashes})));
  const existing=await db.selectOne<Artifact>('artifacts',`id=eq.${pack.id}&select=*`);
  if(existing)return (existing.asset_manifest.production as {import_fingerprint?:string}|undefined)?.import_fingerprint===fingerprint?reply(existing):reply({error:'This package ID already belongs to different content. Use a new package ID.'},409);
  const app=await db.selectOne<{id:string}>('apps',`slug=eq.${pack.app_slug}&select=id`);
  if(!app)return reply({error:'App channel not found.'},404);
  const accounts=await db.select<{id:string}>('tiktok_accounts',`app_id=eq.${app.id}&status=eq.connected&select=id&limit=2`);
  if(accounts.length!==1)return reply({error:'Import requires exactly one connected account for this app channel.'},409);
  const urls:string[]=[];
  for(let i=0;i<images.length;i++){const path=`outputs/${pack.id}/native-${i+1}-${hashes[i]}.jpg`;await uploadMedia(env,path,images[i]!, 'image/jpeg');urls.push(publicMediaUrl(env,path));}
  const now=new Date().toISOString();
  const manifest={version:1,app_slug:pack.app_slug,format:pack.app_slug==='cast'?'cast_editorial_carousel':'two_slide_photo_carousel',creative_direction_version:CREATIVE_DIRECTION_VERSION,
    hook_visual_template:pack.app_slug==='deadset'?{id:DEADSET_NATIVE_TEMPLATE}:undefined, promotional:pack.promotional,feature:pack.feature_key,feature_key:pack.feature_key,requires_owner_review:true,source_policy:'licensed_real_only',generated_media:false,generated_people:false,fabricated_ui:false,
    reference_urls:pack.reference_urls,slides:pack.slides.map(s=>({role:s.role==='feature'?'feature_proof':s.role,overlay:s.overlay,body:s.body,kicker:'',app_asset_key:s.role==='feature'?pack.feature_key:undefined})),
    production:{renderer:NATIVE_IMPORT_RENDERER,rendered_at:now,dimensions:{width:1080,height:1920},output_format:'image/jpeg',import_fingerprint:fingerprint,
      per_slide_sources:pack.slides.map((s,i)=>({...s.source,photo_url:urls[i],sha256:hashes[i]})),provenance_status:'declared_sources_pending_release_review'},
    quality_gate:{publishable:false,required_before_publish:['Exact hosted slides inspected','Sources and product truth reviewed','Independent signed visual review','Existing owner hold resolved']},
  };
  const row={id:pack.id,app_id:app.id,account_id:accounts[0]!.id,status:'draft',stage:'review',media_type:'photo',hook:pack.hook,caption:pack.caption,hashtags:pack.hashtags,photo_urls:urls,thumbnail_url:urls[0],
    script:pack.slides.map((s,i)=>`Slide ${i+1}: ${s.overlay}${s.body?' — '+s.body:''}`).join('\n'),
    asset_manifest:{...manifest,creative_quality:assessCreativeQuality({hook:pack.hook,caption:pack.caption,hashtags:pack.hashtags,mediaType:'photo',assetManifest:manifest,photoUrls:urls})},
    stages:{assets:{state:'done',at:now,note:'Exact local JPEG exports imported with per-slide source declarations and hashes.'},edit:{state:'done',at:now,note:`${urls.length} ordered 1080×1920 slides imported without rerendering.`},review:{state:'pending',at:now,note:'Held for exact visual, source and owner review.'}},
    brand_organic_toggle:pack.promotional,brand_content_toggle:false,is_aigc:false};
  return reply(await db.insert<Artifact>('artifacts',row),201);
}
