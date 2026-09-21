import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { makePlan, makeQuestions, sectionScore, isAnswerCorrect } from './engine.mjs';
import { addPrivateVerbal, addPrivateQuant } from './questions.mjs';
import { createProfileStore } from './profiles.mjs';
import { leastUsed, normalizeUsage, recordUsage } from './question-usage.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const profiles = await createProfileStore(resolve(root,'local-profiles.json'));
const usagePath=resolve(root,'local-question-usage.json');
let usageByProfile={};
try{usageByProfile=JSON.parse(await readFile(usagePath,'utf8'));}catch{}
let usageWrite=Promise.resolve();
const usageFor=profileId=>normalizeUsage(usageByProfile[profileId]);
const markSeen=(profileId,ids)=>{
  usageByProfile[profileId]=recordUsage(usageFor(profileId),ids);
  const data=JSON.stringify(usageByProfile);
  usageWrite=usageWrite.catch(()=>{}).then(async()=>{await writeFile(`${usagePath}.tmp`,data);await rename(`${usagePath}.tmp`,usagePath);});
  return usageWrite;
};
const sessions = new Map();
const greSessionsByProfile = new Map();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const publicPaths = new Set(['/index.html','/styles.css','/enhancements.css','/app.mjs','/history.mjs','/ielts.mjs']);
const ieltsPaths = Object.fromEntries(['reading','listening','writing1','writing2'].map((name,i)=>[name,resolve(root,`local-ielts/IELTS-Study-main/data/${['reading/exercises','listening/exercises','writing/task1','writing/task2'][i]}.json`)]));
const privateGrePath = resolve(root, 'local-gre/manhattan-5lb-checked.json');
const privateQuantPath = resolve(root, 'local-gre/manhattan-5lb-quant-checked.json');
const ieltsData = {};
for (const [kind,path] of Object.entries(ieltsPaths)) {
  try { ieltsData[kind]=JSON.parse(await readFile(path,'utf8')); } catch { ieltsData[kind]=[]; }
}
try {const bank=JSON.parse(await readFile(privateGrePath,'utf8'));if(bank.format==='private-gre-bank-v1')addPrivateVerbal(bank.items);} catch {}
try {const bank=JSON.parse(await readFile(privateQuantPath,'utf8'));if(bank.format==='private-gre-quant-bank-v1')addPrivateQuant(bank.items);} catch {}

