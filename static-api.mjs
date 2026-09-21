import { makePlan, makeQuestions, sectionScore, isAnswerCorrect } from './engine.mjs';
import { defaultProfiles, normalizeProfileName } from './profile-common.mjs';
import { publicIelts } from './public-ielts.mjs';
import { leastUsed, mergeUsage, recordUsage } from './question-usage.mjs';

const profilesKey='studio-public-profiles-v1';
const selectedKey='studio-public-selected-v1';
const greKey=id=>`studio-public-gre-v1:${id}`;
const usageKey=id=>`studio-question-usage-v1:${id}`;
const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback;}catch{return fallback;}};
const publicQuestion=question=>{const {answer,explanation,origin,sourceId,...fields}=question;return {...fields,multiple:Array.isArray(answer)&&!question.blanks};};
const normalized=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ').replace(/[.,]+$/,'');
const gradeText=(expected,value)=>{
  if(!normalized(value))return false;
  if(/^[a-z](,\s*[a-z])+$/i.test(String(expected)))return normalized(value).split(/\s*,\s*/).sort().join(',')===normalized(expected).split(/\s*,\s*/).sort().join(',');
  return normalized(value)===normalized(expected);
};

export function createStaticApi(storage, overrides={}) {
  const localList=()=>{
    const extras=parse(storage.getItem(profilesKey),[]);
    return [...defaultProfiles,...(Array.isArray(extras)?extras:[]).filter(profile=>/^profile-[0-9a-f-]{36}$/.test(profile?.id)&&typeof profile.name==='string')];
  };
  const list=()=>overrides.getProfiles?.()||localList();
  const selected=()=>overrides.getSelected?overrides.getSelected():list().find(profile=>profile.id===storage.getItem(selectedKey))||null;
  const requireProfile=()=>{const profile=selected();if(!profile)throw Error('Choose a profile to practice.');return profile;};
  const getTest=profile=>parse(storage.getItem(greKey(profile.id)),null);
  const putTest=(profile,test)=>storage.setItem(greKey(profile.id),JSON.stringify(test));
  const usageFor=async profile=>{
    const local=parse(storage.getItem(usageKey(profile.id)),{});
    let remote={};
    try{remote=await overrides.getUsage?.(profile)||{};}catch{}
    const usage=mergeUsage(local,remote);
    storage.setItem(usageKey(profile.id),JSON.stringify(usage));
    return usage;
  };
  const markSeen=async(profile,usage,ids)=>{
    storage.setItem(usageKey(profile.id),JSON.stringify(recordUsage(usage,ids)));
    try{await overrides.recordSeen?.(profile,ids);}catch{}
  };
  return async (path,options={})=>{
    const method=options.method||'GET';
    const payload=options.body?JSON.parse(options.body):{};
    const url=new URL(path,'https://studio.local');
    const route=url.pathname;
    if(route==='/api/profiles'&&method==='GET')return {profiles:list()};
    if(route==='/api/session'&&method==='GET')return {user:selected()};
    if(route==='/api/profile'&&method==='POST'){
      let profile;
      if(payload.id){profile=list().find(item=>item.id===payload.id);if(!profile)throw Error('Choose an existing profile.');}
      else {
        const name=normalizeProfileName(payload.name);
        profile=list().find(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase());
        if(!profile){profile={id:`profile-${crypto.randomUUID()}`,name};storage.setItem(profilesKey,JSON.stringify([...list().slice(defaultProfiles.length),profile]));}
      }
      storage.setItem(selectedKey,profile.id);
      return {user:profile,profiles:list()};
    }
    if(route==='/api/logout'&&method==='POST'){storage.removeItem(selectedKey);return {user:null};}
    const profile=requireProfile();
    if(route==='/api/gre/start'&&method==='POST'){
      if(!['full','noEssay','verbalOnly','quantOnly','diagnostic','custom'].includes(payload.mode))throw Error('Invalid test mode.');
      const test={id:crypto.randomUUID(),plan:makePlan(payload.mode,payload.count),completed:[],active:null};
      putTest(profile,test);
      return {id:test.id,plan:test.plan};
    }
    if(route==='/api/gre/section'&&method==='POST'){
      const test=getTest(profile),index=payload.index;
      if(!test||payload.id!==test.id||!Number.isInteger(index)||index!==test.completed.length||!test.plan[index])throw Error('Practice session unavailable. Start a new test.');
      if(!test.active){const usage=await usageFor(profile);test.active={...test.plan[index],questions:makeQuestions(test.plan[index],test.completed,Math.random,usage)};putTest(profile,test);await markSeen(profile,usage,test.active.questions.map(question=>question.id));}
      return {...test.plan[index],questions:test.active.questions.map(publicQuestion)};
    }
    if(route==='/api/gre/submit'&&method==='POST'){
      const test=getTest(profile),section=test?.active;
      if(!section||payload.id!==test.id||payload.index!==test.completed.length||!payload.answers||typeof payload.answers!=='object')throw Error('Practice section unavailable. Start a new test.');
      section.answers=payload.answers;
      const score=section.kind==='essay'?{correct:0,total:0}:sectionScore(section);
      const review=section.questions.map((question,i)=>({correct:section.kind==='essay'?null:isAnswerCorrect(question,payload.answers[i]),answer:question.answer,explanation:question.explanation||''}));
      test.completed.push(section);test.active=null;putTest(profile,test);
      return {score,review};
    }
    if(route==='/api/ielts/exercise'&&method==='GET'){
      const entries=publicIelts[url.searchParams.get('category')];
      const usage=await usageFor(profile),selectedId=url.searchParams.get('id');
      const item=selectedId?entries?.find(entry=>entry.id===selectedId):leastUsed(entries||[],usage,Math.random,entry=>`ielts:${url.searchParams.get('category')}:${entry.id}`)[0];
      if(!item)throw Error('Exercise unavailable.');
      await markSeen(profile,usage,[`ielts:${url.searchParams.get('category')}:${item.id}`]);
      const {questions,transcript,model_answer,...fields}=item;
      return {...fields,audioText:transcript||'',questions:questions?.map(({answer,explanation,...question})=>({...question,optionValue:question.options?.length&&!/^[a-z]$/i.test(String(answer).trim())?'text':'letter'}))||[]};
    }
    if(route==='/api/ielts/submit'&&method==='POST'){
      const item=publicIelts[payload.category]?.find(entry=>entry.id===payload.id);
      if(!item)throw Error('Exercise unavailable.');
      const review=(item.questions||[]).map((question,i)=>({correct:gradeText(question.answer,payload.answers?.[i]),answer:question.answer,explanation:question.explanation||''}));
      return {correct:review.filter(item=>item.correct).length,total:review.length,review,transcript:item.transcript||'',modelAnswer:item.model_answer||''};
    }
    throw Error('Practice request unavailable.');
  };
}
