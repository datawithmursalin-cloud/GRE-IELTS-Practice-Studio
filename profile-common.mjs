export const defaultProfiles = [
  {id:'mursalin',name:'Mursalin'},
  {id:'ramisa',name:'Ramisa'}
];

export function normalizeProfileName(value) {
  if (typeof value !== 'string') throw Error('Enter a profile name.');
  const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if (!name || name.length>40 || !/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name)) throw Error('Use a name of up to 40 letters, numbers, spaces, periods, apostrophes, or hyphens.');
  return name;
}