const json = (response,status,data,headers={}) => response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers}).end(JSON.stringify(data));
const cookie = request => request.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith('studio_session='))?.slice(15);
const session = request => {const token=cookie(request), active=token && sessions.get(token);if(!active || active.expires<Date.now()){if(token)sessions.delete(token);return null;}return active;};
const bodyJson = async request => {let body='';for await(const chunk of request){body+=chunk;if(body.length>65536)throw Error('Request too large');}return JSON.parse(body);};
const publicQuestion = q => {const {answer,explanation,origin,sourceId,...publicFields}=q;return {...publicFields,multiple:Array.isArray(answer)&&!q.blanks};};
const gradeText = (expected,value) => {
  const normalize = input => String(input??'').trim().toLowerCase().replace(/\s+/g,' ').replace(/[.,]+$/,'');
  if (!normalize(value)) return false;
  if (/^[a-z](,\s*[a-z])+$/i.test(String(expected))) return normalize(value).split(/\s*,\s*/).sort().join(',')===normalize(expected).split(/\s*,\s*/).sort().join(',');
  return normalize(value)===normalize(expected);
};
const validModes = new Set(['full','noEssay','verbalOnly','quantOnly','diagnostic','custom']);
const profileGreSessions = active => {
  const id=active.user.id;
  if(!greSessionsByProfile.has(id))greSessionsByProfile.set(id,new Map());
  return greSessionsByProfile.get(id);
};
const activeGre = (active,id) => active && profileGreSessions(active).get(id);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const route = pathname === '/' ? '/index.html' : pathname;
  if (route==='/api/session' && request.method==='GET') return json(response,200,{user:session(request)?.user||null});
  if (route==='/api/profiles' && request.method==='GET') return json(response,200,{profiles:profiles.list()});
  if (route==='/api/profile' && request.method==='POST') {
    try {
      const payload=await bodyJson(request);
      const user=await profiles.select(payload);
      const token=randomBytes(32).toString('hex');
      sessions.set(token,{user,expires:Date.now()+12*60*60*1000});
      return json(response,200,{user,profiles:profiles.list()},{'Set-Cookie':`studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
    } catch (error) {return json(response,400,{error:error.message||'Invalid profile request.'});}
  }
  if (route==='/api/logout' && request.method==='POST') {const token=cookie(request);if(token)sessions.delete(token);return json(response,200,{user:null},{'Set-Cookie':'studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if (route.startsWith('/api/gre/') || route.startsWith('/api/ielts/')) {
    const active=session(request);
    if(!active)return json(response,401,{error:'Sign in to practice.'});
    try {
      if(route==='/api/gre/start' && request.method==='POST') {
        const {mode,count}=await bodyJson(request);
        if(!validModes.has(mode))return json(response,400,{error:'Invalid test mode.'});
        const id=randomUUID(), plan=makePlan(mode,count);
        profileGreSessions(active).set(id,{plan,completed:[],sections:new Map()});
        return json(response,200,{id,plan});
      }
      if(route==='/api/gre/section' && request.method==='POST') {
        const {id,index}=await bodyJson(request), test=activeGre(active,id);
        if(!test || !Number.isInteger(index) || index!==test.completed.length || !test.plan[index])return json(response,400,{error:'Practice session unavailable. Start a new test.'});
        if(!test.sections.has(index)){
          const section={...test.plan[index],questions:makeQuestions(test.plan[index],test.completed,Math.random,usageFor(active.user.id))};
          test.sections.set(index,section);
          await markSeen(active.user.id,section.questions.map(question=>question.id));
        }
        const section=test.sections.get(index);
        return json(response,200,{...test.plan[index],questions:section.questions.map(publicQuestion)});
      }
      if(route==='/api/gre/submit' && request.method==='POST') {
        const {id,index,answers}=await bodyJson(request), test=activeGre(active,id), section=test?.sections.get(index);
        if(!section || index!==test.completed.length || !answers || typeof answers!=='object')return json(response,400,{error:'Practice section unavailable. Start a new test.'});
        section.answers=answers;
        const score=section.kind==='essay'?{correct:0,total:0}:sectionScore(section);
        const review=section.questions.map((q,i)=>({correct:section.kind==='essay'?null:isAnswerCorrect(q,answers[i]),answer:q.answer,explanation:q.explanation||''}));
        test.completed.push(section);test.sections.delete(index);
        return json(response,200,{score,review});
      }
      if(route==='/api/ielts/exercise' && request.method==='GET') {
        const params=new URL(request.url,'http://localhost').searchParams,kind=params.get('category'),id=params.get('id');
        const entries=ieltsData[kind],item=id?entries?.find((entry,i)=>(entry.id||String(i))===id):leastUsed(entries||[],usageFor(active.user.id),Math.random,entry=>`ielts:${kind}:${entry.id||String(entries.indexOf(entry))}`)[0];
        if(!item)return json(response,404,{error:'Exercise not found.'});
        await markSeen(active.user.id,[`ielts:${kind}:${item.id||String(entries.indexOf(item))}`]);
        const {questions,transcript,model_answer,key_vocab,key_phrases,...publicFields}=item;
        return json(response,200,{...publicFields,id:item.id||String(entries.indexOf(item)),questions:questions?.map(q=>{const {answer,explanation,...fields}=q;return {...fields,optionValue:q.options?.length && !/^[a-z]$/i.test(String(answer).trim())?'text':'letter'};})||[]});
      }
      if(route==='/api/ielts/submit' && request.method==='POST') {
        const {category,id,answers}=await bodyJson(request);
        const item=ieltsData[category]?.find((entry,i)=>(entry.id||String(i))===id);
        if(!item)return json(response,404,{error:'Exercise not found.'});
        const review=(item.questions||[]).map((q,i)=>({correct:gradeText(q.answer,answers?.[i]),answer:q.answer,explanation:q.explanation||''}));
        return json(response,200,{correct:review.filter(q=>q.correct).length,total:review.length,review,transcript:item.transcript||'',modelAnswer:item.model_answer||''});
      }
      return json(response,404,{error:'Not found.'});
    } catch {return json(response,400,{error:'Invalid practice request.'});}
  }
  if (!publicPaths.has(route)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const path = resolve(root, `.${route}`);
  try {
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`GRE & IELTS Practice Studio: http://${host}:${port}`));
