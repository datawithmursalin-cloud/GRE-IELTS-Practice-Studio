import { makeRecord, mergeRecords, accuracy } from './history.mjs';
import { showIelts } from './ielts.mjs';

const mount = document.querySelector('#app');
const pagesMode = location.hostname.endsWith('.github.io') || new URLSearchParams(location.search).has('static');
const remoteApi = pagesMode ? (await import('./remote-api.mjs')).createRemoteApi(localStorage) : null;
const STORAGE = 'gre-practice-studio-v1';
const HISTORY = 'gre-practice-history-v1';
const MIGRATED = 'studio-score-migrated-v1';
const PENDING = 'studio-score-pending-v1';
const emptyState = () => ({screen:'home',plan:[],completed:[],current:null,index:0,mode:null});
let state = emptyState(), records = [], user = null, profiles = [], accountReady = false, accountError = '', reviewDetails=[],syncedIds=new Set();
const sectionScore = s => s?.score || {correct:0,total:s?.questions?.length||0};
const chooseLevel = s => s && sectionScore(s).total && sectionScore(s).correct/sectionScore(s).total>=.65?'hard':'medium';
const recommendation = completed => {const scored=completed.filter(s=>s.kind!=='essay');const total=scored.reduce((n,s)=>n+sectionScore(s).total,0),correct=scored.reduce((n,s)=>n+sectionScore(s).correct,0);return !total?'Try a timed section to establish a baseline.':correct/total<.65?'Focus on missed topics, then try another timed section.':'Keep practicing under timed conditions to build consistency.';};
async function api(path, options={}) {if(remoteApi)return remoteApi(path,options);const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await response.json();if(!response.ok)throw Error(data.error||'Practice request failed.');return data;}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => {if(user) localStorage.setItem(`${STORAGE}:${user.id}`, JSON.stringify(state));};
const saveHistory = async () => {
  if(!user)return;
  localStorage.setItem(`${HISTORY}:${user.id}`,JSON.stringify(records));
  if(!pagesMode)return;
  const unsynced=records.filter(record=>!syncedIds.has(record.id));
  if(!unsynced.length)return;
  localStorage.setItem(`${PENDING}:${user.id}`,JSON.stringify(unsynced));
  try{
    await api('/api/history',{method:'POST',body:JSON.stringify({records:unsynced})});
    unsynced.forEach(record=>syncedIds.add(record.id));
    const remaining=records.filter(record=>!syncedIds.has(record.id));
    if(remaining.length)localStorage.setItem(`${PENDING}:${user.id}`,JSON.stringify(remaining));
    else localStorage.removeItem(`${PENDING}:${user.id}`);
  }
  catch(error){reportError(Error(`Scores were saved on this browser but could not sync: ${error.message}`));}
};
const reportError = error => {accountError=error?.message || String(error);if(state.screen!=='ielts')render();};
async function setUser(nextUser, {afterLogin=false}={}) {
  user=nextUser; accountReady=true;accountError='';records=[];syncedIds=new Set();state=emptyState();
  if(user){
    try{const saved=JSON.parse(localStorage.getItem(`${STORAGE}:${user.id}`)||'null');if(saved && Array.isArray(saved.plan) && ![saved.current,...(saved.completed||[])].some(s=>s?.questions?.some(q=>'answer' in q)))state=saved;else save();}catch{}
    try{records=mergeRecords([],JSON.parse(localStorage.getItem(`${HISTORY}:${user.id}`)||'[]'));}catch{}
    if(pagesMode){
      try{
        const remote=mergeRecords([],(await api('/api/history')).records);syncedIds=new Set(remote.map(record=>record.id));
        const migrated=localStorage.getItem(`${MIGRATED}:${user.id}`)==='yes';
        const pending=migrated?mergeRecords([],JSON.parse(localStorage.getItem(`${PENDING}:${user.id}`)||'[]')):records;
        records=mergeRecords(remote,pending);
        const missing=records.filter(record=>!syncedIds.has(record.id));
        if(missing.length)await api('/api/history',{method:'POST',body:JSON.stringify({records:missing})});
        missing.forEach(record=>syncedIds.add(record.id));
        localStorage.setItem(`${MIGRATED}:${user.id}`,'yes');localStorage.removeItem(`${PENDING}:${user.id}`);
        localStorage.setItem(`${HISTORY}:${user.id}`,JSON.stringify(records));
      }catch(error){accountError=`Could not load synced scores: ${error.message}`;}
    }
    if(state.screen==='library')state.screen='home';
    if(afterLogin){state.screen='home';save();}
  }
  render();
}
async function refreshHistory() {
  if(!pagesMode||!user)return;
  const remote=mergeRecords([],(await api('/api/history')).records);
  syncedIds=new Set(remote.map(record=>record.id));
  const pending=mergeRecords([],JSON.parse(localStorage.getItem(`${PENDING}:${user.id}`)||'[]'));
  records=mergeRecords(remote,pending);
  localStorage.setItem(`${HISTORY}:${user.id}`,JSON.stringify(records));
}
Promise.all([api('/api/session'),api('/api/profiles')]).then(([session,data])=>{profiles=data.profiles;setUser(session.user);}).catch(error=>{accountReady=true;reportError(error);});
const section = () => state.current;
const answerText = (q, chosen) => {
  if (chosen == null || Array.isArray(chosen) && !chosen.length) return 'Not answered';
  if (q.type === 'Numeric Entry') return String(chosen);
  if (q.blanks) return chosen.map((option,i)=>q.blanks[i][option]||'—').join(' / ');
  return (Array.isArray(chosen) ? chosen : [chosen]).map(i => q.options[i]).join(' and ');
};
const timeText = seconds => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
const remaining = () => Math.max(0,Math.ceil((section().deadline - Date.now()) / 1000));

