(()=>{
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=(r,s)=>r.querySelector(s),$$=(r,s)=>[...r.querySelectorAll(s)];
const wait=ms=>new Promise(r=>setTimeout(r,RM?0:ms));
const badge=(t,s=40)=>`<span class="dl-badge" style="--s:${s}px;--c1:${t.c1};--c2:${t.c2}">${t.ab}</span>`;
const rel=(el,ph)=>{const a=el.getBoundingClientRect(),b=ph.getBoundingClientRect(),k=b.width/ph.offsetWidth||1;return{x:(a.left-b.left)/k,y:(a.top-b.top)/k,w:a.width/k,h:a.height/k}};
const DIG=[...'0123456789'].map(x=>`<span>${x}</span>`).join('');
const odoHTML=v=>[...String(v)].map(d=>`<span class="dl-odo-d"><span class="dl-odo-col" style="transform:translateY(-${d*10}%)">${DIG}</span></span>`).join('');
const CHEV='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>';
const STAR='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.4l6.3-.9z"></path></svg>';
const CHECK='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"></path></svg>';
const DOWN='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>';

/* 06 Team page */
const TAGS={locked:['Locked','gold'],live:['Live','blue'],reach:['In reach',''],off:['','']};
const TEAMS=[
{name:'Detroit Lions',short:'Lions',ab:'DET',lg:'NFL',c1:'#0076B6',c2:'#FFFFFF',owner:'You',rec:'9–3',pos:'1st NFC N',lk:1,lv:2,tag:['Live','blue'],
ladder:[['Make the playoffs',1,'locked','Clinched last week'],['Division title',2,'live','Lead by 1 game, 5 left'],['Best record in the NFC',3,'reach','1 game behind the Eagles'],['Win the Super Bowl',5,'off','February 8']],
next:{opp:{n:'Packers',ab:'GB',c1:'#203731',c2:'#FFB612'},home:1,when:'Sun · 4:25 PM',secs:195254},
form:[['W','31–17','CHI',14],['W','24–20','MIN',4],['L','17–27','PHI',-10],['W','34–10','NYG',24],['W','28–21','GB',7]]},
{name:'Liverpool',short:'Liverpool',ab:'LIV',lg:'EPL',c1:'#C8102E',c2:'#F6EB61',owner:'You',rec:'8–3–2',pos:'2nd',lk:0,lv:2,tag:['Live','blue'],
ladder:[['Finish top four',2,'live','6 pts clear of 5th'],['Win the league',5,'reach','2 pts behind Arsenal'],['Relegated',-3,'off','28 pts clear of the drop']],
next:{opp:{n:'Man City',ab:'MCI',c1:'#6CABDD',c2:'#1C2C5B'},home:0,when:'Sat · 7:30 AM',secs:139820},
form:[['W','2–0','EVE',2],['D','1–1','TOT',0],['W','3–1','CHE',2],['W','2–1','AVL',1],['L','0–1','NEW',-1]]},
{name:'Boston Celtics',short:'Celtics',ab:'BOS',lg:'NBA',c1:'#007A33',c2:'#FFFFFF',owner:'Sam',rec:'14–6',pos:'2nd East',lk:0,lv:1,tag:['Live','blue'],
ladder:[['Make the playoffs',1,'live','7 games up on 9th'],['Division title',2,'reach','1 game behind the Knicks'],['Best record in the East',3,'reach','2 games back'],['Win the title',5,'off','June']],
next:{opp:{n:'Knicks',ab:'NYK',c1:'#006BB6',c2:'#F58426'},home:1,when:'Tonight · 7:30 PM',secs:22155},
form:[['W','112–104','NYK',8],['W','121–99','MIA',22],['L','98–103','MIL',-5],['W','117–110','PHI',7],['W','108–95','ORL',13]]}];
const cd=s=>{const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60,p=n=>String(n).padStart(2,'0');return (d?d+'d ':'')+p(h)+':'+p(m)+':'+p(x)};
function team(ph){
clearInterval(ph._t);let i=0;const t0=Date.now();
ph.innerHTML=`<div class="dl-scroll tp-sc"><div class="tp-hero"><div class="tp-orb"></div><div class="tp-scrim"></div><div class="tp-hc"></div></div><div class="tp-body"></div></div>
<div class="tp-bar"><div class="tp-bar-bg"></div><button class="tp-back">${CHEV}Home</button><div class="tp-mini"></div><button class="tp-star" aria-label="Favorite">${STAR}</button></div><div class="dl-status dl-top">9:41</div>`;
const sc=$(ph,'.tp-sc'),hero=$(ph,'.tp-hero'),hc=$(ph,'.tp-hc'),body=$(ph,'.tp-body'),mini=$(ph,'.tp-mini'),orb=$(ph,'.tp-orb'),star=$(ph,'.tp-star');
const draw=(dir=0)=>{const t=TEAMS[i],max=t.ladder.reduce((a,s)=>a+Math.max(0,s[1]),0);
ph.style.setProperty('--tc',t.c1);
hc.innerHTML=`${badge(t,76)}<div class="tp-name">${t.name}</div><div class="tp-meta"><span class="${t.owner==='You'?'me':''}">${t.owner}</span><span>·</span><span>${t.lg}</span><span class="dl-tag ${t.tag[1]}">${t.tag[0]}</span></div><div class="tp-dots">${TEAMS.map((_,j)=>`<button data-j="${j}" class="${j===i?'on':''}" aria-label="Team ${j+1}"></button>`).join('')}</div>`;
mini.innerHTML=badge(t,26)+t.short;
star.classList.toggle('on',t.owner==='You'&&i===0);
const sec=(k,h)=>`<div class="tp-in" style="--k:${k}">${h}</div>`;
body.style.setProperty('--dir',dir);body.style.setProperty('--dz',dir?1:0);
body.innerHTML=
sec(0,`<div class="tp-stats"><div class="tp-stat"><small>Record</small><b>${t.rec}</b></div><div class="tp-stat"><small>Standing</small><b>${t.pos}</b></div><div class="tp-stat"><small>Points</small><b class="dl-odo tp-pts">${odoHTML(0)}</b></div></div>`)+
sec(1,`<div class="tp-card"><div class="tp-ch"><h4>Path to points</h4><span>${t.lk+t.lv} now · up to ${max}</span></div>${t.ladder.map(([l,p,s,n],k)=>`<div class="tp-step ${s}" style="--i:${k}"><span class="tp-node">${s==='locked'?CHECK:''}</span><span class="tp-sl"><b>${l}${TAGS[s][0]?`<span class="dl-tag ${TAGS[s][1]}">${TAGS[s][0]}</span>`:''}</b><small>${n}</small></span><span class="tp-sp">${p>0?'+':'−'}${Math.abs(p)}</span></div>`).join('')}</div>`)+
sec(2,`<div class="tp-card"><div class="tp-ch"><h4>Next game</h4><span>${t.next.when}</span></div><div class="tp-next">${badge(t,34)}<span class="tp-vs">${t.next.home?'vs':'at'}</span>${badge(t.next.opp,34)}<b>${t.next.opp.n}</b><span class="tp-cd" data-s="${t.next.secs}"></span></div></div>`)+
sec(3,`<div class="tp-card"><div class="tp-ch"><h4>Recent form</h4><span>Last 5</span></div><div class="tp-form">${t.form.map(([r,s,o,m],k)=>`<div class="tp-fc ${r.toLowerCase()}" style="--i:${k}"><div class="tp-fbar"><i style="--m:${Math.min(48,Math.abs(m)/(t.lg==='EPL'?3:25)*48+6)}"></i></div><span class="tp-fp">${r}</span><span class="tp-fo">${s}</span><span class="tp-fx">${o}</span></div>`).join('')}</div></div>`);
if(dir){hc.animate([{transform:`translateX(${dir*70}px)`,opacity:0},{transform:'translateX(0)',opacity:1}],{duration:RM?1:520,easing:'cubic-bezier(0.22,1,0.36,1)'})}
const pts=$(body,'.tp-pts');requestAnimationFrame(()=>setTimeout(()=>{pts.innerHTML=odoHTML(t.lk+t.lv).replace(/translateY\(-\d+%\)/,'translateY(0%)');requestAnimationFrame(()=>requestAnimationFrame(()=>{$$(pts,'.dl-odo-col').forEach((c,j)=>c.style.transform=`translateY(-${String(t.lk+t.lv)[j]*10}%)`)}))},RM?0:350));
tick();};
const tick=()=>$$(ph,'.tp-cd').forEach(e=>e.textContent=cd(Math.max(0,e.dataset.s-Math.floor((Date.now()-t0)/1000))));
ph._t=setInterval(tick,1000);
const go=(n,dir)=>{i=(n+TEAMS.length)%TEAMS.length;sc.scrollTo({top:0});draw(dir)};
hc.onclick=e=>{const b=e.target.closest('[data-j]');if(b){const j=+b.dataset.j;if(j!==i)go(j,j>i?1:-1)}};
star.onclick=()=>star.classList.toggle('on');
sc.onscroll=()=>{const y=sc.scrollTop;ph.style.setProperty('--p',Math.min(1,Math.max(0,(y-110)/90)));hc.style.setProperty('--y',Math.max(0,y)*.35)};
let sx,sy,dx,dy,mode=null;
hero.onpointerdown=e=>{if(e.target.closest('.tp-dots'))return;sx=e.clientX;sy=e.clientY;dx=dy=0;mode='wait';hero.setPointerCapture(e.pointerId)};
hero.onpointermove=e=>{if(!mode)return;dx=e.clientX-sx;dy=e.clientY-sy;
if(mode==='wait'&&Math.hypot(dx,dy)>6)mode=Math.abs(dx)>Math.abs(dy)?'x':(dy>0&&sc.scrollTop<=0?'y':null);
if(mode==='x'){hc.style.transition='none';hc.style.transform=`translateX(${dx*.6}px)`;hc.style.opacity=1-Math.min(.7,Math.abs(dx)/260)}
if(mode==='y'){const s=Math.min(dy,180)*.5;hero.style.transition='none';hero.style.height=300+s+'px';orb.style.transform=`scale(${1+s/260})`}};
hero.onpointerup=hero.onpointercancel=()=>{
if(mode==='x'){hc.style.transition='transform 420ms var(--ease-spring),opacity 300ms';hc.style.transform='';hc.style.opacity='';if(Math.abs(dx)>70){hc.style.transition='none';go(i-Math.sign(dx),-Math.sign(dx))}}
if(mode==='y'){hero.style.transition='height 560ms var(--ease-spring)';hero.style.height='';orb.style.transition='transform 560ms var(--ease-spring)';orb.style.transform=''}
mode=null};
draw(0);
}

/* 07 Landing */
const MQ1=[['DET','#0076B6','#FFFFFF'],['LIV','#C8102E','#F6EB61'],['CLE','#860038','#FDBB30'],['ORE','#154733','#FEE123'],['TBL','#002868','#FFFFFF'],['CHC','#0E3386','#CC3433'],['HOU','#C8102E','#FFFFFF'],['PIT','#101820','#FFB612'],['DEN','#0E2240','#FEC524'],['PHI','#F74902','#000000']];
const MQ2=[['GSV','#8A6BAF','#0A0B0D'],['NEW','#241F20','#FFFFFF'],['SD','#2F241D','#FFC425'],['TAMU','#500000','#FFFFFF'],['PUR','#000000','#CEB888'],['MIA','#008E97','#FC4C02'],['DRW','#CE1126','#FFFFFF'],['DAL','#00538C','#B8C4CA'],['WSH','#AB0003','#FFFFFF'],['ARIZ','#AB0520','#FFFFFF']];
const SEASON={Isaac:[0,3,6,8,11,13,15,17,19,21,24],You:[0,4,7,9,10,12,13,16,18,20,22],Drew:[0,2,5,9,12,14,14,15,17,18,19],Collin:[0,1,4,6,8,10,12,13,14,16,17]};
const CAPS=[[0,'Draft night. Everyone starts at zero.'],[.06,'Live points follow the real standings every day.'],[.45,'A league’s season ends and its points lock in gold.'],[.97,'The last season ends. First place takes it all.']];
const FAQ=[['Do I set lineups each week?','Nope. Once the draft is done, there’s nothing to manage. You cheer your teams on through the end of their seasons, and every team you drafted earns you points.'],['How does the draft work?','Everyone drafts together, live in Boxscore. It’s a snake draft: the order flips each round. Can’t stay for all of it? Auto draft makes your picks for you.'],['Does it cost anything?','This year’s buy-in is $20 per person, and you can pay it at the end of the season.']];
const GROUPS=[{n:'Season Ticket',u:'seasonticket.boxscore.space',f:7,l:'7 of 10 spots taken',m:'Draft Sat, Oct 18',open:1},{n:'The Draft',u:'thedraft.boxscore.space',f:10,l:'Full',m:'Season underway'}];
function landing(ph,opt={}){
const mq=row=>{const b=row.map(([ab,c1,c2])=>badge({ab,c1,c2},44)).join('');return b+b};
ph.innerHTML=`<div class="dl-scroll ld-sc"><div class="ld-in">
<div class="ld-hd"><img src="assets/logo-header.png" alt=""><h1>Boxscore</h1></div>
<section class="ld-hero"><h1><span>Draft real teams.</span><span>Score where they finish.</span></h1><p>Fantasy drafts across 9 real leagues, followed and scored live. No lineups, no waivers. Just your group and a season.</p></section>
<div class="ld-mq"><div class="ld-track">${mq(MQ1)}</div><div class="ld-track rev">${mq(MQ2)}</div></div>
<div class="ld-cta"><button class="dl-btn ld-find">Find your group</button></div>
${opt.mid?opt.mid.html:`<div class="ld-lbl">A season in one scroll</div>
<div class="ld-scrub"><div class="ld-sticky"><div class="ld-wk"><b class="ld-w">Draft night</b><span>Points</span></div><div class="ld-prog"><i></i></div>
<div class="ld-lad">${Object.keys(SEASON).map(n=>`<div class="ld-row${n==='You'?' me':''}" data-n="${n}"><span class="rk"></span><span class="nm">${n}</span><span class="bar"><i class="lk"></i><i class="lv"></i></span><span class="tt"></span></div>`).join('')}</div>
<div class="ld-cap"></div></div></div>`}
<div class="ld-lbl ld-glbl">Groups</div>
<div class="ld-groups">${GROUPS.map((g,k)=>`<button class="ld-g ld-rv${g.open?'':' full'}" data-k="${k}">${g.open?'<span class="ld-gorb"></span>':''}<div class="ld-gt"><b>${g.n}</b>${g.open?'<span>Claim a spot ›</span>':''}</div><div class="ld-gu">${g.u}</div><div class="ld-spots">${Array.from({length:10},(_,j)=>`<i class="${j<g.f?'f':''}" style="--i:${j}"></i>`).join('')}</div><div class="ld-gm"><span>${g.l}</span><span>${g.m}</span></div></button>`).join('')}</div>
<div class="ld-lbl">FAQ</div>
<div class="ld-faq ld-rv">${FAQ.map(([q,a])=>`<div class="ld-q"><button>${q}${DOWN}</button><div class="ld-a"><div><p>${a}</p></div></div></div>`).join('')}</div>
<p class="ld-foot">Each group is its own app. Open yours, then add it to your Home Screen.</p>
</div></div><div class="ld-cover"></div><div class="dl-status dl-top">9:41</div>`;
const sc=$(ph,'.ld-sc');if(opt.mid)opt.mid.bind(ph,sc);else{const scrub=$(ph,'.ld-scrub'),stk=$(ph,'.ld-sticky'),cap=$(ph,'.ld-cap'),wk=$(ph,'.ld-w'),prog=$(ph,'.ld-prog i');
const rows=Object.fromEntries($$(ph,'.ld-row').map(r=>[r.dataset.n,r]));let lastCap=-1;
const upd=()=>{const range=scrub.offsetHeight-stk.offsetHeight;const p=Math.min(1,Math.max(0,(sc.scrollTop+60-scrub.offsetTop)/range));
const f=p*10,a=Math.floor(f),b=Math.min(10,a+1),t=f-a,lock=p>=.97?1:Math.pow(p,1.8);
const cur=Object.entries(SEASON).map(([n,v])=>({n,v:v[a]+(v[b]-v[a])*t})).sort((x,y)=>y.v-x.v||(x.n<y.n?-1:1));
cur.forEach((c,k)=>{const r=rows[c.n];r.style.transform=`translateY(${k*48}px)`;r.querySelector('.rk').textContent=k+1;r.querySelector('.tt').textContent=Math.round(c.v);
r.querySelector('.lk').style.width=c.v*lock/25*100+'%';r.querySelector('.lv').style.width=c.v*(1-lock)/25*100+'%';r.classList.toggle('champ',p>=.97&&k===0)});
wk.textContent=p<.03?'Draft night':p>=.97?'Final':'Week '+Math.max(1,Math.ceil(f));prog.style.width=p*100+'%';
let ci=0;CAPS.forEach(([at],k)=>{if(p>=at)ci=k});if(ci!==lastCap){lastCap=ci;cap.textContent=CAPS[ci][1];cap.classList.remove('sw');cap.offsetWidth;cap.classList.add('sw')}};
sc.onscroll=upd;upd();}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{root:sc,threshold:.35});
$$(ph,'.ld-rv').forEach(el=>io.observe(el));
$(ph,'.ld-find').onclick=()=>sc.scrollTo({top:$(ph,'.ld-glbl').offsetTop-60,behavior:RM?'auto':'smooth'});
$$(ph,'.ld-q>button').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'));
$$(ph,'.ld-g').forEach(g=>g.onclick=async()=>{const G=GROUPS[g.dataset.k],r=rel(g,ph),W=ph.offsetWidth,H=ph.offsetHeight;
const h=document.createElement('div');h.className='ld-hand';h.innerHTML=`<span class="ld-gorb"></span><img src="assets/icon-192.png" alt=""><div class="ld-ht">Opening ${G.n}</div><div class="ld-hu">${G.u}</div><button class="ld-hb">Back to Boxscore</button>`;ph.appendChild(h);
h.animate([{clipPath:`inset(${r.y}px ${W-r.x-r.w}px ${H-r.y-r.h}px ${r.x}px round 20px)`},{clipPath:'inset(0px 0px 0px 0px round 44px)'}],{duration:RM?1:640,easing:'cubic-bezier(0.32,0.72,0,1)',fill:'forwards'});
await wait(360);h.classList.add('in');$(h,'.ld-hb').onclick=()=>{h.classList.add('out');setTimeout(()=>h.remove(),300)}});
}

window.__landing=landing;
const P={team,landing};
Object.entries(P).forEach(([k,f])=>{const el=document.getElementById('p-'+k);if(el)f(el)});
document.querySelectorAll('[data-replay2]').forEach(b=>b.onclick=()=>{const k=b.dataset.replay2;P[k](document.getElementById('p-'+k))});
})();
