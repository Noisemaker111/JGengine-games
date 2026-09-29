export interface AbilityMod {
  abilityId: string;
  dmgPct?: number;
  healPct?: number;
  costPct?: number;
  cooldownPct?: number;
  castPct?: number;
  flatDmg?: number;
}

export interface GlobalCombatMod {
  meleeDmgPct?: number;
  spellDmgPct?: number;
  healPct?: number;
  threatPct?: number;
}

export interface RankAbilityEffect {
  perRank: AbilityMod | GlobalCombatMod;
  maxRank?: number;
}

export const ABILITY_MOD_NODES: Record<string, RankAbilityEffect> = {
  battlecraft_redhand_practice: { perRank: { abilityId: "redhand", dmgPct: 0.08 } },
  battlecraft_deep_gash_practice: { perRank: { abilityId: "deep_gash", dmgPct: 0.1 } },
  battlecraft_brute_swing_practice: { perRank: { abilityId: "brute_swing", costPct: -0.05, dmgPct: 0.06 } },
  battlecraft_early_grave_practice: { perRank: { abilityId: "early_grave", dmgPct: 0.1 } },
  bloodrush_reaping_arc_practice: { perRank: { abilityId: "reaping_arc", dmgPct: 0.08 } },
  bloodrush_reaping_arc_finesse: { perRank: { abilityId: "reaping_arc", dmgPct: 0.1 } },
  bloodrush_reaver_strike_practice: { perRank: { abilityId: "reaver_strike", dmgPct: 0.1 } },
  vigil_steady_nerve: { perRank: { threatPct: 0.05 } },
  ironguard_quaking_blow_practice: { perRank: { abilityId: "quaking_blow", dmgPct: 0.1, cooldownPct: -0.05 } },
  ironguard_armor_shear_practice: { perRank: { abilityId: "armor_shear", costPct: -0.1 } },
  ironguard_goad_practice: { perRank: { abilityId: "goad", cooldownPct: -0.08 } },
  sacrament_mending_light_practice: { perRank: { abilityId: "mending_light", healPct: 0.08 } },
  sacrament_lightmend_practice: { perRank: { abilityId: "lightmend", costPct: -0.06, castPct: -0.05 } },
  sacrament_last_rite_practice: { perRank: { abilityId: "last_rite", cooldownPct: -0.1 } },
  vigil_decisive_motion: { perRank: { threatPct: 0.08 } },
  vigil_ward_of_faith_practice: { perRank: { abilityId: "ward_of_faith", cooldownPct: -0.08 } },
  vigil_steadfast_aura_practice: { perRank: { abilityId: "steadfast_aura", costPct: -0.05 } },
  requital_oathbrand_practice: { perRank: { abilityId: "oathbrand", costPct: -0.05 } },
  requital_rite_of_expulsion_practice: { perRank: { abilityId: "rite_of_expulsion", dmgPct: 0.1, cooldownPct: -0.05 } },
  requital_oathbrand_finesse: { perRank: { abilityId: "oathbrand", dmgPct: 0.08 } },
  requital_sundering_gavel_practice: { perRank: { abilityId: "sundering_gavel", dmgPct: 0.1 } },
  packlord_harrier_s_guise_practice: { perRank: { abilityId: "harrier_s_guise", costPct: -0.05 } },
  coldsight_fell_shot_practice: { perRank: { abilityId: "fell_shot", dmgPct: 0.1 } },
  coldsight_long_draw_practice: { perRank: { abilityId: "long_draw", castPct: -0.08, dmgPct: 0.05 } },
  coldsight_volley_practice: { perRank: { abilityId: "volley", dmgPct: 0.08 } },
  coldsight_long_draw_finesse: { perRank: { abilityId: "long_draw", dmgPct: 0.12 } },
  fieldcraft_fettering_slash_practice: { perRank: { abilityId: "fettering_slash", costPct: -0.1 } },
  fieldcraft_fevered_draw_practice: { perRank: { abilityId: "fevered_draw", cooldownPct: -0.1 } },
  knifework_dirt_nap_practice: { perRank: { abilityId: "dirt_nap", dmgPct: 0.1 } },
  knifework_decisive_motion: { perRank: { meleeDmgPct: 0.04 } },
  knifework_throat_wire_practice: { perRank: { abilityId: "throat_wire", dmgPct: 0.1 } },
  knifework_wicked_slash_practice: { perRank: { abilityId: "wicked_slash", costPct: -0.05 } },
  thuggery_eye_jab_practice: { perRank: { abilityId: "eye_jab", cooldownPct: -0.08 } },
  thuggery_swift_heels_practice: { perRank: { abilityId: "swift_heels", cooldownPct: -0.1 } },
  thuggery_seasoned_form: { perRank: { meleeDmgPct: 0.04 } },
  skulduggery_craven_thrust_practice: { perRank: { abilityId: "craven_thrust", dmgPct: 0.08 } },
  skulduggery_smokestep_practice: { perRank: { abilityId: "smokestep", cooldownPct: -0.1 } },
  skulduggery_lurker_s_strike_practice: { perRank: { abilityId: "lurker_s_strike", dmgPct: 0.1 } },
  doctrine_steady_nerve: { perRank: { spellDmgPct: 0.03, healPct: 0.03 } },
  doctrine_psalm_of_warding_practice: { perRank: { abilityId: "psalm_of_warding", costPct: -0.06 } },
  doctrine_psalm_of_warding_finesse: { perRank: { abilityId: "psalm_of_warding", costPct: -0.05 } },
  doctrine_smite_practice: { perRank: { abilityId: "smite", dmgPct: 0.1, healPct: 0.1 } },
  benison_measured_practice: { perRank: { healPct: 0.04 } },
  benison_lingering_grace_practice: { perRank: { abilityId: "lingering_grace", healPct: 0.1 } },
  benison_smite_practice: { perRank: { abilityId: "smite", castPct: -0.06 } },
  vespers_mindfracture_practice: { perRank: { abilityId: "mindfracture", cooldownPct: -0.05 } },
  vespers_dirge_of_decay_practice: { perRank: { abilityId: "vespers_dirge_of_decay_practice", dmgPct: 0.1 } },
  vespers_litany_of_woe_practice: { perRank: { abilityId: "litany_of_woe", dmgPct: 0.08 } },
  vespers_mindfracture_finesse: { perRank: { abilityId: "mindfracture", costPct: -0.06 } },
  thundercall_arc_bolt_practice: { perRank: { abilityId: "arc_bolt", dmgPct: 0.08 } },
  thundercall_cinder_jolt_practice: { perRank: { abilityId: "cinder_jolt", dmgPct: 0.1 } },
  thundercall_earthen_jolt_practice: { perRank: { abilityId: "earthen_jolt", cooldownPct: -0.08 } },
  thundercall_seasoned_form: { perRank: { spellDmgPct: 0.04 } },
  thundercall_arc_bolt_finesse: { perRank: { abilityId: "arc_bolt", castPct: -0.06 } },
  warspirit_stonebound_weapon_practice: { perRank: { abilityId: "stonebound_weapon", dmgPct: 0.08 } },
  warspirit_veteran_instinct: { perRank: { meleeDmgPct: 0.06 } },
  spiritmend_mending_waters_practice: { perRank: { abilityId: "mending_waters", costPct: -0.05 } },
  spiritmend_mending_waters_finesse: { perRank: { abilityId: "mending_waters", healPct: 0.08 } },
  aethermancy_aether_darts_practice: { perRank: { abilityId: "aether_darts", dmgPct: 0.08 } },
  aethermancy_steady_nerve: { perRank: { spellDmgPct: 0.03 } },
  aethermancy_bewitch_practice: { perRank: { abilityId: "bewitch", castPct: -0.1 } },
  aethermancy_aetherburst_practice: { perRank: { abilityId: "aetherburst", dmgPct: 0.1 } },
  pyromancy_cinderbolt_practice: { perRank: { abilityId: "cinderbolt", dmgPct: 0.08, castPct: -0.04 } },
  pyromancy_cinderfall_practice: { perRank: { abilityId: "cinderfall", cooldownPct: -0.08 } },
  pyromancy_scald_practice: { perRank: { abilityId: "scald", dmgPct: 0.1 } },
  pyromancy_pyrelance_practice: { perRank: { abilityId: "pyrelance", dmgPct: 0.1 } },
  cryomancy_rimelance_practice: { perRank: { abilityId: "rimelance", dmgPct: 0.08 } },
  cryomancy_icebind_practice: { perRank: { abilityId: "icebind", cooldownPct: -0.08 } },
  hexcraft_hex_of_anguish_practice: { perRank: { abilityId: "hex_of_anguish", dmgPct: 0.1 } },
  hexcraft_blackrot_practice: { perRank: { abilityId: "blackrot", dmgPct: 0.1 } },
  hexcraft_consume_practice: { perRank: { abilityId: "consume", dmgPct: 0.08 } },
  hexcraft_hex_of_anguish_finesse: { perRank: { abilityId: "hex_of_anguish", dmgPct: 0.08 } },
  hexcraft_blackrot_finesse: { perRank: { abilityId: "blackrot", dmgPct: 0.12 } },
  pactbound_consume_practice: { perRank: { abilityId: "consume", healPct: 0.1 } },
  ruination_gloom_bolt_practice: { perRank: { abilityId: "gloom_bolt", costPct: -0.05 } },
  ruination_burning_pact_practice: { perRank: { abilityId: "burning_pact", castPct: -0.06 } },
  ruination_sear_practice: { perRank: { abilityId: "sear", dmgPct: 0.1 } },
  ruination_gloom_bolt_finesse: { perRank: { abilityId: "gloom_bolt", castPct: -0.08 } },
  moongrove_wildbolt_practice: { perRank: { abilityId: "wildbolt", dmgPct: 0.08 } },
  moongrove_lunar_tempest_practice: { perRank: { abilityId: "lunar_tempest", dmgPct: 0.1 } },
  moongrove_decisive_motion: { perRank: { spellDmgPct: 0.03 } },
  moongrove_wildbolt_finesse: { perRank: { abilityId: "wildbolt", dmgPct: 0.1 } },
  wildfang_steady_nerve: { perRank: { meleeDmgPct: 0.04 } },
  wildfang_wildbolt_practice: { perRank: { abilityId: "wildbolt", cooldownPct: -0.05 } },
  groveheart_wildbloom_practice: { perRank: { abilityId: "wildbloom", healPct: 0.1 } },
  groveheart_steady_nerve: { perRank: { healPct: 0.04 } },
  groveheart_wildmend_practice: { perRank: { abilityId: "wildmend", costPct: -0.05 } },
  groveheart_wildmend_finesse: { perRank: { abilityId: "wildmend", healPct: 0.08 } },
};