function home() {
  mount.innerHTML=`<div class="eyebrow">Welcome back, ${escape(user.name)}</div><h1>What are you preparing for?</h1><p class="muted">${pagesMode?'Choose a test to practice. Your completed scores sync under your password-protected profile.':'Choose a test to practice. Your score history is kept under your profile on this browser.'}</p><div class="exam-chooser"><article class="chooser-card gre"><div class="eyebrow">Graduate admissions</div><h2>GRE practice</h2><p>Timed Verbal and Quant sections, a full-length simulation, and detailed review.</p><button class="btn" data-action="gre">Choose GRE</button></article><article class="chooser-card ielts"><div class="eyebrow">English proficiency</div><h2>IELTS practice</h2><p>${pagesMode?'Original Reading, Listening, and Writing exercises.':'Reading, Listening, and Writing exercises from the local study archive.'}</p><button class="btn" data-action="ielts">Choose IELTS</button></article></div><div class="btn-row"><button class="btn secondary" data-action="history">View ${escape(user.name)}’s score history${records.length?` (${records.length})`:''}</button></div>`;
}

function greHome() {
  const resume = Boolean(state.current);
  mount.innerHTML = `<div class="hero"><div><div class="eyebrow">GRE & IELTS · One place to improve</div><h1>Prepare with purpose.</h1><p>Practice timed GRE sections and IELTS skills, review your answers, and track your progress across sessions.</p>${resume ? '<button class="btn" data-action="resume">Resume GRE session</button>' : ''} <button class="btn secondary" data-action="history">Score history${records.length?` (${records.length})`:''}</button></div><div class="hero-art"><div class="art-label">Two exams · One studio</div><div class="art-number">GRE<span style="font-size:36px;color:#d6a85e"> + </span>IELTS</div><div class="art-caption">One section at a time. Your pace, your progress.</div></div></div>
  <div class="path-card"><div><div class="eyebrow">Explore IELTS</div><h2>Reading, Listening & Writing</h2><p>${pagesMode?'Practice with original short exercises, answer review, raw scores, and writing self-review.':'Work through the study archive with answer review, raw scores, and writing self-review.'}</p></div><button class="btn" data-action="ielts">Open IELTS practice</button></div>
  <div class="btn-row"><button class="btn ghost" data-action="home">← Choose test</button></div><div class="eyebrow top-gap">Choose a GRE session</div><div class="grid">
  <article class="card"><div class="card-num">01 · Exam simulation</div><span class="pill">1 hour 58 minutes</span><h3>Full-length test</h3><p>One Issue essay, then 2 Verbal and 2 Quant sections. 54 scored questions in total.</p><button class="btn" data-start="full">Start full test</button></article>
  <article class="card"><div class="card-num">02 · Focused verbal</div><span class="pill">41 minutes · 27 questions</span><h3>Verbal only</h3><p>Two timed Verbal sections. The second section adapts to your first-section performance.</p><button class="btn" data-start="verbalOnly">Start Verbal practice</button></article>
  <article class="card"><div class="card-num">03 · Focused quant</div><span class="pill">47 minutes · 27 questions</span><h3>Quant only</h3><p>Two timed Quant sections with an adaptive second stage and all current question formats.</p><button class="btn" data-start="quantOnly">Start Quant practice</button></article>
  <article class="card"><div class="card-num">04 · Focused endurance</div><span class="pill">88 minutes</span><h3>Verbal + Quant</h3><p>The four scored sections with the same timing and adaptive second stages, without the essay.</p><button class="btn" data-start="noEssay">Start scored sections</button></article>
  <article class="card"><div class="card-num">05 · Quick check-in</div><span class="pill">17 minutes</span><h3>Diagnostic</h3><p>Five Verbal and five Quant questions for a fast read on strengths and gaps.</p><button class="btn" data-start="diagnostic">Start diagnostic</button></article></div>
  <div class="panel top-gap"><h3>Build a shorter practice session</h3><p class="muted small">Choose 10–40 questions across Verbal and Quant. This is a drill, not a GRE-format simulation.</p><div class="field"><label for="count">Question count</label><select id="count">${[10,20,30,40].map(n=>`<option value="${n}" ${n===20?'selected':''}>${n} questions</option>`).join('')}</select></div><button class="btn secondary" data-start="custom">Start custom practice</button></div>
  <p class="muted small top-gap">Includes original practice and, on this local server, private book-derived Verbal items. Adaptive routing and scores are unofficial approximations.</p>`;
}

