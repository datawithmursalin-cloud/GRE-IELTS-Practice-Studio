import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteApi } from '../remote-api.mjs';

function storage() {const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
const post=(api,path,payload)=>api(path,{method:'POST',body:JSON.stringify(payload)});

test('password-protected remote profile unlocks local practice and synced history',async()=>{
  const calls=[];
  const request=async (url,options)=>{
    const path=new URL(url).pathname.split('/studio-api')[1];calls.push({path,options});
    const replies={
      '/profiles':{profiles:[{id:'mursalin',name:'Syed',claimed:false},{id:'ramisa',name:'Ramisa',claimed:true}]},
      '/claim':{token:'studio_test',user:{id:'mursalin',name:'Syed'}},
      '/session':{user:{id:'mursalin',name:'Syed'}},
      '/history':options.method==='POST'?{saved:1}:{records:[]},
      '/logout':{user:null}
    };
    return {ok:Boolean(replies[path]),json:async()=>replies[path]||{error:'Not found.'}};
  };
  const memory=storage(),api=createRemoteApi(memory,request);
  assert.equal((await api('/api/session')).user,null);
  assert.deepEqual((await api('/api/profiles')).profiles.map(profile=>profile.name),['Syed','Ramisa']);
  await assert.rejects(post(api,'/api/gre/start',{mode:'diagnostic'}),/Choose a profile/);
  const signed=await post(api,'/api/profile',{id:'mursalin',password:'long-password',claimCode:'SETUP'});
  assert.equal(signed.user.id,'mursalin');
  assert.equal(calls.find(call=>call.path==='/claim').options.body,JSON.stringify({id:'mursalin',password:'long-password',code:'SETUP'}));
  const started=await post(api,'/api/gre/start',{mode:'diagnostic'});
  assert.equal(started.plan.length,2);
  await post(api,'/api/history',{records:[]});
  assert.match(calls.find(call=>call.path==='/history').options.headers.Authorization,/studio_test/);
  await post(api,'/api/logout',{});
  await assert.rejects(post(api,'/api/gre/start',{mode:'diagnostic'}),/Choose a profile/);
});

test('a signed-in profile can rename and delete itself',async()=>{
  const calls=[];
  const request=async(url,options={})=>{
    const path=new URL(url).pathname.split('/studio-api')[1];calls.push({path,options});
    const replies={
      '/profiles':{profiles:[{id:'mursalin',name:'Syed',claimed:true}]},
      '/session':{user:{id:'mursalin',name:'Syed'}},
      '/profile':options.method==='PATCH'?{user:{id:'mursalin',name:'Syed Ali'}}:{deleted:true}
    };
    return {ok:Boolean(replies[path]),json:async()=>replies[path]||{error:'Not found.'}};
  };
  const memory=storage();memory.setItem('studio-sync-token-v1','studio_existing');
  const api=createRemoteApi(memory,request);
  await api('/api/profiles');await api('/api/session');
  const renamed=await api('/api/profile',{method:'PATCH',body:JSON.stringify({name:'Syed Ali'})});
  assert.equal(renamed.user.name,'Syed Ali');
  assert.equal(renamed.profiles[0].name,'Syed Ali');
  assert.match(calls.at(-1).options.headers.Authorization,/studio_existing/);
  const deleted=await api('/api/profile',{method:'DELETE',body:JSON.stringify({password:'four'})});
  assert.equal(deleted.user,null);
  assert.deepEqual(deleted.profiles,[]);
  assert.equal(memory.getItem('studio-sync-token-v1'),null);
  await assert.rejects(post(api,'/api/gre/start',{mode:'diagnostic'}),/Choose a profile/);
});

test('admin requests carry the session token and preserve authorization errors',async()=>{
  const calls=[];
  const request=async(url,options={})=>{
    const path=new URL(url).pathname.split('/studio-api')[1];calls.push({path,options});
    if(path==='/admin/profiles')return {ok:true,json:async()=>({profiles:[{id:'ramisa',name:'Ramisa',scoreCount:2}]})};
    if(path==='/admin/profiles/ramisa/history')return {ok:true,json:async()=>({profile:{id:'ramisa',name:'Ramisa'},records:[{id:'score-1'}]})};
    if(path==='/admin/profiles/ramisa'&&options.method==='DELETE')return {ok:false,json:async()=>({error:'Admin access required.'})};
    return {ok:false,json:async()=>({error:'Not found.'})};
  };
  const memory=storage();memory.setItem('studio-sync-token-v1','studio_admin');
  const api=createRemoteApi(memory,request);
  assert.equal((await api('/api/admin/profiles')).profiles[0].scoreCount,2);
  assert.equal((await api('/api/admin/profiles/ramisa/history')).records[0].id,'score-1');
  await assert.rejects(api('/api/admin/profiles/ramisa',{method:'DELETE',body:JSON.stringify({password:'secret'})}),/Admin access required/);
  assert.deepEqual(calls.map(call=>call.path),['/admin/profiles','/admin/profiles/ramisa/history','/admin/profiles/ramisa']);
  assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer studio_admin'));
});

test('question usage sync prevents repeats across devices',async()=>{
  const seen={};
  const request=async(url,options={})=>{
    const path=new URL(url).pathname.split('/studio-api')[1];
    if(path==='/session')return {ok:true,json:async()=>({user:{id:'mursalin',name:'Syed'}})};
    if(path==='/question-usage'){
      if(options.method==='POST')for(const id of JSON.parse(options.body).ids)seen[id]=(seen[id]||0)+1;
      return {ok:true,json:async()=>options.method==='POST'?{saved:1}:{usage:{...seen}}};
    }
    return {ok:false,json:async()=>({error:'Not found.'})};
  };
  const firstStorage=storage(),secondStorage=storage();
  firstStorage.setItem('studio-sync-token-v1','studio_first');
  secondStorage.setItem('studio-sync-token-v1','studio_second');
  const first=createRemoteApi(firstStorage,request),second=createRemoteApi(secondStorage,request);
  await first('/api/session');await second('/api/session');
  const firstTest=await post(first,'/api/gre/start',{mode:'diagnostic'});
  const firstSection=await post(first,'/api/gre/section',{id:firstTest.id,index:0});
  const secondTest=await post(second,'/api/gre/start',{mode:'diagnostic'});
  const secondSection=await post(second,'/api/gre/section',{id:secondTest.id,index:0});
  const firstIds=new Set(firstSection.questions.map(question=>question.id));
  assert.ok(secondSection.questions.every(question=>!firstIds.has(question.id)));
});
