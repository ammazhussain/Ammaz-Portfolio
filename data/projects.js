/* ═══════════════════════════════════════════════════════════
   DATA
   ang  — where the label sits on its ring, in degrees from
          vertical. Negative = left. Vary these so labels never
          stack, even when two rings are close together.
   w    — scroll weight. 1 = normal. Give a busy year 2 or 3
          and it takes that much more scrolling to pass through.
   ═══════════════════════════════════════════════════════════ */
const PROJECTS = [
  {year:"2019", name:"Ledger dashboard",   title:"Ledger",        dom:"Fintech · Front-end",  stack:"FINTECH",  ang: -4, w:1, img:"", c:"#6E5C48"},
  {year:"2020", name:"Clinic booking flow",title:"Meridian",      dom:"Healthcare · Product", stack:"HEALTH",   ang:  9, w:1, img:"", c:"#5A6552"},
  {year:"2022", name:"Storefront rebuild", title:"Verso Shop",    dom:"E-commerce · Full stack",stack:"COMMERCE",ang: -8, w:2, img:"", c:"#7A5F45"},
  {year:"2023", name:"Operations console", title:"Northwind",     dom:"Internal tools · React",stack:"TOOLING", ang: 13, w:1, img:"", c:"#4E5A66"},
  {year:"2025", name:"Studio brand site",  title:"Atelier Ruo",   dom:"Brand · WebGL",        stack:"BRAND",    ang: -6, w:1, img:"", c:"#6B5560"},
  {year:"2026", name:"Learning platform",  title:"Coursefold",    dom:"EdTech · Design system",stack:"EDTECH",  ang: 11, w:1, img:"", c:"#4C5F60"},
];
