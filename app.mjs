import { makePlan, makeQuestions, sectionScore, recommendation, chooseLevel, isAnswerCorrect } from './engine.mjs';
import { makeRecord, mergeRecords, accuracy } from './history.mjs';

const mount = document.querySelector('#app');
const STORAGE = 'gre-practice-studio-v1';
const HISTORY = 'gre-practice-history-v1';
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { state = null; }
if (!state || !Array.isArray(state.plan)) state = {screen:'home',plan:[],completed:[],current:null,index:0,mode:null};
let records;
try { records = mergeRecords([],JSON.parse(localStorage.getItem(HISTORY)||'[]')); } catch { records = []; }

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => localStorage.setItem(STORAGE, JSON.stringify(state));
const saveHistory = () => localStorage.setItem(HISTORY,JSON.stringify(records));
const section = () => state.current;
const answerText = (q, chosen) => {
  if (chosen == null || Array.isArray(chosen) && !chosen.length) return 'Not answered';
  if (q.type === 'Numeric Entry') return String(chosen);
  if (q.blanks) return chosen.map((option,i)=>q.blanks[i][option]||'—').join(' / ');
  return (Array.isArray(chosen) ? chosen : [chosen]).map(i => q.options[i]).join(' and ');
};
const isCorrect = isAnswerCorrect;
const timeText = seconds => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
const remaining = () => Math.max(0,Math.ceil((section().deadline - Date.now()) / 1000));

function home() {
  const resume = Boolean(state.current);
  mount.innerHTML = `<div class="hero"><div><div class="eyebrow">Your next practice session starts here</div><h1>Prepare with purpose.</h1><p>Practice the current GRE format with timed sections, section-adaptive difficulty, clear explanations, and a thoughtful review of what to work on next.</p>${resume ? '<button class="btn" data-action="resume">Resume session</button>' : ''} <button class="btn secondary" data-action="history">Score history${records.length?` (${records.length})`:''}</button></div><div class="hero-art"><div class="art-label">A focused path forward</div><div class="art-number">01<span style="font-size:36px;color:#d6a85e"> / 05</span></div><div class="art-caption">One section at a time. Your pace, your progress.</div></div></div>
  <div class="eyebrow">Choose your session</div><div class="grid">
  <article class="card"><div class="card-num">01 · Exam simulation</div><span class="pill">1 hour 58 minutes</span><h3>Full-length test</h3><p>One Issue essay, then 2 Verbal and 2 Quant sections. 54 scored questions in total.</p><button class="btn" data-start="full">Start full test</button></article>
  <article class="card"><div class="card-num">02 · Focused verbal</div><span class="pill">41 minutes · 27 questions</span><h3>Verbal only</h3><p>Two timed Verbal sections. The second section adapts to your first-section performance.</p><button class="btn" data-start="verbalOnly">Start Verbal practice</button></article>
  <article class="card"><div class="card-num">03 · Focused quant</div><span class="pill">47 minutes · 27 questions</span><h3>Quant only</h3><p>Two timed Quant sections with an adaptive second stage and all current question formats.</p><button class="btn" data-start="quantOnly">Start Quant practice</button></article>
  <article class="card"><div class="card-num">04 · Focused endurance</div><span class="pill">88 minutes</span><h3>Verbal + Quant</h3><p>The four scored sections with the same timing and adaptive second stages, without the essay.</p><button class="btn" data-start="noEssay">Start scored sections</button></article>
  <article class="card"><div class="card-num">05 · Quick check-in</div><span class="pill">17 minutes</span><h3>Diagnostic</h3><p>Five Verbal and five Quant questions for a fast read on strengths and gaps.</p><button class="btn" data-start="diagnostic">Start diagnostic</button></article></div>
  <div class="panel top-gap"><h3>Build a shorter practice session</h3><p class="muted small">Choose 10–40 questions across Verbal and Quant. This is a drill, not a GRE-format simulation.</p><div class="field"><label for="count">Question count</label><select id="count">${[10,20,30,40].map(n=>`<option value="${n}" ${n===20?'selected':''}>${n} questions</option>`).join('')}</select></div><button class="btn secondary" data-start="custom">Start custom practice</button></div>
  <p class="muted small top-gap">Original, unofficial practice questions. Adaptive routing here is a simple practice approximation; neither scores nor essay feedback are official GRE scores.</p>`;
}

