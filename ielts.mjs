const paths = {reading:true,listening:true,writing1:true,writing2:true};
const labels = {reading:'Reading',listening:'Listening',writing1:'Writing Task 1',writing2:'Writing Task 2'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let category, selected, answers = {}, submitted = false, writing = '', result=null;
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ').replace(/[.,]+$/,'');
export function grade(question, value) {
  const expected = normalize(question.answer);
  if (!normalize(value)) return false;
  if (question.options?.length && /^[a-z]$/i.test(expected)) return normalize(value) === expected;
  if (/^[a-z](,\s*[a-z])+$/i.test(expected)) return normalize(value).split(/\s*,\s*/).sort().join(',') === expected.split(/\s*,\s*/).sort().join(',');
  return normalize(value) === expected;
}
export async function showIelts(mount, onScore, onBack, api, publicMode=false) {
  const render = () => {
    if (!category) {mount.innerHTML = `<div class="eyebrow">IELTS practice</div><h1>Practice every skill.</h1><p class="muted">Choose a skill, then complete an exercise. Reading and Listening receive raw accuracy; Writing is for self-review, with no estimated band.</p><div class="grid">${Object.keys(paths).map(key=>`<article class="card"><div class="card-num">IELTS · ${esc(labels[key])}</div><h3>${esc(labels[key])}</h3><p>${key.startsWith('writing')?'Work through a prompt and review a model response.':'Answer questions, then review explanations.'}</p><button class="btn" data-ielts-category="${key}">Explore ${esc(labels[key])}</button></article>`).join('')}</div><div class="btn-row"><button class="btn secondary" data-ielts-back>Back to studio</button></div><p class="muted small top-gap">${publicMode?'These are original short practice exercises, not full-length or official IELTS tests. Listening uses browser speech synthesis.':'Archive content is from IELTS Liz and is intended for personal study only.'} This is not an official IELTS score.</p>`;return;}
    if (!selected) {mount.innerHTML='<p>Loading exercise…</p>';return;}
    const isWriting=category.startsWith('writing');
    const questions=selected.questions || [];
    const score=result?.correct||0;
    mount.innerHTML=`<div class="eyebrow">IELTS · ${esc(labels[category])}</div><h1>${esc(selected.title || `Writing ${labels[category]}`)}</h1><p class="muted small">${isWriting?'Self-reviewed writing · no automatic band':`${questions.length} questions · ${esc(selected.question_type?.replaceAll('_',' ') || '')}`}</p>
    <div class="panel">${selected.passage?`<div class="passage">${esc(selected.passage)}</div>`:''}
    ${selected.audio_url && /^https:\/\/ieltsliz\.com\//.test(selected.audio_url)?`<audio controls preload="none" src="${esc(selected.audio_url)}">Audio unavailable</audio><p class="muted small">Audio is hosted by the original publisher and may be unavailable.</p>`:''}
    ${selected.audioText?'<button class="btn secondary" data-ielts-play type="button">Play listening passage</button><p class="muted small">Your browser reads the passage aloud. You can play it again.</p>':''}
    ${isWriting?`<div class="question-prompt">${esc(selected.prompt || selected.question)}</div>${selected.image_url && /^https:\/\/ieltsliz\.com\//.test(selected.image_url)?`<img class="ielts-image" src="${esc(selected.image_url)}" alt="Task illustration supplied by IELTS Liz" loading="lazy">`:''}<label class="side-label" for="ielts-writing">Your response</label><textarea id="ielts-writing" class="essay" placeholder="Write your response here…">${esc(writing)}</textarea><p class="muted small">${writing.trim()?writing.trim().split(/\s+/).length:0} words · Draft stays in this tab until you leave this exercise.</p>${submitted?`<details open class="review-item"><summary>Model response for comparison</summary><p class="passage">${esc(result?.modelAnswer || 'No model response supplied.')}</p></details>`:''}`:
    `${questions.map((q,i)=>`<div class="ielts-question"><label class="side-label" for="ielts-answer-${i}">${i+1}. ${esc(q.text)}</label>${q.options?.length?`<select id="ielts-answer-${i}" data-ielts-answer="${i}" ${submitted?'disabled':''}><option value="">Choose an answer</option>${q.options.map((opt,n)=>{const value=q.optionValue==='text'?opt:String.fromCharCode(65+n);return `<option value="${esc(value)}" ${answers[i]===value?'selected':''}>${esc(opt)}</option>`;}).join('')}</select>`:`<input id="ielts-answer-${i}" data-ielts-answer="${i}" value="${esc(answers[i]||'')}" ${submitted?'disabled':''} autocomplete="off" placeholder="Type your answer">`}${submitted?`<p class="${result?.review?.[i]?.correct?'correct':'incorrect'} small">${result?.review?.[i]?.correct?'Correct':'Review'} · Answer: ${esc(result?.review?.[i]?.answer)}</p><p class="muted small">${esc(result?.review?.[i]?.explanation)}</p>`:''}</div>`).join('')}${submitted?`<div class="stat"><strong>${score}/${questions.length}</strong><span>Raw score · ${questions.length?Math.round(score/questions.length*100):0}% accuracy</span></div>`:''}`}
    ${submitted && result?.transcript?`<details class="review-item"><summary>Show transcript</summary><p class="passage">${esc(result.transcript)}</p></details>`:''}
    ${selected.source_url && /^https:\/\//.test(selected.source_url)?`<p class="small">Source: <a href="${esc(selected.source_url)}" target="_blank" rel="noopener noreferrer">IELTS Liz</a></p>`:''}
    <div class="btn-row">${!submitted?`<button class="btn" data-ielts-submit>${isWriting?'Review model response':'Submit answers'}</button>`:''}<button class="btn secondary" data-ielts-next>Another exercise</button><button class="btn ghost" data-ielts-categories>All skills</button></div></div>`;
  };
  mount.onclick = async event => {
    const button=event.target.closest('button'); if(!button)return;
    if(button.hasAttribute('data-ielts-play')){if('speechSynthesis' in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(selected.audioText);utterance.lang='en-US';utterance.rate=.9;speechSynthesis.speak(utterance);}else alert('Speech playback is unavailable in this browser.');return;}
    if(button.hasAttribute('data-ielts-back')){if('speechSynthesis' in window)speechSynthesis.cancel();mount.onclick=null;onBack();return;}
    if(button.hasAttribute('data-ielts-categories')){if('speechSynthesis' in window)speechSynthesis.cancel();category=null;selected=null;render();return;}
    if(button.dataset.ieltsCategory || button.hasAttribute('data-ielts-next')){if(button.dataset.ieltsCategory)category=button.dataset.ieltsCategory;if('speechSynthesis' in window)speechSynthesis.cancel();mount.innerHTML='<p>Loading exercise…</p>';try{selected=await api(`/api/ielts/exercise?category=${category}`);answers={};writing='';submitted=false;result=null;render();}catch{mount.innerHTML='<div class="notice">IELTS exercises are unavailable on this server.</div><button class="btn secondary" data-ielts-categories>Back</button>';}return;}
    if(button.hasAttribute('data-ielts-submit')){try{result=await api('/api/ielts/submit',{method:'POST',body:JSON.stringify({category,id:selected.id,answers})});submitted=true;await onScore({mode:`ielts-${category}`,correct:result.correct,total:result.total,words:writing.trim()?writing.trim().split(/\s+/).length:0});render();}catch{alert('Could not submit this exercise. Try again.');}}
  };
  mount.oninput = event => {if(event.target.dataset.ieltsAnswer!==undefined)answers[event.target.dataset.ieltsAnswer]=event.target.value;if(event.target.id==='ielts-writing'){writing=event.target.value;}};
  category=null;selected=null;render();
}
