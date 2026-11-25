import { describe, expect, it } from 'vitest';
import { resizeLoadoutHexCount } from '@core/world/blueprint';
import { createDefaultLoadout } from '@core/constants';
import { createDefaultPCConfig, createMobileHUDPreset } from '@storage/profiles';
import { UserStore } from '../server/db';

describe('SQLite UserStore (Auth, Weapon Loadout & Control Configs)', () => {
  it('registers user with hashed password, logs in, and persists weapon loadout + mobile/PC control configs', () => {
    const store = new UserStore(':memory:');
    const initLoadout = createDefaultLoadout();
    const initMobile = createMobileHUDPreset('3-finger');
    initMobile.widgets.scaleCluster.rotation = 90;
    const initPC = createDefaultPCConfig();

    const reg = store.register('Player_01', 'secret123', initLoadout, initMobile, initPC);
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.user.username).toBe('Player_01');
    expect(reg.user.loadout.hexMaterials).toHaveLength(7);
    expect(reg.user.mobileHud?.preset).toBe('3-finger');
    expect(reg.user.mobileHud?.widgets.scaleCluster.rotation).toBe(90);

    // Duplicate username rejected (case-insensitive)
    const dup = store.register('player_01', 'otherpass', initLoadout);
    expect(dup.ok).toBe(false);

    // Wrong password rejected
    const badLogin = store.login('Player_01', 'wrongpass');
    expect(badLogin.ok).toBe(false);

    // Token verification works
    const claim = store.verifyToken(reg.token);
    expect(claim?.uid).toBe(reg.user.id);
    expect(claim?.username).toBe('Player_01');

    // Save custom 10-hex loadout + custom rotated Mobile HUD & PC keybind and verify login loads both back!
    const custom10 = resizeLoadoutHexCount(initLoadout, 10);
    custom10.blueprints.slot1.name = 'Siêu Thương';
    const updated = store.updateLoadout(reg.user.id, custom10);
    expect(updated?.hexMaterials).toHaveLength(10);

    const customMob = createMobileHUDPreset('2-finger');
    customMob.widgets.atk.rotation = 45;
    customMob.widgets.rotCluster.rotation = 90;
    customMob.widgets.special.scale = 1.25;
    const customPC = createDefaultPCConfig();
    customPC.keybinds.special = 'v';
    customPC.reticleStyle = 'crosshair';

    const savedCtrl = store.updateControls(reg.user.id, customMob, customPC);
    expect(savedCtrl?.mobileHud.preset).toBe('2-finger');
    expect(savedCtrl?.mobileHud.widgets.atk.rotation).toBe(45);
    expect(savedCtrl?.pcControls.keybinds.special).toBe('v');

    const loginOk = store.login('Player_01', 'secret123');
    expect(loginOk.ok).toBe(true);
    if (loginOk.ok) {
      expect(loginOk.user.loadout.hexMaterials).toHaveLength(10);
      expect(loginOk.user.loadout.blueprints.slot1.name).toBe('Siêu Thương');
      expect(loginOk.user.mobileHud?.preset).toBe('2-finger');
      expect(loginOk.user.mobileHud?.widgets.atk.rotation).toBe(45);
      expect(loginOk.user.mobileHud?.widgets.rotCluster.rotation).toBe(90);
      expect(loginOk.user.mobileHud?.widgets.special.scale).toBeCloseTo(1.25, 4);
      expect(loginOk.user.pcControls?.keybinds.special).toBe('v');
      expect(loginOk.user.pcControls?.reticleStyle).toBe('crosshair');
    }

    store.close();
  });
});
