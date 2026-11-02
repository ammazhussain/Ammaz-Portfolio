/* ═══════════════════════════════════════════════════════════
   DATA
   ang  — where the label sits on its ring, in degrees from
          vertical. Negative = left. Vary these so labels never
          stack, even when two rings are close together.
   w    — scroll weight. 1 = normal. Give a busy year 2 or 3
          and it takes that much more scrolling to pass through.
   logo — the client's mark. This is the card at rest.
   vid  — a recording of the page scrolling, played on hover on desktop.
          Made with tools-record-page.mjs, which drives the scroll frame by
          frame so the motion is even and the site's own scroll animations
          play properly. Empty = the card rests on its logo.
   page — full-page capture, hero to footer. Still used by the mobile list;
          on desktop vid has replaced it. Revealed on hover
          and scrolled top to bottom. Empty = logo only, which
          is what an unreleased project gets.
   c    — the plate behind the logo. Pick it for the logo's own
          contrast, not for the brand: a dark mark needs a light
          plate and the other way round.
   ═══════════════════════════════════════════════════════════ */
const PROJECTS = [
  {year:"2026", name:"Optimus Medical", title:"Optimus Medical", dom:"Medical supply · Site + CMS",
   stack:"HEALTHCARE", ang: -5, w:2, c:"#08262A",
   logo:"assets/logo-optimus.svg", page:"assets/optimus-medical-page.webp",
   vid:"assets/optimus-medical.mp4",
   url:"https://optimusmedicalpak.com"},

  {year:"2026", name:"Maken Brothers", title:"Maken Brothers", dom:"Construction · Site + SEO",
   stack:"CONSTRUCTION", ang: 10, w:2, c:"#EFEBE3",
   logo:"assets/logo-maken.svg", page:"assets/maken-brothers-page.webp",
   vid:"assets/maken-brothers.mp4",
   url:"https://makenbrothers.com"},

  {year:"2026", name:"HimmelTEK", title:"HimmelTEK", dom:"Accounting ERP · In development",
   stack:"ERP", ang: -7, w:1, c:"#F3F6FB",
   logo:"assets/logo-himmeltek.png", page:""},

  {year:"2026", name:"LumiLife", title:"LumiLife", dom:"Smart wearables · Store + app site",
   stack:"WEARABLES", ang: 14, w:2, c:"#0B3A22",
   logo:"assets/logo-lumilife.png", page:"assets/lumilife-page.webp",
   vid:"assets/lumilife.mp4",
   url:"https://ammazhussain.github.io/LumiLife-Refactor/"},
];
