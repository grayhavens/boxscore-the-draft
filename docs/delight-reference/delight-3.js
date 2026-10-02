(()=>{
const $=(r,s)=>r.querySelector(s),$$=(r,s)=>[...r.querySelectorAll(s)];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),ss=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const badge=(t,s=40)=>`<span class="dl-badge" style="--s:${s}px;--c1:${t.c1};--c2:${t.c2}">${t.ab}</span>`;
const DIG=[...'0123456789'].map(x=>`<span>${x}</span>`).join('');
const odoHTML=v=>[...String(v)].map(d=>`<span class="dl-odo-d"><span class="dl-odo-col" style="transform:translateY(-${d*10}%)">${DIG}</span></span>`).join('');
const odoSet=(el,v)=>{if(el.dataset.v==String(v))return;el.dataset.v=v;const s=String(v),c=$$(el,'.dl-odo-col');if(c.length!==s.length){el.innerHTML=odoHTML(v);return}[...s].forEach((d,i)=>c[i].style.transform=`translateY(-${d*10}%)`)};
const TROPHY='<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M7 6H4.6v1.2A3.3 3.3 0 0 0 7.6 10.5M17 6h2.4v1.2a3.3 3.3 0 0 1-3 3.3"></path><path fill="currentColor" d="M6.8 3.6h10.4v5.2a5.2 5.2 0 0 1-10.4 0z"></path><rect fill="currentColor" x="11" y="13.4" width="2" height="3.6"></rect><rect fill="currentColor" x="7.6" y="17" width="8.8" height="3" rx="1"></rect></svg>';
const LG=[['NFL',3],['NBA',3],['NHL',3],['MLB',3],['CFB',3],['CBB',3],['PGA',3],['EPL',2],['WNBA',1]];
const GOLF='#2E8A5C';
const PICKS=[['NFL','Lions','#0076B6'],['EPL','Liverpool','#C8102E'],['NBA','Cavaliers','#860038'],['CFB','Oregon','#FEE123'],['PGA','Scheffler',GOLF],['NHL','Lightning','#2E5CB8'],['MLB','Cubs','#2F5BC9'],['CBB','Houston','#C8102E'],['NFL','Steelers','#FFB612'],['NBA','Nuggets','#FEC524'],['NHL','Flyers','#F74902'],['WNBA','Valkyries','#8A6BAF'],['EPL','Newcastle','#E6E7EB'],['PGA','Schauffele',GOLF],['MLB','Padres','#FFC425'],['CFB','Texas A&M','#8C1D1D'],['CBB','Purdue','#CEB888'],['NFL','Dolphins','#008E97'],['NHL','Red Wings','#CE1126'],['NBA','Mavericks','#2A6FB5'],['MLB','Nationals','#AB0003'],['PGA','Åberg',GOLF],['CFB','Arizona','#AB0520'],['CBB','Utah State','#4A6FA5']];
const STEPS=[[0,'Draft 24 picks across 9 leagues','A live snake draft with your group. Everyone fills the same 24 slots, so you need a plan for all nine leagues.'],
[0,'Points come from where teams finish','Not single games. Titles, playoff runs and division wins score. Last place costs you.'],
[1,'Every game, one scoreboard','Scores puts every live game from all nine leagues on one page, tagged with who drafted each team.'],
[2,'Talk smack all season','Your league gets its own group chat. Share a game from Scores, react to the bad takes, and talk trash all year.'],
[4,'Live now, locked when the season ends','Live points follow the real standings every day, then lock in for good when a league’s season ends.'],
[4,'Winner-take-all','Every team you draft adds to one leaderboard, across all nine leagues. When the last season ends, first place takes it all.']];
const TABS=[['home','Home'],['scores','Scores'],['chat','Chat'],['standings','Standings'],['points','Points']];
const RULES=[['Make the playoffs',1,.2],['Division title',2,.42],['Best record in the NFC',3,.64],['Win the Super Bowl',5],['Last in the division',-2]];
const GAMES=[{lg:'NFL',clock:['Q4 · 2:10','Q4 · 1:52'],s:[{ab:'DET',n:'Lions',o:'You',c1:'#0076B6',c2:'#B0B7BC',v:[24,31]},{ab:'GB',n:'Packers',o:'Drew',c1:'#203731',c2:'#FFB612',v:[17,17]}]},
{lg:'Premier League',clock:['78′','81′'],s:[{ab:'LIV',n:'Liverpool',o:'Isaac',c1:'#C8102E',c2:'#FFFFFF',v:[2,2]},{ab:'ARS',n:'Arsenal',o:'Collin',c1:'#EF0107',c2:'#FFFFFF',v:[1,1]}]}];
const B4=[{n:'Isaac',lk:14,lv:7},{n:'You',lk:12,lv:7,me:1},{n:'Drew',lk:11,lv:7},{n:'Collin',lk:9,lv:6}];
const B5=[{n:'Isaac',v:21},{n:'You',v:19,me:1},{n:'Drew',v:18},{n:'Collin',v:15}];
const row=(d,k,tail)=>`<div class="tr-r${d.me?' me':''}" data-n="${d.n}" style="transform:translateY(${k*48}px)"><span class="rk">${k+1}</span><span class="nm">${d.n}</span><span class="bar"><i class="lk"></i><i class="lv"></i></span>${tail}<span class="tt dl-odo"></span></div>`;
const SCENES=[
`<div class="tr-sc col"><div class="tr-h"><b>Draft room</b><span class="tr-k tr-rd">Round 1</span></div><div class="tr-tiles">${LG.map(([l,c])=>`<div class="tr-tile" data-lg="${l}"><div class="tr-tt"><span>${l}</span><em>0/${c}</em></div><div class="tr-pips">${'<i></i>'.repeat(c)}</div></div>`).join('')}</div><div class="tr-last"></div></div>`,
`<div class="tr-sc"><div class="tr-hero"><span class="orb"></span>${badge({ab:'DET',c1:'#0076B6',c2:'#FFFFFF'},46)}<div><b class="tr-tn">Detroit Lions</b><span class="tr-tm"><span class="me">You</span> · NFL</span></div><div class="tr-worth"><small>Worth</small><b>+<span class="dl-odo tr-w">${odoHTML(0)}</span></b></div></div>${RULES.map(([l,p],k)=>`<div class="tp-step ${p<0?'off':'reach'}" style="--i:${k}"><span class="tp-node"></span><span class="tp-sl"><b>${l}</b></span><span class="tp-sp">${p>0?'+':'−'}${Math.abs(p)}</span></div>`).join('')}</div>`,
`<div class="tr-sc col"><div class="tr-h"><b>Scores</b><span class="tr-k">Today · 2 live</span></div>${GAMES.map(g=>`<div class="tr-gc live"><div class="tr-ge"><span>${g.lg}</span><span class="lv"><span class="dl-live"></span><span class="ck">${g.clock[0]}</span></span></div>${g.s.map(s=>`<div class="tr-side">${badge(s,28)}<b>${s.n}<small class="${s.o==='You'?'me':''}">${s.o}</small></b><span class="sc dl-odo">${odoHTML(s.v[0])}</span></div>`).join('')}</div>`).join('')}</div>`,
`<div class="tr-sc col"><div class="tr-h"><b>Chat</b><span class="tr-k">The Draft</span></div><div style="flex:1"></div>
<div class="tr-m show" data-at="0"><div class="ct-msg mine"><div class="ct-bub ct-game"><span class="dl-tag" style="align-self:flex-start;background:var(--live-soft);color:var(--live)">Live · Q4</span><div class="ct-gr">${badge({ab:'DET',c1:'#0076B6',c2:'#B0B7BC'},24)}<b>Lions</b><em>31</em></div><div class="ct-gr lose">${badge({ab:'GB',c1:'#203731',c2:'#FFB612'},24)}<b>Packers</b><em>17</em></div></div></div></div>
<div class="tr-m" data-at=".28"><div class="ct-msg"><span class="ct-who">Drew</span><div class="ct-bub">Garbage time TD. Enjoy it while it lasts</div><span class="ct-rx tr-rx"><i>😂</i><b>1</b></span></div></div>
<div class="tr-m" data-at=".78"><div class="ct-msg"><span class="ct-who">Isaac</span><div class="ct-bub">Both of you are chasing me on Points 😎</div></div></div></div>`,
`<div class="tr-sc col"><div class="tr-h"><b>Points</b><span class="tr-k">Locked + Live</span></div><div class="tr-ban">NFL season’s over. Its points are locked.</div><div class="tr-lb">${B4.map((d,k)=>row(d,k,'<span class="dl-tag blue tg">Live</span>')).join('')}</div></div>`,
`<div class="tr-sc col"><div class="tr-h"><b>Points</b><span class="tr-k tr-ph">Projected</span></div><div class="tr-lb">${B5.map((d,k)=>row(d,k,`<span></span>`).replace('<span class="tt',d.me?`<span class="tr-cup">${TROPHY}</span><span class="tt`:'<span></span><span class="tt')).join('')}</div></div>`];
const R=[
(el,p)=>{const n=Math.round(clamp(p/.9)*24),cnt={};
$$(el,'.tr-tile').forEach(t=>{cnt[t.dataset.lg]=0;$$(t,'.tr-pips i').forEach(i=>{i.style.background=''})});
let last=null;PICKS.slice(0,n).forEach(([lg,nm,c],k)=>{const t=$(el,`.tr-tile[data-lg="${lg}"]`),i=$$(t,'.tr-pips i')[cnt[lg]++];if(i)i.style.background=c;if(k===n-1)last={i,lg,nm,c}});
$$(el,'.tr-tile').forEach(t=>{$(t,'em').textContent=cnt[t.dataset.lg]+'/'+$$(t,'.tr-pips i').length});
if(el._n!==n){$$(el,'.tr-pips i.new').forEach(i=>i.classList.remove('new'));if(last&&n>(el._n||0))last.i.classList.add('new');el._n=n}
$(el,'.tr-rd').textContent=n>=24?'Draft complete':'Round '+(n+1);
$(el,'.tr-last').innerHTML=last?`<i style="background:${last.c}"></i>Pick ${n}: <b>${last.nm}</b> · ${last.lg}`:'You’re on the clock';},
(el,p)=>{let tot=0;$$(el,'.tp-step').forEach((s,k)=>{const [l,pt,at]=RULES[k],hit=at!=null&&p>=at;if(hit)tot+=pt;
if(s.classList.contains('live')!==hit){s.classList.toggle('live',hit);s.classList.toggle('reach',!hit&&pt>0);s.classList.toggle('hit',hit);const b=$(s,'b');b.innerHTML=l+(hit?'<span class="dl-tag blue">Live</span>':'')}});odoSet($(el,'.tr-w'),tot)},
(el,p)=>{const on=p>=.3?1:0;$$(el,'.tr-gc').forEach((c,g)=>{const G=GAMES[g];$(c,'.ck').textContent=G.clock[g===1?(p>=.62?1:0):on];
$$(c,'.tr-side').forEach((s,k)=>{const v=G.s[k].v[on],o=G.s[1-k].v[on];odoSet($(s,'.sc'),v);s.classList.toggle('trail',v<o)})});
const c0=$(el,'.tr-gc');if(on&&!el._on){c0.classList.remove('flash');c0.offsetWidth;c0.classList.add('flash')}el._on=on},
(el,p)=>{$$(el,'.tr-m').forEach(m=>m.classList.toggle('show',p>=+m.dataset.at));const n=p>=.62?2:p>=.48?1:0,rx=$(el,'.tr-rx');rx.classList.toggle('on',n>0);
if(n&&rx.dataset.n!=n){rx.dataset.n=n;$(rx,'b').textContent=n;rx.classList.remove('pop');rx.offsetWidth;rx.classList.add('pop')}},
(el,p)=>{const lock=ss(.3,.72,p);$(el,'.tr-ban').classList.toggle('show',p>=.3);
B4.forEach(d=>{const r=$(el,`[data-n="${d.n}"]`);$(r,'.lk').style.width=(d.lk+d.lv*lock)/26*100+'%';$(r,'.lv').style.width=d.lv*(1-lock)/26*100+'%';odoSet($(r,'.tt'),d.lk+d.lv);
const tg=$(r,'.tg'),L=lock>.5;tg.textContent=L?'Locked':'Live';tg.className='dl-tag tg '+(L?'gold':'blue')})},
(el,p)=>{const you=p>=.3?24:19,fin=p>=.55,cup=p>=.66;const cur=B5.map(d=>({...d,v:d.me?you:d.v})).sort((a,b)=>b.v-a.v);
$(el,'.tr-ph').textContent=fin?'Final':'Projected';
cur.forEach((d,k)=>{const r=$(el,`[data-n="${d.n}"]`);r.style.transform=`translateY(${k*48}px)`;r.style.zIndex=d.me?2:1;$(r,'.rk').textContent=k+1;odoSet($(r,'.tt'),d.v);
const lk=fin?d.v:Math.round(d.v*.6);$(r,'.lk').style.width=lk/26*100+'%';$(r,'.lv').style.width=(d.v-lk)/26*100+'%';r.classList.toggle('champ',cup&&k===0)});
$(el,'.tr-cup').classList.toggle('on',cup)}];

function tour(ph){window.__landing(ph,{mid:{
html:`<div class="ld-lbl">How it works</div><div class="tr-sec" style="height:3700px"><div class="tr-sticky"><div class="tr-seg">${STEPS.map((_,k)=>`<button aria-label="Step ${k+1}"><span><i></i></span></button>`).join('')}</div>
<div class="tr-screen">${SCENES.join('')}<nav class="tr-tabs"><span class="tr-pill"></span>${TABS.map(([ic,l])=>`<span class="tr-tab"><i style="--m:url(assets/icons/${ic}.svg)"></i>${l}</span>`).join('')}</nav></div>
<div class="tr-cap"></div></div></div>`,
bind(ph,sc){const sec=$(ph,'.tr-sec'),stk=$(ph,'.tr-sticky'),scenes=$$(ph,'.tr-sc'),segs=$$(ph,'.tr-seg i'),tabs=$$(ph,'.tr-tab'),pill=$(ph,'.tr-pill'),cap=$(ph,'.tr-cap');let cur=-1;
const range=()=>sec.offsetHeight-stk.offsetHeight;
const upd=()=>{const P=clamp((sc.scrollTop+56-sec.offsetTop)/range()),f=P*6,step=Math.min(5,Math.floor(f)),lp=step===5&&P>=1?1:f-step;
if(step!==cur){cur=step;scenes.forEach((s,k)=>{s.classList.toggle('on',k===step);s.classList.toggle('prev',k<step);if(k!==step)R[k](s,k<step?1:0)});
const tb=STEPS[step][0];tabs.forEach((t,k)=>t.classList.toggle('on',k===tb));pill.style.transform=`translateX(${tb*100}%)`;
cap.innerHTML=`<b>${STEPS[step][1]}</b><p>${STEPS[step][2]}</p>`;cap.classList.remove('sw');cap.offsetWidth;cap.classList.add('sw')}
segs.forEach((s,k)=>s.style.width=(k<step?100:k===step?lp*100:0)+'%');R[step](scenes[step],clamp(lp/.85))};
$$(ph,'.tr-seg button').forEach((b,k)=>b.onclick=()=>sc.scrollTo({top:sec.offsetTop-56+range()*(k+.03)/6,behavior:'smooth'}));
sc.onscroll=upd;upd();}}})}
const ph=document.getElementById('p-tour');tour(ph);
document.querySelectorAll('[data-replay3]').forEach(b=>b.onclick=()=>tour(ph));
})();
