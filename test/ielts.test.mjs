import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../ielts.mjs';
import { mergeRecords } from '../history.mjs';

test('IELTS answer grading accepts normalized text and unordered multi-letter answers', () => {
  assert.equal(grade({answer:'TRUE'},' true '),true);
  assert.equal(grade({answer:'A, B, E'},'E, A, B'),true);
  assert.equal(grade({answer:'A, B, E'},'A, B'),false);
  assert.equal(grade({answer:'II – The greenhouse',options:['II – The greenhouse']},'II – The greenhouse'),true);
});

test('IELTS history is validated and kept distinct from GRE measures', () => {
  const base={id:'reading-1',mode:'ielts-reading',completedAt:'2026-09-21T00:00:00Z',verbal:{correct:0,total:0},quant:{correct:0,total:0},ielts:{correct:5,total:8}};
  assert.equal(mergeRecords([], [base]).at(0).ielts.correct,5);
  assert.equal(mergeRecords([], [{...base,ielts:{correct:9,total:8}}]).length,0);
});
