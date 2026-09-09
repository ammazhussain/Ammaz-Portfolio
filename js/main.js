const N = PROJECTS.length;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sky = document.getElementById('sky');

/* weighted anchors: project i lives at anchors[i] on the scroll axis */
const anchors = [0];
for(let i=1;i<N;i++) anchors[i] = anchors[i-1] + PROJECTS[i-1].w;
const U_MAX = anchors[N-1];

/* scroll units -> continuous project index */
function toIndex(u){
  for(let i=0;i<N-1;i++){
    if(u <= anchors[i+1]) return i + (u - anchors[i]) / (anchors[i+1] - anchors[i]);
  }
  return N-1;
}
function nearestAnchor(u){
  let best = anchors[0];
  for(const a of anchors) if(Math.abs(a-u) < Math.abs(best-u)) best = a;
  return best;
}

/* build ring + label per project */
const rings = [], labels = [];
PROJECTS.forEach((p,i)=>{
  const r = document.createElement('div');
  r.className = 'ring';
  r.innerHTML = '<i></i><i class="b"></i>';
  sky.appendChild(r); rings.push(r);

  const l = document.createElement('div');
  l.className = 'lbl';
  l.innerHTML = `<div class="yr">${p.year}</div><div class="nm">${p.name}</div>`;
  sky.appendChild(l); labels.push(l);
});

/* ═══════════════════════════════════════════════════════════
   VIRTUAL SCROLL
   ═══════════════════════════════════════════════════════════ */
let target = 0, u = 0, idle = null, active = -1, t0 = performance.now();
const clamp = v => Math.max(0, Math.min(U_MAX, v));
const locked = () => document.body.dataset.locked === '1';
const isMobile = () => innerWidth <= 960;   // arc is hidden; browser owns scrolling

function nudge(d){
  target = clamp(target + d);
  clearTimeout(idle);
  idle = setTimeout(()=>{ target = nearestAnchor(target); }, 150);
}
addEventListener('wheel', e=>{
  if(isMobile() || locked()) return;
  e.preventDefault();
  nudge(e.deltaY * 0.0021);
},{passive:false});

addEventListener('keydown', e=>{
  if(e.key==='Escape') return closeAll();
  if(isMobile() || locked()) return;   // mobile: arrows and space scroll the page
  const i = Math.round(toIndex(target));
  if(['ArrowDown','ArrowRight','PageDown',' '].includes(e.key)){ e.preventDefault(); target = anchors[Math.min(N-1,i+1)]; }
  if(['ArrowUp','ArrowLeft','PageUp'].includes(e.key)){ e.preventDefault(); target = anchors[Math.max(0,i-1)]; }
});

let ty=null;
addEventListener('touchstart', e=>{
  if(isMobile()) return;
  ty = e.touches[0].clientY;
},{passive:true});
addEventListener('touchmove', e=>{
  if(isMobile() || ty===null || locked()) return;
  const dy = ty - e.touches[0].clientY; ty = e.touches[0].clientY;
  nudge(dy * 0.0055);
},{passive:true});
addEventListener('touchend', ()=>{ ty=null; });

/* ═══════════════════════════════════════════════════════════
   FRAME LOOP
   Ring radius is driven by (i - index): as you scroll forward
   every ring grows, so the whole system breathes outward and
   each project owns its own arc. Rings also drift continuously
   whether or not you touch anything.
   ═══════════════════════════════════════════════════════════ */
