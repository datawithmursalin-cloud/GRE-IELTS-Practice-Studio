// GitHub Pages keeps the original practice engine in the browser while this
// adapter sends profile authentication and score history to Supabase.
import { createStaticApi } from './static-api.mjs';

export const studioEndpoint='https://xjhybpnwvresiyxwxsrk.supabase.co/functions/v1/studio-api';
const tokenKey='studio-sync-token-v1';

export function createRemoteApi(storage, request=fetch) {
  let user=null,profiles=[];
  const practice=createStaticApi(storage,{getProfiles:()=>profiles,getSelected:()=>user});
  async function call(path,options={}) {
    const token=storage.getItem(tokenKey);
    let response;
    try {response=await request(`${studioEndpoint}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});}
    catch {throw Error('Cannot reach the score server. Check your connection and try again.');}
    const data=await response.json().catch(()=>({error:'Score server returned an invalid response.'}));
    if(!response.ok)throw Error(data.error||'Score server request failed.');
    return data;
  }
  return async function api(path,options={}) {
    const route=new URL(path,'https://studio.local').pathname;
    if(route.startsWith('/api/gre/')||route.startsWith('/api/ielts/'))return practice(path,options);
    if(route==='/api/profiles'&&(!options.method||options.method==='GET')) {
      const result=await call('/profiles');profiles=result.profiles;return result;
    }
    if(route==='/api/session'&&(!options.method||options.method==='GET')) {
      if(!storage.getItem(tokenKey))return {user:null};
      try {const result=await call('/session');user=result.user;return result;}
      catch(error){if(error.message==='Sign in to this profile.'){storage.removeItem(tokenKey);user=null;return {user:null};}throw error;}
    }
    if(route==='/api/profile'&&options.method==='POST') {
      const payload=JSON.parse(options.body||'{}');
      const selected=profiles.find(profile=>profile.id===payload.id);
      const action=payload.name?'/register':selected&&!selected.claimed?'/claim':'/login';
      const body=payload.name?{name:payload.name,password:payload.password}:action==='/claim'?{id:payload.id,password:payload.password,code:payload.claimCode}:{id:payload.id,password:payload.password};
      const result=await call(action,{method:'POST',body:JSON.stringify(body)});
      storage.setItem(tokenKey,result.token);user=result.user;
      const listed=await call('/profiles');profiles=listed.profiles;
      return {user,profiles};
    }
    if(route==='/api/logout'&&options.method==='POST') {
      try {if(storage.getItem(tokenKey))await call('/logout',{method:'POST'});}
      finally {storage.removeItem(tokenKey);user=null;}
      return {user:null};
    }
    if(route==='/api/history'&&(!options.method||options.method==='GET'))return call('/history');
    if(route==='/api/history'&&options.method==='POST')return call('/history',options);
    if(route.startsWith('/api/history/')&&options.method==='DELETE')return call(`/history/${encodeURIComponent(decodeURIComponent(route.slice('/api/history/'.length)))}`,options);
    if(route==='/api/password'&&options.method==='POST') {
      const result=await call('/password',options);
      storage.setItem(tokenKey,result.token);user=result.user;
      return result;
    }
    throw Error('Practice request unavailable.');
  };
}
