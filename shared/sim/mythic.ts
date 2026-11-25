// THE MYTHIC TIER.
// One signature weapon per named POI, waiting in that POI's payoff / hero chest every match (loot.ts placeLoot marks the
// chest; rollChestContents fills it). A mythic is a named variant of an existing gun: the gun's own handling, damage of
// a legendary + ~12 % (const.ts RARITY_MUL.mythic), its own colour.
//
// Wire / sim encoding: a rarity byte ≥ MYTHIC_R is a mythic — `rarity - MYTHIC_R` = its index in MYTHICS (items, slots,
// inventory frames carry the full byte). rarityOf() says "mythic" for all of them; tables keyed by tier use
// rarityTier() (0..5). A remote kong's held byte carries the tier only (MYTHIC_R): remotes draw the generic mythic.
// Kill feed: EV.Kill's weapon byte is KILL_MYTHIC + index for a mythic kill (killWeapon()).
import type { PoiId, WeaponId } from "../world/map";
import { POIS, WEAPONS } from "../world/map";

export interface MythicDef { poi: PoiId; weapon: WeaponId; name: string; /** the gun's signature colour (body tint + accent) */ color: string }
export const MYTHICS: readonly MythicDef[] = [
  { poi: "peel-harbor",    weapon: "shotgun", name: "BREACHER S12K",    color: "#1fc7b8" },
  { poi: "mango-market",   weapon: "smg",     name: "VIPER VECTOR",     color: "#ff8a1c" },
  { poi: "coconut-cove",   weapon: "ar",      name: "CORSAIR M416",     color: "#b4743f" },
  { poi: "stilt-town",     weapon: "sniper",  name: "LONGBOW AWM",      color: "#5fc8ff" },
  { poi: "the-murk",       weapon: "smg",     name: "NIGHTSTALKER UMP", color: "#57b33a" },
  { poi: "banana-temple",  weapon: "ar",      name: "SOVEREIGN AKM",    color: "#ffd02e" },
  { poi: "ripe-peak",      weapon: "rocket",  name: "HELLFIRE RPG-7",   color: "#ff4d14" },
  { poi: "mist-falls",     weapon: "sniper",  name: "FROSTBITE KAR98K", color: "#cfeeff" },
  { poi: "cnvs-lab",       weapon: "ar",      name: "PROTOTYPE XM8",    color: "#2ef0ff" },
  { poi: "canopy-line",    weapon: "pistol",  name: "BLACKOUT DEAGLE",  color: "#b8ff2e" },
  { poi: "peel-strip",     weapon: "smg",     name: "RUNWAY VECTOR",    color: "#ff4f7b" },
  { poi: "the-plantation", weapon: "shotgun", name: "ENFORCER S12K",    color: "#d2452f" },
  { poi: "lookout-point",  weapon: "sniper",  name: "OVERWATCH AWM",    color: "#fff0a0" },
  { poi: "the-wreck",      weapon: "pistol",  name: "SPEC-OPS P92",     color: "#4a86ea" },
  { poi: "coco-caves",     weapon: "shotgun", name: "BREACH S12K",      color: "#a9b8cc" },
  { poi: "wreck-bay",      weapon: "rocket",  name: "HARBOR RPG-7",     color: "#ff8840" },
];
/** the rarity tier index of "mythic" (RARITIES[5]); rarity bytes MYTHIC_R + k are mythic k */
export const MYTHIC_R = 5;
/** the share of the POIs whose signature chest holds their mythic in a match: a seeded pick from the match seed, so a
 *  different half every match and the same half on the server and the offline host (loot.ts placeLoot) */
export const MYTHIC_POI_SHARE = 0.5;
/** EV.Kill weapon byte base for a mythic kill (KILL_MYTHIC + k) */
export const KILL_MYTHIC = 32;
export const isMythic = (rarity: number) => rarity >= MYTHIC_R;
/** 0..5: the tier a rarity byte belongs to (tables, bots, the held byte) */
export const rarityTier = (rarity: number) => (rarity >= MYTHIC_R ? MYTHIC_R : rarity < 0 ? 0 : rarity);
export const mythicOf = (rarity: number): MythicDef | null => (rarity >= MYTHIC_R ? MYTHICS[rarity - MYTHIC_R] ?? null : null);
/** the mythic of POI index `poi` (POIS order): its MYTHICS index, or -1 */
export const mythicIndexOfPoi = (poi: number): number => (poi >= 0 && POIS[poi] ? MYTHICS.findIndex((m) => m.poi === POIS[poi].id) : -1);
/** the EV.Kill weapon byte for a gun (WEAPONS index) of rarity byte `rarity` */
export const killWeapon = (weapon: number, rarity: number) => (rarity >= MYTHIC_R && rarity - MYTHIC_R < MYTHICS.length ? KILL_MYTHIC + rarity - MYTHIC_R : weapon);
/** decode an EV.Kill weapon byte: the mythic (or null) and the base gun index */
export const killMythic = (code: number): MythicDef | null => (code >= KILL_MYTHIC && code < KILL_MYTHIC + MYTHICS.length ? MYTHICS[code - KILL_MYTHIC] : null);
export const killBaseWeapon = (code: number) => { const m = killMythic(code); return m ? WEAPONS.indexOf(m.weapon) : code; };