async function start(mode) {
  const count = Number(document.querySelector('#count')?.value || 20);
  try {const {id,plan}=await api('/api/gre/start',{method:'POST',body:JSON.stringify({mode,count})});state={id,startedAt:new Date().toISOString(),screen:'gre',mode,plan,completed:[],current:null,index:0};await nextSection();}catch(error){state.screen='gre';reportError(error);}
}

async function nextSection() {
  const config = state.plan[state.index];
  if (!config) {state.screen='results';state.current=null;state.completedAt=new Date().toISOString();save();render();return;}
  try {const data=await api('/api/gre/section',{method:'POST',body:JSON.stringify({id:state.id,index:state.index})});state.current={...data,answers:{},marked:[],position:0,essay:'',deadline:Date.now()+config.minutes*60000};state.screen='exam';save();render();}catch(error){state.screen='gre';reportError(error);}
}

function questionInput(q, chosen) {
  if (q.blanks) return q.blanks.map((choices,blank)=>`<fieldset class="blank-group"><legend>Blank ${blank+1}</legend>${choices.map((option,i)=>`<label class="choice ${chosen?.[blank]===i?'selected':''}"><input type="radio" name="blank-${blank}" data-blank="${blank}" value="${i}" ${chosen?.[blank]===i?'checked':''}><span>${escape(option)}</span></label>`).join('')}</fieldset>`).join('');
  if (q.type==='Numeric Entry') return `<label class="side-label" for="numeric-answer">Your answer</label><input id="numeric-answer" class="numeric-answer" inputmode="decimal" autocomplete="off" placeholder="Enter a number or fraction" value="${escape(chosen ?? '')}"><p class="muted small">Fractions such as 3/4 are accepted.</p>`;
  const multi=q.multiple;
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

async function finish() {
  if (!state.current) return;
  const current=state.current;state.current=null;
  try {const result=await api('/api/gre/submit',{method:'POST',body:JSON.stringify({id:state.id,index:state.index,answers:current.answers})});reviewDetails=result.review;state.completed.push({...current,score:result.score});state.screen='review';save();render();}catch(error){state.screen='gre';reportError(error);}
}

function review() {
  const s=state.completed.at(-1), essay=s.kind==='essay', score=sectionScore(s);
  const next=state.plan[state.index+1];
  const topicMisses={};
  if (!essay) s.questions.forEach((q,i)=>{if(reviewDetails[i] && !reviewDetails[i].correct)topicMisses[q.topic]=(topicMisses[q.topic]||0)+1;});
  const top=Object.entries(topicMisses).sort((a,b)=>b[1]-a[1]).slice(0,3);
  mount.innerHTML=`<div class="eyebrow">Section complete</div><h1>${escape(s.label)}</h1><p class="muted">${essay?'Review your response with the criteria below. Automatic essay scoring is intentionally not provided.':`You answered ${score.correct} of ${score.total} correctly. Review each item before moving on.`}</p>
  ${essay?`<div class="panel"><h3>Analytical Writing self-review</h3><p class="muted small">Use the official 0–6 scale as a guide, not a machine-generated score. Consider the strength of your position, development, organization, and language control.</p><div class="rubric"><div><strong>Position</strong><br>Did you address the issue and qualify your view when needed?</div><div><strong>Development</strong><br>Are reasons specific, relevant, and supported by examples?</div><div><strong>Organization</strong><br>Does the argument progress logically, with useful transitions?</div><div><strong>Language</strong><br>Is the prose clear, controlled, and precise?</div></div><details class="review-item"><summary>Show my essay (${wordCount(s.essay)} words)</summary><p style="white-space:pre-wrap">${escape(s.essay||'No response entered.')}</p></details></div>`:
  `<div class="stat-row"><div class="stat"><strong>${score.correct}/${score.total}</strong><span>Correct</span></div><div class="stat"><strong>${score.total?Math.round(score.correct/score.total*100):0}%</strong><span>Accuracy</span></div><div class="stat"><strong>${s.stage===2?escape(chooseLevel(state.completed.find(x=>x.kind===s.kind&&x.stage===1))):'Medium'}</strong><span>Practice difficulty</span></div></div><div class="panel"><h3>What to work on</h3><p>${top.length?`Your biggest opportunities: ${top.map(([name,n])=>`${escape(name)} (${n} missed)`).join(', ')}.`:reviewDetails.length?'No missed questions in this section—keep building consistency.':'Detailed review is available immediately after submitting a section.'}</p>${reviewDetails.length?s.questions.map((q,i)=>{const detail=reviewDetails[i]||{};return `<details class="review-item"><summary class="${detail.correct?'correct':'incorrect'}">${i+1}. ${detail.correct?'Correct':'Review'} · ${escape(q.topic)} — ${escape(q.prompt)}</summary><p>Your answer: ${escape(answerText(q,s.answers[i]))}<br>Correct answer: ${escape(answerText(q,detail.answer))}</p><p>${escape(detail.explanation)}</p></details>`;}).join(''):''}</div>`}
  <div class="btn-row"><button class="btn" data-action="continue">${next?`Continue to ${escape(next.label)}`:'View final results'}</button></div>`;
}

function results() {
  if (!state.id) state.id=crypto.randomUUID();
  if (!state.completedAt) state.completedAt=new Date().toISOString();
  if (!records.some(record=>record.id===state.id)) {records=mergeRecords(records,[makeRecord(state)]);saveHistory();save();}
  const scored=state.completed.filter(s=>s.kind!=='essay');
  const correct=scored.reduce((n,s)=>n+sectionScore(s).correct,0), total=scored.reduce((n,s)=>n+sectionScore(s).total,0);
  mount.innerHTML=`<div class="eyebrow">Session complete</div><h1>Your practice review</h1><p class="muted">This is an unofficial practice summary, not a scaled GRE score. Your raw result is saved in ${escape(user.name)}’s ${pagesMode?'synced':'browser'} history.</p><div class="stat-row"><div class="stat"><strong>${correct}/${total}</strong><span>Scored questions correct</span></div><div class="stat"><strong>${total?Math.round(correct/total*100):0}%</strong><span>Overall accuracy</span></div><div class="stat"><strong>${state.completed.length}</strong><span>Sections completed</span></div></div><div class="panel"><h3>Next session</h3><p>${escape(recommendation(state.completed))}</p></div><div class="summary-grid top-gap">${scored.map(s=>{const r=sectionScore(s);return `<div class="panel"><div class="question-type">${escape(s.kind)} · ${escape(s.stage===2?chooseLevel(state.completed.find(x=>x.kind===s.kind&&x.stage===1)):'medium')} difficulty</div><h3>${escape(s.label)}</h3><p>${r.correct} of ${r.total} correct</p></div>`}).join('')}</div>${state.completed.some(s=>s.kind==='essay')?'<p class="notice">Your essay was saved for self-review but was not automatically scored.</p>':''}<div class="btn-row"><button class="btn" data-action="history">View score history</button><button class="btn secondary" data-action="reset">Start a new session</button></div>`;
}

function historyPage() {
  const scored=records.filter(r=>(r.ielts?.total || r.verbal.total+r.quant.total)>0);
  const ordered=[...scored].reverse();
  const measure=r=>r.ielts || {correct:r.verbal.correct+r.quant.correct,total:r.verbal.total+r.quant.total};
  const points=ordered.map((r,i)=>({x:ordered.length===1?50:5+i*90/(ordered.length-1),y:95-100*measure(r).correct/measure(r).total*.9}));
  mount.innerHTML=`<div class="eyebrow">${escape(user.name)}’s progress</div><h1>Score history</h1><p class="muted">GRE and IELTS raw results are saved separately for each profile in this browser. They are not official scaled scores or IELTS bands.</p>${records.length?`<div class="panel"><h3>Overall accuracy over time</h3>${points.length?`<svg class="history-chart" viewBox="0 0 100 100" role="img" aria-label="Practice accuracy trend"><line x1="5" y1="95" x2="95" y2="95" stroke="#c5d3d1"/><polyline points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#176b69" stroke-width="1.5"/>${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2" fill="#d6a052"/>`).join('')}</svg>`:'<p>No scored sessions yet.</p>'}<p class="muted small">Scored sessions are plotted oldest to newest.</p></div><div class="panel top-gap"><h3>Past sessions</h3><div class="history-list">${records.map(r=>`<div class="history-row"><div><strong>${escape(new Date(r.completedAt).toLocaleDateString())}</strong><br><span class="muted small">${escape(modeName(r.mode))}</span></div><div><strong>${measure(r).total?`${measure(r).correct}/${measure(r).total}`:'Self-review'}</strong><br><span class="muted small">${r.ielts?'IELTS':'Overall'}</span></div><div><strong>${r.ielts?(accuracy(r.ielts)==null?'—':`${accuracy(r.ielts)}%`):`${accuracy(r.verbal)??'—'}${accuracy(r.verbal)==null?'':'%'}`}</strong><br><span class="muted small">${r.ielts?'Accuracy':'Verbal'}</span></div><div><strong>${r.ielts?(r.essayWords?`${r.essayWords} words`:'—'):`${accuracy(r.quant)??'—'}${accuracy(r.quant)==null?'':'%'}`}</strong><br><span class="muted small">${r.ielts?'Writing':'Quant'}</span></div><button class="btn ghost small" data-delete="${escape(r.id)}" aria-label="Delete session from ${escape(new Date(r.completedAt).toLocaleDateString())}">Delete</button></div>`).join('')}</div></div>`:'<div class="panel"><p>No completed sessions yet. Finish a practice test to see your progress here.</p></div>'}<div class="btn-row"><button class="btn" data-action="home">Back to test selection</button><button class="btn secondary" data-action="export" ${records.length?'':'disabled'}>Export history</button><button class="btn ghost" data-action="import">Import history</button>${localStorage.getItem(HISTORY)?'<button class="btn ghost" data-action="legacy">Import earlier browser history</button>':''}<input id="history-file" type="file" accept="application/json,.json" hidden></div><p class="muted small top-gap">Exports are backups. Imported sessions are added to this profile on this browser.</p>`;
  if(pagesMode)mount.innerHTML=mount.innerHTML.replace('saved separately for each profile in this browser','synced across devices under this password-protected profile').replace('Imported sessions are added to this profile on this browser.','Imported sessions sync to this profile across devices.');
}

function modeName(mode) {return ({full:'GRE full-length',noEssay:'GRE Verbal + Quant',verbalOnly:'GRE Verbal only',quantOnly:'GRE Quant only',diagnostic:'GRE Diagnostic',custom:'GRE Custom practice','ielts-reading':'IELTS Reading','ielts-listening':'IELTS Listening','ielts-writing1':'IELTS Writing Task 1','ielts-writing2':'IELTS Writing Task 2'})[mode]||mode;}

function profileGate() {
  const passwordField=(id,label,autocomplete)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="password" minlength="10" maxlength="128" autocomplete="${autocomplete}" required></div>`;
  mount.innerHTML=`<div class="auth-card panel"><div class="eyebrow">Welcome to the studio</div><h1>GRE & IELTS Practice Studio</h1><p>${pagesMode?'Choose your profile and enter its password. Scores sync across your devices.':'Choose an existing profile or add your name to begin. No password is needed.'}</p><div class="profile-forms"><form id="select-profile-form"><h2>Existing profile</h2><div class="field"><label for="profile-select">Choose a name</label><select id="profile-select" required><option value="">Select a profile</option>${profiles.map(profile=>`<option value="${escape(profile.id)}">${escape(profile.name)}</option>`).join('')}</select></div>${pagesMode?`${passwordField('profile-password','Password','current-password')}<div class="field"><label for="profile-code">One-time setup code (first sign-in only)</label><input id="profile-code" type="text" autocomplete="off" spellcheck="false" placeholder="Enter your setup code if needed"></div><p class="muted small">Mursalin and Ramisa use their setup codes once to choose a password.</p>`:''}<button class="btn" type="submit">${pagesMode?'Sign in':'Continue'}</button></form><form id="create-profile-form"><h2>New profile</h2><div class="field"><label for="profile-name">Your name</label><input id="profile-name" type="text" maxlength="40" autocomplete="name" placeholder="Enter your name" required></div>${pagesMode?passwordField('new-profile-password','Create password','new-password'):''}<button class="btn secondary" type="submit">Add profile & continue</button></form></div>${accountError?`<p class="incorrect small" role="alert">${escape(accountError)}</p>`:''}<p class="muted small profile-note">${pagesMode?'Each profile has its own password. Completed scores sync; unfinished test work stays in this browser.':'Profiles are shared, but score history stays in this browser under the selected name.'}</p></div>`;
}

