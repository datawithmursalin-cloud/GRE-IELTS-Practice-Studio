import { verbal, issues } from './questions.mjs';

export const FULL_SECTIONS = [
  {kind:'essay',label:'Analytical Writing',minutes:30,count:1},
  {kind:'verbal',label:'Verbal Reasoning · Section 1',minutes:18,count:12,stage:1},
  {kind:'quant',label:'Quantitative Reasoning · Section 1',minutes:21,count:12,stage:1},
  {kind:'verbal',label:'Verbal Reasoning · Section 2',minutes:23,count:15,stage:2},
  {kind:'quant',label:'Quantitative Reasoning · Section 2',minutes:26,count:15,stage:2}
];

export function makePlan(mode, count = 20) {
  if (mode === 'full') return structuredClone(FULL_SECTIONS);
  if (mode === 'noEssay') return structuredClone(FULL_SECTIONS.slice(1));
  if (mode === 'verbalOnly') return structuredClone(FULL_SECTIONS.filter(section => section.kind === 'verbal'));
  if (mode === 'quantOnly') return structuredClone(FULL_SECTIONS.filter(section => section.kind === 'quant'));
  if (mode === 'diagnostic') return [
    {kind:'verbal',label:'Verbal diagnostic',minutes:8,count:5,stage:1},
    {kind:'quant',label:'Quant diagnostic',minutes:9,count:5,stage:1}
  ];
  const total = Math.min(40, Math.max(10, Number(count) || 20));
  const v = Math.ceil(total / 2), q = total - v;
  return [
    {kind:'verbal',label:'Verbal practice',minutes:Math.ceil(v * 1.55),count:v,stage:1},
    {kind:'quant',label:'Quant practice',minutes:Math.ceil(q * 1.8),count:q,stage:1}
  ];
}

export function chooseLevel(firstSection) {
  if (!firstSection || !firstSection.questions.length) return 'medium';
  const fraction = sectionScore(firstSection).correct / firstSection.questions.length;
  return fraction >= .75 ? 'hard' : fraction < .45 ? 'easy' : 'medium';
}

export function sectionScore(section) {
  const questions = section.questions || [];
  const answers = section.answers || {};
  let correct = 0;
  for (const [i, question] of questions.entries()) {
    const chosen = answers[i];
    if (isAnswerCorrect(question, chosen)) correct++;
  }
  return {correct,total:questions.length};
}

export function isAnswerCorrect(question, chosen) {
  if (Array.isArray(question.answer)) {
    if (!Array.isArray(chosen) || chosen.length !== question.answer.length) return false;
    return question.blanks ? question.answer.every((a,i) => a === chosen[i]) : question.answer.every(a => chosen.includes(a));
  }
  if (question.type === 'Numeric Entry') {
    if (chosen == null || String(chosen).trim() === '') return false;
    const input = String(chosen).trim();
    const fraction = input.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
    const value = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(input);
    return Number.isFinite(value) && Math.abs(value - Number(question.answer)) < 1e-9;
  }
  return chosen === question.answer;
}

