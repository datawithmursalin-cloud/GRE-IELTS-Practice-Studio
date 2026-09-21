// Password-protected profile and score API for the static GitHub Pages app.
// This function uses its server-only database connection. Never put the
// database URL or a service-role key in browser code.
import postgres from 'npm:postgres@3.4.3';

const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
if (!databaseUrl) throw Error('SUPABASE_DB_URL is missing');
const sql = postgres(databaseUrl, {prepare:false,max:1,idle_timeout:20});
const allowedOrigins = new Set([
  'https://datawithmursalin-cloud.github.io',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3000',
  'http://localhost:3001'
]);
const modes = new Set(['full','noEssay','verbalOnly','quantOnly','diagnostic','custom','ielts-reading','ielts-listening','ielts-writing1','ielts-writing2']);
const encoder = new TextEncoder();

function bytesToBase64(bytes) {return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function base64ToBytes(value) {const base=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(base.padEnd(Math.ceil(base.length/4)*4,'=')),letter=>letter.charCodeAt(0));}
function secureEqual(left,right) {if(typeof left!=='string'||typeof right!=='string'||left.length!==right.length)return false;let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0;}
async function sha256(value) {const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(salt),iterations:600000},key,256);
  return bytesToBase64(new Uint8Array(bits));
}
function passwordFrom(value) {if(typeof value!=='string'||value.length<4||value.length>128)throw Error('Use a password of 4–128 characters.');return value;}
function profileName(value) {
  if(typeof value!=='string')throw Error('Enter a profile name.');
  const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(!name||name.length>40||!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name))throw Error('Use a name of up to 40 letters, numbers, spaces, periods, apostrophes, or hyphens.');
  return name;
}
function publicProfile(row) {return {id:row.id,name:row.name,claimed:Boolean(row.password_hash)};}
function response(origin,status,data) {return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
async function bodyJson(request) {const body=await request.text();if(body.length>512000)throw Error('Request too large.');try{return JSON.parse(body);}catch{throw Error('Invalid JSON request.');}}
async function profileById(id) {const rows=await sql`select id,name,password_salt,password_hash,claim_code_hash,is_admin from studio.profiles where id=${id} limit 1`;return rows[0]||null;}
async function sessionFor(request) {
  const token=request.headers.get('Authorization')?.match(/^Bearer (studio_[A-Za-z0-9_-]+)$/)?.[1];
  if(!token)return null;
  const hash=await sha256(token);
  const rows=await sql`select p.id,p.name,p.is_admin,s.token_hash from studio.sessions s join studio.profiles p on p.id=s.profile_id where s.token_hash=${hash} and s.expires_at>now() limit 1`;
  return rows[0]||null;
}
async function issueSession(profile) {
  const token=`studio_${bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))}`;
  const hash=await sha256(token);
  await sql`insert into studio.sessions(token_hash,profile_id,expires_at) values(${hash},${profile.id},now()+interval '30 days')`;
  return {token,user:{id:profile.id,name:profile.name,isAdmin:Boolean(profile.is_admin)}};
}
async function failedAttempt(id) {
  await sql`insert into studio.login_attempts(profile_id,failures,blocked_until) values(${id},1,null)
    on conflict(profile_id) do update set
      failures=case when studio.login_attempts.blocked_until is not null and studio.login_attempts.blocked_until<=now() then 1 else studio.login_attempts.failures+1 end,
      blocked_until=case when studio.login_attempts.blocked_until is not null and studio.login_attempts.blocked_until>now() then studio.login_attempts.blocked_until
        when studio.login_attempts.blocked_until is not null and studio.login_attempts.blocked_until<=now() then null
        when studio.login_attempts.failures+1>=5 then now()+interval '15 minutes' else null end`;
}
async function blocked(id) {const rows=await sql`select blocked_until from studio.login_attempts where profile_id=${id} and blocked_until>now()`;return rows.length>0;}
async function clearAttempts(id) {await sql`delete from studio.login_attempts where profile_id=${id}`;}
function validMeasure(measure) {return measure&&Number.isInteger(measure.correct)&&Number.isInteger(measure.total)&&measure.correct>=0&&measure.total>=measure.correct&&measure.total<=1000;}
function validRecord(item) {
  if(!item||typeof item.id!=='string'||item.id.length<1||item.id.length>100||!modes.has(item.mode)||!Number.isFinite(Date.parse(item.completedAt))||!validMeasure(item.verbal)||!validMeasure(item.quant))return false;
  if(item.mode.startsWith('ielts-')&&!validMeasure(item.ielts))return false;
  return JSON.stringify(item).length<=5000;
}
async function registrationAllowed(request) {
  const address=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if(!address)return true;
  const hash=await sha256(address);
  const rows=await sql`insert into studio.registration_attempts(ip_hash,attempts) values(${hash},1)
    on conflict(ip_hash) do update set
      attempts=case when studio.registration_attempts.window_started_at<now()-interval '1 hour' then 1 else studio.registration_attempts.attempts+1 end,
      window_started_at=case when studio.registration_attempts.window_started_at<now()-interval '1 hour' then now() else studio.registration_attempts.window_started_at end
    returning attempts`;
  return rows[0].attempts<=5;
}

Deno.serve(async request => {
  const origin=request.headers.get('Origin');
  if(origin&&!allowedOrigins.has(origin))return response(null,403,{error:'Origin not allowed.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Max-Age':'600'}});
  const path=new URL(request.url).pathname.replace(/^\/studio-api/,'');
  try {
    if(path==='/profiles'&&request.method==='GET') {
      const rows=await sql`select id,name,password_hash from studio.profiles order by created_at,id`;
      return response(origin,200,{profiles:rows.map(publicProfile)});
    }
    if(path==='/register'&&request.method==='POST') {
      const body=await bodyJson(request),name=profileName(body.name),password=passwordFrom(body.password);
      if(!await registrationAllowed(request))return response(origin,429,{error:'Too many new profiles. Try again later.'});
      const id=`profile-${crypto.randomUUID()}`,salt=bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt);
      try {
        await sql`insert into studio.profiles(id,name,name_key,password_salt,password_hash) values(${id},${name},${name.toLocaleLowerCase()},${salt},${hash})`;
      } catch(error) {if(error.code==='23505')return response(origin,409,{error:'That profile name already exists.'});throw error;}
      return response(origin,201,await issueSession({id,name}));
    }
    if(path==='/claim'&&request.method==='POST') {
      const body=await bodyJson(request),id=String(body.id||''),code=String(body.code||'').trim().toUpperCase(),password=passwordFrom(body.password);
      const profile=await profileById(id);
      if(!profile||profile.password_hash||!profile.claim_code_hash)return response(origin,400,{error:'This profile cannot be set up here.'});
      if(await blocked(id))return response(origin,429,{error:'Too many attempts. Try again in 15 minutes.'});
      if(!secureEqual(await sha256(code),profile.claim_code_hash)){await failedAttempt(id);return response(origin,401,{error:'Invalid setup code.'});}
      const salt=bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt);
      const changed=await sql`update studio.profiles set password_salt=${salt},password_hash=${hash},claim_code_hash=null where id=${id} and password_hash is null and claim_code_hash=${profile.claim_code_hash} returning id,name,is_admin`;
      if(!changed.length)return response(origin,409,{error:'Profile was already set up. Sign in instead.'});
      await clearAttempts(id);
      return response(origin,200,await issueSession(changed[0]));
    }
    if(path==='/login'&&request.method==='POST') {
      const body=await bodyJson(request),id=String(body.id||''),password=String(body.password||'');
      const profile=await profileById(id);
      if(!profile||!profile.password_hash)return response(origin,401,{error:'Invalid profile or password.'});
      if(await blocked(id))return response(origin,429,{error:'Too many attempts. Try again in 15 minutes.'});
      if(!secureEqual(await passwordHash(password,profile.password_salt),profile.password_hash)){await failedAttempt(id);return response(origin,401,{error:'Invalid profile or password.'});}
      await clearAttempts(id);
      return response(origin,200,await issueSession(profile));
    }
    const session=await sessionFor(request);
    if(!session)return response(origin,401,{error:'Sign in to this profile.'});
    if(path==='/session'&&request.method==='GET')return response(origin,200,{user:{id:session.id,name:session.name,isAdmin:Boolean(session.is_admin)}});
    if(path==='/logout'&&request.method==='POST') {await sql`delete from studio.sessions where token_hash=${session.token_hash}`;return response(origin,200,{user:null});}
    if(path==='/question-usage'&&request.method==='GET') {
      const rows=await sql`select question_id,seen_count from studio.question_usage where profile_id=${session.id}`;
      return response(origin,200,{usage:Object.fromEntries(rows.map(row=>[row.question_id,row.seen_count]))});
    }
    if(path==='/question-usage'&&request.method==='POST') {
      const body=await bodyJson(request),ids=body.ids;
      if(!Array.isArray(ids)||ids.length>100||!ids.every(id=>typeof id==='string'&&/^(?:v\d+|q\d+|bq\d+|essay\d+|ielts:(?:reading|listening|writing1|writing2):[a-zA-Z0-9_-]{1,100})$/.test(id)))return response(origin,400,{error:'Invalid question usage.'});
      await sql.begin(async transaction=>{for(const id of new Set(ids))await transaction`insert into studio.question_usage(profile_id,question_id,seen_count) values(${session.id},${id},1) on conflict(profile_id,question_id) do update set seen_count=least(studio.question_usage.seen_count+1,100000)`;});
      return response(origin,200,{saved:ids.length});
    }
    if(path.startsWith('/admin/')) {
      if(!session.is_admin)return response(origin,403,{error:'Admin access required.'});
      if(path==='/admin/profiles'&&request.method==='GET') {
        const rows=await sql`select p.id,p.name,p.created_at,count(h.id)::integer as score_count,max(h.completed_at) as last_score_at from studio.profiles p left join studio.score_history h on h.profile_id=p.id where p.id<>${session.id} group by p.id,p.name,p.created_at order by p.created_at,p.id`;
        return response(origin,200,{profiles:rows.map(row=>({id:row.id,name:row.name,createdAt:row.created_at,scoreCount:row.score_count,lastScoreAt:row.last_score_at}))});
      }
      const match=path.match(/^\/admin\/profiles\/(profile-[0-9a-f-]{36}|mursalin|ramisa)(?:\/history)?$/);
      if(!match)return response(origin,404,{error:'Not found.'});
      const targetId=match[1];
      if(targetId===session.id)return response(origin,400,{error:'Use your own profile settings for this account.'});
      const target=await profileById(targetId);
      if(!target)return response(origin,404,{error:'Profile not found.'});
      if(path.endsWith('/history')&&request.method==='GET') {
        const rows=await sql`select record from studio.score_history where profile_id=${targetId} order by completed_at desc`;
        return response(origin,200,{profile:{id:target.id,name:target.name},records:rows.map(row=>row.record)});
      }
      if(path===`/admin/profiles/${targetId}`&&request.method==='DELETE') {
        if(target.is_admin)return response(origin,403,{error:'Another admin profile cannot be removed here.'});
        const body=await bodyJson(request),admin=await profileById(session.id);
        if(!secureEqual(await passwordHash(String(body.password||''),admin.password_salt),admin.password_hash))return response(origin,401,{error:'Current password is incorrect.'});
        await sql`delete from studio.profiles where id=${targetId} and is_admin=false`;
        return response(origin,200,{deleted:targetId});
      }
      return response(origin,405,{error:'Method not allowed.'});
    }
    if(path==='/profile'&&request.method==='PATCH') {
      const body=await bodyJson(request),name=profileName(body.name);
      try {
        const rows=await sql`update studio.profiles set name=${name},name_key=${name.toLocaleLowerCase()} where id=${session.id} returning id,name,is_admin`;
        return response(origin,200,{user:{id:rows[0].id,name:rows[0].name,isAdmin:Boolean(rows[0].is_admin)}});
      } catch(error) {if(error.code==='23505')return response(origin,409,{error:'That profile name already exists.'});throw error;}
    }
    if(path==='/profile'&&request.method==='DELETE') {
      const body=await bodyJson(request),profile=await profileById(session.id);
      if(!secureEqual(await passwordHash(String(body.password||''),profile.password_salt),profile.password_hash))return response(origin,401,{error:'Current password is incorrect.'});
      await sql`delete from studio.profiles where id=${session.id}`;
      return response(origin,200,{deleted:true});
    }
    if(path==='/password'&&request.method==='POST') {
      const body=await bodyJson(request),profile=await profileById(session.id),next=passwordFrom(body.newPassword);
      if(!secureEqual(await passwordHash(String(body.currentPassword||''),profile.password_salt),profile.password_hash))return response(origin,401,{error:'Current password is incorrect.'});
      const salt=bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(next,salt);
      await sql`update studio.profiles set password_salt=${salt},password_hash=${hash} where id=${session.id}`;
      await sql`delete from studio.sessions where profile_id=${session.id}`;
      return response(origin,200,await issueSession(session));
    }
    if(path==='/history'&&request.method==='GET') {
      const rows=await sql`select record from studio.score_history where profile_id=${session.id} order by completed_at desc limit 1000`;
      return response(origin,200,{records:rows.map(row=>row.record)});
    }
    if(path==='/history'&&request.method==='POST') {
      const body=await bodyJson(request),records=body.records;
      if(!Array.isArray(records)||records.length>1000||!records.every(validRecord))return response(origin,400,{error:'Invalid score history.'});
      await sql.begin(async transaction=>{for(const record of records)await transaction`insert into studio.score_history(profile_id,id,completed_at,record) values(${session.id},${record.id},${record.completedAt},${transaction.json(record)}) on conflict(profile_id,id) do update set completed_at=excluded.completed_at,record=excluded.record`;});
      return response(origin,200,{saved:records.length});
    }
    if(path.startsWith('/history/')&&request.method==='DELETE') {
      const id=decodeURIComponent(path.slice('/history/'.length));
      if(!id||id.length>100)return response(origin,400,{error:'Invalid score ID.'});
      await sql`delete from studio.score_history where profile_id=${session.id} and id=${id}`;
      return response(origin,200,{deleted:id});
    }
    return response(origin,404,{error:'Not found.'});
  } catch(error) {
    console.error('Studio API error',error);
    return response(origin,error.message==='Request too large.'?413:400,{error:'Request could not be completed.'});
  }
});
