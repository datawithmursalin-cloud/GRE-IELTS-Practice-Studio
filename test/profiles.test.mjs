import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProfileStore, normalizeProfileName } from '../profiles.mjs';

test('profiles include built-in users and persist new names without a password', async t => {
  const directory=await mkdtemp(join(tmpdir(),'studio-profiles-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'profiles.json');
  const store=await createProfileStore(path);
  assert.deepEqual(store.list().map(profile=>profile.name),['Syed','Ramisa']);
  assert.equal((await store.select({id:'mursalin'})).name,'Syed');
  const [first,duplicate]=await Promise.all([store.select({name:'  Iman   Ali  '}),store.select({name:'iman ali'})]);
  assert.equal(first.id,duplicate.id);
  assert.equal(first.name,'Iman Ali');
  assert.equal(store.list().length,3);
  const restored=await createProfileStore(path);
  assert.equal((await restored.select({id:first.id})).name,'Iman Ali');
});

test('new profile names are validated', () => {
  assert.equal(normalizeProfileName('  Ayesha  Rahman '),'Ayesha Rahman');
  assert.throws(()=>normalizeProfileName('<script>'),/name of up to 40/);
  assert.throws(()=>normalizeProfileName(' '.repeat(5)),/name of up to 40/);
  assert.throws(()=>normalizeProfileName('a'.repeat(41)),/name of up to 40/);
});
