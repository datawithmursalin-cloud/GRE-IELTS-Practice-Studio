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