function passwordPage() {
  mount.innerHTML=`<div class="eyebrow">${escape(user.name)}’s profile</div><h1>Change password</h1><div class="panel"><form id="change-password-form"><div class="field"><label for="current-password">Current password</label><input id="current-password" type="password" autocomplete="current-password" required></div><div class="field"><label for="next-password">New password</label><input id="next-password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><div class="btn-row"><button class="btn" type="submit">Update password</button><button class="btn secondary" type="button" data-action="home">Cancel</button></div></form></div><p class="muted small top-gap">Changing your password signs out other devices. You will need the new password to sign in again.</p>`;
}

function render() {
  const account=document.querySelector('#account');
  if(account) account.innerHTML=user?`<span>${escape(user.name)}</span> ${pagesMode?'<button class="account-button" id="change-password">Change password</button>':''} <button class="account-button" id="switch-profile">Switch profile</button>`:'';
  if (!accountReady) {mount.innerHTML='<div class="panel">Opening the studio…</div>';return;}
  if (!user) {profileGate();return;}
  const oldError=document.querySelector('#account-error');if(oldError)oldError.remove();
  if (accountError) mount.insertAdjacentHTML('beforebegin',`<p class="notice" id="account-error" role="alert">${escape(accountError)}</p>`);
  if (state.screen==='exam' && remaining()===0) {finish();return;}
  if (state.screen==='exam') exam();
  else if (state.screen==='review') review();
  else if (state.screen==='results') results();
  else if (state.screen==='history') historyPage();
  else if (state.screen==='password') passwordPage();
  else if (state.screen==='gre') greHome();
  else if (state.screen==='ielts') showIelts(mount,saveIeltsScore,()=>{state.screen='home';save();render();},api,pagesMode);
  else home();
}

