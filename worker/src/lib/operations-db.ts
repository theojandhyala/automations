import { operationsSchema, type ColumnSpec } from './operations-schema';

type Row = Record<string, unknown>;
type Value = string | number | null;
const namePattern = /^[a-z_][a-z0-9_]*$/;
const quote = (name: string) => { if (!namePattern.test(name)) throw new Error('Invalid column'); return `"${name}"`; };
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sort(x)])) : v;
  return JSON.stringify(sort(value));
}
function encode(value: unknown, spec: ColumnSpec): Value {
  if (value === null) return null;
  if (spec.kind === 'json') return canonicalJson(value);
  if (spec.kind === 'boolean') { if (typeof value !== 'boolean') throw new Error('Expected boolean'); return Number(value); }
  if (spec.kind === 'timestamp') { const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error('Invalid timestamp'); return d.toISOString(); }
  if (spec.kind === 'number') { const n = Number(value); if (!Number.isFinite(n)) throw new Error('Invalid number'); return n; }
  if (typeof value !== 'string') throw new Error('Expected string');
  return value;
}
function tableSchema(table: string) { const s=operationsSchema[table]; if(!s) throw new Error(`Unknown operations table: ${table}`); return s; }
function decode(table: string, row: Row): Row {
  const schema=tableSchema(table);
  return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===null?v:schema[k]?.kind==='json'?JSON.parse(String(v)):schema[k]?.kind==='boolean'?Boolean(v):v]));
}
function column(table:string, path:string):{ sql:string; spec:ColumnSpec; nested:boolean } {
  const keys=path.split(/->>?/); const key=keys.shift()!; const spec=tableSchema(table)[key];
  if(!spec || keys.some(k=>!namePattern.test(k)))throw new Error(`Unknown ${table} column`);
  if(keys.length && spec.kind!=='json')throw new Error('JSON path requires JSON column');
  return {sql:keys.length?`json_extract(${quote(key)}, '$.${keys.join('.')}')`:quote(key),spec,nested:keys.length>0};
}
/** Only the small PostgREST query subset actually used by Jarvis is accepted. */
export function operationsWhere(table:string, params:URLSearchParams):{sql:string;values:Value[]} {
  const values:Value[]=[];
  function predicate(key:string, value:string):string {
    if(key==='or'||key==='and'){
      if(!value.startsWith('(')||!value.endsWith(')'))throw new Error('Invalid boolean filter');
      // Current Jarvis groups contain scalar predicates, never arbitrary SQL.
      const terms=value.slice(1,-1).split(',').map(term=>{const dot=term.indexOf('.');if(dot<1)throw new Error('Invalid filter');return predicate(term.slice(0,dot),term.slice(dot+1));});
      return '('+terms.join(key==='or'?' OR ':' AND ')+')';
    }
    const {sql,spec,nested}=column(table,key);
    if(value.startsWith('not.'))return `NOT (${predicate(key,value.slice(4))})`;
    const dot=value.indexOf('.');if(dot<1)throw new Error('Invalid filter operator');
    const op=value.slice(0,dot), raw=value.slice(dot+1);
    const scalar=(v:string):Value=>nested?(v==='true'?1:v==='false'?0:v):encode(spec.kind==='json'?JSON.parse(v):spec.kind==='boolean'?v==='true'?true:v==='false'?false:undefined:v,spec);
    if(op==='is') {if(raw==='null')return `${sql} IS NULL`;if(raw==='true'||raw==='false'){values.push(Number(raw==='true'));return `${sql} IS ?`;}throw new Error('Invalid is filter');}
    if(op==='in'){
      if(!raw.startsWith('(')||!raw.endsWith(')'))throw new Error('Invalid in filter');
      const items=raw.slice(1,-1)?raw.slice(1,-1).split(','):[];
      if(!items.length)return '0'; values.push(...items.map(scalar));return `${sql} IN (${items.map(()=>'?').join(',')})`;
    }
    const operators:Record<string,string>={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='};
    if(!operators[op])throw new Error('Unsupported filter operator');
    values.push(scalar(raw)); return `${sql} ${operators[op]} ?`;
  }
  const clauses=[];
  for(const [key,value] of params){if(['select','order','limit','offset'].includes(key))continue;clauses.push(predicate(key,value));}
  return {sql:clauses.length?' WHERE '+clauses.join(' AND '):'',values};
}

export class OperationsDb {
  constructor(readonly database:D1Database, readonly now:()=>Date = ()=>new Date()){}
  async select<T>(table:string,query=''):Promise<T[]> {
    tableSchema(table);const params=new URLSearchParams(query), where=operationsWhere(table,params);
    const selected=params.get('select')??'*';
    const fields=selected==='*'?'*':selected.split(',').map(k=>{column(table,k);return quote(k);}).join(',');
    const order=params.get('order');const ordering=order?' ORDER BY '+order.split(',').map(item=>{const [key,direction='asc',nulls]=item.split('.');const col=column(table,key!);if(!['asc','desc'].includes(direction)||nulls&&!['nullsfirst','nullslast'].includes(nulls))throw new Error('Invalid order');return col.sql+' '+direction.toUpperCase()+' NULLS '+(nulls==='nullsfirst'||!nulls&&direction==='desc'?'FIRST':'LAST');}).join(','):'';
    const limit=params.get('limit'), offset=params.get('offset');
    const bounded=(v:string,max:number)=>{if(!/^\d+$/.test(v)||Number(v)>max)throw new Error('Invalid query bound');return Number(v);};
    const paging=limit!==null?' LIMIT '+bounded(limit,100000)+(offset!==null?' OFFSET '+bounded(offset,10000000):''):offset!==null?' LIMIT -1 OFFSET '+bounded(offset,10000000):'';
    const result=await this.database.prepare(`SELECT ${fields} FROM ${quote(table)}${where.sql}${ordering}${paging}`).bind(...where.values).all<Row>();
    return result.results.map(r=>decode(table,r)) as T[];
  }
  async selectOne<T>(table:string,query=''):Promise<T|null>{const p=new URLSearchParams(query);p.set('limit','1');return (await this.select<T>(table,p.toString()))[0]??null;}
  private insertStatement(table:string,value:unknown,conflict?:string):D1PreparedStatement {
    if(!value||typeof value!=='object'||Array.isArray(value)||table==='tiktok_accounts_public')throw new Error('Expected mutable row');
    const schema=tableSchema(table);const row={...value} as Row;
    for(const [k,s] of Object.entries(schema))if(!(k in row)) {if(s.generated==='uuid')row[k]=crypto.randomUUID();else if(s.generated==='now')row[k]=this.now().toISOString();}
    const entries=Object.entries(row).filter(([,v])=>v!==undefined);
    for(const [k] of entries)if(!schema[k])throw new Error(`Unknown ${table} column: ${k}`);
    if(conflict && schema.updated_at && !('updated_at' in row))row.updated_at=this.now().toISOString();
    const changed=Object.keys(value).filter(k=>k!=='id');
    if(conflict && schema.updated_at && !changed.includes('updated_at'))changed.push('updated_at');
    const upsert=conflict?' ON CONFLICT ('+conflict.split(',').map(k=>{column(table,k);return quote(k);}).join(',')+') DO UPDATE SET '+changed.map(k=>`${quote(k)}=excluded.${quote(k)}`).join(','):'';
    return this.database.prepare(`INSERT INTO ${quote(table)} (${entries.map(([k])=>quote(k)).join(',')}) VALUES (${entries.map(()=>'?').join(',')})${upsert} RETURNING *`).bind(...entries.map(([k,v])=>encode(v,schema[k]!)));
  }
  async insert<T>(table:string,row:unknown):Promise<T>{const result=await this.insertStatement(table,row).first<Row>();if(!result)throw new Error('Insert returned no row');return decode(table,result) as T;}
  async insertMany(table:string,rows:unknown[]):Promise<void>{if(rows.length)await this.database.batch(rows.map(r=>this.insertStatement(table,r)));}
  async upsert<T>(table:string,row:unknown,conflict:string):Promise<T>{const result=await this.insertStatement(table,row,conflict).first<Row>();if(!result)throw new Error('Upsert returned no row');return decode(table,result) as T;}
  async update<T>(table:string,query:string,value:unknown):Promise<T[]> {
    if(!value||typeof value!=='object'||Array.isArray(value)||table==='tiktok_accounts_public')throw new Error('Expected mutable patch');
    const schema=tableSchema(table), row={...value} as Row;
    if(schema.updated_at&&!('updated_at' in row))row.updated_at=this.now().toISOString();
    const entries=Object.entries(row).filter(([,v])=>v!==undefined);if(!entries.length)return [];
    for(const [k]of entries)if(!schema[k])throw new Error('Unknown update column');
    const where=operationsWhere(table,new URLSearchParams(query));
    const result=await this.database.prepare(`UPDATE ${quote(table)} SET ${entries.map(([k])=>`${quote(k)}=?`).join(',')}${where.sql} RETURNING *`).bind(...entries.map(([k,v])=>encode(v,schema[k]!)),...where.values).all<Row>();
    return result.results.map(r=>decode(table,r)) as T[];
  }
  async rpc<T>(fn:string,args:Row={}):Promise<T>{
    const now=this.now().toISOString();const stale=new Date(Date.parse(now)-15*60000).toISOString();
    if(fn==='claim_due_automations'||fn==='claim_automation'){
      const condition=fn==='claim_automation'?`id=?`:`enabled=1 AND cron IS NOT NULL AND next_run_at IS NOT NULL AND next_run_at<=?`;
      const params=fn==='claim_automation'?[String(args.p_id)]:[now];
      const limit=fn==='claim_automation'?1:Number(args.p_limit??20);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid claim limit');
      const result=await this.database.prepare(`UPDATE automations SET status='running',running_since=?,updated_at=? WHERE id IN (SELECT id FROM automations WHERE ${condition} AND status<>'disabled' AND (status<>'running' OR running_since IS NULL OR running_since<?) ORDER BY next_run_at LIMIT ?) RETURNING *`).bind(now,now,...params,stale,limit).all<Row>();
      return result.results.map(r=>decode('automations',r)) as T;
    }
    if(fn==='claim_tiktok_refresh'){
      const result=await this.database.prepare('UPDATE tiktok_accounts SET refresh_locked_until=?,updated_at=? WHERE id=? AND (refresh_locked_until IS NULL OR refresh_locked_until<?) RETURNING *').bind(new Date(Date.parse(now)+60000).toISOString(),now,String(args.p_account_id),now).all<Row>();
      return result.results.map(r=>decode('tiktok_accounts',r)) as T;
    }
    if(fn==='configure_five_daily_posting')return await this.configureFive(now) as T;
    if(fn==='reserve_tiktok_delivery')return await this.reserve(args,now) as T;
    throw new Error(`Operations RPC is not implemented: ${fn}`);
  }
  private async configureFive(now:string):Promise<Row>{
    const matchingAccount=`c.status='connected' AND p.promotion_enabled=1 AND ((p.slug='deadset' AND lower(ltrim(c.handle,'@'))='deadset.app') OR (p.slug='cast' AND lower(ltrim(c.handle,'@'))='cast.fishing.app'))`;
    const guard=`(SELECT COUNT(*) FROM tiktok_accounts c JOIN apps p ON p.id=c.app_id WHERE ${matchingAccount})=2
      AND (SELECT COUNT(*) FROM automations WHERE handler_key='tiktok.publish' AND enabled=1)=1
      AND (SELECT COUNT(*) FROM automations WHERE handler_key='tiktok.generate' AND enabled=1 AND json_extract(config,'$.app_slug') IN ('deadset','cast'))=2
      AND (SELECT COUNT(*) FROM automations WHERE handler_key='tiktok.produce' AND enabled=1 AND json_extract(config,'$.app_slug') IN ('deadset','cast'))=2`;
    // D1 batch is a transaction. The invalid-JSON branch aborts before any
    // settings change when the live destination/mission preconditions fail.
    await this.database.batch([
      this.database.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE json('Both matching accounts and enabled pipeline missions are required') END AS ready`),
      this.database.prepare(`UPDATE automations SET config=json_set(json_remove(config,'$.local_hours'),'$.timezone','Europe/London','$.local_times',json('[' || '"10:00","12:00","14:00","16:00","18:30"' || ']')),cron='* * * * *',updated_at=? WHERE handler_key='tiktok.publish'`).bind(now),
      this.database.prepare(`UPDATE automations SET config=json_set(config,'$.count',5),updated_at=? WHERE handler_key='tiktok.generate' AND json_extract(config,'$.app_slug') IN ('deadset','cast')`).bind(now),
      this.database.prepare(`UPDATE tiktok_accounts SET daily_post_limit=5,updated_at=? WHERE id IN (SELECT c.id FROM tiktok_accounts c JOIN apps p ON p.id=c.app_id WHERE ${matchingAccount})`).bind(now),
    ]);
    return {timezone:'Europe/London',local_times:['10:00','12:00','14:00','16:00','18:30'],daily_post_limit:5,note:'Five daily slots saved for both accounts. Only reviewed, approved posts can publish.'};
  }
  private async reserve(args:Row,now:string):Promise<boolean>{
    if(!args.p_expected||typeof args.p_expected!=='object'||Array.isArray(args.p_expected))return false;
    const expected=Object.entries(args.p_expected as Row);if(!expected.length)return false;
    const schema=tableSchema('artifacts');if(expected.some(([k])=>!schema[k]))return false;
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
    const part=(type:string)=>parts.find(p=>p.type===type)!.value;
    const day=`${part('year')}-${part('month')}-${part('day')}`,minute=Number(part('hour'))*60+Number(part('minute'));
    const slotMinutes=[600,720,840,960,1110];const found=slotMinutes.find(s=>minute>=s&&minute<s+5);
    if(args.p_scheduled&&found===undefined)return false;
    const slot=args.p_scheduled?(found===1110?'18:30':String(Math.floor(found!/60))):`manual:${args.p_artifact_id}`;
    // Determine the UTC start of the London day, including both DST transitions.
    let start=Date.parse(day+'T00:00:00Z');
    for(let i=0;i<2;i++){
      const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(start));const v=(k:string)=>p.find(x=>x.type===k)!.value;
      const rendered=Date.parse(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}Z`);start-=rendered-Date.parse(day+'T00:00:00Z');
    }
    const matches=expected.map(([k])=>`a.${quote(k)} IS ?`).join(' AND ');
    const reserve=this.database.prepare(`INSERT INTO tiktok_delivery_slots(artifact_id,account_id,local_day,slot,reserved_at)
      SELECT a.id,c.id,?,?,? FROM artifacts a JOIN tiktok_accounts c ON c.id=a.account_id JOIN apps p ON p.id=a.app_id
      WHERE a.id=? AND a.status='approved' AND a.publish_id IS NULL AND (a.scheduled_for IS NULL OR a.scheduled_for<=?)
      AND c.status='connected' AND c.app_id=a.app_id AND p.promotion_enabled=1 AND p.slug IN ('deadset','cast','lifescore','reclaim')
      AND p.slug=json_extract(a.asset_manifest,'$.app_slug') AND lower(ltrim(c.handle,'@'))=CASE p.slug WHEN 'deadset' THEN 'deadset.app' WHEN 'cast' THEN 'cast.fishing.app' WHEN 'lifescore' THEN 'lifescore.app' WHEN 'reclaim' THEN 'reclaim.addiction.app' ELSE '' END
      AND NOT EXISTS(SELECT 1 FROM artifacts WHERE account_id=c.id AND status='publishing')
      AND (SELECT COUNT(*) FROM (SELECT artifact_id AS id FROM tiktok_delivery_slots WHERE account_id=c.id AND local_day=? UNION SELECT id FROM artifacts WHERE account_id=c.id AND status='published' AND published_at>=?))<min(c.daily_post_limit,5)
      AND ${matches} ON CONFLICT DO NOTHING RETURNING artifact_id`).bind(day,slot,now,String(args.p_artifact_id),now,day,new Date(start).toISOString(),...expected.map(([k,v])=>encode(v,schema[k]!)));
    const update=this.database.prepare(`UPDATE artifacts SET status='publishing',stage='publish',error=NULL,updated_at=? WHERE id=? AND changes()=1`).bind(now,String(args.p_artifact_id));
    const results=await this.database.batch([reserve,update]);return results[0]!.results.length===1;
  }
}
