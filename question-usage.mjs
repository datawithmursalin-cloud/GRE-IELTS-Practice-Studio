export const questionId = id => typeof id === 'string' && /^(?:v\d+|q\d+|bq\d+|essay\d+|ielts:(?:reading|listening|writing1|writing2):[a-zA-Z0-9_-]{1,100})$/.test(id);

export function normalizeUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id,count])=>questionId(id)&&Number.isInteger(count)&&count>=0&&count<=100000));
}

export function mergeUsage(...sources) {
  const result={};
  for (const source of sources) for (const [id,count] of Object.entries(normalizeUsage(source))) result[id]=Math.max(result[id]||0,count);
  return result;
}

export function recordUsage(usage, ids) {
  const next={...normalizeUsage(usage)};
  for (const id of new Set(ids)) if(questionId(id))next[id]=(next[id]||0)+1;
  return next;
}

export function leastUsed(items, usage, random=Math.random, id=item=>item.id) {
  return items.map(item=>({item,tie:random()})).sort((a,b)=>(usage[id(a.item)]||0)-(usage[id(b.item)]||0)||a.tie-b.tie).map(entry=>entry.item);
}