function start(mode) {
  const count = Number(document.querySelector('#count')?.value || 20);
  state = {id:crypto.randomUUID(),startedAt:new Date().toISOString(),screen:'exam',mode,plan:makePlan(mode,count),completed:[],current:null,index:0};
  nextSection();
}

function nextSection() {
  const config = state.plan[state.index];
  if (!config) {state.screen='results';state.current=null;state.completedAt=new Date().toISOString();save();render();return;}
  state.current = {...config,questions:makeQuestions(config,state.completed),answers:{},marked:[],position:0,essay:'',deadline:Date.now()+config.minutes*60000};
  state.screen='exam';save();render();
}

function questionInput(q, chosen) {
  if (q.blanks) return q.blanks.map((choices,blank)=>`<fieldset class="blank-group"><legend>Blank ${blank+1}</legend>${choices.map((option,i)=>`<label class="choice ${chosen?.[blank]===i?'selected':''}"><input type="radio" name="blank-${blank}" data-blank="${blank}" value="${i}" ${chosen?.[blank]===i?'checked':''}><span>${escape(option)}</span></label>`).join('')}</fieldset>`).join('');
  if (q.type==='Numeric Entry') return `<label class="side-label" for="numeric-answer">Your answer</label><input id="numeric-answer" class="numeric-answer" inputmode="decimal" autocomplete="off" placeholder="Enter a number or fraction" value="${escape(chosen ?? '')}"><p class="muted small">Fractions such as 3/4 are accepted.</p>`;
  const multi=Array.isArray(q.answer);
  return `<div class="choices">${q.options.map((option,i)=>`<label class="choice ${selected(chosen,i)?'selected':''}"><input type="${multi?'checkbox':'radio'}" name="answer" value="${i}" ${selected(chosen,i)?'checked':''}><span>${escape(option)}</span></label>`).join('')}</div>${multi?`<p class="muted small">${q.type==='Sentence equivalence'?'Select exactly two answers.':'Select all answers that apply.'} No partial credit.</p>`:''}`;
}

function exam() {
  const s=section(), isEssay=s.kind==='essay', p=s.position || 0, q=s.questions[p];
  const answered=s.questions.filter((question,i)=>hasAnswer(question,s.answers[i])).length;
  mount.innerHTML=`<div class="section-head"><div><div class="eyebrow">Section ${state.index+1} of ${state.plan.length}</div><h2>${escape(s.label)}</h2><p class="muted small">${isEssay?'Write a reasoned response. You can revise freely until the section ends.':`${s.questions.length} questions · You may revisit any question in this section.`}</p></div><div class="timer ${remaining()<60?'low':''}" id="timer" role="timer" aria-label="Time remaining">${timeText(remaining())}</div></div>
  <div class="exam-layout"><div class="panel">${isEssay ? `<div class="question-type">Analyze an Issue</div><div class="question-prompt">${escape(q.prompt)}</div><p class="muted small">Discuss the extent to which you agree or disagree. Support your position with reasons and examples, and consider circumstances in which the statement might or might not hold.</p><label class="side-label" for="essay">Your response</label><textarea id="essay" class="essay" placeholder="Begin writing here…">${escape(s.essay)}</textarea><p class="muted small" id="word-count">${wordCount(s.essay)} words</p>` : `<div class="question-type">${escape(q.type)} · ${escape(q.topic)} · Question ${p+1} of ${s.questions.length}</div>${q.passage?`<div class="passage">${escape(q.passage)}</div>`:''}<div class="question-prompt">${escape(q.prompt)}</div>${questionInput(q,s.answers[p])}`}
  <div class="btn-row">${!isEssay?`<button class="btn secondary" data-action="prev" ${p===0?'disabled':''}>Previous</button><button class="btn secondary" data-action="next" ${p===s.questions.length-1?'disabled':''}>Next</button><button class="btn ghost" data-action="mark">${s.marked.includes(p)?'Remove mark':'Mark for review'}</button>`:''}<button class="btn danger" data-action="finish">Finish section</button></div></div>
  <aside class="panel"><div class="side-label">${isEssay?'Writing progress':'Section progress'}</div>${isEssay?`<p class="muted small">Your essay is saved in this browser while you work.</p>`:`<p class="muted small">${answered} of ${s.questions.length} answered</p><div class="progress"><span style="width:${answered/s.questions.length*100}%"></span></div><div class="nav-grid">${s.questions.map((question,i)=>`<button class="nav-number ${i===p?'current':''} ${hasAnswer(question,s.answers[i])?'answered':''} ${s.marked.includes(i)?'marked':''}" data-jump="${i}" aria-label="Question ${i+1}${s.marked.includes(i)?', marked':''}">${i+1}</button>`).join('')}</div><p class="muted small top-gap">Outlined numbers are marked for review.</p>`}<div class="notice">The timer advances automatically when time runs out. Finishing early ends this section permanently.</div><button class="btn secondary" data-action="abandon">Abandon session</button></aside></div>`;
}

