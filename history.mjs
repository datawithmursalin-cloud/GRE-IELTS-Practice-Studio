const sectionScore = section => section.score || {correct:(section.questions||[]).reduce((n,q,i)=>n+Number(Array.isArray(q.answer)?JSON.stringify([...q.answer].sort())===JSON.stringify([...(section.answers?.[i]||[])].sort()):String(q.answer)===String(section.answers?.[i])),0),total:section.questions?.length||0};

export function makeRecord(session) {
  const measures = {};
  for (const kind of ['verbal','quant']) {
    const sections = session.completed.filter(s => s.kind === kind);
    measures[kind] = sections.reduce((out,s) => {
      const score = sectionScore(s);
      out.correct += score.correct;
      out.total += score.total;
      return out;
    },{correct:0,total:0});
  }
  return {
    id:session.id,
    mode:session.mode,
    startedAt:session.startedAt,
    completedAt:session.completedAt,
    verbal:measures.verbal,
    quant:measures.quant,
    essayWords:session.completed.find(s=>s.kind==='essay')?.essay?.trim().split(/\s+/).filter(Boolean).length || 0,
    sections:session.completed.map(s=>({kind:s.kind,label:s.label,stage:s.stage||0,...(s.kind==='essay'?{words:s.essay?.trim().split(/\s+/).filter(Boolean).length||0}:sectionScore(s))}))
  };
}

export function mergeRecords(existing, incoming) {
  const map = new Map();
  for (const candidate of [...incoming,...existing]) {
    if (!candidate || typeof candidate.id !== 'string' || candidate.id.length > 100 || !['full','noEssay','verbalOnly','quantOnly','diagnostic','custom','ielts-reading','ielts-listening','ielts-writing1','ielts-writing2'].includes(candidate.mode)) continue;
    if (!Number.isFinite(Date.parse(candidate.completedAt))) continue;
    const measures = [candidate.verbal,candidate.quant];
    if (measures.some(m => !m || !Number.isInteger(m.correct) || !Number.isInteger(m.total) || m.correct < 0 || m.total < m.correct || m.total > 1000)) continue;
    const ielts = candidate.ielts;
    if (candidate.mode.startsWith('ielts-') && (!ielts || !Number.isInteger(ielts.correct) || !Number.isInteger(ielts.total) || ielts.correct<0 || ielts.total<ielts.correct || ielts.total>1000)) continue;
    const record = {id:candidate.id,mode:candidate.mode,startedAt:String(candidate.startedAt||''),completedAt:new Date(candidate.completedAt).toISOString(),verbal:{correct:candidate.verbal.correct,total:candidate.verbal.total},quant:{correct:candidate.quant.correct,total:candidate.quant.total},essayWords:Number.isInteger(candidate.essayWords)?candidate.essayWords:0,...(ielts?{ielts:{correct:ielts.correct,total:ielts.total}}:{})};
    map.set(record.id,record);
  }
  return [...map.values()].sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
}

export function accuracy(measure) {
  return measure?.total ? Math.round(measure.correct / measure.total * 100) : null;
}