function shuffle(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeVerbal(count, level, used = [], random = Math.random) {
  const available = verbal.filter(q => !used.includes(verbal.indexOf(q)));
  const order = [level, 'medium', 'easy', 'hard'].filter((v,i,a) => a.indexOf(v) === i);
  const preferred = kind => order.flatMap(l => shuffle(available.filter(q => q.level === l && q.type === kind), random));
  const rcCount = Math.round(count * .45), tcCount = Math.round(count * .3);
  const picks = [
    ...preferred('Reading comprehension').slice(0,rcCount),
    ...preferred('Text completion').slice(0,tcCount),
    ...preferred('Sentence equivalence').slice(0,count-rcCount-tcCount)
  ];
  const remainder = order.flatMap(l => shuffle(available.filter(q => q.level === l && !picks.includes(q)),random));
  return shuffle([...picks,...remainder.slice(0,count-picks.length)],random).map(q => ({...q,id:`v${verbal.indexOf(q)}`}));
}

function options(answer, step = 1) {
  const values = [answer, answer + step, answer - step, answer + 2 * step, answer - 2 * step];
  const rotated = [values[2], values[3], values[0], values[4], values[1]];
  return {options:rotated.map(String),answer:2};
}

const comparisonOptions = ['Quantity A is greater','Quantity B is greater','The two quantities are equal','The relationship cannot be determined'];

export function makeQuant(count, level = 'medium', used = [], random = Math.random) {
  const made = [];
  let n = 1;
  while (made.length < count && n < 300) {
    const id = `q${n}`;
    if (!used.includes(id)) {
      const d = level === 'hard' ? 3 : level === 'easy' ? 1 : 2;
      const a = 3 + n % 9, b = 2 + (n * 3) % 7;
      let q;
      switch (n % 8) {
        case 0: {
          const side = a + d;
          q = {type:'Quantitative Comparison',topic:'Geometry',prompt:`A square has side length ${side}. Compare the quantities.`,passage:`Quantity A: The square's perimeter\nQuantity B: ${4 * side}`,options:comparisonOptions,answer:2,explanation:`The perimeter is 4 × ${side} = ${4 * side}, so the quantities are equal.`};
          break;
        }
        case 1: {
          const x = a + d, multiplier = b + d, constant = 2 * d + n % 5;
          q = {type:'Multiple choice',topic:'Algebra',prompt:`If ${multiplier}x + ${constant} = ${multiplier * x + constant}, what is x?`,...options(x),explanation:`Subtract ${constant}, then divide by ${multiplier}: x = ${x}.`};
          break;
        }
        case 2: {
          const price = (a + d) * 10, percent = (b + d) * 5;
          const answer = price * percent / 100;
          q = {type:'Numeric Entry',topic:'Arithmetic',prompt:`What is ${percent}% of ${price}? Enter a number.`,answer:String(answer),explanation:`${percent}% of ${price} = ${percent}/100 × ${price} = ${answer}.`};
          break;
        }
        case 3: {
          const base = a + d, gap = b + d, answer = base + gap;
          q = {type:'Multiple choice',topic:'Data analysis',prompt:`The values in a data set are ${base}, ${base + gap}, and ${base + 2 * gap}. What is their mean?`,...options(answer),explanation:`The values are equally spaced, so the middle value, ${answer}, is the mean.`};
          break;
        }
        case 4: {
          const x = a + d;
          q = {type:'Quantitative Comparison',topic:'Algebra',prompt:`x is a real number and x² = ${x*x}. Compare the quantities.`,passage:`Quantity A: x\nQuantity B: 0`,options:comparisonOptions,answer:3,explanation:`x could be ${x} or -${x}, so the relationship cannot be determined.`};
          break;
        }
        case 5: {
          const divisor = 2 + n % 3;
          const values = [divisor,divisor+1,divisor*2,divisor*2+1,divisor*3,divisor*3+2];
          q = {type:'Multiple choice · Select all that apply',topic:'Arithmetic',prompt:`Which of the following numbers are divisible by ${divisor}? Select ALL that apply.`,options:values.map(String),answer:values.flatMap((value,i)=>value%divisor===0?[i]:[]),explanation:`A number is divisible by ${divisor} when the division leaves no remainder.`};
          break;
        }
        case 6: {
          const base = (a+d)*2, height = b+d, answer = base*height/2;
          q = {type:'Numeric Entry',topic:'Geometry',prompt:`A triangle has base ${base} and height ${height}. What is its area? Enter a number.`,answer:String(answer),explanation:`Area = ½ × ${base} × ${height} = ${answer}.`};
          break;
        }
        default: {
          const monday = 20+a+d, tuesday = monday+b+d, answer = tuesday-monday;
          q = {type:'Data Interpretation',topic:'Data analysis',passage:`Library visits\nMonday: ${monday}\nTuesday: ${tuesday}`,prompt:'How many more visits occurred on Tuesday than Monday?',...options(answer),explanation:`Subtract ${monday} from ${tuesday} to get ${answer}.`};
        }
      }
      made.push({...q,id,level});
    }
    n++;
  }
  return shuffle(made, random);
}

export function makeQuestions(section, history = [], random = Math.random) {
  if (section.kind === 'essay') return [{id:'essay',type:'Analyze an Issue',prompt:issues[Math.floor(random()*issues.length)]}];
  const first = history.find(s => s.kind === section.kind && s.stage === 1);
  const level = section.stage === 2 ? chooseLevel(first) : 'medium';
  const used = history.filter(s => s.kind === section.kind).flatMap(s => (s.questions || []).map(q => q.id));
  return section.kind === 'verbal' ? makeVerbal(section.count,level,used.map(id => Number(id.slice(1))),random) : makeQuant(section.count,level,used,random);
}

export function recommendation(sections) {
  const scored = sections.filter(s => s.kind !== 'essay');
  const total = scored.reduce((sum,s) => sum + sectionScore(s).total,0);
  const correct = scored.reduce((sum,s) => sum + sectionScore(s).correct,0);
  if (!total) return 'Complete a Verbal or Quant section to get a practice recommendation.';
  const ratio = correct / total;
  return ratio >= .8 ? 'You are ready to try the next difficulty level.' : ratio >= .6 ? 'Repeat this mix once, focusing on missed question types.' : 'Shift to foundational practice before increasing difficulty.';
}