function wordCount(value) {return value.trim()?value.trim().split(/\s+/).length:0;}
function selected(chosen,index) {return Array.isArray(chosen)?chosen.includes(index):chosen===index;}
function hasAnswer(q,chosen) {return q.blanks ? Array.isArray(chosen)&&q.blanks.every((_,i)=>Number.isInteger(chosen[i])) : q.type==='Numeric Entry' ? String(chosen??'').trim()!=='' : Array.isArray(chosen) ? chosen.length>0 : chosen!=null;}

function finish() {
  if (!state.current) return;
  state.completed.push(state.current);
  state.current=null;
  state.screen='review';
  save();render();
}

function review() {
  const s=state.completed.at(-1), essay=s.kind==='essay', score=sectionScore(s);
  const next=state.plan[state.index+1];
  const topicMisses={};
  if (!essay) s.questions.forEach((q,i)=>{if(!isCorrect(q,s.answers[i]))topicMisses[q.topic]=(topicMisses[q.topic]||0)+1;});
  const top=Object.entries(topicMisses).sort((a,b)=>b[1]-a[1]).slice(0,3);
  mount.innerHTML=`<div class="eyebrow">Section complete</div><h1>${escape(s.label)}</h1><p class="muted">${essay?'Review your response with the criteria below. Automatic essay scoring is intentionally not provided.':`You answered ${score.correct} of ${score.total} correctly. Review each item before moving on.`}</p>
  ${essay?`<div class="panel"><h3>Analytical Writing self-review</h3><p class="muted small">Use the official 0–6 scale as a guide, not a machine-generated score. Consider the strength of your position, development, organization, and language control.</p><div class="rubric"><div><strong>Position</strong><br>Did you address the issue and qualify your view when needed?</div><div><strong>Development</strong><br>Are reasons specific, relevant, and supported by examples?</div><div><strong>Organization</strong><br>Does the argument progress logically, with useful transitions?</div><div><strong>Language</strong><br>Is the prose clear, controlled, and precise?</div></div><details class="review-item"><summary>Show my essay (${wordCount(s.essay)} words)</summary><p style="white-space:pre-wrap">${escape(s.essay||'No response entered.')}</p></details></div>`:
  `<div class="stat-row"><div class="stat"><strong>${score.correct}/${score.total}</strong><span>Correct</span></div><div class="stat"><strong>${Math.round(score.correct/score.total*100)}%</strong><span>Accuracy</span></div><div class="stat"><strong>${s.stage===2?escape(chooseLevel(state.completed.find(x=>x.kind===s.kind&&x.stage===1))):'Medium'}</strong><span>Practice difficulty</span></div></div><div class="panel"><h3>What to work on</h3><p>${top.length?`Your biggest opportunities: ${top.map(([name,n])=>`${escape(name)} (${n} missed)`).join(', ')}.`:'No missed questions in this section—keep building consistency.'}</p>${s.questions.map((q,i)=>`<details class="review-item"><summary class="${isCorrect(q,s.answers[i])?'correct':'incorrect'}">${i+1}. ${isCorrect(q,s.answers[i])?'Correct':'Review'} · ${escape(q.topic)} — ${escape(q.prompt)}</summary><p>Your answer: ${escape(answerText(q,s.answers[i]))}<br>Correct answer: ${escape(answerText(q,q.answer))}</p><p>${escape(q.explanation)}</p></details>`).join('')}</div>`}
  <div class="btn-row"><button class="btn" data-action="continue">${next?`Continue to ${escape(next.label)}`:'View final results'}</button></div>`;
}

