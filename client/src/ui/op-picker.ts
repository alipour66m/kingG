// Lazy-loaded pre-game Operator Roster popover panel (keeps initial boot JS chunk untouched).
import type { OperatorGender } from "../actors/api";
import { preferences } from "../settings/preferences";
import { addCss } from "./styles";
import { T } from "./toon";

const ROLES: Array<[OperatorGender, string, string, string]> = [
  ["male", "Vanguard", "M", "Tactical Gear"],
  ["mira", "Mira", "F", "Exo-Ops Armored"],
  ["acu", "Tracker", "M", "ACU Camo"],
  ["ranger", "Ranger", "M", "Woodland BDU"],
  ["female", "Valkyrie", "F", "MultiCam"],
  ["female2", "Nomad", "F", "Desert Ops"],
  ["female3", "Nightfall", "F", "Night Stealth"],
];

let built = false;

export function mountOpPicker(panel: HTMLDivElement): void {
  if (built) return;
  built = true;
  addCss(
    "kr-ui-op-picker",
    `.tn-op-panel{left:0;right:auto;top:auto;bottom:calc(100% + ${T(12)});width:${T(460)};z-index:6;transform-origin:20% 100%}
.tn-op-grid{display:grid;grid-template-columns:1fr 1fr;gap:${T(8)}}
.tn-op-card{display:grid;gap:${T(2)};padding:${T(9)} ${T(12)};text-align:left;cursor:pointer;background:var(--kong-surface-2);color:var(--kong-text);border:var(--kong-outline-sm) solid var(--kong-outline);border-radius:${T(12)};box-shadow:0 ${T(3)} 0 var(--kong-outline);font-family:var(--kong-font-ui)}
.tn-op-card:hover{background:var(--kong-surface-raised)}
.tn-op-card.is-on{border-color:var(--kong-accent);box-shadow:0 ${T(3)} 0 var(--kong-accent);background:var(--kong-surface-raised)}
.tn-op-top{display:flex;align-items:center;justify-content:space-between;font-weight:900;font-size:${T(15)};text-transform:uppercase}
.tn-op-card.is-on b{color:var(--kong-accent)}
.tn-op-top i{font-style:normal;font-size:${T(12)};padding:${T(1)} ${T(7)};border-radius:999px;background:var(--kong-bg);color:var(--kong-text-muted)}
.tn-op-card small{font-weight:700;font-size:${T(12)};color:var(--kong-text-muted)}`,
  );

  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Select operator");
  const head = document.createElement("div");
  head.className = "tn-play-plabel";
  head.textContent = "Select Operator";
  const grid = document.createElement("div");
  grid.className = "tn-op-grid";
  panel.append(head, grid);

  const cards = new Map<OperatorGender, HTMLButtonElement>();
  for (const [g, name, sex, role] of ROLES) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "tn-op-card";
    c.dataset.op = g;
    c.innerHTML = `<span class="tn-op-top"><b>${name}</b><i>${sex}</i></span><small>${role}</small>`;
    c.addEventListener("click", () => preferences.set({ operatorGender: g }));
    grid.append(c);
    cards.set(g, c);
  }

  const paint = (cur: OperatorGender) => {
    cards.forEach((c, id) => {
      const on = id === cur;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", String(on));
    });
  };
  preferences.subscribe((p) => paint(p.operatorGender));
}