export interface ResolvedAbilityMods {
  byAbility: Map<string, Required<Pick<AbilityMod, "abilityId">> & AbilityMod>;
  global: GlobalCombatMod;
}

function isAbilityMod(mod: AbilityMod | GlobalCombatMod): mod is AbilityMod {
  return "abilityId" in mod && typeof (mod as AbilityMod).abilityId === "string";
}

export function resolveAbilityMods(ranks: Record<string, number>): ResolvedAbilityMods {
  const byAbility = new Map<string, AbilityMod & { abilityId: string }>();
  const global: GlobalCombatMod = {};
  for (const [nodeId, rank] of Object.entries(ranks)) {
    if (rank <= 0) continue;
    const effect = ABILITY_MOD_NODES[nodeId];
    if (effect === undefined) continue;
    const scaledRank = Math.min(rank, effect.maxRank ?? rank);
    const per = effect.perRank;
    if (isAbilityMod(per)) {
      const existing = byAbility.get(per.abilityId) ?? { abilityId: per.abilityId };
      existing.dmgPct = (existing.dmgPct ?? 0) + (per.dmgPct ?? 0) * scaledRank;
      existing.healPct = (existing.healPct ?? 0) + (per.healPct ?? 0) * scaledRank;
      existing.costPct = (existing.costPct ?? 0) + (per.costPct ?? 0) * scaledRank;
      existing.cooldownPct = (existing.cooldownPct ?? 0) + (per.cooldownPct ?? 0) * scaledRank;
      existing.castPct = (existing.castPct ?? 0) + (per.castPct ?? 0) * scaledRank;
      existing.flatDmg = (existing.flatDmg ?? 0) + (per.flatDmg ?? 0) * scaledRank;
      byAbility.set(per.abilityId, existing);
    } else {
      global.meleeDmgPct = (global.meleeDmgPct ?? 0) + (per.meleeDmgPct ?? 0) * scaledRank;
      global.spellDmgPct = (global.spellDmgPct ?? 0) + (per.spellDmgPct ?? 0) * scaledRank;
      global.healPct = (global.healPct ?? 0) + (per.healPct ?? 0) * scaledRank;
      global.threatPct = (global.threatPct ?? 0) + (per.threatPct ?? 0) * scaledRank;
    }
  }
  return { byAbility, global };
}