function results() {
  if (!state.id) state.id=crypto.randomUUID();
  if (!state.completedAt) state.completedAt=new Date().toISOString();
  if (!records.some(record=>record.id===state.id)) {records=mergeRecords(records,[makeRecord(state)]);saveHistory();save();}
  const scored=state.completed.filter(s=>s.kind!=='essay');
  const correct=scored.reduce((n,s)=>n+sectionScore(s).correct,0), total=scored.reduce((n,s)=>n+sectionScore(s).total,0);
  mount.innerHTML=`<div class="eyebrow">Session complete</div><h1>Your practice review</h1><p class="muted">This is an unofficial practice summary, not a scaled GRE score. It has been added to your score history in this browser.</p><div class="stat-row"><div class="stat"><strong>${correct}/${total}</strong><span>Scored questions correct</span></div><div class="stat"><strong>${total?Math.round(correct/total*100):0}%</strong><span>Overall accuracy</span></div><div class="stat"><strong>${state.completed.length}</strong><span>Sections completed</span></div></div><div class="panel"><h3>Next session</h3><p>${escape(recommendation(state.completed))}</p></div><div class="summary-grid top-gap">${scored.map(s=>{const r=sectionScore(s);return `<div class="panel"><div class="question-type">${escape(s.kind)} · ${escape(s.stage===2?chooseLevel(state.completed.find(x=>x.kind===s.kind&&x.stage===1)):'medium')} difficulty</div><h3>${escape(s.label)}</h3><p>${r.correct} of ${r.total} correct</p></div>`}).join('')}</div>${state.completed.some(s=>s.kind==='essay')?'<p class="notice">Your essay was saved for self-review but was not automatically scored.</p>':''}<div class="btn-row"><button class="btn" data-action="history">View score history</button><button class="btn secondary" data-action="reset">Start a new session</button></div>`;
}

function historyPage() {
  const ordered=[...records].reverse();
  const points=ordered.map((r,i)=>{const total=r.verbal.total+r.quant.total;return {x:ordered.length===1?50:5+i*90/(ordered.length-1),y:95-(total?100*(r.verbal.correct+r.quant.correct)/total:0)*.9};});
  mount.innerHTML=`<div class="eyebrow">Your progress</div><h1>Score history</h1><p class="muted">Raw practice accuracy is saved only in this browser. It does not sync automatically between devices or represent an official GRE score.</p>${records.length?`<div class="panel"><h3>Overall accuracy over time</h3><svg class="history-chart" viewBox="0 0 100 100" role="img" aria-label="Practice accuracy trend"><line x1="5" y1="95" x2="95" y2="95" stroke="#c5d3d1"/><line x1="5" y1="5" x2="5" y2="95" stroke="#c5d3d1"/><polyline points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#176b69" stroke-width="1.5"/>${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2" fill="#d6a052"/>`).join('')}</svg><p class="muted small">Sessions are plotted oldest to newest; higher points mean higher accuracy.</p></div><div class="panel top-gap"><h3>Past sessions</h3><div class="history-list">${records.map(r=>`<div class="history-row"><div><strong>${escape(new Date(r.completedAt).toLocaleDateString())}</strong><br><span class="muted small">${escape(modeName(r.mode))}</span></div><div><strong>${r.verbal.correct+r.quant.correct}/${r.verbal.total+r.quant.total}</strong><br><span class="muted small">Overall</span></div><div><strong>${accuracy(r.verbal)??'—'}${accuracy(r.verbal)==null?'':'%'}</strong><br><span class="muted small">Verbal</span></div><div><strong>${accuracy(r.quant)??'—'}${accuracy(r.quant)==null?'':'%'}</strong><br><span class="muted small">Quant</span></div><button class="btn ghost small" data-delete="${escape(r.id)}" aria-label="Delete session from ${escape(new Date(r.completedAt).toLocaleDateString())}">Delete</button></div>`).join('')}</div></div>`:'<div class="panel"><p>No completed sessions yet. Finish a diagnostic or practice test to see your progress here.</p></div>'}<div class="btn-row"><button class="btn" data-action="home">Back to practice</button><button class="btn secondary" data-action="export" ${records.length?'':'disabled'}>Export history</button><button class="btn ghost" data-action="import">Import history</button><input id="history-file" type="file" accept="application/json,.json" hidden></div><p class="muted small top-gap">Export a backup before clearing browser data. Import merges sessions by ID; the app never uploads your history.</p>`;
}

