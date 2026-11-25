import { PLAYER_RADIUS } from '../../../constants';
import { computePrismWebClusters, distPointToSegment } from '../../../world/structure';
import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export const PRISM_WEB_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.LOOSE_PRISM_WEB,
  modeId: 'loose',
  name: 'Lưới Quang Lục Giác',
  short: 'LƯỚI QUANG',
  dur: 12.0,
  cd: 22.0,
  color: '#a855f7',
  desc: 'Tự chuyển sang Cắm & Thu trong 12s: các mảnh cắm trong phạm vi R (đường kính Trường Trọng Lực) nối thành Bao Lồi gây sát thương laze trên đường nối và làm chậm 40% trong vùng khép kín.',
  activate: ({ state, fighter }) => {
    fighter.fireMode = 'xayah';
    fighter.specialActive = {
      type: 'loose',
      skillId: PRISM_WEB_SKILL.id,
      timer: PRISM_WEB_SKILL.dur,
      maxTimer: PRISM_WEB_SKILL.dur,
      duration: PRISM_WEB_SKILL.dur,
      miniPulseCd: 0,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'LƯỚI QUANG LỤC GIÁC!',
      color: PRISM_WEB_SKILL.color,
      scale: 1.05,
    });
    state.events.push({ type: 'sfx', kind: 'special' });
    return true;
  },
  onUpdate: ({ state, fighter, opponent }, dt) => {
    const sp = fighter.specialActive;
    if (!sp || state.matchOver) return;
    sp.miniPulseCd = Math.max(0, (sp.miniPulseCd ?? 0) - dt);
    if (sp.miniPulseCd > 0) return;

    const clusters = computePrismWebClusters(fighter);
    if (clusters.length === 0) return;

    for (const cluster of clusters) {
      for (const [a, b] of cluster.edges) {
        const hit = distPointToSegment(opponent.x, opponent.y, a.x, a.y, b.x, b.y);
        if (hit.dist <= PLAYER_RADIUS + 6) {
          const avgSharp = (a.material.sharp + b.material.sharp) * 0.5;
          const rawDmg = Math.max(18, Math.round(20 + avgSharp * 0.10));
          const prevHp = opponent.hp;
          opponent.hp = Math.max(0, opponent.hp - rawDmg);
          const dealt = Math.max(0, Math.round(prevHp - opponent.hp));
          opponent.damageFlash = 0.14;

          if (fighter.id === 'player') {
            state.stats.dmgDealt += dealt;
            state.stats.playerDmgByMode.loose += dealt;
            state.stats.playerHits++;
          } else {
            state.stats.enemyDmg += dealt;
            state.stats.enemyDmgByMode.loose += dealt;
            state.stats.enemyHits++;
          }

          state.events.push({
            type: 'sparks',
            x: hit.cx,
            y: hit.cy,
            color: PRISM_WEB_SKILL.color,
            count: 9,
            speed: 220,
            size: 2.8,
          });
          state.events.push({
            type: 'floatingText',
            x: opponent.x,
            y: opponent.y - 26,
            text: `-${dealt}`,
            color: '#e879f9',
            scale: 0.94,
          });
          state.events.push({ type: 'sfx', kind: 'clashSharp' });
          state.events.push({ type: 'haptic', pattern: [12, 10], target: opponent.id });

          if (opponent.hp <= 0) {
            opponent.hp = 0;
            state.matchOver = true;
            state.winner = fighter.id;
            state.events.push({ type: 'matchEnd', playerWon: fighter.id === 'player' });
          }

          sp.miniPulseCd = 0.30;
          return;
        }
      }
    }
  },
  onExpire: ({ fighter }) => {
    fighter.specialActive = null;
  },
};
