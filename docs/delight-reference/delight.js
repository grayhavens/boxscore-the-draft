(()=>{
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const T={
ars:{n:'Arsenal',ab:'ARS',lg:'EPL',c1:'#EF0107',c2:'#FFFFFF'},
kc:{n:'Chiefs',ab:'KC',lg:'NFL',c1:'#E31837',c2:'#FFB81C'},
bos:{n:'Celtics',ab:'BOS',lg:'NBA',c1:'#007A33',c2:'#FFFFFF'},
lad:{n:'Dodgers',ab:'LAD',lg:'MLB',c1:'#005A9C',c2:'#FFFFFF'},
edm:{n:'Oilers',ab:'EDM',lg:'NHL',c1:'#041E42',c2:'#FF4C00'},
nyl:{n:'Liberty',ab:'NYL',lg:'WNBA',c1:'#6ECEB2',c2:'#000000'},
det:{n:'Lions',ab:'DET',lg:'NFL',c1:'#0076B6',c2:'#FFFFFF'},
liv:{n:'Liverpool',ab:'LIV',lg:'EPL',c1:'#C8102E',c2:'#F6EB61'},
nyk:{n:'Knicks',ab:'NYK',lg:'NBA',c1:'#006BB6',c2:'#F58426'}};
const $=(r,s)=>r.querySelector(s),$$=(r,s)=>[...r.querySelectorAll(s)];
const wait=ms=>new Promise(r=>setTimeout(r,RM?0:ms));
const badge=(t,s=40)=>`<span class="dl-badge" style="--s:${s}px;--c1:${t.c1};--c2:${t.c2}">${t.ab}</span>`;
const STATUS='<div class="dl-status">9:41</div>';
const rel=(el,ph)=>{const a=el.getBoundingClientRect(),b=ph.getBoundingClientRect(),k=b.width/ph.offsetWidth||1;return{x:(a.left-b.left)/k,y:(a.top-b.top)/k,w:a.width/k,h:a.height/k}};
const DIG=[...'0123456789'].map(x=>`<span>${x}</span>`).join('');
const odoHTML=v=>[...String(v)].map(d=>`<span class="dl-odo-d"><span class="dl-odo-col" style="transform:translateY(-${d*10}%)">${DIG}</span></span>`).join('');
const odoSet=(el,v)=>{const s=String(v),c=$$(el,'.dl-odo-col');if(c.length!==s.length){el.innerHTML=odoHTML(v);return}[...s].forEach((d,i)=>c[i].style.transform=`translateY(-${d*10}%)`)};
function fly(ph,html,from,to,o={}){
const f=document.createElement('div');f.className='dl-fly';f.innerHTML=html;
f.style.cssText=`left:${from.x}px;top:${from.y}px;width:${from.w}px;height:${from.h}px`;ph.appendChild(f);
const s=to.w/from.w,dx=to.x+to.w/2-(from.x+from.w/2),dy=to.y+to.h/2-(from.y+from.h/2);
const a=f.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx}px,${dy}px) scale(${s})`}],{duration:RM?1:(o.dur||620),easing:o.ease||'cubic-bezier(0.34,1.4,0.64,1)',fill:'forwards'});
return a.finished.then(()=>f.remove());}

/* 01 Draft */
function draft(ph){
clearInterval(ph._t);
const avail=['ars','kc','bos','lad'],proj={ars:38,kc:34,bos:31,lad:29};
const snake=['Sam','Jordan','Priya','You','Mo','Dev','Kat','Leo','Ana','Ben'],prior=['#0076B6','#C8102E','#041E42'];
ph.innerHTML=`${STATUS}<div class="dl-label" style="margin-top:4px">Draft · Round 3</div>
<div class="dr-strip"><div class="dr-rail">${snake.map((n,i)=>`<div class="dr-slot${i<3?' done':''}${i===3?' now':''}"><span class="dr-pk">3.${i+1}</span><span class="dr-nm">${n}</span>${i<3?`<span class="dr-mini" style="background:${prior[i]}"></span>`:''}</div>`).join('')}</div></div>
<section class="dr-hero"><div class="dr-flood"></div><div class="dr-clock"><svg viewBox="0 0 120 120"><circle class="dr-track" cx="60" cy="60" r="54"></circle><circle class="dr-ring" cx="60" cy="60" r="54"></circle></svg><div class="dr-time"><b>0:20</b><span>to pick</span></div></div><div class="dr-head"><h3>You’re on the clock</h3><p>Pick 3.4 · your next turn is 4.7</p></div><div class="dr-landed"></div></section>
<div class="dl-label">Best available</div>
<div class="dr-list">${avail.map(k=>`<button class="dr-row" data-k="${k}">${badge(T[k])}<span class="dr-tn"><b>${T[k].n}</b><small>${T[k].lg}</small></span><span class="dr-pr">${proj[k]}<small>proj</small></span></button>`).join('')}</div>
<div class="dr-cta"><button class="dl-btn" disabled>Choose a team</button></div>`;
const hero=$(ph,'.dr-hero'),ring=$(ph,'.dr-ring'),tb=$(ph,'.dr-time b'),cta=$(ph,'.dr-cta .dl-btn'),C=339.3,TOT=20;
let left=TOT,sel=null,done=false;
const tick=()=>{ring.style.strokeDashoffset=C*(1-Math.max(left-1,0)/TOT);tb.textContent='0:'+String(left).padStart(2,'0');hero.classList.toggle('hurry',left<=8)};
tick();
ph._t=setInterval(()=>{left--;tick();if(left<=0){clearInterval(ph._t);land(sel||'ars',true)}},1000);
$$(ph,'.dr-row').forEach(r=>r.onclick=()=>{if(done)return;sel=r.dataset.k;$$(ph,'.dr-row').forEach(x=>x.classList.toggle('sel',x===r));cta.disabled=false;cta.textContent='Draft '+T[sel].n});
cta.onclick=()=>sel&&!done&&land(sel);
async function land(k,auto){
done=true;clearInterval(ph._t);
const t=T[k],row=$(ph,`.dr-row[data-k="${k}"]`),b=$(row,'.dl-badge'),L=$(ph,'.dr-landed');
hero.style.setProperty('--tc1',t.c1);
L.innerHTML=`<span class="dr-lb" style="opacity:0">${badge(t,72)}</span><div class="dr-lt">${auto?'Auto-picked for you':'Your pick is in'}</div><div class="dr-ls">${t.n} · ${t.lg} · Pick 3.4</div>`;
hero.classList.remove('hurry');hero.classList.add('landed');
cta.disabled=true;cta.classList.add('ghost');cta.innerHTML='<span class="dl-live"></span>Mo is picking…';
const from=rel(b,ph),to=rel($(L,'.dl-badge'),ph);
b.style.visibility='hidden';
await fly(ph,badge(t,40),from,to,{dur:720});
const lb=$(L,'.dr-lb');lb.style.opacity=1;lb.classList.add('ring');L.classList.add('in');
row.classList.add('gone');
const slots=$$(ph,'.dr-slot');slots[3].classList.remove('now');slots[3].classList.add('done','pop');
slots[3].insertAdjacentHTML('beforeend',`<span class="dr-mini" style="background:${t.c1}"></span>`);
await wait(300);slots[4].classList.add('now');$(ph,'.dr-rail').style.transform='translateX(-128px)';
await wait(900);L.insertAdjacentHTML('beforeend','<div class="dr-next">You pick again at 4.7 · 12 picks away</div>');}
}

/* 02 Rank */
const RACE={Sam:[2,1,1,1,1,1,1,1],Jordan:[1,2,2,3,2,2,2,2],Priya:[3,3,4,2,3,3,3,3],You:[4,4,3,4,4,4,4,4]};
const RX=i=>10+i*35,RY=r=>12+(r-1)*29;
function rank(ph){
const ppl=[{n:'Sam',p:188,l:150},{n:'Jordan',p:181,l:139},{n:'Priya',p:176,l:120},{n:'You',p:170,l:128,me:1},{n:'Mo',p:152,l:110},{n:'Dev',p:141,l:101}];
const row=(p,i)=>`<div class="rk-row${p.me?' me':''}" data-n="${p.n}"><span class="rk-rank dl-odo">${odoHTML(i+1)}</span><span class="rk-nm">${p.n}</span><span class="rk-pts dl-odo">${odoHTML(p.p)}</span><span class="rk-bar"><i class="lk" style="width:${p.l/2.1}%"></i><i class="lv" style="width:${(p.p-p.l)/2.1}%"></i></span></div>`;
const lines=Object.entries(RACE).map(([n,rs])=>{const me=n==='You';return `<polyline points="${rs.map((r,i)=>RX(i)+','+RY(r)).join(' ')}" stroke="${me?'var(--accent)':'var(--text-mute)'}" stroke-width="${me?3:2}" opacity="${me?1:.45}"></polyline><circle class="rk-dot" data-n="${n}" cx="${RX(7)}" cy="${RY(rs[7])}" r="${me?4:3}" fill="${me?'var(--accent)':'var(--text-mute)'}"></circle>`}).join('');
ph.innerHTML=`${STATUS}<h1 class="dl-title">Points</h1><p class="dl-sub">Projected = Locked + Live</p>
<div class="rk-slot"><button class="rk-trigger">Simulate: Chiefs clinch the AFC West</button></div>
<div class="rk-list">${ppl.map(row).join('')}</div>
<div class="dl-label">Race · top 4 by week</div>
<div class="rk-race"><svg viewBox="0 0 290 112">${lines}<g class="rk-new"></g></svg>${Object.entries(RACE).map(([n,rs])=>`<span class="rk-lbl${n==='You'?' me':''}" data-n="${n}" style="top:${RY(rs[7])+6}px">${n}</span>`).join('')}</div>`;
$(ph,'.rk-trigger').onclick=async()=>{
$(ph,'.rk-slot').innerHTML=`<div class="rk-banner">${badge(T.kc,22)}<span>Chiefs clinched the AFC West · <b>+12 locked</b></span></div>`;
const me=ppl[3],list=$(ph,'.rk-list'),r=$(list,'.me');
await wait(500);
me.p+=12;me.l+=12;$(r,'.lk').style.width=me.l/2.1+'%';odoSet($(r,'.rk-pts'),me.p);r.classList.add('flash');
await wait(1000);
const rows=$$(list,'.rk-row'),first=new Map(rows.map(x=>[x,x.getBoundingClientRect().top]));
const order=[...ppl].sort((a,b)=>b.p-a.p);
order.forEach(p=>list.appendChild($(list,`[data-n="${p.n}"]`)));
const k=ph.getBoundingClientRect().height/ph.offsetHeight||1;
rows.forEach(x=>{const dy=(first.get(x)-x.getBoundingClientRect().top)/k;x.style.transition='none';x.style.transform=`translateY(${dy}px)`});
list.offsetHeight;r.classList.add('lift');
rows.forEach(x=>{x.style.transition=x===r?'transform 760ms cubic-bezier(.34,1.25,.64,1),box-shadow 300ms':'transform 620ms var(--ease-push)';x.style.transform=''});
order.forEach((p,i)=>{const el=$(list,`[data-n="${p.n}"]`),d=ppl.indexOf(p)-i;odoSet($(el,'.rk-rank'),i+1);if(d){$(el,'.rk-nm').insertAdjacentHTML('beforeend',`<span class="rk-d ${d>0?'up':'dn'}">${d>0?'▲':'▼'}${Math.abs(d)}</span>`)}});
const next={Sam:1,You:2,Jordan:3,Priya:4},g=$(ph,'.rk-new');
g.innerHTML=Object.entries(next).map(([n,rk])=>{const m=n==='You';return `<path class="rk-seg" pathLength="1" d="M${RX(7)},${RY(RACE[n][7])} L${RX(8)},${RY(rk)}" stroke="${m?'var(--accent)':'var(--text-mute)'}" stroke-width="${m?3:2}" opacity="${m?1:.45}"></path>`}).join('');
$$(ph,'.rk-dot').forEach(d=>d.style.opacity=0);
g.getBoundingClientRect();$$(g,'.rk-seg').forEach(s=>s.classList.add('on'));
$$(ph,'.rk-lbl').forEach(l=>{l.style.left='331px';l.style.top=RY(next[l.dataset.n])+6+'px'});
await wait(800);r.classList.remove('lift');
g.insertAdjacentHTML('beforeend',Object.entries(next).map(([n,rk])=>{const m=n==='You';return `<circle cx="${RX(8)}" cy="${RY(rk)}" r="${m?4:3}" fill="${m?'var(--accent)':'var(--text-mute)'}" style="transform-box:fill-box;transform-origin:center;animation:dl-pop 400ms var(--ease-spring)"></circle>`}).join(''));
$(ph,'.rk-slot').innerHTML='<div class="rk-banner"><span>You passed Jordan and Priya · <b>2nd</b>, 6 behind Sam</span></div>';};
}

/* 03 Daily open */
function daily(ph){
const cards=[
{t:T.bos,h:'Celtics won 112–104',s:'Beat the Knicks at home. +3 live points.',m:'NBA · Final · 10:42 PM'},
{t:T.ars,h:'Arsenal locked top four',s:'8 points locked. Those can’t be lost.',m:'<span class="dl-tag gold">Locked</span>EPL · 11:58 PM'},
{t:{ab:'2',c1:'#D9B45B',c2:'#0A0B0D'},h:'You moved up to 2nd',s:'Passed Jordan and Priya overnight. 6 behind Sam.',m:'Points · ▲2'}];
const home=[['ars','EPL',42],['kc','NFL',36],['bos','NBA',31],['lad','MLB',28],['edm','NHL',22]];
ph.classList.remove('do-done');
ph.innerHTML=`${STATUS}<div class="do-hd"><h1 class="dl-title">Home</h1><button class="do-pill">3 updates</button></div><p class="dl-sub">Thursday, October 1</p>
<div class="do-home"><div class="do-lh"><span>Your teams</span><span>Pts</span></div>${home.map(([k,lg,p],i)=>`<div class="do-row" style="--i:${i}">${badge(T[k],36)}<b>${T[k].n}<br><small style="font:600 12px Manrope;color:var(--text-mute)">${lg}</small></b><em>${p}</em></div>`).join('')}</div>
<div class="do-scrim"></div>
<div class="do-wrap"><div class="do-k"><span>Since last night</span><button class="do-clear">Clear all</button></div><div class="do-stack">${cards.map(c=>`<div class="do-card"><div class="do-orb" style="--c1:${c.t.c1}"></div>${badge(c.t,48)}<h4>${c.h}</h4><p>${c.s}</p><div class="do-m">${c.m}</div></div>`).join('')}</div><div class="do-hint">Swipe to clear · <b class="do-count">1 of 3</b></div></div>`;
const els=$$(ph,'.do-card');let idx=0;
const layout=()=>els.forEach((c,j)=>{const i=j-idx;if(i<0)return;c.style.zIndex=10-i;c.style.opacity=i<3?1:0;c.style.transform=`translateY(${i*14}px) scale(${1-i*.05})`});
els.forEach((c,j)=>setTimeout(()=>{c.style.transitionDelay='0ms';layout()},RM?0:200+j*90));
const finish=async()=>{await wait(250);ph.classList.add('do-done');await wait(200);$(ph,'.do-home').classList.add('in');await wait(300);$(ph,'.do-pill').classList.add('on')};
const out=(c,dir,dy=0)=>{c.style.transition='transform 460ms var(--ease-out),opacity 460ms';c.style.transform=`translate(${dir*440}px,${dy}px) rotate(${dir*22}deg)`;c.style.opacity=0;idx++;
$(ph,'.do-count').textContent=Math.min(idx+1,3)+' of 3';
els.forEach((x,j)=>{if(j>idx-1)x.style.transition='transform 520ms var(--ease-spring),opacity 300ms'});layout();if(idx>=els.length)finish()};
els.forEach((c,j)=>{let sx,sy,dx=0,dy=0,lx,lt,v=0,drag=false;
c.onpointerdown=e=>{if(j!==idx)return;drag=true;sx=lx=e.clientX;sy=e.clientY;lt=performance.now();dx=dy=v=0;c.setPointerCapture(e.pointerId);c.style.transition='none'};
c.onpointermove=e=>{if(!drag)return;dx=e.clientX-sx;dy=e.clientY-sy;const n=performance.now();v=(e.clientX-lx)/Math.max(1,n-lt);lx=e.clientX;lt=n;
c.style.transform=`translate(${dx}px,${dy*.25}px) rotate(${dx/18}deg)`;
const nx=els[idx+1];if(nx){const p=Math.min(1,Math.abs(dx)/140);nx.style.transition='none';nx.style.transform=`translateY(${14-14*p}px) scale(${.95+.05*p})`}};
c.onpointerup=c.onpointercancel=()=>{if(!drag)return;drag=false;
if(Math.abs(dx)>90||Math.abs(v)>.6)out(c,Math.sign(dx||v),dy*.25);
else{c.style.transition='transform 520ms var(--ease-spring)';const nx=els[idx+1];if(nx)nx.style.transition='transform 520ms var(--ease-spring)';layout()}}});
$(ph,'.do-clear').onclick=async()=>{for(let k=idx;k<els.length;k++){out(els[k],1);await wait(110)}};
$(ph,'.do-pill').onclick=()=>daily(ph);
}

/* 04 Champion */
function burst(cv,x,y,colors){
if(RM)return;const d=devicePixelRatio||1,W=375,H=760,ctx=cv.getContext('2d');cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0);
const P=Array.from({length:110},()=>({x,y,vx:(Math.random()-.5)*11,vy:-Math.random()*10-3,r:Math.random()*6,vr:(Math.random()-.5)*.35,w:4+Math.random()*6,h:3+Math.random()*3,c:colors[Math.random()*colors.length|0]}));
let f=0;(function step(){ctx.clearRect(0,0,W,H);P.forEach(p=>{p.vy+=.24;p.vx*=.985;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;ctx.save();ctx.globalAlpha=Math.max(0,1-f/120);ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h*Math.abs(Math.cos(p.r*2)));ctx.restore()});if(++f<120)requestAnimationFrame(step);else ctx.clearRect(0,0,W,H)})();}
function champ(ph){
const teams=[['liv',52],['det',44],['bos',38],['edm',31],['lad',27],['nyl',22]];
const table=[['Priya',214],['Sam',196],['You',188],['Jordan',181],['Mo',160],['Dev',149]];
const pr=[12,30,51,70,92,118,141,166,190,214],sm=[18,38,55,78,99,120,139,158,178,196];
const line=a=>a.map((v,i)=>`${i*22.6},${46-v/214*44}`).join(' ');
ph.innerHTML=`${STATUS}<h1 class="dl-title">Points</h1><p class="dl-sub">2025–26 · Final</p>
<div class="ch-table">${table.map(([n,p],i)=>`<div class="ch-tr${n==='You'?' me':''}"><span>${i+1}</span><b>${n}</b><em>${p}</em></div>`).join('')}</div>
<div class="dr-cta"><button class="dl-btn ch-go">Crown the champion</button></div>
<div class="ch-stage"><div class="ch-orb"></div><canvas></canvas><div class="ch-in"><div class="ch-k">The Draft · 2025–26 champion</div><div class="ch-name">${[...'Priya'].map((c,i)=>`<span style="--i:${i}">${c}</span>`).join('')}</div><div class="ch-total"><b>0</b><span>pts · 18 clear of Sam</span></div><div class="ch-teams">${teams.map(([k,p],i)=>`<div class="ch-t" style="--i:${i}">${badge(T[k],40)}<span>${p}</span></div>`).join('')}</div></div>
<div class="ch-act"><button class="dl-btn ch-share">Share to chat</button><button class="dl-btn ghost ch-close">See the final table</button></div></div>
<div class="ch-toast">Posted to The Draft chat</div><div class="ch-veil"></div>
<div class="ch-sheet"><div class="ch-grab"></div><h3>Share to chat</h3><div class="ch-card"><div class="ch-corb"></div><div class="ch-logo"><img src="assets/logo-header.png" alt=""><span>Boxscore</span></div><div class="ch-ck">2025–26 champion</div><div class="ch-cn">Priya</div><div class="ch-cp">214 pts · 18 clear of Sam</div><svg class="ch-race" viewBox="0 0 204 48"><polyline points="${line(sm)}" stroke="#64666E" stroke-width="1.5"></polyline><polyline class="ch-draw" pathLength="1" points="${line(pr)}" stroke="#D9B45B" stroke-width="2.5"></polyline></svg><div class="ch-cb">${teams.map(([k])=>badge(T[k],24)).join('')}</div><div class="ch-cf">thedraft.boxscore.space</div></div><button class="dl-btn ch-send">Send to The Draft</button></div>`;
const st=$(ph,'.ch-stage'),tot=$(ph,'.ch-total b'),sh=$(ph,'.ch-sheet'),veil=$(ph,'.ch-veil');
$(ph,'.ch-go').onclick=async()=>{
st.className='ch-stage on';await wait(350);st.classList.add('p1');await wait(800);st.classList.add('p2');
await new Promise(res=>{if(RM){tot.textContent=214;return res()}const t0=performance.now(),D=1500;(function f(n){const p=Math.min(1,(n-t0)/D);tot.textContent=Math.round(214*(1-Math.pow(1-p,3)));p<1?requestAnimationFrame(f):res()})(t0)});
tot.classList.add('pop');const r=rel(tot,ph);burst($(st,'canvas'),r.x+r.w/2,r.y+r.h/2,['#D9B45B','#E2B84A','#F3F4F6','#C8102E','#0076B6','#007A33']);
await wait(500);st.classList.add('p3');await wait(800);st.classList.add('p4');};
$(ph,'.ch-close').onclick=()=>{st.className='ch-stage'};
$(ph,'.ch-share').onclick=()=>{sh.classList.add('open');veil.classList.add('on')};
veil.onclick=()=>{sh.classList.remove('open');veil.classList.remove('on')};
$(ph,'.ch-send').onclick=async()=>{sh.classList.remove('open');veil.classList.remove('on');await wait(250);const t=$(ph,'.ch-toast');t.classList.add('on');await wait(2200);t.classList.remove('on')};
}

/* 05 Chat */
const EM=['👍','👎','😂','😮','😢','🔥','😎'];
const ARROW='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"></path><path d="M4 9h11a5 5 0 0 1 5 5v6"></path></svg>';
function chat(ph){
ph.innerHTML=`${STATUS}<h1 class="dl-title">Chat</h1><p class="dl-sub">The Draft’s #1 Source for Smack Talk</p>
<div class="ct-thread">
<div class="ct-msg" data-who="Sam"><span class="ct-who">Sam</span><div class="ct-bub">Arsenal at 3.4 was a reach and you know it</div><span class="ct-arrow">${ARROW}</span><span class="ct-rx"><i>😂</i><b>2</b></span></div>
<div class="ct-msg mine" data-who="you"><div class="ct-bub">Talk to me in May</div><span class="ct-arrow">${ARROW}</span></div>
<div class="ct-msg" data-who="Jordan"><span class="ct-who">Jordan</span><div class="ct-bub ct-game"><span class="dl-tag" style="align-self:flex-start">Final</span><div class="ct-gr">${badge(T.bos,26)}<b>Celtics</b><em>112</em></div><div class="ct-gr lose">${badge(T.nyk,26)}<b>Knicks</b><em>104</em></div></div><span class="ct-arrow">${ARROW}</span></div>
<div class="ct-msg" data-who="Jordan"><div class="ct-bub">Celtics carrying your whole season</div><span class="ct-arrow">${ARROW}</span></div>
</div>
<div class="ct-hint">Hold a message to react · swipe right to reply</div>
<div class="ct-replying"><span>Replying to <b></b></span><button aria-label="Cancel reply"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></button></div>
<div class="ct-comp"><div class="ct-input">Message</div><button class="ct-send" aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg></button></div>`;
const thread=$(ph,'.ct-thread'),rp=$(ph,'.ct-replying');let bar=null,hot=null;
const close=()=>{thread.classList.remove('focus');if(hot)hot.classList.remove('hot');hot=null;if(bar){const b=bar;b.classList.add('out');setTimeout(()=>b.remove(),200);bar=null}};
const open=msg=>{hot=msg;msg.classList.add('hot');thread.classList.add('focus');const r=rel($(msg,'.ct-bub'),ph);
bar=document.createElement('div');bar.className='ct-bar';bar.innerHTML=EM.map(e=>`<span>${e}</span>`).join('');ph.appendChild(bar);
const w=bar.offsetWidth;let x=msg.classList.contains('mine')?r.x+r.w-w:r.x;x=Math.max(10,Math.min(375-w-10,x));
bar.style.left=x+'px';bar.style.top=(r.y-60)+'px';$$(bar,'span').forEach(s=>s.onclick=ev=>{ev.stopPropagation();pick(s)})};
const magnify=(cx,cy)=>{if(!bar)return null;const sp=$$(bar,'span'),br=bar.getBoundingClientRect(),near=cy>br.top-50&&cy<br.bottom+40;let best=null,bd=1e9;
sp.forEach(s=>{const r=s.getBoundingClientRect(),d=Math.abs(cx-(r.left+r.width/2)),k=near?Math.max(0,1-d/72):0;s.style.transform=`translateY(${-k*14}px) scale(${1+k*.65})`;if(near&&d<bd&&d<26){bd=d;best=s}});return best};
const pick=async s=>{const msg=hot,e=s.textContent;let pill=$(msg,'.ct-rx');
if(!pill){msg.insertAdjacentHTML('beforeend','<span class="ct-rx" style="opacity:0"><i></i><b>0</b></span>');pill=$(msg,'.ct-rx')}
const ic=$(pill,'i');if(!ic.textContent.includes(e))ic.textContent+=e;
const from=rel(s,ph),to=rel(pill,ph);to.w=to.h=14;to.x+=4;to.y+=3;
close();
await fly(ph,`<span style="font-size:24px;line-height:1">${e}</span>`,from,to,{dur:560,ease:'cubic-bezier(0.5,0,0.3,1.3)'});
pill.style.opacity=1;$(pill,'b').textContent=+$(pill,'b').textContent+1;pill.classList.remove('pop');pill.offsetWidth;pill.classList.add('pop');
if(e==='🔥'||e==='😂'||e==='😎'){const p=rel(pill,ph);for(let i=0;i<6;i++){const m=document.createElement('span');m.className='ct-mini';m.textContent=e;m.style.left=p.x+8+'px';m.style.top=p.y+'px';ph.appendChild(m);
m.animate([{transform:'translate(0,0) scale(.6)',opacity:1},{transform:`translate(${(Math.random()-.5)*70}px,${-60-Math.random()*50}px) scale(${.8+Math.random()*.5}) rotate(${(Math.random()-.5)*60}deg)`,opacity:0}],{duration:RM?1:800+Math.random()*400,easing:'cubic-bezier(.22,1,.36,1)',delay:i*40}).finished.then(()=>m.remove())}}};
$$(ph,'.ct-msg').forEach(msg=>{const bub=$(msg,'.ct-bub'),ar=$(msg,'.ct-arrow');let t,sx,sy,mode=null,crossed=false;
bub.onpointerdown=e=>{if(bar)return;sx=e.clientX;sy=e.clientY;mode='wait';crossed=false;bub.setPointerCapture(e.pointerId);bub.classList.add('press');
t=setTimeout(()=>{mode='hold';bub.classList.remove('press');open(msg)},380)};
bub.onpointermove=e=>{if(!mode)return;const dx=e.clientX-sx,dy=e.clientY-sy;
if(mode==='wait'&&(Math.abs(dx)>8||Math.abs(dy)>8)){clearTimeout(t);bub.classList.remove('press');mode=dx>8&&Math.abs(dx)>Math.abs(dy)?'swipe':null;if(mode)msg.classList.add('swiping')}
if(mode==='swipe'){const x=Math.max(0,Math.min(dx,150)*.55);msg.style.setProperty('--sw',x+'px');ar.style.opacity=Math.min(1,x/44);const c=x>=52;if(c!==crossed){crossed=c;ar.classList.toggle('tick',c)}}
if(mode==='hold')magnify(e.clientX,e.clientY)};
bub.onpointerup=bub.onpointercancel=e=>{clearTimeout(t);bub.classList.remove('press');
if(mode==='swipe'){msg.classList.remove('swiping');msg.style.setProperty('--sw','0px');ar.style.opacity=0;ar.classList.remove('tick');if(crossed){$(rp,'b').textContent=msg.dataset.who==='you'?'yourself':msg.dataset.who;rp.classList.add('on')}}
else if(mode==='hold'&&bar){const b=magnify(e.clientX,e.clientY);if(b)pick(b);else $$(bar,'span').forEach(s=>s.style.transform='')}
mode=null}});
ph.onpointerdown=e=>{if(bar&&!bar.contains(e.target)&&!e.target.closest('.ct-msg.hot'))close()};
$(rp,'button').onclick=()=>rp.classList.remove('on');
}

const P={draft,rank,daily,champ,chat};
Object.entries(P).forEach(([k,f])=>{const el=document.getElementById('p-'+k);if(el)f(el)});
document.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>{const k=b.dataset.replay;P[k](document.getElementById('p-'+k))});
})();
