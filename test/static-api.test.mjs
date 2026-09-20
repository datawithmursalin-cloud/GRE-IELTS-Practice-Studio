import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticApi } from '../static-api.mjs';

function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
const post=(api,path,payload)=>api(path,{method:'POST',body:JSON.stringify(payload)});

test('public profiles include both built-in names and persist added names',async()=>{
  const memory=storage(),api=createStaticApi(memory);
  assert.deepEqual((await api('/api/profiles')).profiles.map(profile=>profile.name),['Syed','Ramisa']);
  const ramisa=(await post(api,'/api/profile',{id:'ramisa'})).user;
  assert.equal(ramisa.name,'Ramisa');
  assert.equal((await api('/api/session')).user.id,'ramisa');
  await post(api,'/api/logout',{});
  assert.equal((await api('/api/session')).user,null);
  const added=(await post(api,'/api/profile',{name:'  Third Person  '})).user;
  assert.equal(added.name,'Third Person');
  assert.equal((await post(api,'/api/profile',{name:'third person'})).user.id,added.id);
  assert.equal((await createStaticApi(memory)('/api/profiles')).profiles.length,3);
});

test('public GRE test can be completed and resumed per profile',async()=>{
  const memory=storage(),api=createStaticApi(memory);
  await post(api,'/api/profile',{id:'mursalin'});
  const {id,plan}=await post(api,'/api/gre/start',{mode:'diagnostic'});
  assert.equal(plan.length,2);
  const first=await post(api,'/api/gre/section',{id,index:0});
  assert.equal(first.questions.length,5);
  assert.equal('answer' in first.questions[0],false);
  const resumed=await post(createStaticApi(memory),'/api/gre/section',{id,index:0});
  assert.deepEqual(resumed.questions,first.questions);
  const result=await post(api,'/api/gre/submit',{id,index:0,answers:{}});
  assert.equal(result.score.total,5);
  await post(api,'/api/profile',{id:'ramisa'});
  await assert.rejects(post(api,'/api/gre/section',{id,index:1}),/unavailable/);
  await post(api,'/api/profile',{id:'mursalin'});
  const second=await post(api,'/api/gre/section',{id,index:1});
  assert.equal(second.questions.length,5);
});

test('public IELTS exercises grade without exposing answers before submission',async()=>{
  const api=createStaticApi(storage());
  await post(api,'/api/profile',{id:'ramisa'});
  const exercise=await api('/api/ielts/exercise?category=reading&id=public-reading-gardens');
  assert.equal(exercise.questions.length,5);
  assert.equal('answer' in exercise.questions[0],false);
  const result=await post(api,'/api/ielts/submit',{category:'reading',id:exercise.id,answers:{0:'2022',1:'runoff'}});
  assert.equal(result.correct,2);
  assert.equal(result.total,5);
  const listening=await api('/api/ielts/exercise?category=listening');
  assert.ok(listening.audioText);
});