function modeName(mode) {return ({full:'Full-length',noEssay:'Verbal + Quant',verbalOnly:'Verbal only',quantOnly:'Quant only',diagnostic:'Diagnostic',custom:'Custom practice'})[mode]||mode;}

function render() {
  if (state.screen==='exam' && remaining()===0) {finish();return;}
  if (state.screen==='exam') exam();
  else if (state.screen==='review') review();
  else if (state.screen==='results') results();
  else if (state.screen==='history') historyPage();
  else home();
}

mount.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button) return;
  if(button.dataset.delete){if(confirm('Delete this saved practice session? Export a backup first if you want to keep it.')){records=records.filter(record=>record.id!==button.dataset.delete);saveHistory();render();}return;}
  if(button.dataset.start) { if(state.current && !confirm('Start over and discard your current session?')) return;start(button.dataset.start);return; }
  if(button.dataset.jump!==undefined) {section().position=Number(button.dataset.jump);save();render();return;}
  switch(button.dataset.action) {
    case 'resume':state.screen='exam';save();render();break;
    case 'prev':section().position--;save();render();break;
    case 'next':section().position++;save();render();break;
    case 'mark':{const s=section(),i=s.position;s.marked=s.marked.includes(i)?s.marked.filter(x=>x!==i):[...s.marked,i];save();render();break;}
    case 'finish':if(confirm('Finish this section? You cannot return to its questions.')) finish();break;
    case 'continue':state.index++;nextSection();break;
    case 'reset':state={screen:'home',plan:[],completed:[],current:null,index:0,mode:null};save();render();break;
    case 'abandon':if(confirm('Abandon this session? Its unfinished results will not be saved to history.')){state={screen:'home',plan:[],completed:[],current:null,index:0,mode:null};save();render();}break;
    case 'home':state.screen='home';save();render();break;
    case 'history':state.screen='history';save();render();break;
    case 'export':{const blob=new Blob([JSON.stringify({format:'gre-practice-history-v1',records},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='gre-practice-history.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
    case 'import':document.querySelector('#history-file').click();break;
  }
});
mount.addEventListener('change',event=>{
  if(event.target.id==='history-file') {const file=event.target.files?.[0];if(file) file.text().then(text=>{try{const parsed=JSON.parse(text);if(parsed.format!=='gre-practice-history-v1'||!Array.isArray(parsed.records)) throw Error('Invalid backup');records=mergeRecords(records,parsed.records);saveHistory();render();}catch{alert('This is not a valid GRE Practice Studio history backup.');}});return;}
  if(event.target.dataset.blank!==undefined&&state.current){const s=section(),blank=Number(event.target.dataset.blank);const old=s.answers[s.position]||[];old[blank]=Number(event.target.value);s.answers[s.position]=old;save();render();return;}
  if(event.target.name!=='answer'||!state.current)return;
  const s=section(),q=s.questions[s.position],value=Number(event.target.value);
  if(Array.isArray(q.answer)) {const old=s.answers[s.position]||[];s.answers[s.position]=event.target.checked?[...old,value]:old.filter(x=>x!==value);}
  else s.answers[s.position]=value;
  save();render();
});
mount.addEventListener('input',event=>{
  if(event.target.id==='essay'&&state.current){section().essay=event.target.value;document.querySelector('#word-count').textContent=`${wordCount(event.target.value)} words`;save();}
  if(event.target.id==='numeric-answer'&&state.current){section().answers[section().position]=event.target.value;save();}
});
setInterval(()=>{
  if(state.screen!=='exam'||!state.current)return;
  const left=remaining();
  if(left===0){finish();return;}
  const timer=document.querySelector('#timer');if(timer){timer.textContent=timeText(left);timer.classList.toggle('low',left<60);}
},500);
render();
