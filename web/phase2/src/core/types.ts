export type MaterialId = 'base' | 'heavy' | 'sharp' | 'light';
export type CombatStance = 'ranged' | 'melee' | 'defense';
export type SlotKey = 'slot1' | 'slot2' | 'slot3';
export type FormKey = 'loose' | SlotKey;
export type ScaleTier = 0.6 | 1.0 | 1.5;
export type RotMode = 'static' | 'normal' | 'random';
export type FireMode = 'xayah' | 'seq' | 'volley';
export type HexRole = 'root' | 'tip' | 'front' | 'spine' | 'core' | 'wing';
export type FighterId = 'player' | 'enemy';

export type HexState =
  | 'ORBIT'
  | 'LAUNCHED'
  | 'PLANTED'
  | 'RECALLING'
  | 'ASSEMBLED'
  | 'BROKEN'
  | 'STOLEN_FLY'
  | 'STOLEN_FLOOR'
  | 'STOLEN_RETURN';

export interface HexMaterialSpec {
  id: MaterialId;
  name: string;
  dur: number;
  hard: number;
  sharp: number;
  agil: number;
}

export interface AxialCoord {
  q: number;
  r: number;
}

export interface BlueprintSlot {
  hexIndex: number;
  q: number;
  r: number;
}

export interface WeaponBlueprint {
  id: SlotKey;
  name: string;
  stance: CombatStance;
  defaultScale: ScaleTier;
  rootHexIndex: number;
  slots: BlueprintSlot[];
}

export interface PlayerLoadout {
  version: number;
  hexMaterials: MaterialId[]; // length 5..10
  blueprints: Record<SlotKey, WeaponBlueprint>;
}

export interface BlueprintValidationResult {
  valid: boolean;
  disconnectedIndices: number[];
  duplicateCoords: boolean;
  missingHexIndices: number[];
  errorMessage: string | null;
}

export interface BlueprintDerivedMetrics {
  roles: Record<number, HexRole>;
  anchorDistFactor: number; // multiplier on R added to PLAYER_RADIUS so no hex clips player body
  minLocalX: number;        // in units of R
  maxLocalX: number;        // in units of R
  reachScore: number;       // 0..100
  coverageScore: number;    // 0..100
  hardnessScore: number;    // 0..100
  pierceScore: number;      // 0..100
  agilityScore: number;     // 0..100
  avgAdjacency: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface ObstaclePlane {
  nx: number;
  ny: number;
  d: number;
}

export interface Obstacle {
  id: number;
  shape: 'hex' | 'square' | 'rect';
  x: number;
  y: number;
  angle: number;
  r: number;      // hex radius
  hw: number;     // half-width (square/rect)
  hh: number;     // half-height (square/rect)
  boundR: number;
  height: number;
  normals: ObstaclePlane[];
  verts: Vec2[];
}

export interface HexEntity {
  id: number;
  ownerId: FighterId;
  material: HexMaterialSpec;
  hp: number;
  maxHp: number;
  state: HexState;
  selected: boolean;
  cooldown: number;
  regenDelay: number;
  flashTimer: number;
  hitCooldown: number;

  // World position & kinematics
  x: number;
  y: number;
  vx: number;
  vy: number;
  altitude: number;
  orbitAngle: number;
  spinAngle: number;
  tumblePhaseX: number;
  tumblePhaseY: number;

  // Launch / Recall / Stolen tracking
  targetX: number;
  targetY: number;
  remainingDist: number;
  launchSpeed: number;
  autoReturn: boolean;
  isAutoReturning: boolean;
  hasBounced: boolean;
  bouncesLeft: number;
  randomRoll: number;
  initialEnergy: number;
  energy: number;
  stolenById: FighterId | null;
  stolenTimer: number;

  // Assembled axial structure & morph
  q: number;
  r: number;
  animQ: number;
  animR: number;
  startQ: number;
  startR: number;
  morphTimer: number;
  morphDuration: number;
  isReassembling: boolean;
  tetherFromX: number;
  tetherFromY: number;
  adjCount: number;
  role: HexRole;

