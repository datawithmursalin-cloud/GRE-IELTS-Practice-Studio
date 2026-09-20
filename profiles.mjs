import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { defaultProfiles, normalizeProfileName } from './profile-common.mjs';
export { defaultProfiles, normalizeProfileName } from './profile-common.mjs';

export async function createProfileStore(path) {
  const profiles=new Map(defaultProfiles.map(profile=>[profile.id,profile]));
  try {
    const saved=JSON.parse(await readFile(path,'utf8'));
    if (Array.isArray(saved)) for (const candidate of saved) {
      if (typeof candidate?.id!=='string' || !/^profile-[0-9a-f-]{36}$/.test(candidate.id) || profiles.has(candidate.id)) continue;
      try {
        const name=normalizeProfileName(candidate.name);
        if (![...profiles.values()].some(profile=>profile.name.toLocaleLowerCase()===name.toLocaleLowerCase())) profiles.set(candidate.id,{id:candidate.id,name});
      } catch {}
    }
  } catch (error) {
    if (error.code!=='ENOENT') throw error;
  }
  let pending=Promise.resolve();
  const list=()=>[...profiles.values()];
  const select=payload=> {
    if (payload?.id) {
      const profile=profiles.get(payload.id);
      if (!profile) throw Error('Choose an existing profile.');
      return Promise.resolve(profile);
    }
    const name=normalizeProfileName(payload?.name);
    pending=pending.catch(()=>{}).then(async()=>{
      const existing=list().find(profile=>profile.name.toLocaleLowerCase()===name.toLocaleLowerCase());
      if (existing) return existing;
      const profile={id:`profile-${randomUUID()}`,name};
      const next=[...list(),profile];
      const temporary=`${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary,JSON.stringify(next,null,2));
      await rename(temporary,path);
      profiles.set(profile.id,profile);
      return profile;
    });
    return pending;
  };
  return {list,select};
}
