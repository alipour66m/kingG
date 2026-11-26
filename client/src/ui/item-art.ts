// Procedural vector renders for tactical ordnance, medical kits, and field gear items.
// Modern 3D firearms use studio-rendered public/assets/ui/icons/*.webp via icons.ts.

const wrap = (body: string, defs = "") =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='64' viewBox='0 0 128 64'>${
      defs ? `<defs>${defs}</defs>` : ""
    }${body}</svg>`,
  )}`;

const G_STEEL = `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#687482'/><stop offset='.35' stop-color='#39414b'/><stop offset='1' stop-color='#191e24'/></linearGradient>`;
const G_OLIVE = `<linearGradient id='o' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6c7852'/><stop offset='1' stop-color='#39412a'/></linearGradient>`;
const G_GLASS = `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8fe4ff'/><stop offset='.5' stop-color='#2680b8'/><stop offset='1' stop-color='#0f314d'/></linearGradient>`;

const ART: Record<string, string> = {

  // M67 Frag Grenade
  "banana-bomb": wrap(
    `<rect x='57' y='10' width='14' height='8' rx='2' fill='#4e565e' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M71 13c7 0 11 5 11 15v9' fill='none' stroke='#8e98a2' stroke-width='4' stroke-linecap='round'/>` +
      `<circle cx='50' cy='15' r='6' fill='none' stroke='#d4af37' stroke-width='2.2'/>` +
      `<ellipse cx='64' cy='38' rx='18' ry='20' fill='url(#o)' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<path d='M48 33h32M47 41h34M56 20v36M72 20v36' stroke='#262d1e' stroke-width='1.5' opacity='.6'/>` +
      `<ellipse cx='57' cy='30' rx='5' ry='8' fill='#98a678' opacity='.35'/>`,
    G_OLIVE,
  ),

  // Bandage (Sterile Rolled Field Gauze)
  "leaf-bundle": wrap(
    `<rect x='34' y='16' width='56' height='36' rx='6' fill='#dde4ea' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<path d='M42 16v36M82 16v36' stroke='#b2bec9' stroke-width='2'/>` +
      `<rect x='56' y='23' width='16' height='22' rx='2' fill='#fff'/>` +
      `<path d='M64 26v16M56 34h16' stroke='#e63946' stroke-width='4.5' stroke-linecap='round'/>` +
      `<path d='M86 30h12v14H86z' fill='#c6d0d9' stroke='#0c0e12' stroke-width='1.4'/>`,
  ),

  // First Aid Kit (Tactical IFAK Pouch)
  "peel-plate": wrap(
    `<rect x='34' y='12' width='60' height='44' rx='8' fill='url(#o)' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<path d='M52 12V7h24v5' fill='none' stroke='#262b1f' stroke-width='4' stroke-linejoin='round'/>` +
      `<rect x='40' y='20' width='48' height='28' rx='4' fill='#282e23' opacity='.38'/>` +
      `<rect x='50' y='22' width='28' height='24' rx='4' fill='#edf2f5' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M64 26v16M56 34h16' stroke='#e63946' stroke-width='5' stroke-linecap='round'/>`,
    G_OLIVE,
  ),

  // Med Kit (Heavy Trauma Case)
  coconut: wrap(
    `<rect x='26' y='14' width='76' height='42' rx='6' fill='#2a333d' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<path d='M48 14V8h32v6' fill='none' stroke='#566270' stroke-width='4.5' stroke-linejoin='round'/>` +
      `<rect x='34' y='14' width='8' height='8' fill='#f0a500'/><rect x='86' y='14' width='8' height='8' fill='#f0a500'/>` +
      `<rect x='48' y='21' width='32' height='28' rx='4' fill='#e63946' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M64 26v18M55 35h18' stroke='#ffffff' stroke-width='5.5' stroke-linecap='round'/>`,
  ),

  // Energy Drink / Boost Canister
  smoothie: wrap(
    `<rect x='47' y='8' width='34' height='48' rx='6' fill='url(#g)' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<rect x='49' y='8' width='30' height='6' rx='2' fill='#cfd6de' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<rect x='49' y='50' width='30' height='6' rx='2' fill='#9aa5b1'/>` +
      `<path d='M67 19l-10 14h8l-4 13 12-16h-8z' fill='#ffffff' stroke='#0c0e12' stroke-width='1'/>`,
    G_GLASS,
  ),

  // Tactical Adrenaline / Boost Injectors (golden-banana / red-banana)
  "golden-banana": wrap(
    `<rect x='47' y='8' width='34' height='48' rx='6' fill='#1c232b' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<rect x='47' y='20' width='34' height='22' fill='#f0a500'/>` +
      `<rect x='49' y='8' width='30' height='6' rx='2' fill='#cfd6de' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M67 22l-9 11h7l-3 9 10-12h-7z' fill='#101419'/>`,
  ),

  "red-banana": wrap(
    `<rect x='47' y='8' width='34' height='48' rx='6' fill='#24181c' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<rect x='47' y='20' width='34' height='22' fill='#e63946'/>` +
      `<rect x='49' y='8' width='30' height='6' rx='2' fill='#cfd6de' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M67 22l-9 11h7l-3 9 10-12h-7z' fill='#ffffff'/>`,
  ),

  // Deployable Ballistic Cover
  "crate-wall": wrap(
    `<rect x='24' y='12' width='80' height='42' rx='4' fill='url(#s)' stroke='#0c0e12' stroke-width='1.8'/>` +
      `<rect x='30' y='17' width='68' height='32' rx='2' fill='#28313b' stroke='#505d6b' stroke-width='1.4'/>` +
      `<path d='M36 22h56v5H36z' fill='#f0a500'/><path d='M42 34h44v8H42z' fill='#171c22'/>`,
    G_STEEL,
  ),
};

export function tacticalItemUrl(id: string): string | null {
  return ART[id] ?? null;
}