document.addEventListener('submit',async event=>{
  if(event.target.id==='change-password-form'){
    event.preventDefault();
    const currentPassword=document.querySelector('#current-password').value,newPassword=document.querySelector('#next-password').value,confirmation=document.querySelector('#confirm-password').value;
    if(newPassword!==confirmation){reportError(Error('New passwords do not match.'));return;}
    try{await api('/api/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});state.screen='home';accountError='';save();render();}catch(error){reportError(error);}
    return;
  }
  if(!['select-profile-form','create-profile-form'].includes(event.target.id))return;
  event.preventDefault();
  try{
    const payload=event.target.id==='select-profile-form'?{id:document.querySelector('#profile-select').value,...(pagesMode?{password:document.querySelector('#profile-password').value,claimCode:document.querySelector('#profile-code').value}:{})}:{name:document.querySelector('#profile-name').value,...(pagesMode?{password:document.querySelector('#new-profile-password').value}:{})};
    const result=await api('/api/profile',{method:'POST',body:JSON.stringify(payload)});
    profiles=result.profiles;
    await setUser(result.user,{afterLogin:true});
  }catch(error){reportError(error);}
});
document.addEventListener('click',async event=>{
  if(event.target.id==='switch-profile'){try{await api('/api/logout',{method:'POST'});await setUser(null);}catch(error){reportError(error);} }
  if(event.target.id==='change-password'){state.screen='password';save();render();}
});

async function saveIeltsScore(result) {
  const now=new Date().toISOString();
  const record={id:crypto.randomUUID(),mode:result.mode,startedAt:now,completedAt:now,verbal:{correct:0,total:0},quant:{correct:0,total:0},essayWords:result.words,ielts:{correct:result.correct,total:result.total}};
  records=mergeRecords(records,[record]);await saveHistory();
}

mount.addEventListener('click',async event=>{
  const button=event.target.closest('button'); if(!button) return;
  if(button.dataset.delete){if(confirm('Delete this saved practice session from this profile?')){try{if(pagesMode)await api(`/api/history/${encodeURIComponent(button.dataset.delete)}`,{method:'DELETE'});records=records.filter(record=>record.id!==button.dataset.delete);syncedIds.delete(button.dataset.delete);if(pagesMode){const pending=mergeRecords([],JSON.parse(localStorage.getItem(`${PENDING}:${user.id}`)||'[]')).filter(record=>record.id!==button.dataset.delete);localStorage.setItem(`${PENDING}:${user.id}`,JSON.stringify(pending));}await saveHistory();render();}catch(error){reportError(error);}}return;}
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
    case 'history':try{await refreshHistory();}catch(error){reportError(error);}state.screen='history';save();render();break;
    case 'gre':state.screen='gre';save();render();break;
    case 'ielts':state.screen='ielts';save();render();break;
    case 'export':{const blob=new Blob([JSON.stringify({format:'gre-practice-history-v1',records},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='gre-practice-history.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
    case 'import':document.querySelector('#history-file').click();break;
    case 'legacy':{try{const incoming=mergeRecords([],JSON.parse(localStorage.getItem(HISTORY)||'[]'));records=mergeRecords(records,incoming);saveHistory();render();}catch(error){reportError(error);}break;}
  }
});
mount.addEventListener('change',event=>{
  if(event.target.id==='history-file') {const file=event.target.files?.[0];if(file) file.text().then(text=>{try{const parsed=JSON.parse(text);if(parsed.format!=='gre-practice-history-v1'||!Array.isArray(parsed.records)) throw Error('Invalid backup');records=mergeRecords(records,parsed.records);saveHistory();render();}catch(error){alert(`Could not import backup: ${error.message}`);}});return;}
  if(event.target.dataset.blank!==undefined&&state.current){const s=section(),blank=Number(event.target.dataset.blank);const old=s.answers[s.position]||[];old[blank]=Number(event.target.value);s.answers[s.position]=old;save();render();return;}
  if(event.target.name!=='answer'||!state.current)return;
  const s=section(),q=s.questions[s.position],value=Number(event.target.value);
  if(q.multiple) {const old=s.answers[s.position]||[];s.answers[s.position]=event.target.checked?[...old,value]:old.filter(x=>x!==value);}
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
