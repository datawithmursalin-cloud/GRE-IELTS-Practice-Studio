import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_SECTIONS,makePlan,makeQuestions,makeVerbal,makeQuant,sectionScore,chooseLevel,isAnswerCorrect} from '../engine.mjs';
import {makeRecord,mergeRecords,accuracy} from '../history.mjs';

test('full-length plan follows current section counts and timing',()=>{
  assert.deepEqual(FULL_SECTIONS.map(s=>s.count),[1,12,12,15,15]);
  assert.deepEqual(FULL_SECTIONS.map(s=>s.minutes),[30,18,21,23,26]);
  assert.equal(FULL_SECTIONS.reduce((n,s)=>n+s.minutes,0),118);
});

test('practice plans respect requested size',()=>{
  assert.equal(makePlan('diagnostic').reduce((n,s)=>n+s.count,0),10);
  assert.equal(makePlan('custom',40).reduce((n,s)=>n+s.count,0),40);
  assert.equal(makePlan('noEssay').length,4);
  const verbalOnly=makePlan('verbalOnly');
  const quantOnly=makePlan('quantOnly');
  assert.deepEqual(verbalOnly.map(s=>[s.kind,s.count,s.minutes,s.stage]),[['verbal',12,18,1],['verbal',15,23,2]]);
  assert.deepEqual(quantOnly.map(s=>[s.kind,s.count,s.minutes,s.stage]),[['quant',12,21,1],['quant',15,26,2]]);
});

test('full sections use distinct verbal and quant items',()=>{
  const completed=[];
  for(const config of FULL_SECTIONS){
    const questions=makeQuestions(config,completed,()=>.4);
    assert.equal(questions.length,config.count);
    const ids=completed.flatMap(s=>s.questions.map(q=>q.id));
    assert.ok(questions.every(q=>!ids.includes(q.id)));
    completed.push({...config,questions,answers:{}});
  }
});

test('adaptive level responds to first-section accuracy',()=>{
  const questions=makeVerbal(12,'medium');
  assert.equal(chooseLevel({questions,answers:{}}),'easy');
  const answers=Object.fromEntries(questions.map((q,i)=>[i,q.answer]));
  assert.equal(sectionScore({questions,answers}).correct,12);
  assert.equal(chooseLevel({questions,answers}),'hard');
});

test('generated quant answers match explanations and offer distinct options',()=>{
  for(const level of ['easy','medium','hard']){
    const questions=makeQuant(40,level);
    assert.equal(questions.length,40);
    for(const q of questions){
      if(q.options) assert.equal(new Set(q.options).size,q.options.length);
      assert.ok(isAnswerCorrect(q,q.answer));
    }
  }
});

test('question library covers current interaction types',()=>{
  const quant=makeQuant(40);
  assert.ok(quant.some(q=>q.type==='Quantitative Comparison'));
  assert.ok(quant.some(q=>q.type==='Numeric Entry'));
  assert.ok(quant.some(q=>q.type.includes('Select all')));
  assert.ok(quant.some(q=>q.type==='Data Interpretation'));
  const verbal=makeVerbal(40,'medium');
  assert.ok(verbal.some(q=>q.blanks));
  assert.ok(verbal.some(q=>q.topic==='Select a sentence'));
  assert.ok(verbal.some(q=>q.topic==='Select all that apply'));
  assert.ok(verbal.filter(q=>q.type==='Reading comprehension').length>=16);
});

test('numeric, multiselect and ordered blanks are scored correctly',()=>{
  assert.ok(isAnswerCorrect({type:'Numeric Entry',answer:'0.75'},'3/4'));
  assert.ok(!isAnswerCorrect({type:'Numeric Entry',answer:'0.75'},''));
  assert.ok(isAnswerCorrect({answer:[0,2]},[2,0]));
  assert.ok(!isAnswerCorrect({answer:[0,2],blanks:[[],[]]},[2,0]));
});

test('history records are deduplicated and retain measure scores',()=>{
  const questions=makeVerbal(5,'medium');
  const answers=Object.fromEntries(questions.map((q,i)=>[i,q.answer]));
  const session={id:'example',mode:'diagnostic',startedAt:'2026-09-20T00:00:00Z',completedAt:'2026-09-20T00:20:00Z',completed:[{kind:'verbal',label:'Verbal diagnostic',questions,answers}]};
  const record=makeRecord(session);
  assert.equal(accuracy(record.verbal),100);
  assert.equal(record.quant.total,0);
  assert.equal(mergeRecords([record],[record]).length,1);
  assert.equal(mergeRecords([],[{...record,id:'verbal',mode:'verbalOnly'}]).length,1);
  assert.equal(mergeRecords([],[{...record,id:'quant',mode:'quantOnly'}]).length,1);
});
