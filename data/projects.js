/* ═══════════════════════════════════════════════════════════
   DATA
   ang  — where the label sits on its ring, in degrees from
          vertical. Negative = left. Vary these so labels never
          stack, even when two rings are close together.
   w    — scroll weight. 1 = normal. Give a busy year 2 or 3
          and it takes that much more scrolling to pass through.
   ═══════════════════════════════════════════════════════════ */
const PROJECTS = [
  {year:"2026", name:"Optimus Medical", title:"Optimus Medical", dom:"Medical supply · Site + CMS",
   stack:"HEALTHCARE", ang: -5, w:2, img:"assets/optimus-medical.png", c:"#0E3B42",
   url:"https://optimusmedicalpak.com"},

  {year:"2026", name:"Maken Brothers", title:"Maken Brothers", dom:"Construction · Site + SEO",
   stack:"CONSTRUCTION", ang: 10, w:2, img:"assets/maken-brothers.webp", c:"#6E5C48",
   url:"https://makenbrothers.com"},

  {year:"2026", name:"Accounting ERP", title:"Accounting ERP", dom:"Finance · In development",
   stack:"ERP", ang: -7, w:1, img:"", c:"#4E5A66"},
];
