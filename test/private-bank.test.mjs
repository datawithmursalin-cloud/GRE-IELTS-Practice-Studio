import test from 'node:test';
import assert from 'node:assert/strict';
import { addPrivateVerbal, addPrivateQuant, privateQuant, verbal } from '../questions.mjs';
import { makeQuant } from '../engine.mjs';

test('private verbal importer validates answer indexes and deduplicates source IDs', () => {
  const start=verbal.length;
  const item={sourceId:'test-local-1',type:'Sentence equivalence',level:'medium',topic:'Vocabulary',prompt:'A sample ___ question.',options:['one','two','three','four','five','six'],answer:[0,2],explanation:'Sample rationale.',origin:'Private test'};
  assert.equal(addPrivateVerbal([{...item,answer:[0,9]}]),0);
  assert.equal(addPrivateVerbal([item,item]),1);
  assert.equal(verbal.length,start+1);
});

test('private reading-comprehension importer requires passage and keeps answer indexes valid', () => {
  const start=verbal.length;
  const item={sourceId:'test-local-rc-1',type:'Reading comprehension',level:'medium',topic:'Argument',passage:'A brief argument.',prompt:'Which inference follows?',options:['one','two','three','four','five'],answer:2,explanation:'Sample rationale.',origin:'Private test'};
  assert.equal(addPrivateVerbal([{...item,passage:''},{...item,answer:8}]),0);
  assert.equal(addPrivateVerbal([item,item]),1);
  assert.equal(verbal.length,start+1);
});

test('private Quant importer validates five choices and feeds Quant sections', () => {
  const start=privateQuant.length;
  const item={sourceId:'test-local-quant-1',type:'Multiple choice',level:'medium',topic:'Arithmetic',prompt:'What is two plus two?',options:['1','2','3','4','5'],answer:3,explanation:'The sum is four.',origin:'Private test'};
  assert.equal(addPrivateQuant([{...item,answer:9},{...item,options:['1','2','3','4','4']}]),0);
  assert.equal(addPrivateQuant([item,item]),1);
  assert.equal(privateQuant.length,start+1);
  const first=makeQuant(10,'medium',[],()=>.3);
  assert.ok(first.some(question=>question.id.startsWith('bq')));
  assert.equal(new Set(first.map(question=>question.id)).size,first.length);
  const next=makeQuant(10,'medium',first.map(question=>question.id),()=>.3);
  assert.ok(next.every(question=>!first.some(previous=>previous.id===question.id)));
});
