import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COSMETICS, sanitizeCosmetics } from '@config/cosmetics';
import { SFX_CATALOG } from '@audio/sfxRegistry';
import { createMatchState } from '@core/physics/simulation';
import { damageFighterBody, damageHex } from '@core/physics/combat';
import { executeFighterAttack, setFighterForm, triggerFighterSpecial } from '@attacks/index';
import { DEFAULT_AUDIO_SETTINGS, sanitizeAudioSettings } from '@storage/profiles';
import { UserStore } from '../server/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SFX_DIR = path.resolve(__dirname, '../public/assets/audio/sfx');

describe('Phase 3 Polish — Audio WAV Assets, Cosmetics, Telemetry & SQLite Persistence', () => {
  it('provides valid RIFF/WAVE SFX files for every SfxKind in SFX_CATALOG', () => {
    for (const [kind, entry] of Object.entries(SFX_CATALOG)) {
      expect(entry.assetUrl, `missing assetUrl for ${kind}`).toBeTruthy();
      const fileName = path.basename(entry.assetUrl!);
      const fullPath = path.join(SFX_DIR, fileName);
      expect(fs.existsSync(fullPath), `missing wav file ${fullPath}`).toBe(true);
      const buf = fs.readFileSync(fullPath);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect(buf.length).toBeGreaterThan(44);
    }
  });

  it('sanitizes cosmetics and audio settings with safe bounds and defaults', () => {
    expect(sanitizeCosmetics(null)).toEqual(DEFAULT_COSMETICS);
    expect(sanitizeCosmetics({ neonTheme: 'bad', shatterStyle: 'nova', dashTrail: 'bolt' })).toEqual({
      neonTheme: 'cyan',
      shatterStyle: 'nova',
      dashTrail: 'bolt',
    });

    expect(sanitizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(sanitizeAudioSettings({ enabled: false, masterVolume: 2.5, sfxVolume: -1, bgmVolume: 0.6 })).toEqual({
      enabled: false,
      masterVolume: 1,
      sfxVolume: 0,
      bgmVolume: 0.6,
    });
  });

  it('persists player cosmetics in SQLite UserStore across register, updateCosmetics & login', () => {
    const store = new UserStore(':memory:');
    const reg = store.register('polish_user', 'pass1234', undefined, undefined, undefined, {
      neonTheme: 'emerald',
      shatterStyle: 'rings',
      dashTrail: 'prism',
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.user.cosmetics).toEqual({
      neonTheme: 'emerald',
      shatterStyle: 'rings',
      dashTrail: 'prism',
    });

    const updated = store.updateCosmetics(reg.user.id, {
      neonTheme: 'gold',
      shatterStyle: 'nova',
      dashTrail: 'bolt',
    });
    expect(updated).toEqual({ neonTheme: 'gold', shatterStyle: 'nova', dashTrail: 'bolt' });

    const logged = store.login('polish_user', 'pass1234');
    expect(logged.ok).toBe(true);
    if (logged.ok) {
      expect(logged.user.cosmetics).toEqual({ neonTheme: 'gold', shatterStyle: 'nova', dashTrail: 'bolt' });
    }
    store.close();
  });

  it('records combat telemetry (attacks, hits, damage by mode, specials) and material-aware SFX', () => {
    const state = createMatchState();
    const { player, enemy } = state;

    // 1. Melee attack emits meleeWhoosh and increments attack count
    setFighterForm(state, player, 'slot2');
    state.events.length = 0;
    executeFighterAttack(state, player, 0, 1.0);
    expect(state.stats.playerAttacks).toBe(1);
    expect(state.events.some((e) => e.type === 'sfx' && e.kind === 'meleeWhoosh')).toBe(true);

    // 2. Heavy vs Base hex clash emits clashHeavy
    state.events.length = 0;
    const heavyHex = player.hexes.find((h) => h.material.id === 'heavy')!;
    const baseHex = enemy.hexes.find((h) => h.material.id === 'base')!;
    damageHex(state, player, heavyHex, enemy, baseHex, 0.25);
    expect(state.events.some((e) => e.type === 'sfx' && e.kind === 'clashHeavy')).toBe(true);

    // 3. Sharp vs Base hex clash emits clashSharp
    state.events.length = 0;
    const sharpHex = player.hexes.find((h) => h.material.id === 'sharp')!;
    damageHex(state, player, sharpHex, enemy, baseHex, 0.25);
    expect(state.events.some((e) => e.type === 'sfx' && e.kind === 'clashSharp')).toBe(true);

    // 4. Loose Gravity Field emits gravityField and tracks special use
    setFighterForm(state, player, 'loose');
    state.events.length = 0;
    triggerFighterSpecial(state, player);
    expect(state.stats.playerSpecialUses.loose).toBe(1);
    expect(state.events.some((e) => e.type === 'sfx' && e.kind === 'gravityField')).toBe(true);

    // 5. Body damage tracks hit count & mode breakdown
    damageFighterBody(state, player, heavyHex, enemy, 1.0);
    expect(state.stats.playerHits).toBe(1);
    expect(state.stats.playerDmgByMode.loose).toBeGreaterThan(0);
  });
});