let last = performance.now();
function frame(now){
  const t  = (now - t0) / 1000;
  let dt   = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);                     // clamp after a stall

  // frame-rate independent damping: same feel at 60Hz and 120Hz,
  // and a dropped frame catches up instead of stuttering.
  const k = reduce ? 1 : 1 - Math.exp(-7.5 * dt);
  u += (target - u) * k;
  if(Math.abs(target - u) < 0.0003) u = target;
  const idx = toIndex(u);

  const W = innerWidth, H = innerHeight;
  const cx = W * 0.56, cy = H * 1.30;          // ring centre, below the fold
  const base = H * 0.62, gap = H * 0.30;
  const drift = Math.sin(t * 0.16) * 7;         // slow, always-on breathing

  rings.forEach((el,i)=>{
    const d = i - idx;
    const r = base + d * gap + drift;
    if(r < 40){ el.style.opacity = 0; return; }
    const near = Math.max(0, 1 - Math.abs(d) * 0.30);
    const ease = near * near * (3 - 2 * near);   // smoothstep, no linear ramp
    el.style.opacity = (0.18 + ease * 0.82).toFixed(3);
    el.style.borderColor = Math.abs(d) < 0.5
      ? 'rgba(107,74,33,.78)' : 'var(--bronze-soft)';
    el.style.width = el.style.height = (r*2)+'px';
    el.style.transform = `translate(${cx-r}px, ${cy-r}px) rotate(${t*(3.2 + i*0.9)}deg)`;

    // label rides the same ring, upright
    const a = PROJECTS[i].ang * Math.PI/180;
    const lx = cx + Math.sin(a)*r, ly = cy - Math.cos(a)*r;
    const L = labels[i];
    L.style.transform = `translate(${lx}px, ${ly}px) translate(-50%,-50%)`;
    L.classList.toggle('on', Math.abs(d) < 0.5);

    // keep labels out of the text columns: fade across a 90px band
    // at each edge so they dissolve rather than pop.
    const leftEdge  = W * 0.42;
    const rightEdge = W - Math.min(W*0.33,440) - 110;
    let gate = 1;
    if(lx < leftEdge)  gate = Math.max(0, (lx - (leftEdge-90)) / 90);
    if(lx > rightEdge) gate = Math.min(gate, Math.max(0, ((rightEdge+90) - lx) / 90));
    if(ly < 96) gate = Math.min(gate, Math.max(0, (ly - 40) / 56));

    const lf = Math.max(0, 1 - Math.abs(d)*0.44);
    L.style.opacity = (lf*lf*(3-2*lf) * (gate*gate*(3-2*gate))).toFixed(3);
  });

  const kk = Math.round(idx);
  if(kk !== active){ active = kk; paint(kk); }

  // card eases out and back with a slight lift, rather than a linear dip
  const frac = Math.min(1, Math.abs(idx - kk) * 2);
  const dip  = frac*frac*(3-2*frac);
  if(W > 960){
    card.style.opacity   = (1 - dip*0.7).toFixed(3);
    card.style.transform = `translateY(calc(-50% + ${(dip*9).toFixed(2)}px)) scale(${(1 - dip*0.014).toFixed(4)})`;
  }else{
    card.style.opacity = 1; card.style.transform = 'none';
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- card ---------- */
const card = document.getElementById('card');
const shotImg = document.getElementById('shotImg'), shotPh = document.getElementById('shotPh');
function paint(i){
  const p = PROJECTS[i];
  document.getElementById('pTitle').textContent = p.title;
  document.getElementById('pDom').textContent   = `${p.year} — ${p.dom}`;
  document.getElementById('stack').textContent  = p.stack;
  document.getElementById('cNum').textContent   = String(i+1).padStart(2,'0');
  if(p.img){
    shotImg.src = p.img; shotImg.alt = p.title;
    shotImg.style.display='block'; shotPh.style.display='none';
  }else{
    shotImg.style.display='none'; shotPh.style.display='grid';
    shotPh.style.background = p.c;
    shotPh.textContent = p.title.split(' ').map(w=>w[0]).join('');
  }
}
document.getElementById('cTot').textContent = String(N).padStart(2,'0');
paint(0);

/* ---------- mobile list: same data, no arc ---------- */
const mlist = document.getElementById('mlist');

const head = document.createElement('div');
head.className = 'mhead';
head.innerHTML = `<h2>Selected work</h2><span>${N} projects</span>`;
mlist.appendChild(head);

PROJECTS.forEach(p=>{
  const art = document.createElement('article');
  art.className = 'mcard';
  const media = p.img
    ? `<img src="${p.img}" alt="${p.title}">`
    : `<div style="position:absolute;inset:0;display:grid;place-items:center;
         background:${p.c};font-family:Fraunces,serif;font-weight:600;font-size:50px;
         color:rgba(252,250,246,.92)">${p.title.split(' ').map(w=>w[0]).join('')}</div>`;
  art.innerHTML =
    `<div class="myear">${p.year}</div>
     <div class="shot">${media}<div class="stack">${p.stack}</div></div>
     <div class="mbody">
       <h3>${p.title}</h3>
       <p class="mdom">${p.dom}</p>
       <a class="mcta" href="${p.url || '#'}">View project <span>&rarr;</span></a>
     </div>`;
  mlist.appendChild(art);
});

const foot = document.createElement('div');
foot.className = 'mfoot';
foot.innerHTML =
  `<h3>Have a project in mind?</h3>
   <p>Taking on two clients at a time. Tell me what you are building.</p>
   <a href="mailto:hello@yourdomain.com">Start a project <i>&rarr;</i></a>`;
mlist.appendChild(foot);

/* ---------- panels ---------- */
const closeBtn = document.getElementById('closeBtn');
function openPanel(id){
  const el = document.getElementById('p-'+id); if(!el) return;
  el.classList.add('open'); el.setAttribute('aria-hidden','false');
  document.body.dataset.locked = '1';
  closeBtn.classList.add('show');
  el.focus();                       // focus the panel, not a button still fading in
}
function closeAll(){
  document.querySelectorAll('.panel').forEach(p=>{
    p.classList.remove('open'); p.setAttribute('aria-hidden','true');
  });
  delete document.body.dataset.locked;
  closeBtn.classList.remove('show');   // leaves immediately, no delay
}
document.querySelectorAll('.nav-item').forEach(b=>
  b.addEventListener('click',()=>openPanel(b.dataset.panel)));
document.getElementById('openAbout').addEventListener('click',()=>openPanel('about'));
closeBtn.addEventListener('click',closeAll);