  trail: Vec2[];
}

export type SpecialSkillKey = 'loose' | CombatStance;

export interface SpecialActiveState {
  type: SpecialSkillKey;
  timer: number;
  maxTimer: number;
  duration: number;
  consumed?: boolean;
  storedEnergy?: number;
  prevScale?: ScaleTier;
}

export interface RangedAttackAnim {
  type: 'ranged';
  phase: 'out' | 'guided' | 'ricochet' | 'return';
  timer: number;
  duration: number;
  angle: number;
  outSpeed: number;
  guidedSpeed?: number;
  retSpeed: number;
  maxDist: number;
  traveled: number;
  initialEnergy: number;
  energy: number;
  ricochetTimer: number;
  guidedHitBodyCd: number;
  guidedStunTimer: number;
  anchorX: number;
  anchorY: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  hasCmd: boolean;
  cmdX: number;
  cmdY: number;
  cmdHoldTimer: number;
  isManualSteer: boolean;
  altitude: number;
  hitBody: boolean;
  hitHexIds: Set<number>;
  wallBlocked?: boolean;
}

export interface MeleeAttackAnim {
  type: 'melee';
  timer: number;
  duration: number;
  angle: number;
  startAngle: number;
  endAngle: number;
  lastSafeAngle: number;
  wallBlocked: boolean;
  empoweredParry: boolean;
  stolenCount: number;
  hitBody: boolean;
  hitHexIds: Set<number>;
}

export interface DefenseAttackAnim {
  type: 'defense';
  timer: number;
  duration: number;
  angle: number;
  wallBlocked: boolean;
  hitBody: boolean;
  hitHexIds: Set<number>;
}

export type AttackAnim = RangedAttackAnim | MeleeAttackAnim | DefenseAttackAnim;

export interface DashAfterimage {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

export interface SeqFireJob {
  hexId: number;
  angle: number;
  strength: number;
  fireMode: FireMode;
}

export interface Fighter {
  id: FighterId;
  isAI: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kbX: number;
  kbY: number;
  facing: number;
  hp: number;
  maxHp: number;
  damageFlash: number;

  // Loadout & active configuration
  loadout: PlayerLoadout;
  blueprintMetrics: Record<SlotKey, BlueprintDerivedMetrics>;
  form: FormKey;
  rootHexId: number;
  targetScale: ScaleTier;
  currentScale: number;
  rotMode: RotMode;
  fireMode: FireMode;

  // Aiming & action state
  isAiming: boolean;
  aimAngle: number;
  aimStrength: number;
  isAimingDash: boolean;
  dashAimAngle: number;
  attackCooldown: number;
  dashCooldown: number;
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  dashAfterimages: DashAfterimage[];

  specialCooldown: number;
  specialMaxCooldown: number;
  specialActive: SpecialActiveState | null;

  attackAnim: AttackAnim | null;
  needsFullMorph: boolean;
  seqFireQueue: SeqFireJob[];
  seqFireTimer: number;

  pingHexId: number;
  pingTimer: number;

  // AI internal timers
  aiTimer: number;
  aiActionTimer: number;
  aiStrafeDir: number;

  hexes: HexEntity[];
}

export interface MatchStats {
  dmgDealt: number;
  enemyDmg: number;
  hexBroken: number;
  elapsed: number;
}

export interface GuidedSteerInput {
  mode: 'desktop' | 'touch';
  touchHoldingAttack: boolean;
  touchAimAngle: number;
  touchAimStrength: number;
  desktopHoldingGuided: boolean;
}

export type SfxKind =
  | 'launch'
  | 'clash'
  | 'shatter'
  | 'snap'
  | 'recall'
  | 'bounce'
  | 'pierce'
  | 'dash'
  | 'special'
  | 'pulse'
  | 'cancel'
  | 'uiClick';

export type SimEvent =
  | { type: 'sparks'; x: number; y: number; color: string; count: number; speed: number; size: number }
  | { type: 'shatter'; x: number; y: number; color: string; radius: number }
  | { type: 'shockwave'; x: number; y: number; r: number; maxR: number; life: number; color: string }
  | { type: 'floatingText'; x: number; y: number; text: string; color: string; scale: number }
  | { type: 'sfx'; kind: SfxKind }
  | { type: 'haptic'; pattern: number[] }
  | { type: 'shake'; amount: number }
  | { type: 'hitStop'; duration: number }
  | { type: 'toast'; message: string }
  | { type: 'matchEnd'; playerWon: boolean | null };

export interface MatchState {
  player: Fighter;
  enemy: Fighter;
  obstacles: Obstacle[];
  timeRemaining: number;
  hitStopTimer: number;
  matchOver: boolean;
  winner: 'player' | 'enemy' | 'draw' | null;
  stats: MatchStats;
  events: SimEvent[];
}
