import type { Db } from './db';

// Read-only dashboard relations. The credential-bearing account and integration
// tables are intentionally absent. This handler is called after owner auth.
const relations = new Set(['apps','automations','artifacts','tiktok_accounts_public','runs','run_events','analytics_snapshots','post_metrics','daily_reports','creative_assets']);
export async function readOwnerData(req:Request, db:Db, table:string):Promise<Response> {
  if (!relations.has(table) || !['GET','HEAD'].includes(req.method)) return Response.json({message:'Read-only relation unavailable'}, {status:404});
  const url=new URL(req.url), params=new URLSearchParams(url.search);
  if (url.search.length>12000) return Response.json({message:'Query too large'}, {status:400});
  const countRequested=(req.headers.get('Prefer')??'').includes('count=exact');
  if (!params.has('limit')) params.set('limit','1000');
  if (Number(params.get('limit'))>2000) return Response.json({message:'Read limit exceeded'}, {status:400});
  try {
    const rows=await db.select<Record<string,unknown>>(table,params.toString());
    let count:number|null=null;
    if(countRequested){
      const countParams=new URLSearchParams(params);for(const key of ['limit','offset','order'])countParams.delete(key);
      // The existing dashboards only count artifacts; return IDs, not bodies.
      countParams.set('select','id');countParams.set('limit','100000');
      count=(await db.select(table,countParams.toString())).length;
    }
    const single=(req.headers.get('Accept')??'').includes('application/vnd.pgrst.object+json');
    const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
    if(count!==null)headers.set('Content-Range',`${rows.length?'0-'+(rows.length-1):'*'}/${count}`);
    if(single && rows.length!==1)return Response.json({code:'PGRST116',message:'Expected exactly one row',details:`The result contains ${rows.length} rows`},{status:406,headers});
    return new Response(req.method==='HEAD'?null:JSON.stringify(single?rows[0]:rows),{headers});
  } catch {return Response.json({message:'Invalid dashboard query'},{status:400});}
}
