// Procedural crisp vector renders for every tactical weapon, ordnance, medical kit, and field gear item.
// Used by icons.ts -> hotbar, inventory, loot prompts, Field Armory, buff pill, and kill-feed silhouettes.

const wrap = (body: string, defs = "") =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='64' viewBox='0 0 128 64'>${
      defs ? `<defs>${defs}</defs>` : ""
    }${body}</svg>`,
  )}`;

const G_STEEL = `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#687482'/><stop offset='.35' stop-color='#39414b'/><stop offset='1' stop-color='#191e24'/></linearGradient>`;
const G_POLY = `<linearGradient id='p' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a4046'/><stop offset='1' stop-color='#15181c'/></linearGradient>`;
const G_WOOD = `<linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8a5832'/><stop offset='1' stop-color='#4d2e18'/></linearGradient>`;
const G_OLIVE = `<linearGradient id='o' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6c7852'/><stop offset='1' stop-color='#39412a'/></linearGradient>`;
const G_GLASS = `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8fe4ff'/><stop offset='.5' stop-color='#2680b8'/><stop offset='1' stop-color='#0f314d'/></linearGradient>`;

const ART: Record<string, string> = {
  // P92 / Tactical 9mm Sidearm
  pistol: wrap(
    `<path d='M36 33h14l-5 22h-15l4-16c0-4 2-6 2-6z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M48 33h13c1 5-1 8-6 9h-8' fill='none' stroke='#2b313a' stroke-width='2.2'/>` +
      `<path d='M53 33c0 3 1 5 3 5' fill='none' stroke='#9aa5b1' stroke-width='1.8' stroke-linecap='round'/>` +
      `<path d='M31 28h58l3 4H46l-10 4-5-2z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M33 17h56l2 2v9H31l2-11z' fill='url(#s)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M35 19h52v2H35z' fill='#7a8796' opacity='.5'/>` +
      `<path d='M38 20v6M41 20v6M44 20v6M47 20v6' stroke='#161a1f' stroke-width='1.4'/>` +
      `<rect x='35' y='14' width='5' height='3' rx='.8' fill='#cfd6de'/><rect x='82' y='14' width='4' height='3' rx='.8' fill='#f0a500'/>` +
      `<rect x='91' y='20' width='6' height='5' rx='1' fill='#282e36' stroke='#0c0e12' stroke-width='1.2'/>`,
    G_STEEL + G_POLY,
  ),

  // UMP45 / Vector Tactical SMG
  smg: wrap(
    `<path d='M8 22h16v13l-14 4-3-4V24z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M24 25h8v4h-8z' fill='#252a31'/>` +
      `<path d='M58 37h10l-3 19h-10z' fill='#272d34' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M39 36h10l-4 17h-9z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M48 36h11v6c0 3-2 4-5 4h-6z' fill='none' stroke='#2e343d' stroke-width='2'/>` +
      `<path d='M31 20h55v16H31z' fill='url(#s)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<rect x='74' y='22' width='24' height='11' rx='1.5' fill='#2b323b' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M78 24v7M82 24v7M86 24v7M90 24v7' stroke='#14181d' stroke-width='1.6'/>` +
      `<rect x='98' y='24' width='18' height='6' rx='1.5' fill='#1c2128' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<path d='M78 36h12l-3 11h-7z' fill='#242930' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<rect x='46' y='13' width='16' height='7' rx='1.5' fill='#1e232a' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<circle cx='54' cy='16.5' r='1.6' fill='#ff4d4d'/><path d='M35 22h42v2H35z' fill='#82909e' opacity='.4'/>`,
    G_STEEL + G_POLY,
  ),

  // M416 / AKM Tactical Assault Rifle
  ar: wrap(
    `<path d='M6 25l19-2v12l-18 6-2-3V27z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M25 26h11v5H25z' fill='#2d343d'/>` +
      `<path d='M62 35l9 1c1 9 4 17 8 23l-11 2c-4-7-6-16-6-26z' fill='#262c33' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M39 35h9l-4 17h-9z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M48 35h13v5c0 3-2 4-5 4h-8z' fill='none' stroke='#2b323b' stroke-width='2'/>` +
      `<path d='M35 21h38v14H35z' fill='url(#s)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M73 22h31v10H73z' fill='url(#s)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M77 25h22v4H77z' fill='#14181d' opacity='.65'/>` +
      `<rect x='104' y='25' width='14' height='4' fill='#2b323b' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M118 24h6v6h-6z' fill='#454f5b' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M45 13h19v8H45z' fill='#1e242c' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<circle cx='55' cy='17' r='2' fill='#f0a500'/><path d='M82 32h7l-2 10h-5z' fill='#252a32' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M38 23h62v1.6H38z' fill='#94a1ae' opacity='.45'/>`,
    G_STEEL + G_POLY,
  ),

  // S12K Tactical 12-Gauge Combat Shotgun
  shotgun: wrap(
    `<path d='M6 26l22-3v10l-20 8-3-3z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M28 24h9v6H28z' fill='#2b313a'/>` +
      `<path d='M60 36h13l-2 17H58z' fill='#262c34' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M38 35h9l-4 16h-8z' fill='url(#p)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M36 20h38v15H36z' fill='url(#s)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<rect x='74' y='21' width='45' height='5.5' rx='1' fill='url(#s)' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<rect x='74' y='27' width='36' height='5.5' rx='1' fill='#2b323b' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<rect x='74' y='26' width='22' height='9' rx='1.5' fill='#1b2026' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<path d='M78 28v5M83 28v5M88 28v5M93 28v5' stroke='#49535f' stroke-width='1.5'/>` +
      `<rect x='115' y='19.5' width='4' height='3' fill='#f0a500'/>`,
    G_STEEL + G_POLY,
  ),

  // Kar98k / AWM Precision Sniper Rifle
  sniper: wrap(
    `<path d='M4 27l29-3 4 9-29 8-4-3z' fill='url(#o)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M12 24h11v4H12z' fill='#252922' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M35 24h38l4 10H36z' fill='url(#o)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M55 34h12l-1 12H54z' fill='#282e35' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M37 33h8l-3 15h-7z' fill='#282e35' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<rect x='73' y='24' width='46' height='4.5' rx='1' fill='url(#s)' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<rect x='117' y='22.5' width='8' height='7.5' rx='1' fill='#2d343e' stroke='#0c0e12' stroke-width='1.2'/>` +
      `<path d='M77 32l-4 13m4-13l9 12' stroke='#56616e' stroke-width='2.2' stroke-linecap='round'/>` +
      `<path d='M40 12h39l5-2v10l-5-2H40l-4 2V10z' fill='#1d2229' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<rect x='49' y='18' width='4' height='6' fill='#38414b'/><rect x='66' y='18' width='4' height='6' fill='#38414b'/>` +
      `<ellipse cx='82.5' cy='15' rx='2' ry='4.2' fill='url(#g)'/><path d='M57 22l5-5' stroke='#cfd6de' stroke-width='2.4' stroke-linecap='round'/>`,
    G_STEEL + G_OLIVE + G_GLASS,
  ),

  // RPG-7 Anti-Armor Rocket Launcher
  rocket: wrap(
    `<path d='M8 23l10 3v12l-10 3V23z' fill='#2b323b' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<rect x='18' y='26' width='76' height='12' rx='2' fill='url(#s)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<rect x='46' y='25' width='26' height='14' rx='1.5' fill='url(#w)' stroke='#0c0e12' stroke-width='1.4'/>` +
      `<path d='M40 38h8l-3 15h-7zM72 38h7l-2 13h-6z' fill='#262b32' stroke='#0c0e12' stroke-width='1.3'/>` +
      `<path d='M94 27h9v10h-9z' fill='#394238'/>` +
      `<path d='M103 24l12-4 10 12-10 12-12-4z' fill='url(#o)' stroke='#0c0e12' stroke-width='1.5'/>` +
      `<path d='M121 29l5 3-5 3z' fill='#e63946'/>` +
      `<rect x='50' y='16' width='12' height='9' rx='1.5' fill='#1f252c' stroke='#0c0e12' stroke-width='1.3'/>`,
    G_STEEL + G_WOOD + G_OLIVE,
  ),

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
  return ART[id] ?? ART.ar;
}
