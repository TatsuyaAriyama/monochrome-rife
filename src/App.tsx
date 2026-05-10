import { useEffect, useMemo, useRef, useState } from "react";
import {
  listenToAuthState,
  loginWithGoogle,
  loginWithEmail,
  logoutUser,
  registerWithEmail,
  type AuthUser,
} from "./services/authService";
import {
  createDefaultUserData,
  ensureUserDocument,
  saveUserData,
  type UserSaveData,
} from "./services/userService";

type Screen =
  | "account"
  | "home"
  | "stageSelect"
  | "intro"
  | "travel"
  | "game"
  | "customize"
  | "collection"
  | "settings"
  | "archive";
type Slot = "weapon" | "relic1" | "relic2" | "core";
type ItemType = "weapon" | "relic" | "core";
type Rarity = "Common" | "Rare" | "Legendary";

type Item = {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  icon: string;
  effect: string;
  flavor: string;
  droppable?: boolean;
};

type Equipment = Record<Slot, string | null>;
type Settings = {
  reducedMotion: boolean;
  showAimLine: boolean;
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
};

type Vec = {
  x: number;
  y: number;
};

type Player = Vec & {
  radius: number;
  hp: number;
  maxHp: number;
  invincible: number;
  dodgeCooldown: number;
  dodgeTime: number;
  dodgeVx: number;
  dodgeVy: number;
  dodgeTrail: number;
};

type Bullet = Vec & {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  pierce: number;
  canSplit: boolean;
  waveRiff?: boolean;
  phase: number;
};

type Enemy = Vec & {
  id: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  kind: number;
  pulse: number;
  attackClock: number;
  mode: number;
  telegraph: boolean;
};

type Hazard = Vec & {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  kind?: "orb" | "laser" | "wave" | "shockwave" | "noiseZone";
  angle?: number;
  length?: number;
  width?: number;
  angularVelocity?: number;
};

type Particle = Vec & {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  kind: "ripple" | "spark" | "text" | "wave" | "afterimage" | "rest" | "riff";
  label?: string;
};

type Boss = Vec & {
  id: number;
  name: string;
  radius: number;
  hp: number;
  maxHp: number;
  attack: number;
  phase: number;
  telegraphClock: number;
  telegraphDuration: number;
  pattern: number;
  rhythmIndex: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
};

type Snapshot = {
  hp: number;
  maxHp: number;
  stageNumber: number;
  stageName: string;
  phase: StagePhase;
  timeLeft: number;
  bossElapsed: number;
  runLoop: number;
  score: number;
  bossName: string | null;
  bossHp: number;
  bossMaxHp: number;
};

type StagePhase = "combat" | "warning" | "boss";

type StageConfig = {
  name: string;
  boss: string;
  bossPhase: number;
  enemyLevel: number;
  dropItemId: string;
  storyText: string;
};

type LootResult = {
  item: Item | null;
  rarity: Rarity;
};

type GameState = {
  width: number;
  height: number;
  keys: Set<string>;
  mouse: Vec;
  player: Player;
  bullets: Bullet[];
  enemies: Enemy[];
  hazards: Hazard[];
  particles: Particle[];
  boss: Boss | null;
  stageIndex: number;
  phase: StagePhase;
  phaseTimer: number;
  bossElapsed: number;
  runLoop: number;
  waveKills: number;
  score: number;
  nextRestScore: number;
  spawnClock: number;
  fireClock: number;
  pulseClock: number;
  auraClock: number;
  bannerClock: number;
  bannerText: string;
  silenceAmount: number;
  freezeClock: number;
  freezeCooldown: number;
  freezeReason: "intro" | "stop" | null;
  shake: number;
  gameOver: boolean;
  nextId: number;
};

type BuildStats = {
  damage: number;
  fireInterval: number;
  bulletRadius: number;
  pierce: number;
  split: boolean;
  killExplosion: boolean;
  lowHpPower: boolean;
  lifesteal: boolean;
  pulse: boolean;
  aura: boolean;
  fracturedRiff: boolean;
  waveRiff: boolean;
};

const STORAGE_KEYS = {
  collection: "monochrome-riff.collection",
  equipment: "monochrome-riff.equipment",
  settings: "monochrome-riff.settings",
  users: "monochrome-riff.users",
  activeUser: "monochrome-riff.activeUser",
};

const STARTER_ITEM = "starter-tuning-fork";

const ITEMS: Item[] = [
  {
    id: STARTER_ITEM,
    name: "Tuning Fork",
    type: "weapon",
    rarity: "Common",
    icon: "TF",
    effect: "静かな基準音を放つ初期装備",
    flavor: "黒い譜面に触れるための小さな音叉",
  },
  {
    id: "wave-riff",
    name: "WAVE RIFF",
    type: "weapon",
    rarity: "Common",
    icon: "WR",
    effect: "弾が白い波形の刃へ変化する",
    flavor: "取り戻した最初の波。空間を音で薄く切る",
    droppable: true,
  },
  {
    id: "broken-metronome",
    name: "Broken Metronome",
    type: "weapon",
    rarity: "Rare",
    icon: "BM",
    effect: "射撃速度を上昇させる壊れたメトロノーム",
    flavor: "狂った拍だけが、まだ美しく鳴る",
    droppable: true,
  },
  {
    id: "silver-pick",
    name: "Silver Pick",
    type: "weapon",
    rarity: "Common",
    icon: "SP",
    effect: "攻撃力を少し高める銀のピック",
    flavor: "薄い雑音を静かに裂く",
    droppable: true,
  },
  {
    id: "silent-vinyl",
    name: "Silent Vinyl",
    type: "weapon",
    rarity: "Rare",
    icon: "SV",
    effect: "弾が敵を貫通する静かなレコード",
    flavor: "音を失っても溝は記憶している",
    droppable: true,
  },
  {
    id: "echo-pedal",
    name: "Echo Pedal",
    type: "weapon",
    rarity: "Rare",
    icon: "EP",
    effect: "命中した弾が淡く分裂する",
    flavor: "一音が、控えめな和音になる",
    droppable: true,
  },
  {
    id: "piano-wire",
    name: "Piano Wire",
    type: "weapon",
    rarity: "Common",
    icon: "PW",
    effect: "射撃速度と弾の大きさを少し上げる",
    flavor: "張り詰めた白い線",
    droppable: true,
  },
  {
    id: "black-baton",
    name: "Black Baton",
    type: "relic",
    rarity: "Rare",
    icon: "BB",
    effect: "敵撃破時に小さな波紋を起こす",
    flavor: "最後の指示だけが黒く残る",
    droppable: true,
  },
  {
    id: "white-noise-core",
    name: "White Noise Core",
    type: "relic",
    rarity: "Common",
    icon: "WN",
    effect: "HPが低いほど攻撃力が上昇する",
    flavor: "沈黙に近づくほど白く響く",
    droppable: true,
  },
  {
    id: "last-chord",
    name: "Last Chord",
    type: "relic",
    rarity: "Rare",
    icon: "LC",
    effect: "敵撃破時にHPをわずかに吸収する",
    flavor: "消え残る最後の和音",
    droppable: true,
  },
  {
    id: "reverb-glass",
    name: "Reverb Glass",
    type: "relic",
    rarity: "Common",
    icon: "RG",
    effect: "弾の大きさを上昇させる",
    flavor: "黒い枠に浮かぶ透明な残響",
    droppable: true,
  },
  {
    id: "staff-ring",
    name: "Staff Ring",
    type: "relic",
    rarity: "Common",
    icon: "SR",
    effect: "最大HPを上昇させる",
    flavor: "五線が静かに身を守る",
    droppable: true,
  },
  {
    id: "final-symphony",
    name: "Final Symphony",
    type: "core",
    rarity: "Legendary",
    icon: "FS",
    effect: "全ての弾が貫通し分裂する",
    flavor: "譜面すべてが一撃へ収束する",
    droppable: true,
  },
  {
    id: "moonlight-tape",
    name: "Moonlight Tape",
    type: "core",
    rarity: "Legendary",
    icon: "MT",
    effect: "一定時間ごとに全画面へ波動を放つ",
    flavor: "月明かりの下で回り続ける白いテープ",
    droppable: true,
  },
  {
    id: "silent-orchestra",
    name: "Silent Orchestra",
    type: "core",
    rarity: "Legendary",
    icon: "SO",
    effect: "周囲の敵へ自動で音波攻撃を行う",
    flavor: "演奏者のいない管弦楽",
    droppable: true,
  },
  {
    id: "fractured-riff",
    name: "Fractured Riff",
    type: "relic",
    rarity: "Rare",
    icon: "FR",
    effect: "弾に細い楽譜線とノイズの軌跡を残す",
    flavor: "擦り切れた記録から、まだ旋律がこぼれる",
    droppable: true,
  },
];

const BOSSES = ["WAVE REMNANT", "RESONANCE", "BROKEN METRONOME", "LOST SCORE"];

const STAGE_DURATIONS = {
  combat: 60,
  warning: 5,
};

const STAGES: StageConfig[] = [
  {
    name: "SILENT ENTRY",
    boss: "WAVE REMNANT",
    bossPhase: 4,
    enemyLevel: 1,
    dropItemId: "wave-riff",
    storyText: "最初の音は、もう壊れていた。",
  },
  {
    name: "STATIC RHYTHM",
    boss: "RESONANCE",
    bossPhase: 4,
    enemyLevel: 2,
    dropItemId: "white-noise-core",
    storyText: "リズムは、静かに崩れ始める。",
  },
  {
    name: "WHITE REQUIEM",
    boss: "BROKEN METRONOME",
    bossPhase: 5,
    enemyLevel: 3,
    dropItemId: "silent-vinyl",
    storyText: "沈黙は、呼吸の仕方を覚えてしまった。",
  },
  {
    name: "MEMORY NOISE",
    boss: "LOST SCORE",
    bossPhase: 6,
    enemyLevel: 4,
    dropItemId: "fractured-riff",
    storyText: "記録は、静かに擦り切れていく。",
  },
];

const DEFAULT_EQUIPMENT: Equipment = {
  weapon: STARTER_ITEM,
  relic1: null,
  relic2: null,
  core: null,
};

const DEFAULT_SETTINGS: Settings = {
  reducedMotion: false,
  showAimLine: true,
  masterVolume: 0.75,
  bgmVolume: 0.42,
  sfxVolume: 0.7,
};

const byId = new Map(ITEMS.map((item) => [item.id, item]));

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function rarityClass(rarity: Rarity) {
  return rarity.toLowerCase();
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, y: number) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function rotate(v: Vec, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function rollRarity(): Rarity {
  const value = Math.random();
  if (value < 0.1) return "Legendary";
  if (value < 0.4) return "Rare";
  return "Common";
}

function rollDrop(): LootResult {
  const rarity = rollRarity();
  const pool = ITEMS.filter((item) => item.droppable && item.rarity === rarity);
  return {
    rarity,
    item: pool[Math.floor(Math.random() * pool.length)] ?? null,
  };
}

function createBuild(equipment: Equipment): BuildStats {
  const ids = Object.values(equipment).filter(Boolean);
  const has = (id: string) => ids.includes(id);
  const stats: BuildStats = {
    damage: 14,
    fireInterval: 0.48,
    bulletRadius: 5,
    pierce: 0,
    split: false,
    killExplosion: false,
    lowHpPower: false,
    lifesteal: false,
    pulse: false,
    aura: false,
    fracturedRiff: false,
    waveRiff: false,
  };

  if (has("wave-riff")) {
    stats.waveRiff = true;
    stats.bulletRadius += 0.8;
  }
  if (has("broken-metronome")) stats.fireInterval *= 0.62;
  if (has("silver-pick")) stats.damage += 9;
  if (has("silent-vinyl")) stats.pierce += 1;
  if (has("echo-pedal")) stats.split = true;
  if (has("piano-wire")) {
    stats.fireInterval *= 0.88;
    stats.bulletRadius += 1.5;
  }
  if (has("black-baton")) stats.killExplosion = true;
  if (has("white-noise-core")) stats.lowHpPower = true;
  if (has("last-chord")) stats.lifesteal = true;
  if (has("reverb-glass")) stats.bulletRadius += 3;
  if (has("final-symphony")) {
    stats.damage += 8;
    stats.pierce += 4;
    stats.split = true;
  }
  if (has("moonlight-tape")) stats.pulse = true;
  if (has("silent-orchestra")) stats.aura = true;
  if (has("fractured-riff")) {
    stats.fracturedRiff = true;
    stats.damage += 3;
  }

  return stats;
}

type BrowserAudioContext = typeof AudioContext;

type WindowWithAudio = Window & {
  webkitAudioContext?: BrowserAudioContext;
};

class MonochromeAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgm: GainNode | null = null;
  private sfx: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private bgmTimer = 0;
  private step = 0;
  private lastHit = 0;
  private mode: "home" | "intro" | "game" = "game";
  private stageIndex = 0;
  private bossLayer = false;
  private bossIntensity = 0;
  private settings: Settings = DEFAULT_SETTINGS;

  async start(settings: Settings, mode: "home" | "intro" | "game" = "game", stageIndex = 0) {
    this.ensure();
    if (this.mode !== mode || this.stageIndex !== stageIndex) {
      this.stop();
      this.step = 0;
    }
    this.mode = mode;
    this.stageIndex = stageIndex;
    this.bossLayer = false;
    this.bossIntensity = 0;
    this.setSettings(settings);
    if (!this.context) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.startBgm();
  }

  setGameStage(stageIndex: number, bossLayer = false) {
    if (this.stageIndex === stageIndex && this.bossLayer === bossLayer) return;
    this.stageIndex = stageIndex;
    this.bossLayer = bossLayer;
    this.bossIntensity = 0;
    this.step = 0;
    if (this.mode === "game" && this.bgmTimer) {
      this.stop();
      this.startBgm();
    }
  }

  resumeGameLayer(stageIndex: number, bossLayer = false) {
    this.stageIndex = stageIndex;
    this.bossLayer = bossLayer;
    this.mode = "game";
    this.step = 0;
    if (!this.bgmTimer) this.startBgm();
  }

  setBossIntensity(intensity: number) {
    const next = clamp(Math.floor(intensity), 0, 2);
    if (this.bossIntensity === next) return;
    this.bossIntensity = next;
    if (this.mode === "game" && this.stageIndex >= 2 && this.bossLayer && this.bgmTimer) {
      this.stop();
      this.startBgm();
    }
  }

  stop() {
    window.clearInterval(this.bgmTimer);
    this.bgmTimer = 0;
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    if (!this.context || !this.master || !this.bgm || !this.sfx) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.masterVolume, now, 0.03);
    this.bgm.gain.setTargetAtTime(settings.bgmVolume, now, 0.08);
    this.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.03);
  }

  shoot(split: boolean) {
    this.tone(split ? 740 : 620, 0.045, 0.07, "triangle", this.sfx);
    this.tone(split ? 1240 : 980, 0.025, 0.025, "sine", this.delay);
  }

  hit() {
    if (!this.context || this.context.currentTime - this.lastHit < 0.045) return;
    this.lastHit = this.context.currentTime;
    this.tone(190, 0.05, 0.08, "sine", this.sfx);
    this.noise(0.035, 0.05, 1200);
  }

  kill() {
    this.tone(330, 0.09, 0.09, "sine", this.sfx);
    this.tone(660, 0.12, 0.05, "triangle", this.delay);
  }

  playerHit() {
    this.tone(96, 0.18, 0.16, "sawtooth", this.sfx);
    this.noise(0.12, 0.13, 480);
  }

  boss() {
    [110, 82, 55].forEach((freq, index) => {
      this.tone(freq, 0.5, 0.16 - index * 0.025, "sine", this.sfx, index * 0.08);
    });
  }

  loot(legendary: boolean) {
    const notes = legendary ? [392, 494, 740, 988] : [294, 370, 587];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.35, legendary ? 0.12 : 0.08, "sine", this.delay, index * 0.09);
    });
  }

  wavePulse() {
    this.tone(146, 0.34, 0.12, "sine", this.sfx);
    this.tone(292, 0.38, 0.06, "triangle", this.delay, 0.04);
  }

  metronomeTick(accent = false) {
    this.tone(accent ? 980 : 760, 0.035, accent ? 0.12 : 0.08, "square", this.sfx);
    this.tone(accent ? 196 : 147, 0.11, 0.035, "sine", this.delay, 0.015);
  }

  timeStop() {
    this.tone(72, 0.7, 0.12, "sine", this.sfx);
    this.noise(0.36, 0.055, 520, this.sfx);
    this.tone(1220, 0.08, 0.035, "square", this.delay, 0.05);
  }

  timeRelease() {
    this.tone(980, 0.04, 0.12, "square", this.sfx);
    this.tone(246.94, 0.2, 0.05, "sine", this.delay, 0.03);
  }

  dodge() {
    this.tone(520, 0.08, 0.06, "sine", this.sfx);
    this.tone(1040, 0.11, 0.025, "triangle", this.delay, 0.03);
  }

  private ensure() {
    if (this.context) return;
    const AudioCtor = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext;
    if (!AudioCtor) return;
    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.bgm = this.context.createGain();
    this.sfx = this.context.createGain();
    this.delay = this.context.createDelay();
    this.feedback = this.context.createGain();

    this.delay.delayTime.value = 0.18;
    this.feedback.gain.value = 0.22;
    this.master.gain.value = this.settings.masterVolume;
    this.bgm.gain.value = this.settings.bgmVolume;
    this.sfx.gain.value = this.settings.sfxVolume;

    this.bgm.connect(this.master);
    this.sfx.connect(this.master);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.master);
    this.master.connect(this.context.destination);
  }

  private startBgm() {
    if (!this.context || this.bgmTimer) return;
    this.playBgmStep();
    this.bgmTimer = window.setInterval(() => this.playBgmStep(), this.bgmInterval());
  }

  private bgmInterval() {
    if (this.mode === "intro") return 940;
    if (this.mode === "home") return 760;
    if (this.stageIndex === 2 && this.bossLayer) {
      return this.bossIntensity >= 2 ? 158 : this.bossIntensity === 1 ? 205 : 340;
    }
    if (this.stageIndex === 3 && this.bossLayer) {
      return this.bossIntensity >= 2 ? 210 : this.bossIntensity === 1 ? 245 : 320;
    }
    if (this.stageIndex === 2) return 860;
    if (this.stageIndex === 3) return 700;
    return this.stageIndex === 1 ? 430 : 640;
  }

  private playBgmStep() {
    if (!this.context || !this.bgm) return;
    if (this.mode === "home") {
      this.playHomePianoStep();
      return;
    }
    if (this.mode === "intro") {
      this.playIntroStoryStep();
      this.step += 1;
      return;
    }
    this.playStageBgmStep();
    this.step += 1;
  }

  private playStageBgmStep() {
    if (!this.bgm) return;
    const index = this.step;

    if (this.stageIndex === 0) {
      const bass = [55, 55, 73.42, 65.41, 49, 55, 87.31, 65.41];
      const piano = [220, 277.18, 329.63, 277.18, 246.94, 220, 196, 246.94];
      const note = index % bass.length;
      this.tone(bass[note], 0.95, this.bossLayer ? 0.085 : 0.065, "sine", this.bgm);
      if (note % 2 === 0) this.pianoTone(piano[note], 0.82, 0.045, this.bgm, 0.08);
      if (note === 3 || note === 7) this.noise(0.16, 0.018, 1100, this.bgm);
      return;
    }

    if (this.stageIndex === 1) {
      const pulse = [73.42, 73.42, 98, 87.31, 73.42, 110, 98, 87.31];
      const note = index % pulse.length;
      this.tone(pulse[note], 0.34, this.bossLayer ? 0.095 : 0.07, "triangle", this.bgm);
      if (note % 2 === 1) this.noise(0.08, 0.034, 1900, this.bgm);
      if (note === 0 || note === 4) this.tone(293.66, 0.16, 0.032, "sine", this.delay, 0.03);
      return;
    }

    if (this.stageIndex === 2 && this.bossLayer) {
      this.playBrokenMetronomeBossStep(index);
      return;
    }

    if (this.stageIndex === 3) {
      if (this.bossLayer) {
        this.playLostScoreBossStep(index);
        return;
      }
      const bass = [49, 0, 61.74, 55, 0, 73.42, 65.41, 0];
      const fragments = [196, 0, 246.94, 220, 0, 293.66, 261.63, 0];
      const note = index % bass.length;
      if (bass[note]) this.tone(bass[note], 1.1, 0.058, "sine", this.bgm);
      if (fragments[note]) this.pianoTone(fragments[note], 0.72, 0.03, this.delay, 0.06);
      if (note % 2 === 0) this.noise(0.18, 0.024, 900, this.bgm);
      return;
    }

    const drone = [41.2, 49, 55, 49];
    const note = index % drone.length;
    this.tone(drone[note], 1.6, this.bossLayer ? 0.08 : 0.055, "sine", this.bgm);
    if (note === 1) this.tone(196, 1.2, 0.026, "sine", this.delay, 0.2);
    if (note === 3) this.noise(0.34, this.bossLayer ? 0.044 : 0.026, 720, this.bgm);
  }

  private playBrokenMetronomeBossStep(index: number) {
    const phrase = [
      659.25,
      587.33,
      0,
      523.25,
      587.33,
      784,
      0,
      740,
      659.25,
      523.25,
      587.33,
      0,
      493.88,
      440,
      523.25,
      0,
    ];
    const bass = [55, 0, 73.42, 0, 82.41, 0, 73.42, 0];
    const note = index % phrase.length;
    const beat = index % 4;
    const intensity = this.bossIntensity;

    this.tone(beat === 0 ? 1046.5 : 783.99, 0.022, beat === 0 ? 0.04 : 0.024, "square", this.bgm);

    const melody = phrase[note];
    if (melody) {
      this.tone(melody, 0.18, intensity > 0 ? 0.07 : 0.055, "square", this.bgm, 0.012);
      this.pianoTone(melody * 0.5, 0.42, 0.028 + intensity * 0.006, this.delay, 0.04);
      this.tone(melody * 2, 0.07, 0.014 + intensity * 0.006, "triangle", this.delay, 0.018);
    }

    const bassNote = bass[index % bass.length];
    if (bassNote) {
      this.tone(bassNote, intensity > 0 ? 0.34 : 0.5, intensity > 0 ? 0.115 : 0.078, "sine", this.bgm);
    }

    if (note === 0 || note === 8) this.pianoTone(293.66, 0.62, 0.034 + intensity * 0.009, this.delay, 0.04);
    if (note === 4 || note === 12) this.pianoTone(220, 0.68, 0.026 + intensity * 0.008, this.bgm, 0.02);

    if (intensity > 0) {
      if (note % 4 === 2) this.tone(880, 0.05, 0.024, "square", this.delay, 0.06);
      if (note === 6 || note === 14) this.noise(0.1, 0.026 + intensity * 0.012, 1300, this.bgm);
      if (intensity > 1 && note % 5 === 0) this.tone(349.23, 0.08, 0.022, "sawtooth", this.bgm, 0.05);
    }
  }

  private playLostScoreBossStep(index: number) {
    const phrase = [392, 0, 440, 493.88, 0, 369.99, 329.63, 0, 293.66, 0, 329.63, 392];
    const bass = [49, 0, 55, 0, 61.74, 0, 55, 0];
    const note = index % phrase.length;
    const intensity = this.bossIntensity;
    const melody = phrase[note];

    if (melody) {
      this.tone(melody, 0.22, 0.048 + intensity * 0.012, "triangle", this.bgm, 0.01);
      this.tone(melody * 1.5, 0.07, 0.012 + intensity * 0.006, "square", this.delay, 0.04);
    }

    const bassNote = bass[index % bass.length];
    if (bassNote) this.tone(bassNote, 0.52, 0.082 + intensity * 0.018, "sine", this.bgm);
    if (index % 3 === 0) this.noise(0.13 + intensity * 0.08, 0.025 + intensity * 0.012, 1050, this.bgm);
    if (intensity > 0 && index % 4 === 2) this.pianoTone(246.94, 0.42, 0.024, this.delay, 0.03);
  }

  private playIntroStoryStep() {
    if (!this.bgm) return;
    const index = this.step;
    const beat = index % 4;
    const distantTick = beat === 0 ? 880 : 660;
    this.tone(distantTick, 0.025, beat === 0 ? 0.034 : 0.019, "square", this.bgm);
    this.tone(49, 1.35, 0.038, "sine", this.bgm);
    if (index % 2 === 0) this.noise(0.22, 0.013, 620, this.bgm);
    if (index === 2 || index === 7 || index === 11) {
      const notes = [220, 277.18, 196];
      this.pianoTone(notes[index % notes.length], 1.2, 0.03, this.delay, 0.06);
    }
  }

  private playHomePianoStep() {
    if (!this.bgm) return;
    const chordCycle = [
      [220, 329.63, 440],
      [196, 293.66, 392],
      [174.61, 261.63, 349.23],
      [196, 246.94, 329.63],
    ];
    const chord = chordCycle[Math.floor(this.step / 4) % chordCycle.length];
    const note = chord[this.step % chord.length];
    const bass = chord[0] / 2;

    this.pianoTone(note, 1.05, 0.055, this.bgm);
    if (this.step % 4 === 0) {
      this.pianoTone(bass, 1.5, 0.045, this.bgm, 0.04);
    }
    if (this.step % 8 === 6) {
      this.pianoTone(chord[2] * 2, 1.2, 0.024, this.delay, 0.12);
    }
    this.step += 1;
  }

  private tone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    destination: AudioNode | null,
    delay = 0,
  ) {
    if (!this.context || !destination) return;
    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  private pianoTone(
    frequency: number,
    duration: number,
    gainValue: number,
    destination: AudioNode | null,
    delay = 0,
  ) {
    if (!this.context || !destination) return;
    const now = this.context.currentTime + delay;
    const body = this.context.createOscillator();
    const chime = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    body.type = "triangle";
    chime.type = "sine";
    body.frequency.setValueAtTime(frequency, now);
    chime.frequency.setValueAtTime(frequency * 2.01, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(820, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    body.connect(filter);
    chime.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    body.start(now);
    chime.start(now);
    body.stop(now + duration + 0.05);
    chime.stop(now + duration + 0.05);
  }

  private noise(
    duration: number,
    gainValue: number,
    filterFrequency: number,
    destination: AudioNode | null = this.sfx,
  ) {
    if (!this.context || !destination) return;
    const bufferSize = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFrequency;
    gain.gain.value = gainValue;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start();
  }
}

const audioEngine = new MonochromeAudio();

function maxHpFor(equipment: Equipment) {
  const ids = Object.values(equipment);
  return ids.includes("staff-ring") ? 125 : 100;
}

function migrateLegacyLocalSave(data: UserSaveData) {
  const legacyItems = readJson<string[]>(STORAGE_KEYS.collection, []);
  const legacyEquipment = readJson<Partial<Equipment>>(STORAGE_KEYS.equipment, {});
  const hasLegacyItems = legacyItems.length > 0;
  const hasLegacyEquipment = Object.keys(legacyEquipment).length > 0;
  const normalized = normalizeProgress(data);

  if (!hasLegacyItems && !hasLegacyEquipment) return normalized;

  return {
    ...normalized,
    ownedItems: Array.from(new Set([...normalized.ownedItems, STARTER_ITEM, ...legacyItems])),
    equippedItems: {
      ...normalized.equippedItems,
      ...legacyEquipment,
    },
  };
}

function normalizeProgress(data: UserSaveData): UserSaveData {
  const clearedStages = [...data.clearedStages, ...STAGES.map(() => false)].slice(0, STAGES.length);
  const stageHighScores = [...data.stageHighScores, ...STAGES.map(() => 0)].slice(0, STAGES.length);
  const lastClearedIndex = clearedStages.reduce(
    (latest, cleared, index) => (cleared ? index : latest),
    -1,
  );
  const inferredHighestStage = Math.min(Math.max(lastClearedIndex + 2, 1), STAGES.length);

  return {
    ...data,
    clearedStages,
    stageHighScores,
    highestStage: Math.max(data.highestStage, inferredHighestStage),
  };
}

function firebaseAuthMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "このメールアドレスはすでに登録されています。Loginを使ってください。",
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
    "auth/missing-password": "パスワードを入力してください。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/user-not-found": "このメールアドレスのアカウントが見つかりません。",
    "auth/wrong-password": "パスワードが違います。",
    "auth/operation-not-allowed": "Firebase Consoleでこのログイン方法を有効にしてください。",
    "auth/popup-closed-by-user": "Googleログインのポップアップが閉じられました。",
    "auth/unauthorized-domain": "Firebase Authenticationの承認済みドメインに現在のドメインを追加してください。",
  };

  return messages[code] ?? "認証に失敗しました。Firebase設定と入力内容を確認してください。";
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [userData, setUserData] = useState<UserSaveData | null>(null);
  const [screen, setScreen] = useState<Screen>("account");
  const [selectedStage, setSelectedStage] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }));

  useEffect(() => {
    const unsubscribe = listenToAuthState(async (firebaseUser) => {
      setAuthLoading(false);
      setAuthError("");

      if (!firebaseUser) {
        setAuthUser(null);
        setUserData(null);
        setScreen("account");
        return;
      }

      setAuthUser(firebaseUser);
      setDataLoading(true);
      try {
        const loaded = await ensureUserDocument(
          firebaseUser.uid,
          firebaseUser.email ?? "",
        );
        const migrated = migrateLegacyLocalSave(loaded);
        setUserData(migrated);
        if (migrated !== loaded) {
          await saveUserData(firebaseUser.uid, migrated);
        }
        setScreen("home");
      } catch (error) {
        console.error(error);
        setAuthError("ユーザーデータの読み込みに失敗しました。Firestore設定を確認してください。");
        setUserData(createDefaultUserData(firebaseUser.email ?? ""));
        setScreen("home");
      } finally {
        setDataLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    audioEngine.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (screen === "intro") {
      void audioEngine.start(settings, "intro");
      return;
    }
    if (screen === "game" || screen === "travel") return;
    void audioEngine.start(settings, "home");
    const unlockHomeBgm = () => {
      void audioEngine.start(settings, "home");
    };
    window.addEventListener("pointerdown", unlockHomeBgm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockHomeBgm);
    };
  }, [screen, settings]);

  const collection = userData?.ownedItems ?? [STARTER_ITEM];
  const equipment = (userData?.equippedItems ?? DEFAULT_EQUIPMENT) as Equipment;

  const collectedItems = useMemo(
    () => collection.map((id) => byId.get(id)).filter(Boolean) as Item[],
    [collection],
  );

  function updateUserSave(updater: (user: UserSaveData) => UserSaveData) {
    if (!authUser) return;
    setUserData((current) => {
      if (!current) return current;
      const next = updater(current);
      void saveUserData(authUser.uid, next).catch((error) => {
        console.error(error);
        setAuthError("セーブデータの保存に失敗しました。");
      });
      return next;
    });
  }

  async function login(email: string, password: string) {
    setAuthError("");
    setDataLoading(true);
    try {
      const credential = await loginWithEmail(email, password);
      await openAuthenticatedHome(credential.user);
    } catch (error) {
      console.error(error);
      setAuthError(firebaseAuthMessage(error));
    } finally {
      setDataLoading(false);
    }
  }

  async function register(email: string, password: string) {
    setAuthError("");
    setDataLoading(true);
    try {
      const credential = await registerWithEmail(email, password);
      await openAuthenticatedHome(credential.user);
    } catch (error) {
      console.error(error);
      setAuthError(firebaseAuthMessage(error));
    } finally {
      setDataLoading(false);
    }
  }

  async function loginGoogle() {
    setAuthError("");
    setDataLoading(true);
    try {
      const credential = await loginWithGoogle();
      await openAuthenticatedHome(credential.user);
    } catch (error) {
      console.error(error);
      setAuthError(`${firebaseAuthMessage(error)} Googleログイン後に止まる場合はFirestoreのルールも確認してください。`);
    } finally {
      setDataLoading(false);
    }
  }

  async function openAuthenticatedHome(firebaseUser: AuthUser) {
    setAuthUser(firebaseUser);
    const loaded = await ensureUserDocument(
      firebaseUser.uid,
      firebaseUser.email ?? "",
    );
    const migrated = migrateLegacyLocalSave(loaded);
    setUserData(migrated);
    if (migrated !== loaded) {
      await saveUserData(firebaseUser.uid, migrated);
    }
    setScreen("home");
  }

  async function logout() {
    await logoutUser();
  }

  function addLoot(item: Item | null) {
    if (!item) return;
    updateUserSave((user) => ({
      ...user,
      ownedItems: user.ownedItems.includes(item.id)
        ? user.ownedItems
        : [...user.ownedItems, item.id],
    }));
  }

  function updateEquipment(equipmentUpdate: Equipment) {
    updateUserSave((user) => ({ ...user, equippedItems: equipmentUpdate }));
  }

  function markStageClear(stageIndex: number, score: number) {
    updateUserSave((user) => {
      const clearedStages = [...user.clearedStages];
      const stageHighScores = [...user.stageHighScores];
      clearedStages[stageIndex] = true;
      stageHighScores[stageIndex] = Math.max(stageHighScores[stageIndex] ?? 0, score);
      return {
        ...user,
        clearedStages,
        stageHighScores,
        highestStage: Math.max(user.highestStage, Math.min(stageIndex + 2, STAGES.length)),
        highScore: Math.max(user.highScore, score),
      };
    });
  }

  function incrementPlayCount() {
    updateUserSave((user) => ({ ...user, playCount: user.playCount + 1 }));
  }

  if (authLoading) {
    return (
      <main className="app">
        <section className="panel-screen account-screen">
          <div className="login-brand">
            <h1>MONOCHROME RIFF</h1>
            <p>loading signal</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      {screen === "account" && (
        <AccountScreen
          onLogin={login}
          onRegister={register}
          onGoogleLogin={loginGoogle}
          error={authError}
          loading={dataLoading}
        />
      )}
      {screen === "home" && userData && (
        <HomeScreen
          username={authUser?.email ?? "unknown"}
          collectionCount={collection.length}
          equipment={equipment}
          onStart={() => {
            setScreen("stageSelect");
          }}
          onNavigate={setScreen}
          onLogout={logout}
        />
      )}
      {screen === "stageSelect" && userData && (
        <StageSelectScreen
          user={userData}
          onBack={() => setScreen("home")}
          onStart={(stageIndex) => {
            setSelectedStage(stageIndex);
            incrementPlayCount();
            if (stageIndex === 0) {
              setScreen("intro");
              return;
            }
            void audioEngine.start(settings, "game", stageIndex);
            setScreen("travel");
          }}
        />
      )}
      {screen === "intro" && (
        <IntroStoryScreen
          onComplete={() => {
            setSelectedStage(0);
            void audioEngine.start(settings, "game", 0);
            setScreen("travel");
          }}
        />
      )}
      {screen === "travel" && (
        <TravelScreen
          stageIndex={selectedStage}
          onComplete={() => setScreen("game")}
        />
      )}
      {screen === "customize" && (
        <CustomizeScreen
          collection={collectedItems}
          equipment={equipment}
          onBack={() => setScreen("home")}
          onEquip={updateEquipment}
        />
      )}
      {screen === "collection" && (
        <CollectionScreen
          collection={collection}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "archive" && (
        <ArchiveScreen onBack={() => setScreen("home")} />
      )}
      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          onChange={setSettings}
          onBack={() => setScreen("home")}
          onReset={() => {
            if (!window.confirm("Reset collection and equipment?")) return;
            updateUserSave((user) => ({
              ...user,
              ownedItems: [STARTER_ITEM],
              equippedItems: DEFAULT_EQUIPMENT,
              clearedStages: STAGES.map(() => false),
              stageHighScores: STAGES.map(() => 0),
              highestStage: 1,
              highScore: 0,
              playCount: 0,
            }));
          }}
        />
      )}
      {screen === "game" && (
        <GameScreen
          initialStageIndex={selectedStage}
          equipment={equipment}
          settings={settings}
          onLoot={addLoot}
          onStageClear={markStageClear}
          onExit={() => setScreen("home")}
        />
      )}
    </main>
  );
}

function AccountScreen({
  onLogin,
  onRegister,
  onGoogleLogin,
  error,
}: {
  onLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string) => void;
  onGoogleLogin: () => void;
  error: string;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const canSubmit = email.trim().length > 0 && password.length >= 6;

  return (
    <section className="login-screen">
      <div className="staff-lines" />
      <div className="login-shell">
        <div className="login-brand">
          <p className="kicker">Firebase Authentication</p>
          <h1>MONOCHROME RIFF</h1>
          <p>login required</p>
        </div>
      <form
        className="account-box"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password);
        }}
      >
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="player@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="6+ characters"
            autoComplete="current-password"
            minLength={6}
            required
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <div className="login-actions">
          <button type="submit" disabled={!canSubmit}>
            Login
          </button>
          <button type="button" disabled={!canSubmit} onClick={() => onRegister(email, password)}>
            Create Account
          </button>
        </div>
        {!canSubmit && (
          <small className="login-hint">メールログインは6文字以上のパスワードが必要です。</small>
        )}
        <button className="google-button" type="button" onClick={onGoogleLogin}>
          Continue with Google
        </button>
      </form>
        <div className="login-wave" aria-hidden="true">
          {Array.from({ length: 42 }).map((_, index) => (
            <span key={index} style={{ height: `${10 + ((index * 13) % 52)}px` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeScreen({
  username,
  collectionCount,
  equipment,
  onStart,
  onNavigate,
  onLogout,
}: {
  username: string;
  collectionCount: number;
  equipment: Equipment;
  onStart: () => void;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <section className="home-screen">
      <div className="staff-lines" />
      <button className="archive-link" onClick={() => onNavigate("archive")}>
        ARCHIVE
      </button>
      <div className="home-shell">
        <div className="brand-block">
          <h1>MONOCHROME RIFF</h1>
          <p className="developer-name">developer:arinitriff</p>
        </div>

        <div className="record-stage" aria-hidden="true">
          <div className="record-disc">
            <div className="record-label" />
            <div className="tonearm" />
          </div>
          <div className="waveform">
            {Array.from({ length: 34 }).map((_, index) => (
              <span
                key={index}
                style={{ height: `${12 + ((index * 17) % 44)}px` }}
              />
            ))}
          </div>
        </div>

        <nav className="home-menu" aria-label="Main menu">
          <button onClick={onStart}>Start Game</button>
          <button onClick={() => onNavigate("customize")}>Customize</button>
          <button onClick={() => onNavigate("collection")}>Collection</button>
          <button onClick={() => onNavigate("settings")}>Settings</button>
        </nav>

        <div className="home-footer">
          <span>{collectionCount}/{ITEMS.length} items archived</span>
          <span>
            Equipped:{" "}
            {Object.values(equipment)
              .map((id) => (id ? byId.get(id)?.icon : "--"))
              .join(" / ")}
          </span>
          <button className="text-button" onClick={onLogout}>
            {username}
          </button>
        </div>
      </div>
    </section>
  );
}

function StageSelectScreen({
  user,
  onBack,
  onStart,
}: {
  user: UserSaveData;
  onBack: () => void;
  onStart: (stageIndex: number) => void;
}) {
  const lastClearedIndex = user.clearedStages.reduce(
    (latest, cleared, index) => (cleared ? index : latest),
    -1,
  );
  const maxPlayable = Math.min(
    Math.max(user.highestStage - 1, lastClearedIndex + 1, 0),
    STAGES.length - 1,
  );

  return (
    <section className="panel-screen">
      <Header onBack={onBack} eyebrow="Start Game" title="Select Stage" />
      <div className="stage-grid">
        {STAGES.map((stage, index) => {
          const unlocked = index <= maxPlayable;
          const drop = byId.get(stage.dropItemId);
          return (
            <article className={`stage-card ${unlocked ? "" : "locked"}`} key={stage.name}>
              <div className="card-topline">
                <span>Stage {index + 1}</span>
                <span>{user.clearedStages[index] ? "Cleared" : unlocked ? "Open" : "Locked"}</span>
              </div>
              <h2>{stage.name}</h2>
              <p>{stage.boss}</p>
              <small>Drop: {drop?.name ?? "???"}</small>
              <small>High Score: {user.stageHighScores[index] ?? 0}</small>
              <button disabled={!unlocked} onClick={() => onStart(index)}>
                Start
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IntroStoryScreen({ onComplete }: { onComplete: () => void }) {
  const lines = [
    "この世界は、音によって保たれていた。",
    "拍は時間を刻み、旋律は記憶を繋ぎ、休符は静寂を守っていた。",
    "だが、ある日を境に、音は止まらなくなった。",
    "崩れたリズムは、世界そのものを歪ませていく。",
    "残されたのは、壊れた音と、失われた“Riff”だけ。",
  ];

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 23400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <section className="intro-screen">
      <div className="intro-staff" aria-hidden="true" />
      <div className="intro-particles" aria-hidden="true">
        {Array.from({ length: 46 }).map((_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 37) % 100}%`,
              top: `${(index * 19) % 100}%`,
              animationDelay: `${(index % 11) * 0.28}s`,
            }}
          />
        ))}
      </div>
      <div className="intro-metronome" aria-hidden="true">
        <i />
      </div>
      <div className="intro-copy">
        {lines.map((line, index) => (
          <p
            className="intro-line"
            key={line}
            style={{ animationDelay: `${1 + index * 3.35}s` }}
          >
            {line}
          </p>
        ))}
        <h1>MONOCHROME RIFF</h1>
      </div>
      <button className="intro-skip" onClick={onComplete}>
        Enter
      </button>
    </section>
  );
}

function TravelScreen({
  stageIndex,
  onComplete,
}: {
  stageIndex: number;
  onComplete: () => void;
}) {
  const stage = STAGES[stageIndex];

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 5600);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <section className="travel-screen">
      <div className="travel-staff" />
      <div className="travel-particles" aria-hidden="true">
        {Array.from({ length: 34 }).map((_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 29) % 100}%`,
              animationDelay: `${(index % 9) * 0.35}s`,
            }}
          />
        ))}
      </div>
      <div className="travel-player" aria-hidden="true">
        <i />
      </div>
      <div className="travel-copy">
        <p className="kicker">approaching riff</p>
        <h1>{stage.name}</h1>
        <p>{stage.storyText}</p>
      </div>
      <button className="travel-skip" onClick={onComplete}>
        Enter
      </button>
    </section>
  );
}

function CustomizeScreen({
  collection,
  equipment,
  onEquip,
  onBack,
}: {
  collection: Item[];
  equipment: Equipment;
  onEquip: (equipment: Equipment) => void;
  onBack: () => void;
}) {
  const slots: { key: Slot; label: string; type: ItemType }[] = [
    { key: "weapon", label: "Weapon Slot", type: "weapon" },
    { key: "relic1", label: "Relic Slot 1", type: "relic" },
    { key: "relic2", label: "Relic Slot 2", type: "relic" },
    { key: "core", label: "Core Slot", type: "core" },
  ];

  function equip(slot: Slot, itemId: string | null) {
    onEquip({ ...equipment, [slot]: itemId });
  }

  return (
    <section className="panel-screen">
      <Header onBack={onBack} eyebrow="Customize" title="Tune Your Loadout" />
      <div className="slot-grid">
        {slots.map((slot) => {
          const equipped = equipment[slot.key]
            ? byId.get(equipment[slot.key]!)
            : null;
          const options = collection.filter((item) => item.type === slot.type);
          return (
            <section className="slot-panel" key={slot.key}>
              <div className="slot-heading">
                <span>{slot.label}</span>
                <strong>{equipped?.name ?? "Empty"}</strong>
              </div>
              <div className="item-list">
                {slot.key !== "weapon" && (
                  <button
                    className={!equipped ? "mini-card active" : "mini-card"}
                    onClick={() => equip(slot.key, null)}
                  >
                    <span className="item-icon">--</span>
                    <span>Empty</span>
                  </button>
                )}
                {options.map((item) => {
                  const takenByOtherRelic =
                    item.type === "relic" &&
                    ((slot.key === "relic1" && equipment.relic2 === item.id) ||
                      (slot.key === "relic2" && equipment.relic1 === item.id));
                  return (
                    <button
                      className={`mini-card ${rarityClass(item.rarity)} ${
                        equipment[slot.key] === item.id ? "active" : ""
                      }`}
                      disabled={takenByOtherRelic}
                      key={item.id}
                      onClick={() => equip(slot.key, item.id)}
                    >
                      <span className="item-icon">{item.icon}</span>
                      <span>{item.name}</span>
                      <small>{item.effect}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function CollectionScreen({
  collection,
  onBack,
}: {
  collection: string[];
  onBack: () => void;
}) {
  return (
    <section className="panel-screen">
      <Header onBack={onBack} eyebrow="Collection" title="Recovered Scores" />
      <div className="collection-grid">
        {ITEMS.map((item) => {
          const obtained = collection.includes(item.id);
          return (
            <article
              className={`collection-card ${rarityClass(item.rarity)} ${
                obtained ? "obtained" : "locked"
              }`}
              key={item.id}
            >
              <div className="card-topline">
                <span>{obtained ? item.type : "unknown"}</span>
                <span>{item.rarity}</span>
              </div>
              <div className="item-mark">{obtained ? item.icon : "??"}</div>
              <h2>{obtained ? item.name : "???"}</h2>
              <p>{obtained ? item.effect : "Defeat bosses to reveal this item."}</p>
              <small>{obtained ? item.flavor : "Signal not archived."}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ArchiveScreen({ onBack }: { onBack: () => void }) {
  const sections = [
    {
      title: "世界説明",
      lines: [
        "音は、まだ残っている。",
        "ただし旋律は細く、世界は白と黒の間でほどけている。",
        "Riff は回収されるたび、沈黙の形を少しだけ変える。",
      ],
    },
    {
      title: "敵記録",
      lines: [
        "WAVEFORM: 壊れた波が身体を得たもの。ゆっくりと距離を詰める。",
        "DISTORTED NOTE: 歪んだ音符。撃つ前に白いノイズを小さく集める。",
        "BROKEN VINYL: 割れた音楽媒体。近づかれると空間を切る。",
        "SHARP: 鋭く歪んだ音。細い線で空間を切り裂く。",
        "64分休符: スコア1000ごとに、黄緑色の64分休符が出現する。倒すとHPを10回復。",
      ],
    },
    {
      title: "ボス記録",
      lines: [
        "WAVE REMNANT: 崩壊した波形生命体。身体は一定の形を保てない。",
        "RESONANCE: 響きだけが残った存在。安全な間を波で測らせる。",
        "BROKEN METRONOME: 壊れた時間。振り子は拍ではなく亀裂を刻む。",
        "LOST SCORE: 失われた記録。譜面は読まれるたびに別の形へ崩れる。",
      ],
    },
    {
      title: "用語",
      lines: [
        "Riff: 失われた短い音の記憶。",
        "Noise: 音楽が意味を失ったあとに残る輪郭。",
        "Rest: 戦闘の中に現れる静寂。まだ壊れていない、淡い黄緑。",
      ],
    },
    {
      title: "ストーリー断片",
      lines: [
        "最初の音は、もう壊れていた。",
        "リズムは、静かに崩れ始める。",
        "沈黙は、呼吸の仕方を覚えてしまった。",
        "記録は、静かに擦り切れていく。",
        "旋律だけが、まだ世界を覚えている。",
      ],
    },
  ];

  return (
    <section className="panel-screen archive-screen">
      <Header onBack={onBack} eyebrow="Archive" title="Silent Index" />
      <div className="archive-layout">
        {sections.map((section) => (
          <article className="archive-section" key={section.title}>
            <h2>{section.title}</h2>
            <div className="archive-lines">
              {section.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsScreen({
  settings,
  onChange,
  onBack,
  onReset,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const updateVolume = (key: "masterVolume" | "bgmVolume" | "sfxVolume", value: string) => {
    onChange({ ...settings, [key]: Number(value) });
  };

  return (
    <section className="panel-screen">
      <Header onBack={onBack} eyebrow="Settings" title="再生設定" />
      <div className="settings-list">
        <label className="slider-row">
          <span>
            <strong>マスター音量</strong>
            <small>ゲーム全体の音量を調整します。</small>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.masterVolume}
            onChange={(event) => updateVolume("masterVolume", event.target.value)}
          />
          <b>{Math.round(settings.masterVolume * 100)}</b>
        </label>
        <label className="slider-row">
          <span>
            <strong>BGM音量</strong>
            <small>ホームやステージで流れる静かな音楽の音量です。</small>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.bgmVolume}
            onChange={(event) => updateVolume("bgmVolume", event.target.value)}
          />
          <b>{Math.round(settings.bgmVolume * 100)}</b>
        </label>
        <label className="slider-row">
          <span>
            <strong>効果音音量</strong>
            <small>射撃、命中、回避、ドロップなどの音量です。</small>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.sfxVolume}
            onChange={(event) => updateVolume("sfxVolume", event.target.value)}
          />
          <b>{Math.round(settings.sfxVolume * 100)}</b>
        </label>
        <label className="toggle-row">
          <span>
            <strong>照準ラインを表示</strong>
            <small>プレイヤーからマウス方向へ細い線を表示します。</small>
          </span>
          <input
            type="checkbox"
            checked={settings.showAimLine}
            onChange={(event) =>
              onChange({ ...settings, showAimLine: event.target.checked })
            }
          />
        </label>
        <label className="toggle-row">
          <span>
            <strong>演出を控えめにする</strong>
            <small>レコード回転や戦闘中の揺れを弱めます。</small>
          </span>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) =>
              onChange({ ...settings, reducedMotion: event.target.checked })
            }
          />
        </label>
        <button className="danger-button" onClick={onReset}>
          セーブデータをリセット
        </button>
      </div>
    </section>
  );
}

function Header({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="screen-header">
      <button className="back-button" onClick={onBack} aria-label="Back">
        Back
      </button>
      <div>
        <p className="kicker">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function GameScreen({
  initialStageIndex,
  equipment,
  settings,
  onLoot,
  onStageClear,
  onExit,
}: {
  initialStageIndex: number;
  equipment: Equipment;
  settings: Settings;
  onLoot: (item: Item | null) => void;
  onStageClear: (stageIndex: number, score: number) => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const lootRef = useRef<LootResult | null>(null);
  const audioRef = useRef(audioEngine);
  const build = useMemo(() => createBuild(equipment), [equipment]);
  const [restartKey, setRestartKey] = useState(0);
  const [loot, setLoot] = useState<LootResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    hp: maxHpFor(equipment),
    maxHp: maxHpFor(equipment),
    stageNumber: 1,
    stageName: STAGES[0].name,
    phase: "combat",
    timeLeft: STAGE_DURATIONS.combat,
    bossElapsed: 0,
    runLoop: 1,
    score: 0,
    bossName: null,
    bossHp: 0,
    bossMaxHp: 0,
  });

  useEffect(() => {
    lootRef.current = loot;
  }, [loot]);

  useEffect(() => {
    audioRef.current.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gameCanvas = canvas;
    const gameCtx = ctx;

    let frame = 0;
    let lastTime = performance.now();
    let snapshotClock = 0;

    function resize() {
      const rect = gameCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      gameCanvas.width = Math.floor(rect.width * dpr);
      gameCanvas.height = Math.floor(rect.height * dpr);
      gameCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const state = stateRef.current;
      if (state) {
        state.width = rect.width;
        state.height = rect.height;
        state.player.x = clamp(state.player.x, 40, rect.width - 40);
        state.player.y = clamp(state.player.y, 40, rect.height - 40);
      }
    }

    function createState(): GameState {
      const rect = gameCanvas.getBoundingClientRect();
      const maxHp = maxHpFor(equipment);
      return {
        width: rect.width,
        height: rect.height,
        keys: new Set<string>(),
        mouse: { x: rect.width / 2, y: rect.height / 2 - 80 },
        player: {
          x: rect.width / 2,
          y: rect.height / 2,
          radius: 14,
          hp: maxHp,
          maxHp,
          invincible: 0,
          dodgeCooldown: 0,
          dodgeTime: 0,
          dodgeVx: 0,
          dodgeVy: 0,
          dodgeTrail: 0,
        },
        bullets: [],
        enemies: [],
        hazards: [],
        particles: [],
        boss: null,
        stageIndex: initialStageIndex,
        phase: "combat",
        phaseTimer: STAGE_DURATIONS.combat,
        bossElapsed: 0,
        runLoop: 1,
        waveKills: 0,
        score: 0,
        nextRestScore: 1000,
        spawnClock: 0,
        fireClock: 0,
        pulseClock: 7,
        auraClock: 0,
        bannerClock: 1.8,
        bannerText: `STAGE ${initialStageIndex + 1}  ${STAGES[initialStageIndex].name}`,
        silenceAmount: initialStageIndex === 2 ? 0.18 : initialStageIndex === 3 ? 0.14 : 0,
        freezeClock: 0,
        freezeCooldown: 11,
        freezeReason: null,
        shake: 0,
        gameOver: false,
        nextId: 1,
      };
    }

    stateRef.current = createState();
    resize();
    lootRef.current = null;
    setLoot(null);
    void audioRef.current.start(settings, "game", initialStageIndex);
    audioRef.current.setGameStage(initialStageIndex, false);

    function keyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      stateRef.current?.keys.add(key);
      if (key === " " || key === "shift") {
        event.preventDefault();
        const state = stateRef.current;
        if (state && !state.gameOver && !lootRef.current) attemptDodge(state);
      }
    }

    function keyUp(event: KeyboardEvent) {
      stateRef.current?.keys.delete(event.key.toLowerCase());
    }

    function mouseMove(event: MouseEvent) {
      const rect = gameCanvas.getBoundingClientRect();
      const state = stateRef.current;
      if (!state) return;
      state.mouse.x = event.clientX - rect.left;
      state.mouse.y = event.clientY - rect.top;
    }

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    gameCanvas.addEventListener("mousemove", mouseMove);

    function loop(time: number) {
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;
      const state = stateRef.current;
      if (state) {
        if (!lootRef.current && !state.gameOver) updateGame(state, build, settings, dt);
        drawGame(gameCtx, state, build, settings, time / 1000);
        snapshotClock += dt;
        if (snapshotClock > 0.12) {
          snapshotClock = 0;
          setSnapshot({
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            stageNumber: state.stageIndex + 1,
            stageName: STAGES[state.stageIndex].name,
            phase: state.phase,
            timeLeft: state.phaseTimer,
            bossElapsed: state.bossElapsed,
            runLoop: state.runLoop,
            score: state.score,
            bossName: state.boss?.name ?? null,
            bossHp: state.boss?.hp ?? 0,
            bossMaxHp: state.boss?.maxHp ?? 0,
          });
        }
      }
      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      audioRef.current.stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      gameCanvas.removeEventListener("mousemove", mouseMove);
    };
  }, [restartKey, equipment, build, settings, initialStageIndex]);

  function keepPlaying() {
    const state = stateRef.current;
    if (state) {
      advanceStage(state);
    }
    lootRef.current = null;
    setLoot(null);
  }

  function restart() {
    setRestartKey((value) => value + 1);
  }

  const equipped = Object.values(equipment)
    .map((id) => (id ? byId.get(id) : null))
    .filter(Boolean) as Item[];

  return (
    <section className="game-screen">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud top-hud">
        <div className="meter-block">
          <span>HP</span>
          <div className="hp-track">
            <div
              className="hp-fill"
              style={{ width: `${(snapshot.hp / snapshot.maxHp) * 100}%` }}
            />
          </div>
          <strong>
            {Math.ceil(snapshot.hp)}/{snapshot.maxHp}
          </strong>
        </div>
        <div className="hud-stat stage-title">
          <span>
            Stage {snapshot.stageNumber} / Run {snapshot.runLoop}
          </span>
          <strong>{snapshot.stageName}</strong>
        </div>
        <div className="hud-stat wide-stat">
          <span>{snapshot.phase === "combat" ? "Noise" : snapshot.phase}</span>
          <strong>
            {snapshot.phase === "boss"
              ? `${Math.floor(snapshot.bossElapsed)}s`
              : `${Math.max(0, Math.ceil(snapshot.timeLeft))}s`}
          </strong>
        </div>
        <div className="hud-stat">
          <span>Score</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div className="equip-strip">
          {equipped.map((item) => (
            <span className={rarityClass(item.rarity)} key={item.id}>
              {item.icon}
            </span>
          ))}
        </div>
        <button onClick={onExit}>Home</button>
      </div>

      {snapshot.bossName && (
        <div className="boss-hud">
          <span>{snapshot.bossName}</span>
          <div>
            <i
              style={{
                width: `${(snapshot.bossHp / snapshot.bossMaxHp) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {loot && (
        <div className={`modal loot-modal ${rarityClass(loot.rarity)}`}>
          <p className="kicker">Boss Drop</p>
          {loot.item ? (
            <>
              <div className="item-mark">{loot.item.icon}</div>
              <h2>{loot.item.name}</h2>
              <span className="rarity-label">{loot.item.rarity}</span>
              <p>{loot.item.effect}</p>
              <small>{loot.item.flavor}</small>
            </>
          ) : (
            <>
              <div className="item-mark">--</div>
              <h2>No Drop</h2>
              <p>The silence remains empty this time.</p>
            </>
          )}
          <div className="modal-actions">
            <button onClick={keepPlaying}>
              {snapshot.stageNumber === STAGES.length ? "New Run" : "Next Stage"}
            </button>
            <button onClick={onExit}>Archive & Home</button>
          </div>
        </div>
      )}

      {stateRef.current?.gameOver && (
        <div className="modal">
          <p className="kicker">Signal Lost</p>
          <h2>Game Over</h2>
          <p>
            {snapshot.stageName} collapsed into noise during {snapshot.phase}.
          </p>
          <div className="modal-actions">
            <button onClick={restart}>Restart</button>
            <button onClick={onExit}>Home</button>
          </div>
        </div>
      )}
    </section>
  );

  function updateGame(
    state: GameState,
    stats: BuildStats,
    currentSettings: Settings,
    dt: number,
  ) {
    updatePlayer(state, dt);
    updateStage(state, dt);
    if (state.phase !== "warning") updateShooting(state, stats, dt);
    updateBoss(state, dt);
    updateEntities(state, stats, currentSettings, dt);
    state.bannerClock = Math.max(0, state.bannerClock - dt);
    state.shake = Math.max(0, state.shake - dt * 16);
  }

  function updatePlayer(state: GameState, dt: number) {
    const left = state.keys.has("a") || state.keys.has("arrowleft");
    const right = state.keys.has("d") || state.keys.has("arrowright");
    const up = state.keys.has("w") || state.keys.has("arrowup");
    const down = state.keys.has("s") || state.keys.has("arrowdown");
    const dir = normalize((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
    const moving = left || right || up || down;
    const insideNoiseZone = state.hazards.some(
      (hazard) => hazard.kind === "noiseZone" && distance(state.player, hazard) < hazard.radius + state.player.radius,
    );
    const timeDrag = (state.freezeClock > 0 && state.freezeReason === "stop" ? 0.34 : 1) * (insideNoiseZone ? 0.72 : 1);
    const speed = 245 * timeDrag;
    state.player.dodgeCooldown = Math.max(0, state.player.dodgeCooldown - dt);
    state.player.dodgeTrail = Math.max(0, state.player.dodgeTrail - dt);

    if (state.player.dodgeTime > 0) {
      const previousDodgeTime = state.player.dodgeTime;
      state.player.dodgeTime = Math.max(0, state.player.dodgeTime - dt);
      state.player.x += state.player.dodgeVx * dt * timeDrag;
      state.player.y += state.player.dodgeVy * dt * timeDrag;
      state.player.invincible = Math.max(state.player.invincible, 0.12);
      if (previousDodgeTime > 0 && state.player.dodgeTime === 0) {
        state.player.invincible = Math.max(state.player.invincible, 0.42);
      }
      if (state.player.dodgeTrail <= 0) {
        state.player.dodgeTrail = 0.035;
        addDodgeAfterimage(state);
      }
    } else if (moving) {
      state.player.x += dir.x * speed * dt;
      state.player.y += dir.y * speed * dt;
    }
    state.player.x = clamp(state.player.x, 24, state.width - 24);
    state.player.y = clamp(state.player.y, 72, state.height - 24);
    state.player.invincible = Math.max(0, state.player.invincible - dt);
  }

  function attemptDodge(state: GameState) {
    if (state.player.dodgeCooldown > 0 || state.player.dodgeTime > 0) return;
    const left = state.keys.has("a") || state.keys.has("arrowleft");
    const right = state.keys.has("d") || state.keys.has("arrowright");
    const up = state.keys.has("w") || state.keys.has("arrowup");
    const down = state.keys.has("s") || state.keys.has("arrowdown");
    const moving = left || right || up || down;
    const dir = moving
      ? normalize((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0))
      : normalize(state.mouse.x - state.player.x, state.mouse.y - state.player.y);

    state.player.dodgeTime = 0.2;
    state.player.dodgeCooldown = 1.05;
    state.player.dodgeVx = dir.x * 780;
    state.player.dodgeVy = dir.y * 780;
    state.player.invincible = 0.34;
    state.player.dodgeTrail = 0;
    state.shake = settings.reducedMotion ? 0 : 0.45;
    addDodgeAfterimage(state);
    addRipple(state, state.player.x, state.player.y, 88, "wave");
    audioRef.current.dodge();
  }

  function updateShooting(state: GameState, stats: BuildStats, dt: number) {
    state.fireClock -= dt;
    if (state.fireClock > 0) return;
    const aim = normalize(state.mouse.x - state.player.x, state.mouse.y - state.player.y);
    const lowHpBonus =
      stats.lowHpPower && state.player.hp / state.player.maxHp < 0.38 ? 1.55 : 1;
    spawnBullet(state, aim, stats.damage * lowHpBonus, stats);
    audioRef.current.shoot(stats.split);
    state.fireClock = stats.fireInterval;
  }

  function updateStage(state: GameState, dt: number) {
    if (state.phase === "boss") {
      state.bossElapsed += dt;
    } else {
      state.phaseTimer = Math.max(0, state.phaseTimer - dt);
    }
    updateWhiteRequiemMood(state, dt);

    if (state.phase === "combat") {
      updateStageSpawns(state, dt);
      if (state.phaseTimer <= 0) startWarning(state);
      return;
    }

    if (state.phase === "warning" && state.phaseTimer <= 0) {
      spawnBoss(state);
      return;
    }

  }

  function updateStageSpawns(state: GameState, dt: number) {
    state.spawnClock -= dt;
    const stage = STAGES[state.stageIndex];
    const difficulty = stage.enemyLevel + (state.runLoop - 1) * 0.7;
    const spawnLimit = Math.min(8, Math.round(4 + difficulty * 1.25));
    const spawnDelay = clamp(1.28 - difficulty * 0.08, 0.72, 1.28);

    if (state.spawnClock <= 0 && state.enemies.length < spawnLimit) {
      spawnEnemy(state);
      state.spawnClock = spawnDelay;
    }
  }

  function startWarning(state: GameState) {
    state.phase = "warning";
    state.phaseTimer = STAGE_DURATIONS.warning;
    state.enemies = [];
    state.hazards = [];
    state.bullets = [];
    state.spawnClock = 0;
    state.bannerText = "WARNING";
    state.bannerClock = STAGE_DURATIONS.warning;
    state.shake = settings.reducedMotion ? 0 : 1.4;
    audioRef.current.boss();
  }

  function advanceStage(state: GameState) {
    const finishedFinalStage = state.stageIndex >= STAGES.length - 1;
    state.stageIndex = finishedFinalStage ? 0 : state.stageIndex + 1;
    if (finishedFinalStage) state.runLoop += 1;
    state.phase = "combat";
    state.phaseTimer = STAGE_DURATIONS.combat;
    state.bossElapsed = 0;
    state.waveKills = 0;
    state.enemies = [];
    state.hazards = [];
    state.bullets = [];
    state.boss = null;
    state.spawnClock = 0;
    state.fireClock = 0;
    state.freezeClock = 0;
    state.freezeCooldown = state.stageIndex === 2 ? 8 : 11;
    state.freezeReason = null;
    state.silenceAmount = state.stageIndex === 2 ? 0.18 : state.stageIndex === 3 ? 0.14 : 0;
    state.bannerText = `STAGE ${state.stageIndex + 1}  ${STAGES[state.stageIndex].name}`;
    state.bannerClock = 2;
    checkRestSpawn(state);
    audioRef.current.setGameStage(state.stageIndex, false);
  }

  function updateWhiteRequiemMood(state: GameState, dt: number) {
    if (state.stageIndex === 3) {
      const stageElapsed =
        state.phase === "combat"
          ? STAGE_DURATIONS.combat - state.phaseTimer
          : state.phase === "warning"
            ? STAGE_DURATIONS.combat + STAGE_DURATIONS.warning - state.phaseTimer
            : STAGE_DURATIONS.combat + STAGE_DURATIONS.warning + state.bossElapsed;
      const pulse = Math.max(0, Math.sin(stageElapsed * 1.15 + Math.sin(stageElapsed * 0.18) * 3));
      const target = clamp(0.16 + stageElapsed / 150 + pulse * 0.28, 0.12, 0.72);
      state.silenceAmount += (target - state.silenceAmount) * dt * 1.65;
      return;
    }

    if (state.stageIndex !== 2) {
      state.silenceAmount = 0;
      return;
    }

    const stageElapsed =
      state.phase === "combat"
        ? STAGE_DURATIONS.combat - state.phaseTimer
      : state.phase === "warning"
          ? STAGE_DURATIONS.combat + STAGE_DURATIONS.warning - state.phaseTimer
          : STAGE_DURATIONS.combat + STAGE_DURATIONS.warning + state.bossElapsed;
    const pulse = Math.max(0, Math.sin(stageElapsed * 0.88));
    const target = clamp(0.18 + stageElapsed / 120 + pulse * 0.35, 0.12, 0.82);
    state.silenceAmount += (target - state.silenceAmount) * dt * 1.8;

    if (state.freezeClock > 0) {
      const previous = state.freezeClock;
      state.freezeClock = Math.max(0, state.freezeClock - dt);
      if (previous > 0 && state.freezeClock === 0) {
        if (state.freezeReason === "stop") {
          state.bannerText = "TIME RELEASE";
          state.bannerClock = 0.9;
          audioRef.current.timeRelease();
          audioRef.current.resumeGameLayer(state.stageIndex, true);
        }
        state.freezeReason = null;
        addRipple(state, state.width / 2, state.height / 2, 460, "wave");
      }
      return;
    }

    if (state.phase !== "boss" || !state.boss) return;
    state.freezeCooldown -= dt;
    if (state.freezeCooldown <= 0 && state.freezeClock <= 0) {
      const hpRatio = state.boss.hp / state.boss.maxHp;
      const enrage = hpRatio < 0.25 ? 2 : hpRatio < 0.5 ? 1 : 0;
      state.freezeClock = enrage > 0 ? 1.7 : 2.05;
      state.freezeCooldown = enrage > 0 ? 9.2 : 12.5;
      state.freezeReason = "stop";
      state.bannerText = "TIME STOPS";
      state.bannerClock = 1.4;
      addRipple(state, state.width / 2, state.height / 2, 360, "wave");
      spawnFrozenBeatMemory(state, state.boss, enrage);
      audioRef.current.timeStop();
      audioRef.current.stop();
    }
  }

  function spawnEnemy(state: GameState) {
    const edge = Math.floor(Math.random() * 4);
    const margin = 34;
    const x =
      edge === 0
        ? -margin
        : edge === 1
          ? state.width + margin
          : Math.random() * state.width;
    const y =
      edge === 2
        ? -margin
        : edge === 3
          ? state.height + margin
          : 70 + Math.random() * (state.height - 90);
    const stage = STAGES[state.stageIndex];
    const kindPool =
      state.stageIndex === 3
        ? [0, 0, 0, 1, 1, 3, 3, 6]
        : [0, 0, 0, 0, 0, 1, 1, 1, 3, 3];
    const kind = kindPool[Math.floor(Math.random() * kindPool.length)];
    const radius = kind === 6 ? 16 : 11 + Math.min(kind, 4) * 2;
    const difficulty = stage.enemyLevel + (state.runLoop - 1) * 0.65;
    const movementDifficulty = state.stageIndex === 3 ? STAGES[0].enemyLevel + (state.runLoop - 1) * 0.65 : difficulty;
    const baseHp = 22 + difficulty * 10 + Math.min(kind, 4) * 7;
    const hp = kind === 3 ? baseHp * 2.64 : kind === 6 ? baseHp * 1.15 : baseHp;
    const speedBoost = kind === 3 ? 26 : kind === 4 ? 92 : kind === 5 ? 38 : 0;
    state.enemies.push({
      id: state.nextId++,
      x,
      y,
      radius,
      hp,
      maxHp: hp,
      speed: 48 + movementDifficulty * 13 + speedBoost + Math.random() * 24,
      damage: 9 + Math.min(kind, 4) * 2 + state.stageIndex,
      kind,
      pulse: Math.random() * Math.PI * 2,
      attackClock: kind === 1 ? 1.4 + Math.random() * 1.2 : kind === 3 ? 1.1 : kind === 6 ? 1.35 + Math.random() * 0.75 : 0,
      mode: 0,
      telegraph: false,
    });
  }

  function spawnRestCharacter(state: GameState) {
    const margin = 90;
    const x = margin + Math.random() * Math.max(1, state.width - margin * 2);
    const y = 120 + Math.random() * Math.max(1, state.height - 220);
    const hp = 38 + state.runLoop * 4;
    state.enemies.push({
      id: state.nextId++,
      x,
      y,
      radius: 18,
      hp,
      maxHp: hp,
      speed: 34,
      damage: 0,
      kind: 8,
      pulse: Math.random() * Math.PI * 2,
      attackClock: 0,
      mode: 0,
      telegraph: false,
    });
    addRipple(state, x, y, 120, "rest");
    audioRef.current.loot(false);
  }

  function checkRestSpawn(state: GameState) {
    while (state.score >= state.nextRestScore) {
      spawnRestCharacter(state);
      state.nextRestScore += 1000;
    }
  }

  function spawnBoss(state: GameState) {
    const stage = STAGES[state.stageIndex];
    const baseHp = [1720, 2450, 3380, 3720][state.stageIndex];
    const maxHp = baseHp + (state.runLoop - 1) * 360;
    state.boss = {
      id: state.nextId++,
      name: stage.boss,
      x: state.width / 2,
      y: state.stageIndex === 2 ? 176 : state.stageIndex === 3 ? 142 : 125,
      radius: state.stageIndex === 2 ? 86 : state.stageIndex === 3 ? 74 : 48 + state.stageIndex * 6,
      hp: maxHp,
      maxHp,
      attack: 1.3,
      phase: stage.bossPhase,
      telegraphClock: 0,
      telegraphDuration: 0,
      pattern: 0,
      rhythmIndex: 0,
      targetX: state.player.x,
      targetY: state.player.y,
      targetAngle: 0,
    };
    state.phase = "boss";
    state.phaseTimer = 0;
    state.bossElapsed = 0;
    state.enemies = [];
    state.hazards = [];
    state.bullets = [];
    state.freezeClock = 0;
    state.freezeCooldown = state.stageIndex === 2 ? 7 : 99;
    state.bannerText = stage.boss;
    state.bannerClock = 2.4;
    state.shake = 2;
    if (state.stageIndex === 2) {
      const introBossId = state.boss.id;
      state.freezeClock = 1.65;
      state.freezeCooldown = 8.4;
      state.freezeReason = "intro";
      state.bannerText = "";
      audioRef.current.stop();
      [0, 820, 1180, 1540].forEach((delay, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live && live.boss?.id === introBossId && !live.gameOver) {
            audioRef.current.metronomeTick(index === 0);
          }
        }, delay);
      });
      window.setTimeout(() => {
        const live = stateRef.current;
        if (live && live.boss?.id === introBossId && !live.gameOver) {
          audioRef.current.resumeGameLayer(state.stageIndex, true);
        }
      }, 1680);
    } else {
      audioRef.current.setGameStage(state.stageIndex, true);
      audioRef.current.boss();
    }
  }

  function updateBoss(state: GameState, dt: number) {
    if (!state.boss) return;
    if (state.freezeClock > 0) return;
    const boss = state.boss;
    const hpRatio = boss.hp / boss.maxHp;
    const enrage = hpRatio < 0.25 ? 2 : hpRatio < 0.5 ? 1 : 0;
    if (state.stageIndex >= 2) audioRef.current.setBossIntensity(enrage);
    const time = state.bossElapsed;
    const targetX =
      state.stageIndex === 2
        ? state.width / 2 +
          Math.sin(time * (0.28 + enrage * 0.06)) * (34 + enrage * 11) +
          Math.sin(time * 0.09 + boss.rhythmIndex) * 12
        : state.stageIndex === 3
          ? state.width / 2 +
            Math.sin(time * (0.36 + enrage * 0.08)) * (86 + enrage * 28) +
            Math.sin(time * 1.1 + boss.rhythmIndex) * (12 + enrage * 5)
        : state.width / 2 +
          Math.sin(time * (0.62 + enrage * 0.12) + boss.phase * 1.8) *
            (76 + state.stageIndex * 18 + enrage * 22) +
          Math.sin(time * 0.23 + boss.rhythmIndex) * 24;
    const targetY =
      state.stageIndex === 2
        ? 176 + Math.sin(time * (0.22 + enrage * 0.04) + boss.phase) * (7 + enrage * 3)
        : state.stageIndex === 3
          ? 132 + Math.sin(time * (0.62 + enrage * 0.08) + boss.phase) * (16 + enrage * 8)
        : 118 +
          state.stageIndex * 8 +
          Math.sin(time * (0.78 + enrage * 0.08) + boss.phase) * (18 + enrage * 9);
    boss.x += (targetX - boss.x) * dt * (0.58 + enrage * 0.16);
    boss.y += (targetY - boss.y) * dt * (0.72 + enrage * 0.12);

    if (boss.telegraphClock > 0) {
      const previous = boss.telegraphClock;
      const charge = 1 - boss.telegraphClock / boss.telegraphDuration;
      boss.x += Math.cos(boss.targetAngle + Math.PI) * (18 + enrage * 8) * charge * dt;
      boss.y += Math.sin(boss.targetAngle + Math.PI) * (10 + enrage * 5) * charge * dt;
      boss.x = clamp(boss.x, boss.radius + 36, state.width - boss.radius - 36);
      boss.y = clamp(boss.y, boss.radius + 48, Math.min(190, state.height * 0.34));
      boss.telegraphClock = Math.max(0, boss.telegraphClock - dt);
      if (previous > 0 && boss.telegraphClock === 0) {
        fireBossPattern(state, boss, enrage);
        boss.attack = bossCooldown(state, enrage);
      }
      return;
    }
    boss.x = clamp(boss.x, boss.radius + 36, state.width - boss.radius - 36);
    boss.y = clamp(boss.y, boss.radius + 48, Math.min(190, state.height * 0.34));

    boss.attack -= dt;
    if (boss.attack <= 0) {
      beginBossTelegraph(state, boss, enrage);
    }
  }

  function bossCooldown(state: GameState, enrage: number) {
    const base =
      state.stageIndex === 0 ? 1.55 : state.stageIndex === 1 ? 1.28 : state.stageIndex === 2 ? 1.46 : 1.34;
    return clamp(base - enrage * 0.2 - state.runLoop * 0.02, state.stageIndex === 2 ? 0.88 : state.stageIndex === 3 ? 0.82 : 0.86, base);
  }

  function beginBossTelegraph(state: GameState, boss: Boss, enrage: number) {
    boss.pattern = chooseBossPattern(state, boss, enrage);
    boss.telegraphDuration =
      state.stageIndex === 0
        ? 1.08
        : state.stageIndex === 1
          ? 1.02
          : state.stageIndex === 2
            ? boss.pattern === 4
              ? 1.48
              : 1.26 - enrage * 0.08
            : boss.pattern === 1
              ? 1.28
              : 1.05 - enrage * 0.05;
    boss.telegraphClock = boss.telegraphDuration;
    boss.targetX = state.player.x;
    boss.targetY = state.player.y;
    boss.targetAngle = Math.atan2(state.player.y - boss.y, state.player.x - boss.x);
    boss.rhythmIndex += 1;
    addRipple(state, boss.x, boss.y, 78 + state.stageIndex * 18, "spark");
    state.shake = settings.reducedMotion
      ? 0
      : state.stageIndex === 2
        ? 0.32 + enrage * 0.24
        : state.stageIndex === 3
          ? 0.38 + enrage * 0.28
          : 0.45 + enrage * 0.3;
    if (state.stageIndex === 2) audioRef.current.metronomeTick(boss.rhythmIndex % 4 === 1);
    audioRef.current.wavePulse();
  }

  function chooseBossPattern(state: GameState, boss: Boss, enrage: number) {
    if (state.stageIndex === 0) {
      if (boss.rhythmIndex % 4 === 3) return 2;
      return boss.rhythmIndex % 3 === 2 && enrage > 0 ? 1 : 0;
    }
    if (state.stageIndex === 1) return boss.rhythmIndex % 5 === 4 ? 4 : boss.rhythmIndex % 4;
    if (state.stageIndex === 3) {
      if (enrage > 0 && boss.rhythmIndex % 5 === 4) return 4;
      return boss.rhythmIndex % 4;
    }
    if (enrage > 0 && boss.rhythmIndex % 6 === 5) return 4;
    const phrase = boss.rhythmIndex % 5;
    if (phrase === 0 || phrase === 2) return 0;
    if (phrase === 1) return 1;
    if (phrase === 3) return 2;
    return 3;
  }

  function fireBossPattern(state: GameState, boss: Boss, enrage: number) {
    if (state.stageIndex === 0) {
      fireStageOneBoss(state, boss, enrage);
    } else if (state.stageIndex === 1) {
      fireStageTwoBoss(state, boss, enrage);
    } else if (state.stageIndex === 2) {
      fireStageThreeBoss(state, boss, enrage);
      if (enrage > 0) {
        [170, enrage > 1 ? 290 : 360].forEach((delay) => {
          window.setTimeout(() => {
            const live = stateRef.current;
            if (live?.boss?.id === boss.id && !live.gameOver) audioRef.current.metronomeTick(false);
          }, delay);
        });
      }
    } else {
      fireStageFourBoss(state, boss, enrage);
    }
    addRipple(state, boss.x, boss.y, 96 + enrage * 20, "wave");
  }

  function fireStageOneBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 2) {
      fireWaveWall(state, boss, 126 + enrage * 16, 9);
      return;
    }
    if (boss.pattern === 1) {
      const offsets = enrage > 0 ? [-0.38, -0.19, 0, 0.19, 0.38] : [-0.28, -0.1, 0.1, 0.28];
      offsets.forEach((offset, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live?.boss?.id === boss.id && !live.gameOver) {
            spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle + offset, 142 + enrage * 18, 10.5, 9);
          }
        }, index * 130);
      });
      return;
    }
    [-0.16, 0.16].forEach((offset) => {
      spawnWaveHazard(state, boss.x, boss.y, boss.targetAngle + offset, 132 + enrage * 16, 11, 9);
    });
    [220, 440].slice(0, enrage > 0 ? 2 : 1).forEach((delay, beat) => {
      window.setTimeout(() => {
        const live = stateRef.current;
        if (live?.boss?.id === boss.id && !live.gameOver) {
          [-0.08, 0.08].forEach((offset) => {
            spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle + offset + beat * 0.03, 132 + enrage * 16, 11, 9);
          });
        }
      }, delay);
    });
  }

  function fireStageTwoBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 4) {
      fireWaveWall(state, boss, 148 + enrage * 20, 10);
      return;
    }
    if (boss.pattern === 0) {
      const offsets = enrage > 0 ? [-0.5, -0.3, -0.11, 0.11, 0.3, 0.5] : [-0.42, -0.22, 0.22, 0.42];
      offsets.forEach((offset) => {
        spawnWaveHazard(state, boss.x, boss.y, boss.targetAngle + offset, 140 + enrage * 18, 10, 9);
      });
      return;
    }
    if (boss.pattern === 1) {
      const lanes = [0.22, 0.38, 0.54, 0.7];
      const gap = boss.rhythmIndex % lanes.length;
      for (let i = 0; i < lanes.length; i += 1) {
        if (i === gap) continue;
        const y = state.height * lanes[i];
        spawnWaveHazard(state, boss.x, boss.y, Math.atan2(y - boss.y, state.width * 0.5 - boss.x), 126 + enrage * 18, 12.5, 10);
      }
      return;
    }
    if (boss.pattern === 2) {
      const offsets = enrage > 0 ? [-0.34, -0.17, 0, 0.17, 0.34] : [-0.28, 0, 0.28];
      offsets.forEach((offset, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live?.boss?.id === boss.id && !live.gameOver) {
            spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle + offset, 152 + enrage * 14, 10.5, 10);
          }
        }, index * 145);
      });
      return;
    }
    const count = 7 + enrage;
    for (let i = 0; i < count; i += 1) {
      if (i === Math.floor(count / 2)) continue;
      const angle = -Math.PI * 0.86 + (Math.PI * 0.72 * i) / (count - 1);
      spawnWaveHazard(state, boss.x, boss.y, angle, 122 + enrage * 14, 11.5, 9);
    }
  }

  function fireStageThreeBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 0) {
      fireMetronomeBeatShockwave(state, boss, enrage);
      audioRef.current.metronomeTick(true);
      return;
    }
    if (boss.pattern === 1) {
      firePendulumBeatCut(state, boss, enrage);
      audioRef.current.metronomeTick(true);
      return;
    }
    if (boss.pattern === 2) {
      fireBeatLineRain(state, boss, enrage);
      audioRef.current.metronomeTick(true);
      return;
    }
    if (boss.pattern === 3) {
      fireBeatScatter(state, boss, enrage);
      audioRef.current.metronomeTick(true);
      return;
    }
    const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
    spawnBeatShockwave(
      state,
      boss.x,
      boss.y + boss.radius * 0.44,
      Math.PI / 2 + swing * 0.48,
      Math.PI * 0.72,
      164 + enrage * 22,
      38,
      14,
      11,
      4.8,
    );
    [130, 280].forEach((delay, index) => {
      window.setTimeout(() => {
        const live = stateRef.current;
        if (live?.boss?.id === boss.id && !live.gameOver) {
          if (index === 0) fireBeatLineRain(live, boss, enrage);
          else fireBeatScatter(live, boss, enrage);
          audioRef.current.metronomeTick(index === 1);
        }
      }, delay);
    });
  }

  function fireStageFourBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 0) {
      fireLostScoreMelody(state, boss, enrage);
      return;
    }
    if (boss.pattern === 1) {
      spawnNoiseZone(state, boss.targetX, boss.targetY, 78 + enrage * 18, 3.6 + enrage * 0.6);
      audioRef.current.wavePulse();
      return;
    }
    if (boss.pattern === 2) {
      fireLostScoreMelody(state, boss, enrage);
      return;
    }
    if (boss.pattern === 3) {
      fireLostScoreMelody(state, boss, enrage);
      return;
    }
    spawnNoiseZone(state, boss.targetX, boss.targetY, 92 + enrage * 20, 3.4 + enrage * 0.6);
    window.setTimeout(() => {
      const live = stateRef.current;
      if (live?.boss?.id === boss.id && !live.gameOver) fireLostScoreMelody(live, boss, enrage);
    }, 260);
  }

  function fireLostScoreMelody(state: GameState, boss: Boss, enrage: number) {
    const count = enrage > 0 ? 11 : 9;
    const openA = boss.rhythmIndex % count;
    const openB = (openA + 1) % count;
    for (let i = 0; i < count; i += 1) {
      if (i === openA || i === openB) continue;
      const angle = -Math.PI * 0.86 + (Math.PI * 0.72 * i) / Math.max(1, count - 1);
      spawnWaveHazard(state, boss.x, boss.y + boss.radius * 0.42, angle, 132 + enrage * 18, 11.5, 9);
    }
    audioRef.current.wavePulse();
  }

  function fireMetronomeBeatShockwave(state: GameState, boss: Boss, enrage: number) {
    spawnBeatShockwave(
      state,
      boss.x,
      boss.y + boss.radius * 0.48,
      Math.PI / 2,
      Math.PI * (0.92 - enrage * 0.05),
      132 + enrage * 22,
      34,
      14,
      10,
      5.4,
    );
    if (enrage > 0) {
      window.setTimeout(() => {
        const live = stateRef.current;
        if (live?.boss?.id === boss.id && !live.gameOver) {
          spawnBeatShockwave(
            live,
            boss.x,
            boss.y + boss.radius * 0.48,
            Math.PI / 2,
            Math.PI * 0.7,
            146 + enrage * 22,
            28,
            12,
            10,
            4.8,
          );
          audioRef.current.metronomeTick(false);
        }
      }, 310);
    }
  }

  function firePendulumBeatCut(state: GameState, boss: Boss, enrage: number) {
    const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
    spawnBeatShockwave(
      state,
      boss.x + swing * boss.radius * 0.16,
      boss.y + boss.radius * 0.2,
      Math.PI / 2 + swing * (0.5 + enrage * 0.08),
      Math.PI * 0.52,
      172 + enrage * 26,
      30,
      13,
      11,
      4.2,
    );
  }

  function spawnFrozenBeatMemory(state: GameState, boss: Boss, enrage: number) {
    const originY = boss.y + boss.radius * 0.48;
    [-0.36, 0.36].forEach((offset, index) => {
      spawnBeatShockwave(
        state,
        boss.x,
        originY,
        Math.PI / 2 + offset,
        Math.PI * 0.46,
        118 + enrage * 22,
        42 + index * 16,
        13,
        10,
        5.8,
      );
    });
  }

  function fireBeatLineRain(state: GameState, boss: Boss, enrage: number) {
    const count = enrage > 0 ? 7 : 5;
    const gap = boss.rhythmIndex % count;
    const padding = 58;
    for (let i = 0; i < count; i += 1) {
      if (i === gap || (enrage === 0 && i === gap + 1)) continue;
      const x = padding + ((state.width - padding * 2) * i) / Math.max(1, count - 1);
      spawnWaveHazard(state, x, 78, Math.PI / 2, 148 + enrage * 20, 16 + enrage, 10);
    }
  }

  function fireBeatScatter(state: GameState, boss: Boss, enrage: number) {
    const count = enrage > 0 ? 12 : 9;
    const openA = boss.rhythmIndex % count;
    const openB = (openA + 1) % count;
    for (let i = 0; i < count; i += 1) {
      if (i === openA || i === openB) continue;
      const angle = (Math.PI * 2 * i) / count;
      spawnWaveHazard(state, boss.x, boss.y + boss.radius * 0.2, angle, 108 + enrage * 16, 11.5, 9);
    }
  }

  function spawnBeatShockwave(
    state: GameState,
    x: number,
    y: number,
    angle: number,
    spread: number,
    speed: number,
    radius: number,
    width: number,
    damage: number,
    life: number,
  ) {
    state.hazards.push({
      id: state.nextId++,
      x,
      y,
      vx: speed,
      vy: Math.random() * Math.PI * 2,
      radius,
      damage,
      life,
      kind: "shockwave",
      angle,
      length: spread,
      width,
    });
    audioRef.current.wavePulse();
  }

  function spawnNoiseZone(state: GameState, x: number, y: number, radius: number, life: number) {
    state.hazards.push({
      id: state.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      damage: 0,
      life,
      kind: "noiseZone",
    });
    addRipple(state, x, y, radius, "afterimage");
  }

  function fireWaveWall(state: GameState, boss: Boss, speed: number, damage: number) {
    const y = boss.y + boss.radius * 1.35;
    const spacing = 26;
    const drift = Math.sin(boss.rhythmIndex) * 8;
    for (let x = -spacing; x <= state.width + spacing; x += spacing) {
      spawnWaveHazard(state, x + drift, y, Math.PI / 2, speed, 12.5, damage);
    }
    state.shake = settings.reducedMotion ? 0 : 0.7;
  }

  function spawnBossLaser(
    state: GameState,
    x: number,
    y: number,
    angle: number,
    width: number,
    damage: number,
    life: number,
    angularVelocity = 0,
  ) {
    state.hazards.push({
      id: state.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: width / 2,
      damage: 10,
      life,
      kind: "laser",
      angle,
      length: Math.hypot(state.width, state.height) + 160,
      width,
      angularVelocity,
    });
    audioRef.current.wavePulse();
  }

  function spawnWaveHazard(
    state: GameState,
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    damage: number,
  ) {
    state.hazards.push({
      id: state.nextId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      damage,
      life: 7.5,
      kind: "wave",
      angle,
      width: radius * 2.2,
    });
    audioRef.current.wavePulse();
  }

  function spawnBossHazard(
    state: GameState,
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
  ) {
    state.hazards.push({
      id: state.nextId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      damage: 10 + state.stageIndex * 2,
      life: 8,
      kind: "orb",
    });
  }

  function updateEntities(
    state: GameState,
    stats: BuildStats,
    currentSettings: Settings,
    dt: number,
  ) {
    const frozen = state.freezeClock > 0;
    if (!frozen) {
      state.bullets.forEach((bullet) => {
        if (bullet.waveRiff) {
          const dir = normalize(bullet.vx, bullet.vy);
          const side = rotate(dir, Math.PI / 2);
          const wave = Math.sin((1.7 - bullet.life) * 16 + bullet.phase) * 22;
          bullet.x += (bullet.vx + side.x * wave) * dt;
          bullet.y += (bullet.vy + side.y * wave) * dt;
          if (Math.random() < 0.32) addWaveRiffTrail(state, bullet, dir);
        } else {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
        }
        bullet.life -= dt;
      });
      state.hazards.forEach((hazard) => {
        if (hazard.kind === "laser" && hazard.angularVelocity) {
          hazard.angle = (hazard.angle ?? 0) + hazard.angularVelocity * dt;
        }
        if (hazard.kind === "shockwave") {
          hazard.radius += hazard.vx * dt;
        } else {
          hazard.x += hazard.vx * dt;
          hazard.y += hazard.vy * dt;
        }
        hazard.life -= dt;
      });

      updateEnemies(state, dt);
      handleBulletHits(state, stats);
      handlePlayerDamage(state);
      updateSpecials(state, stats, currentSettings, dt);
    }

    state.bullets = state.bullets.filter(
      (bullet) =>
        bullet.life > 0 &&
        bullet.x > -80 &&
        bullet.x < state.width + 80 &&
        bullet.y > -80 &&
        bullet.y < state.height + 80,
    );
    state.hazards = state.hazards.filter((hazard) => hazard.life > 0);
    state.particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    });
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function updateEnemies(state: GameState, dt: number) {
    state.enemies.forEach((enemy) => {
      enemy.pulse += dt * 5;
      const toPlayer = normalize(state.player.x - enemy.x, state.player.y - enemy.y);
      const side = rotate(toPlayer, Math.PI / 2);

      if (enemy.kind === 8) {
        const dist = distance(enemy, state.player);
        const away = dist < 180 ? -28 : 0;
        enemy.x +=
          (toPlayer.x * away + side.x * Math.sin(enemy.pulse * 0.72) * enemy.speed) * dt;
        enemy.y +=
          (toPlayer.y * away + side.y * Math.cos(enemy.pulse * 0.68) * enemy.speed) * dt;
        enemy.x = clamp(enemy.x, 44, state.width - 44);
        enemy.y = clamp(enemy.y, 94, state.height - 44);
        if (Math.random() < 0.04) {
          state.particles.push({
            id: state.nextId++,
            x: enemy.x + (Math.random() - 0.5) * 28,
            y: enemy.y + (Math.random() - 0.5) * 28,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            radius: 12 + Math.random() * 18,
            life: 0.6,
            maxLife: 0.6,
            kind: "rest",
          });
        }
        return;
      }

      if (enemy.kind === 1) {
        const closeEnough = distance(enemy, state.player) < 260;
        enemy.attackClock -= dt;
        if (closeEnough && enemy.attackClock <= 0.62 && !enemy.telegraph) {
          enemy.telegraph = true;
          addRipple(state, enemy.x, enemy.y, 52, "spark");
        }
        if (closeEnough && enemy.attackClock <= 0) {
          fireDistortedNote(state, enemy);
          enemy.attackClock = 2.45 - state.stageIndex * 0.18;
          enemy.telegraph = false;
        }
        const holding = closeEnough && enemy.attackClock < 0.62;
        const forward = holding ? 0 : enemy.speed * 0.7;
        const drift = holding ? 8 : 42;
        enemy.x += (toPlayer.x * forward + side.x * Math.sin(enemy.pulse) * drift) * dt;
        enemy.y += (toPlayer.y * forward + side.y * Math.cos(enemy.pulse) * drift) * dt;
        return;
      }

      if (enemy.kind === 3) {
        const dist = distance(enemy, state.player);
        if (enemy.mode === 0 && dist < 170) {
          enemy.mode = 1;
          enemy.attackClock = 0.5;
          enemy.telegraph = true;
          addRipple(state, enemy.x, enemy.y, 76, "spark");
        }
        if (enemy.mode === 1) {
          enemy.attackClock -= dt;
          if (enemy.attackClock > 0.24) addVinylDistortion(state, enemy);
          if (enemy.attackClock <= 0) {
            enemy.mode = 2;
            enemy.attackClock = 0.38;
            enemy.telegraph = false;
            addRipple(state, enemy.x, enemy.y, 96, "wave");
          }
          return;
        }
        if (enemy.mode === 2) {
          enemy.attackClock -= dt;
          enemy.x += toPlayer.x * enemy.speed * 3.25 * dt;
          enemy.y += toPlayer.y * enemy.speed * 3.25 * dt;
          addVinylDistortion(state, enemy);
          if (enemy.attackClock <= 0) {
            enemy.mode = 3;
            enemy.attackClock = 0.48;
          }
          return;
        }
        if (enemy.mode === 3) {
          enemy.attackClock -= dt;
          enemy.x += side.x * Math.sin(enemy.pulse) * 18 * dt;
          enemy.y += side.y * Math.cos(enemy.pulse) * 18 * dt;
          if (enemy.attackClock <= 0) enemy.mode = 0;
          return;
        }
      }

      if (enemy.kind === 6) {
        const dist = distance(enemy, state.player);
        enemy.attackClock -= dt;
        if (enemy.mode === 2) {
          enemy.attackClock -= dt;
          enemy.x += Math.cos(enemy.pulse) * enemy.speed * 2.45 * dt;
          enemy.y += Math.sin(enemy.pulse) * enemy.speed * 2.45 * dt;
          addSharpAfterimage(state, enemy);
          if (enemy.attackClock <= 0) {
            enemy.mode = 3;
            enemy.attackClock = 0.42;
          }
          return;
        }
        if (enemy.mode === 3) {
          enemy.attackClock -= dt;
          enemy.x += side.x * Math.sin(enemy.pulse * 2) * 22 * dt;
          enemy.y += side.y * Math.cos(enemy.pulse * 2) * 22 * dt;
          if (enemy.attackClock <= 0) {
            enemy.mode = 0;
            enemy.attackClock = 1.45 + Math.random() * 0.65;
          }
          return;
        }
        if ((enemy.attackClock <= 0.42 || dist < 145) && enemy.mode === 0) {
          enemy.mode = 1;
          enemy.attackClock = 0.34;
          enemy.telegraph = true;
          enemy.pulse = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
          addRipple(state, enemy.x, enemy.y, 64, "spark");
        }
        if (enemy.mode === 1) {
          enemy.attackClock -= dt;
          enemy.x += side.x * Math.sin(enemy.pulse * 6) * 14 * dt;
          enemy.y += side.y * Math.cos(enemy.pulse * 6) * 14 * dt;
          addSharpAfterimage(state, enemy);
          if (enemy.attackClock <= 0) {
            fireSharpCut(state, enemy);
            enemy.mode = 2;
            enemy.attackClock = 0.28;
          }
          return;
        }
        if (enemy.attackClock <= 0) {
          enemy.mode = 1;
          enemy.attackClock = 0.34;
          enemy.telegraph = false;
          enemy.pulse = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
        }

        const cutAngle = Math.atan2(toPlayer.y, toPlayer.x);
        const slash = { x: Math.cos(cutAngle + Math.sin(enemy.pulse) * 0.55), y: Math.sin(cutAngle + Math.sin(enemy.pulse) * 0.55) };
        enemy.x += (toPlayer.x * enemy.speed * 0.28 + slash.x * enemy.speed * 0.24 + side.x * Math.sin(enemy.pulse * 3.2) * 28) * dt;
        enemy.y += (toPlayer.y * enemy.speed * 0.28 + slash.y * enemy.speed * 0.24 + side.y * Math.cos(enemy.pulse * 3.4) * 28) * dt;
        if (Math.random() < 0.32) addSharpAfterimage(state, enemy);
        enemy.x = clamp(enemy.x, 34, state.width - 34);
        enemy.y = clamp(enemy.y, 82, state.height - 34);
        return;
      }

      const forward = enemy.speed * 0.58;
      const drift = 46;
      enemy.x += (toPlayer.x * forward + side.x * Math.sin(enemy.pulse) * drift) * dt;
      enemy.y += (toPlayer.y * forward + side.y * Math.cos(enemy.pulse) * drift) * dt;
    });
    separateEnemies(state);
  }

  function separateEnemies(state: GameState) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < state.enemies.length; i += 1) {
        const a = state.enemies[i];
        if (a.kind === 8) continue;
        for (let j = i + 1; j < state.enemies.length; j += 1) {
          const b = state.enemies[j];
          if (b.kind === 8) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minDist = a.radius + b.radius + 10;
          if (dist >= minDist) continue;
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    for (const enemy of state.enemies) {
      enemy.x = clamp(enemy.x, enemy.radius + 18, state.width - enemy.radius - 18);
      enemy.y = clamp(enemy.y, 72 + enemy.radius, state.height - enemy.radius - 18);
    }
  }

  function addVinylDistortion(state: GameState, enemy: Enemy) {
    if (Math.random() > 0.45) return;
    state.particles.push({
      id: state.nextId++,
      x: enemy.x,
      y: enemy.y,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      radius: enemy.radius * (1.3 + Math.random() * 0.8),
      life: 0.28,
      maxLife: 0.28,
      kind: "afterimage",
    });
  }

  function addSharpAfterimage(state: GameState, enemy: Enemy) {
    if (Math.random() > 0.58) return;
    state.particles.push({
      id: state.nextId++,
      x: enemy.x,
      y: enemy.y,
      vx: -Math.cos(enemy.pulse) * 34 + (Math.random() - 0.5) * 14,
      vy: -Math.sin(enemy.pulse) * 34 + (Math.random() - 0.5) * 14,
      radius: enemy.radius * (0.95 + Math.random() * 0.35),
      life: 0.22,
      maxLife: 0.22,
      kind: "afterimage",
    });
  }

  function addRestBurst(state: GameState, x: number, y: number) {
    addRipple(state, x, y, 92, "rest");
    addRipple(state, x, y, 148, "rest");
    for (let i = 0; i < 18; i += 1) {
      const angle = (Math.PI * 2 * i) / 18;
      const speed = 18 + Math.random() * 48;
      state.particles.push({
        id: state.nextId++,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5 + Math.random() * 13,
        life: 0.72,
        maxLife: 0.72,
        kind: "rest",
      });
    }
  }

  function fireDistortedNote(state: GameState, enemy: Enemy) {
    const aim = normalize(state.player.x - enemy.x, state.player.y - enemy.y);
    [-0.22, 0, 0.22].forEach((angle) => {
      const dir = rotate(aim, angle);
      state.hazards.push({
        id: state.nextId++,
        x: enemy.x,
        y: enemy.y,
        vx: dir.x * (132 + state.stageIndex * 14),
        vy: dir.y * (132 + state.stageIndex * 14),
        radius: 4.5,
        damage: 8 + state.stageIndex,
        life: 5.2,
      });
    });
    addRipple(state, enemy.x, enemy.y, 78, "wave");
    audioRef.current.wavePulse();
  }

  function fireSharpCut(state: GameState, enemy: Enemy) {
    addRipple(state, enemy.x, enemy.y, 84, "wave");
    audioRef.current.wavePulse();
  }

  function updateSpecials(
    state: GameState,
    stats: BuildStats,
    currentSettings: Settings,
    dt: number,
  ) {
    if (stats.pulse) {
      state.pulseClock -= dt;
      if (state.pulseClock <= 0) {
        state.pulseClock = 7.5;
        addRipple(state, state.player.x, state.player.y, 700, "wave");
        state.enemies.forEach((enemy) => (enemy.hp -= 42));
        if (state.boss) state.boss.hp -= 55;
        state.shake = currentSettings.reducedMotion ? 0 : 1.4;
        audioRef.current.wavePulse();
      }
    }

    if (stats.aura) {
      state.auraClock -= dt;
      if (state.auraClock <= 0) {
        state.auraClock = 0.85;
        const target =
          state.enemies
            .filter((enemy) => distance(enemy, state.player) < 190)
            .sort((a, b) => distance(a, state.player) - distance(b, state.player))[0] ??
          null;
        if (target) {
          target.hp -= 30;
          addRipple(state, target.x, target.y, 46, "spark");
        }
      }
    }

    collectDeadEnemies(state, stats);
    if (state.boss && state.boss.hp <= 0) {
      finishBoss(state);
    }
  }

  function handleBulletHits(state: GameState, stats: BuildStats) {
    const deadBullets = new Set<number>();

    for (const bullet of state.bullets) {
      for (const enemy of state.enemies) {
        if (distance(bullet, enemy) > bullet.radius + enemy.radius) continue;
        enemy.hp -= bullet.damage;
        if (bullet.waveRiff) addWaveRiffHit(state, bullet.x, bullet.y, normalize(bullet.vx, bullet.vy));
        else addRipple(state, enemy.x, enemy.y, 28, "spark");
        audioRef.current.hit();
        if (bullet.canSplit) splitBullet(state, bullet, stats);
        bullet.pierce -= 1;
        if (bullet.pierce < 0) deadBullets.add(bullet.id);
        break;
      }

      if (
        state.boss &&
        !deadBullets.has(bullet.id) &&
        distance(bullet, state.boss) <= bullet.radius + state.boss.radius
      ) {
        state.boss.hp -= bullet.damage;
        if (bullet.waveRiff) addWaveRiffHit(state, bullet.x, bullet.y, normalize(bullet.vx, bullet.vy));
        else addRipple(state, bullet.x, bullet.y, 34, "spark");
        audioRef.current.hit();
        if (bullet.canSplit) splitBullet(state, bullet, stats);
        bullet.pierce -= 1;
        if (bullet.pierce < 0) deadBullets.add(bullet.id);
      }
    }

    state.bullets = state.bullets.filter((bullet) => !deadBullets.has(bullet.id));
    collectDeadEnemies(state, stats);
  }

  function collectDeadEnemies(state: GameState, stats: BuildStats) {
    const survivors: Enemy[] = [];
    for (const enemy of state.enemies) {
      if (enemy.hp > 0) {
        survivors.push(enemy);
        continue;
      }
      if (enemy.kind === 8) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 10);
        addRestBurst(state, enemy.x, enemy.y);
        audioRef.current.loot(false);
        continue;
      }
      state.waveKills += 1;
      state.score += 30 + (state.stageIndex + 1) * 14 + state.runLoop * 5;
      checkRestSpawn(state);
      addRipple(state, enemy.x, enemy.y, 58, "ripple");
      audioRef.current.kill();
      if (stats.lifesteal) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2.5);
      }
      if (stats.killExplosion) {
        state.enemies.forEach((other) => {
          if (other !== enemy && distance(other, enemy) < 82) other.hp -= 28;
        });
        if (state.boss && distance(state.boss, enemy) < 110) state.boss.hp -= 24;
        addRipple(state, enemy.x, enemy.y, 92, "wave");
      }
    }
    state.enemies = survivors;
  }

  function handlePlayerDamage(state: GameState) {
    if (state.player.invincible > 0) return;
    for (const enemy of state.enemies) {
      if (enemy.kind === 8) continue;
      if (distance(state.player, enemy) <= state.player.radius + enemy.radius) {
        damagePlayer(state, enemy.damage);
        enemy.hp -= 999;
        return;
      }
    }

    if (
      state.boss &&
      distance(state.player, state.boss) <= state.player.radius + state.boss.radius
    ) {
      damagePlayer(state, 18);
      return;
    }

    for (const hazard of state.hazards) {
      if (hazard.kind === "noiseZone") continue;
      const hit =
        hazard.kind === "laser"
          ? laserHitsPlayer(hazard, state.player)
          : hazard.kind === "shockwave"
            ? shockwaveHitsPlayer(hazard, state.player)
            : distance(state.player, hazard) <= state.player.radius + hazard.radius;
      if (hit) {
        damagePlayer(state, hazard.damage);
        if (hazard.kind !== "laser" && hazard.kind !== "shockwave") hazard.life = 0;
        return;
      }
    }
  }

  function shockwaveHitsPlayer(hazard: Hazard, player: Player) {
    const centerAngle = hazard.angle ?? Math.PI / 2;
    const spread = hazard.length ?? Math.PI * 0.9;
    const width = hazard.width ?? hazard.radius * 0.22;
    const dx = player.x - hazard.x;
    const dy = player.y - hazard.y;
    const dist = Math.hypot(dx, dy);
    const direction = Math.atan2(dy, dx);
    const withinArc = Math.abs(angleDelta(direction, centerAngle)) <= spread / 2 + 0.05;
    const withinRing = Math.abs(dist - hazard.radius) <= width / 2 + player.radius * 0.72;
    return withinArc && withinRing;
  }

  function laserHitsPlayer(hazard: Hazard, player: Player) {
    const angle = hazard.angle ?? 0;
    const length = hazard.length ?? 0;
    const width = hazard.width ?? hazard.radius * 2;
    const dx = player.x - hazard.x;
    const dy = player.y - hazard.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const perpendicular = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return along >= 0 && along <= length && perpendicular <= width / 2 + player.radius * 0.72;
  }

  function damagePlayer(state: GameState, damage: number) {
    state.player.hp -= damage;
    state.player.invincible = 0.85;
    state.shake = settings.reducedMotion ? 0 : 1.25;
    addRipple(state, state.player.x, state.player.y, 70, "ripple");
    audioRef.current.playerHit();
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.gameOver = true;
      state.bannerText = "SIGNAL LOST";
      state.bannerClock = 5;
    }
  }

  function finishBoss(state: GameState) {
    const stageDrop = byId.get(STAGES[state.stageIndex].dropItemId) ?? null;
    const result: LootResult = {
      item: stageDrop,
      rarity: stageDrop?.rarity ?? "Common",
    };
    state.score += 900 + (state.stageIndex + 1) * 360 + state.runLoop * 120;
    onStageClear(state.stageIndex, state.score);
    state.boss = null;
    state.enemies = [];
    state.hazards = [];
    state.bullets = [];
    state.bannerText =
      state.stageIndex === 3
        ? "旋律だけが、まだ世界を覚えている。"
        : state.stageIndex === 2
        ? "THE BEAT FALLS SILENT"
        : result.item?.rarity === "Legendary"
          ? "LEGENDARY DROP"
          : "DROP FOUND";
    state.bannerClock = state.stageIndex >= 2 ? 2.8 : 2.4;
    state.shake =
      state.stageIndex >= 2
        ? settings.reducedMotion
          ? 0
          : state.stageIndex === 3
            ? 1.4
            : 1.7
        : result.item?.rarity === "Legendary" && !settings.reducedMotion
          ? 3
          : 1;
    addRipple(state, state.width / 2, state.height / 2, state.stageIndex >= 2 ? 420 : 280, "wave");
    if (state.stageIndex === 2 || state.stageIndex === 3) {
      for (let i = 0; i < 28; i += 1) {
        const angle = (Math.PI * 2 * i) / 28;
        const speed = 22 + Math.random() * 90;
        state.particles.push({
          id: state.nextId++,
          x: state.width / 2 + Math.cos(angle) * 18,
          y: state.height / 2 + Math.sin(angle) * 18,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 8 + Math.random() * 26,
          life: 1.1,
          maxLife: 1.1,
          kind: i % 3 === 0 ? "wave" : "spark",
        });
      }
      audioRef.current.stop();
    }
    audioRef.current.loot(result.item?.rarity === "Legendary");
    onLoot(result.item);
    lootRef.current = result;
    setLoot(result);
  }

  function spawnBullet(
    state: GameState,
    aim: Vec,
    damage: number,
    stats: BuildStats,
  ) {
    const speed = 540;
    const base = {
      radius: stats.bulletRadius,
      damage,
      life: 1.7,
      pierce: stats.pierce,
      canSplit: stats.split,
      waveRiff: stats.waveRiff,
    };
    const angles = stats.split ? [-0.07, 0.07] : [0];
    angles.forEach((angle) => {
      const dir = rotate(aim, angle);
      const bulletX = state.player.x + dir.x * 18;
      const bulletY = state.player.y + dir.y * 18;
      state.bullets.push({
        id: state.nextId++,
        x: bulletX,
        y: bulletY,
        vx: dir.x * speed,
        vy: dir.y * speed,
        phase: Math.random() * Math.PI * 2,
        ...base,
      });
      if (stats.waveRiff) addWaveRiffMuzzle(state, bulletX, bulletY, Math.atan2(dir.y, dir.x));
    });
  }

  function splitBullet(state: GameState, bullet: Bullet, stats: BuildStats) {
    if (!bullet.canSplit) return;
    const current = normalize(bullet.vx, bullet.vy);
    [-0.58, 0.58].forEach((angle) => {
      const dir = rotate(current, angle);
      state.bullets.push({
        id: state.nextId++,
        x: bullet.x,
        y: bullet.y,
        vx: dir.x * 390,
        vy: dir.y * 390,
        radius: Math.max(3, stats.bulletRadius - 1),
        damage: bullet.damage * 0.42,
        life: 0.72,
        pierce: Math.max(0, stats.pierce - 1),
        canSplit: false,
        waveRiff: bullet.waveRiff,
        phase: bullet.phase + angle,
      });
    });
    bullet.canSplit = false;
  }

  function addRipple(
    state: GameState,
    x: number,
    y: number,
    radius: number,
    kind: Particle["kind"],
  ) {
    state.particles.push({
      id: state.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      life: 0.7,
      maxLife: 0.7,
      kind,
    });
  }

  function addWaveRiffMuzzle(state: GameState, x: number, y: number, angle: number) {
    addRipple(state, x, y, 42, "riff");
    const side = { x: -Math.sin(angle), y: Math.cos(angle) };
    for (let i = 0; i < 4; i += 1) {
      state.particles.push({
        id: state.nextId++,
        x: x + side.x * (i - 1.5) * 4,
        y: y + side.y * (i - 1.5) * 4,
        vx: Math.cos(angle) * (18 + i * 5) + side.x * (i - 1.5) * 12,
        vy: Math.sin(angle) * (18 + i * 5) + side.y * (i - 1.5) * 12,
        radius: 3 + i,
        life: 0.24,
        maxLife: 0.24,
        kind: "riff",
      });
    }
  }

  function addWaveRiffTrail(state: GameState, bullet: Bullet, dir: Vec) {
    state.particles.push({
      id: state.nextId++,
      x: bullet.x - dir.x * 18,
      y: bullet.y - dir.y * 18,
      vx: -dir.x * 22 + (Math.random() - 0.5) * 10,
      vy: -dir.y * 22 + (Math.random() - 0.5) * 10,
      radius: bullet.radius * (1.2 + Math.random() * 0.8),
      life: 0.22,
      maxLife: 0.22,
      kind: "riff",
    });
  }

  function addWaveRiffHit(state: GameState, x: number, y: number, dir: Vec) {
    addRipple(state, x, y, 46, "riff");
    const side = rotate(dir, Math.PI / 2);
    for (let i = 0; i < 6; i += 1) {
      const spread = i - 2.5;
      state.particles.push({
        id: state.nextId++,
        x,
        y,
        vx: side.x * spread * 18 - dir.x * (20 + i * 5),
        vy: side.y * spread * 18 - dir.y * (20 + i * 5),
        radius: 3 + Math.random() * 9,
        life: 0.34,
        maxLife: 0.34,
        kind: "riff",
      });
    }
  }

  function addDodgeAfterimage(state: GameState) {
    state.particles.push({
      id: state.nextId++,
      x: state.player.x,
      y: state.player.y,
      vx: -state.player.dodgeVx * 0.035,
      vy: -state.player.dodgeVy * 0.035,
      radius: state.player.radius + 8,
      life: 0.34,
      maxLife: 0.34,
      kind: "afterimage",
    });
  }
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  build: BuildStats,
  settings: Settings,
  elapsed: number,
) {
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;

  ctx.save();
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.translate(shakeX, shakeY);
  drawBackground(ctx, state, settings, elapsed);
  drawParticles(ctx, state);
  drawAim(ctx, state, settings);
  if (state.boss) drawBossTelegraph(ctx, state, state.boss);
  drawBullets(ctx, state, build);
  drawHazards(ctx, state);
  drawEnemies(ctx, state, elapsed);
  if (state.boss) drawBoss(ctx, state.boss, state, elapsed);
  drawPlayer(ctx, state.player, build, elapsed);
  drawDodgeDistortion(ctx, state, elapsed);
  drawStageAtmosphere(ctx, state, elapsed);
  drawBanner(ctx, state);
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  settings: Settings,
  elapsed: number,
) {
  const silence = state.silenceAmount;
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.strokeStyle = `rgba(255,255,255,${0.08 * (1 - silence * 0.7)})`;
  ctx.lineWidth = 1;
  for (let y = 96; y < state.height; y += 54) {
    const collapse =
      state.stageIndex === 2
        ? Math.sin(elapsed * 1.7 + y * 0.02) * silence * 42
        : state.stageIndex === 3
          ? Math.sin(elapsed * 3.1 + y * 0.041) * silence * 28 +
            (Math.sin(elapsed * 9 + y * 0.13) > 0.82 ? silence * 42 : 0)
          : 0;
    ctx.beginPath();
    ctx.moveTo(collapse, y);
    ctx.lineTo(state.width - collapse * 0.4, y + collapse * 0.08);
    ctx.stroke();
  }

  const cx = state.width - 150;
  const cy = state.height - 130;
  const rotation = settings.reducedMotion ? 0 : elapsed * 0.35;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - silence)})`;
  for (let r = 28; r <= 115; r += 18) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-110, 0);
  ctx.lineTo(110, 0);
  ctx.stroke();
  ctx.restore();

  if (silence < 0.72) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * (1 - silence * 1.25)})`;
    ctx.beginPath();
    for (let x = 0; x <= state.width; x += 16) {
      const missing =
        (state.stageIndex === 2 && Math.sin(x * 0.04 + elapsed * 1.5) < silence - 0.28) ||
        (state.stageIndex === 3 && Math.sin(x * 0.055 + elapsed * 3.4) > 0.76 - silence * 0.22);
      const y =
        48 +
        Math.sin(x * 0.025 + elapsed * 1.3) * 11 +
        (state.stageIndex === 3 ? Math.sin(x * 0.15 + elapsed * 8) * silence * 8 : 0);
      if (x === 0 || missing) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawStageAtmosphere(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  elapsed: number,
) {
  if (state.stageIndex === 3) {
    const noise = state.silenceAmount;
    ctx.save();
    ctx.fillStyle = `rgba(5,5,5,${0.12 + noise * 0.18})`;
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + noise * 0.16})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const y = ((elapsed * (28 + i * 0.8) + i * 47) % (state.height + 80)) - 40;
      const offset = Math.sin(elapsed * 4 + i) * noise * 34;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.width * 0.22 + offset, y + Math.sin(i) * 8);
      ctx.moveTo(state.width * 0.34 + offset, y + 2);
      ctx.lineTo(state.width, y + Math.sin(elapsed + i) * 5);
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(255,255,255,${0.04 + noise * 0.1})`;
    for (let i = 0; i < 7; i += 1) {
      const x = ((i * 173 + elapsed * 21) % (state.width + 180)) - 90;
      const y = 110 + ((i * 71) % Math.max(1, state.height - 190));
      ctx.strokeRect(x, y, 62 + (i % 3) * 24, 24 + (i % 2) * 16);
      for (let line = 0; line < 3; line += 1) {
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 7 + line * 6);
        ctx.lineTo(x + 54 + (i % 3) * 24, y + 7 + line * 6 + Math.sin(elapsed * 3 + line) * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (state.stageIndex !== 2) return;
  const silence = state.silenceAmount;

  ctx.save();
  ctx.fillStyle = `rgba(5,5,5,${silence * 0.34})`;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.strokeStyle = `rgba(255,255,255,${0.08 + silence * 0.13})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i += 1) {
    const y = ((elapsed * 16 + i * 83) % (state.height + 140)) - 70;
    const drift = Math.sin(elapsed * 0.7 + i) * silence * 80;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width * 0.42 + drift, y + silence * 24);
    ctx.moveTo(state.width * 0.58 + drift, y - silence * 18);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }

  if (state.freezeClock > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(state.width / 2, state.height / 2, 130 + Math.sin(elapsed * 10) * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(state.width / 2 - 42, state.height / 2);
    ctx.lineTo(state.width / 2 + 42, state.height / 2);
    ctx.moveTo(state.width / 2, state.height / 2 - 42);
    ctx.lineTo(state.width / 2, state.height / 2 + 42);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDodgeDistortion(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  elapsed: number,
) {
  if (state.player.dodgeTime <= 0) return;
  const alpha = clamp(state.player.dodgeTime / 0.2, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.1 + alpha * 0.18})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = state.player.y - 26 + i * 13;
    const stretch = 42 + i * 10;
    const noise = Math.sin(elapsed * 24 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(state.player.x - stretch + noise, y);
    ctx.lineTo(state.player.x + stretch * 0.7 + noise, y + Math.sin(elapsed * 12 + i) * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBossTelegraph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: Boss,
) {
  if (boss.telegraphClock <= 0 || boss.telegraphDuration <= 0) return;
  const t = boss.telegraphClock / boss.telegraphDuration;
  const alpha = 0.18 + (1 - t) * 0.28;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.fillStyle = `rgba(255,255,255,${0.025 + (1 - t) * 0.035})`;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.arc(boss.x, boss.y, boss.radius + 18 + (1 - t) * 18, 0, Math.PI * 2);
  ctx.stroke();

  if (state.stageIndex === 0) {
    if (boss.pattern === 2) {
      drawWaveWallTelegraph(ctx, state, boss, alpha, 24);
      ctx.restore();
      return;
    }
    const offsets = boss.pattern === 1 ? [-0.24, 0, 0.24] : [0];
    offsets.forEach((offset) =>
      drawTelegraphLine(
        ctx,
        boss.x,
        boss.y,
        boss.targetAngle + offset,
        Math.hypot(state.width, state.height),
        alpha,
        boss.pattern === 1 ? 18 : 20,
      ),
    );
  } else if (state.stageIndex === 1) {
    if (boss.pattern === 4) {
      drawWaveWallTelegraph(ctx, state, boss, alpha, 26);
    } else if (boss.pattern === 1) {
      const lanes = [0.22, 0.38, 0.54, 0.7];
      const gap = boss.rhythmIndex % lanes.length;
      for (let i = 0; i < lanes.length; i += 1) {
        if (i === gap) continue;
        const y = state.height * lanes[i];
        drawTelegraphLine(
          ctx,
          boss.x,
          boss.y,
          Math.atan2(y - boss.y, state.width * 0.5 - boss.x),
          Math.hypot(state.width, state.height),
          alpha * 1.02,
          14,
        );
      }
    } else if (boss.pattern === 2) {
      [-0.28, 0, 0.28].forEach((offset) =>
        drawTelegraphLine(
          ctx,
          boss.x,
          boss.y,
          boss.targetAngle + offset,
          Math.hypot(state.width, state.height),
          alpha * 1.1,
          12,
        ),
      );
    } else if (boss.pattern === 3) {
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI * 0.82 + (Math.PI * 0.64 * i) / 4;
        drawTelegraphLine(ctx, boss.x, boss.y, angle, Math.hypot(state.width, state.height), alpha * 0.88, 12);
      }
    } else {
      [-0.34, -0.17, 0, 0.17, 0.34].forEach((offset) => {
        drawTelegraphLine(
          ctx,
          boss.x,
          boss.y,
          boss.targetAngle + offset,
          Math.hypot(state.width, state.height),
          alpha * 0.9,
          9,
        );
      });
    }
  } else if (state.stageIndex === 2) {
    if (boss.pattern === 1) {
      const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
      drawShockwaveTelegraph(
        ctx,
        boss.x + swing * boss.radius * 0.16,
        boss.y + boss.radius * 0.2,
        Math.PI / 2 + swing * 0.54,
        Math.PI * 0.52,
        boss.radius * 0.42,
        boss.radius * 1.62,
        alpha * 1.12,
      );
    } else if (boss.pattern === 2) {
      drawBeatLineTelegraph(ctx, state, boss, alpha);
    } else if (boss.pattern === 3) {
      drawBeatScatterTelegraph(ctx, state, boss, alpha);
    } else if (boss.pattern === 4) {
      const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
      drawShockwaveTelegraph(
        ctx,
        boss.x,
        boss.y + boss.radius * 0.44,
        Math.PI / 2 + swing * 0.48,
        Math.PI * 0.72,
        boss.radius * 0.46,
        boss.radius * 1.95,
        alpha * 1.18,
      );
      drawBeatLineTelegraph(ctx, state, boss, alpha * 0.75);
      drawBeatScatterTelegraph(ctx, state, boss, alpha * 0.58);
    } else {
      drawShockwaveTelegraph(
        ctx,
        boss.x,
        boss.y + boss.radius * 0.48,
        Math.PI / 2,
        Math.PI * 0.92,
        boss.radius * 0.38,
        boss.radius * 2.15,
        alpha,
      );
    }
  } else {
    drawLostScoreTelegraph(ctx, state, boss, alpha);
  }
  ctx.restore();
}

function drawLostScoreTelegraph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: Boss,
  alpha: number,
) {
  const enrage = boss.hp / boss.maxHp < 0.5 ? 1 : 0;

  if (boss.pattern === 1 || boss.pattern === 4) {
    const radius = boss.pattern === 4 ? 92 + enrage * 20 : 78 + enrage * 18;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.42)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.05})`;
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.72})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(boss.targetX, boss.targetY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(boss.targetX, boss.targetY, radius * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (boss.pattern === 0 || boss.pattern === 2 || boss.pattern === 3 || boss.pattern === 4) {
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI * 0.82 + (Math.PI * 0.64 * i) / Math.max(1, count - 1);
      drawTelegraphLine(ctx, boss.x, boss.y + boss.radius * 0.42, angle, Math.hypot(state.width, state.height), alpha * 0.68, 8);
    }
  }
}

function drawShockwaveTelegraph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  spread: number,
  startRadius: number,
  endRadius: number,
  alpha: number,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,255,255,0.52)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.26})`;
  ctx.lineWidth = 16;
  for (let i = 0; i < 3; i += 1) {
    const t = i / 2;
    const radius = startRadius + (endRadius - startRadius) * t;
    ctx.beginPath();
    ctx.arc(x, y, radius, angle - spread / 2, angle + spread / 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.setLineDash([22, 14]);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.84})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, endRadius, angle - spread / 2, angle + spread / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBeatLineTelegraph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: Boss,
  alpha: number,
) {
  const enrage = boss.hp / boss.maxHp < 0.5 ? 1 : 0;
  const count = enrage > 0 ? 7 : 5;
  const gap = boss.rhythmIndex % count;
  const padding = 58;
  for (let i = 0; i < count; i += 1) {
    if (i === gap || (enrage === 0 && i === gap + 1)) continue;
    const x = padding + ((state.width - padding * 2) * i) / Math.max(1, count - 1);
    drawTelegraphLine(ctx, x, 58, Math.PI / 2, state.height, alpha * 0.95, 15);
  }
}

function drawBeatScatterTelegraph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: Boss,
  alpha: number,
) {
  const count = 12;
  const open = boss.rhythmIndex % count;
  for (let i = 0; i < count; i += 1) {
    if (i === open || i === (open + 1) % count) continue;
    drawTelegraphLine(
      ctx,
      boss.x,
      boss.y,
      (Math.PI * 2 * i) / count,
      Math.hypot(state.width, state.height),
      alpha * 0.62,
      8,
    );
  }
}

function drawWaveWallTelegraph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: Boss,
  alpha: number,
  width: number,
) {
  const y = boss.y + boss.radius * 1.35;
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.58)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.36})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(-20, y);
  ctx.lineTo(state.width + 20, y);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.setLineDash([20, 12]);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, y);
  ctx.lineTo(state.width + 20, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.42})`;
  ctx.lineWidth = 1;
  for (let x = 18; x < state.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, y - width * 0.72);
    ctx.lineTo(x + 14, y);
    ctx.lineTo(x, y + width * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTelegraphLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  alpha: number,
  width = 10,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,255,255,0.58)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.24})`;
  ctx.lineWidth = width * 1.55;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.82})`;
  ctx.lineWidth = Math.max(2, width * 0.18);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.34})`;
  ctx.lineWidth = 1;
  for (let i = 90; i < length; i += 120) {
    const cx = x + Math.cos(angle) * i;
    const cy = y + Math.sin(angle) * i;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    ctx.beginPath();
    ctx.moveTo(cx - nx * width * 0.55, cy - ny * width * 0.55);
    ctx.lineTo(cx + nx * width * 0.55, cy + ny * width * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  settings: Settings,
) {
  if (!settings.showAimLine) return;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(state.player.x, state.player.y);
  ctx.lineTo(state.mouse.x, state.mouse.y);
  ctx.stroke();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  build: BuildStats,
  elapsed: number,
) {
  const flash = player.invincible > 0 && Math.floor(elapsed * 18) % 2 === 0;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.strokeStyle = flash ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.95)";
  ctx.fillStyle = "#050505";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.beginPath();
  ctx.arc(0, 0, 23 + Math.sin(elapsed * 4) * 2, 0, Math.PI * 2);
  ctx.stroke();

  if (player.invincible > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + Math.min(0.22, player.invincible * 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 32 + Math.sin(elapsed * 18) * 3, 25, Math.sin(elapsed * 6) * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (build.aura) {
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 74 + Math.sin(elapsed * 2) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState, build: BuildStats) {
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (const bullet of state.bullets) {
    const dir = normalize(bullet.vx, bullet.vy);
    if (bullet.waveRiff) {
      drawWaveRiffBullet(ctx, bullet, dir);
      continue;
    }
    if (build.fracturedRiff) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      const side = rotate(dir, Math.PI / 2);
      [-4, 4].forEach((offset) => {
        ctx.beginPath();
        ctx.moveTo(bullet.x - dir.x * 34 + side.x * offset, bullet.y - dir.y * 34 + side.y * offset);
        ctx.lineTo(bullet.x + dir.x * 8 + side.x * offset, bullet.y + dir.y * 8 + side.y * offset);
        ctx.stroke();
      });
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(bullet.x - dir.x * 44, bullet.y - dir.y * 44);
      ctx.lineTo(bullet.x + dir.x * 12, bullet.y + dir.y * 12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bullet.x - dir.x * 18, bullet.y - dir.y * 18);
    ctx.lineTo(bullet.x + dir.x * 7, bullet.y + dir.y * 7);
    ctx.stroke();
  }
}

function drawWaveRiffBullet(ctx: CanvasRenderingContext2D, bullet: Bullet, dir: Vec) {
  const side = rotate(dir, Math.PI / 2);
  const width = 34 + bullet.radius * 2.4;
  const amp = 4.8 + bullet.radius * 0.32;
  const phase = bullet.phase + bullet.life * 9;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 10;

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = bullet.radius * 1.85;
  drawWaveRiffPath(ctx, bullet.x, bullet.y, dir, side, width, amp, phase);
  ctx.stroke();

  ctx.shadowBlur = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.lineWidth = 1.6;
  drawWaveRiffPath(ctx, bullet.x, bullet.y, dir, side, width, amp, phase);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  [-1, 1].forEach((offset) => {
    drawWaveRiffPath(ctx, bullet.x - dir.x * 8, bullet.y - dir.y * 8, dir, side, width * 0.72, amp * 0.55, phase + offset * 0.8, offset * 4);
    ctx.stroke();
  });
  ctx.restore();
}

function drawWaveRiffPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: Vec,
  side: Vec,
  width: number,
  amp: number,
  phase: number,
  offset = 0,
) {
  ctx.beginPath();
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const forward = -width * 0.62 + t * width;
    const wave = Math.sin(t * Math.PI * 2.2 + phase) * amp + offset;
    const px = x + dir.x * forward + side.x * wave;
    const py = y + dir.y * forward + side.y * wave;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

function drawHazards(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const hazard of state.hazards) {
    if (hazard.kind === "laser") {
      drawLaser(ctx, hazard);
      continue;
    }
    if (hazard.kind === "wave") {
      drawWaveHazard(ctx, hazard);
      continue;
    }
    if (hazard.kind === "shockwave") {
      drawShockwaveHazard(ctx, hazard);
      continue;
    }
    if (hazard.kind === "noiseZone") {
      drawNoiseZone(ctx, hazard);
      continue;
    }
    ctx.strokeStyle = "rgba(255,255,255,0.46)";
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hazard.x - 5, hazard.y);
    ctx.quadraticCurveTo(hazard.x, hazard.y - 8, hazard.x + 5, hazard.y);
    ctx.stroke();
  }
}

function drawNoiseZone(ctx: CanvasRenderingContext2D, hazard: Hazard) {
  const alpha = clamp(hazard.life / 0.55, 0, 1);
  ctx.save();
  ctx.translate(hazard.x, hazard.y);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 * alpha})`;
  ctx.fillStyle = `rgba(255,255,255,${0.025 * alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.16 * alpha})`;
  for (let i = 0; i < 8; i += 1) {
    const y = -hazard.radius + ((hazard.life * 40 + i * 17) % (hazard.radius * 2));
    ctx.beginPath();
    ctx.moveTo(-hazard.radius * 0.82, y);
    ctx.lineTo(hazard.radius * 0.82, y + Math.sin(hazard.life * 10 + i) * 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShockwaveHazard(ctx: CanvasRenderingContext2D, hazard: Hazard) {
  const angle = hazard.angle ?? Math.PI / 2;
  const spread = hazard.length ?? Math.PI * 0.9;
  const width = hazard.width ?? 14;
  const alpha = clamp(hazard.life / 0.42, 0, 1);
  const seed = hazard.vy ?? 0;
  const start = angle - spread / 2;
  const end = angle + spread / 2;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(255,255,255,${0.2 * alpha})`;
  ctx.lineWidth = width * 1.8;
  ctx.beginPath();
  ctx.arc(hazard.x, hazard.y, hazard.radius, start, end);
  ctx.stroke();

  ctx.shadowBlur = 8;
  ctx.strokeStyle = `rgba(255,255,255,${0.62 * alpha})`;
  ctx.lineWidth = Math.max(2.2, width * 0.25);
  ctx.beginPath();
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = start + spread * t;
    const wave = Math.sin(t * Math.PI * 9 + hazard.life * 8 + seed) * 3.2;
    const r = hazard.radius + wave;
    const x = hazard.x + Math.cos(a) * r;
    const y = hazard.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,255,255,${0.24 * alpha})`;
  ctx.lineWidth = 1;
  for (let offset = -width * 0.7; offset <= width * 0.7; offset += width * 0.7) {
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, Math.max(1, hazard.radius + offset), start, end);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaveHazard(ctx: CanvasRenderingContext2D, hazard: Hazard) {
  const angle = hazard.angle ?? 0;
  const pulse = Math.sin(hazard.life * 9 + hazard.id) * 3;
  const width = hazard.width ?? hazard.radius * 2.2;

  ctx.save();
  ctx.translate(hazard.x, hazard.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = 1.6;
  ctx.shadowColor = "rgba(255,255,255,0.34)";
  ctx.shadowBlur = 8;

  ctx.beginPath();
  for (let i = 0; i <= 7; i += 1) {
    const t = i / 7;
    const x = -width * 0.5 + t * width;
    const y = Math.sin(t * Math.PI * 2.4 + hazard.life * 10) * (hazard.radius * 0.42 + pulse * 0.18);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  for (let r = 1.05; r <= 1.65; r += 0.3) {
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.32 * r, hazard.radius * 0.68 * r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLaser(ctx: CanvasRenderingContext2D, hazard: Hazard) {
  const angle = hazard.angle ?? 0;
  const length = hazard.length ?? 900;
  const width = hazard.width ?? 16;
  const fade = clamp(hazard.life / 0.18, 0, 1);
  const x2 = hazard.x + Math.cos(angle) * length;
  const y2 = hazard.y + Math.sin(angle) * length;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,255,255,0.72)";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = `rgba(255,255,255,${0.2 * fade})`;
  ctx.lineWidth = width * 3.2;
  ctx.beginPath();
  ctx.moveTo(hazard.x, hazard.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.strokeStyle = `rgba(255,255,255,${0.58 * fade})`;
  ctx.lineWidth = width * 1.18;
  ctx.beginPath();
  ctx.moveTo(hazard.x, hazard.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(5,5,5,${0.45 * fade})`;
  ctx.lineWidth = Math.max(2, width * 0.52);
  ctx.beginPath();
  ctx.moveTo(hazard.x, hazard.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,255,255,${0.98 * fade})`;
  ctx.lineWidth = Math.max(3, width * 0.22);
  ctx.beginPath();
  ctx.moveTo(hazard.x, hazard.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,255,255,${0.26 * fade})`;
  ctx.lineWidth = 1;
  for (let i = 120; i < length; i += 150) {
    const cx = hazard.x + Math.cos(angle) * i;
    const cy = hazard.y + Math.sin(angle) * i;
    const tear = width * (0.55 + ((i / 150) % 2) * 0.28);
    ctx.beginPath();
    ctx.moveTo(cx - nx * tear, cy - ny * tear);
    ctx.lineTo(cx + nx * tear, cy + ny * tear);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState, elapsed: number) {
  for (const enemy of state.enemies) {
    const hp = enemy.hp / enemy.maxHp;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const vinylSpin =
      enemy.kind === 3
        ? elapsed * (enemy.mode === 2 ? 14 : enemy.mode === 1 ? 10 : enemy.mode === 3 ? 1.6 : 3.3) + enemy.pulse
        : Math.sin(elapsed + enemy.pulse) * 0.2;
    ctx.rotate(vinylSpin);
    ctx.strokeStyle = `rgba(255,255,255,${0.32 + hp * 0.45})`;
    ctx.lineWidth = 1.5;

    if (enemy.kind === 8) {
      // Sixty-fourth rest: a fragile pause that briefly heals the player.
      const glow = 0.42 + Math.sin(elapsed * 3 + enemy.pulse) * 0.12;
      ctx.shadowColor = "rgba(184,255,166,0.7)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(184,255,166,${0.76 + glow * 0.2})`;
      ctx.fillStyle = `rgba(184,255,166,${0.12 + glow * 0.08})`;
      ctx.lineWidth = 2;

      for (let ring = 1.1; ring <= 1.7; ring += 0.3) {
        ctx.beginPath();
        ctx.ellipse(0, 0, enemy.radius * ring, enemy.radius * 0.52 * ring, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(enemy.radius * 0.28, -enemy.radius * 1.25);
      ctx.lineTo(-enemy.radius * 0.18, enemy.radius * 1.1);
      ctx.stroke();

      for (let flag = 0; flag < 4; flag += 1) {
        const y = -enemy.radius * 0.78 + flag * enemy.radius * 0.36;
        ctx.beginPath();
        ctx.moveTo(enemy.radius * 0.22, y);
        ctx.bezierCurveTo(
          -enemy.radius * 0.42,
          y + enemy.radius * 0.02,
          -enemy.radius * 0.52,
          y + enemy.radius * 0.32,
          -enemy.radius * 0.05,
          y + enemy.radius * 0.42,
        );
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(-enemy.radius * 0.22, enemy.radius * 1.03, enemy.radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      for (let i = 0; i < 5; i += 1) {
        const angle = enemy.pulse + elapsed * 0.8 + (Math.PI * 2 * i) / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * enemy.radius * 1.7, Math.sin(angle) * enemy.radius, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (enemy.kind === 0) {
      // Waveform lifeform: this existing enemy type stays as the baseline noise.
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const x = -enemy.radius + i * 4;
        const y = Math.sin(i + elapsed * 8) * enemy.radius * 0.45;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (enemy.kind === 1) {
      // Distorted note.
      ctx.beginPath();
      ctx.ellipse(-3, 7, enemy.radius * 0.55, enemy.radius * 0.38, -0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, 5);
      ctx.lineTo(3, -enemy.radius * 1.2);
      ctx.quadraticCurveTo(10, -enemy.radius * 0.8, 4, -enemy.radius * 0.45);
      ctx.moveTo(-enemy.radius * 0.7, -2);
      ctx.lineTo(enemy.radius * 0.65, -7);
      ctx.stroke();
    } else if (enemy.kind === 2) {
      // Noise speaker.
      ctx.strokeRect(-enemy.radius, -enemy.radius * 0.65, enemy.radius * 2, enemy.radius * 1.3);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.72 + Math.sin(enemy.pulse) * 2, -0.6, 0.6);
      ctx.arc(0, 0, enemy.radius * 0.95 + Math.sin(enemy.pulse) * 2, -0.45, 0.45);
      ctx.stroke();
    } else if (enemy.kind === 3) {
      // Broken vinyl: a damaged record disc with grooves, center hole, and a missing shard.
      const r = enemy.radius * 1.12;
      const jitter =
        enemy.mode === 1
          ? Math.sin(elapsed * 48) * 3.4
          : enemy.mode === 2
            ? Math.sin(elapsed * 62) * 4.2
            : enemy.mode === 3
              ? Math.sin(elapsed * 18) * 1.4
              : 0;
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,0.45)";
      ctx.shadowBlur = enemy.mode === 1 ? 18 : enemy.mode === 2 ? 14 : 7;

      ctx.beginPath();
      ctx.arc(0, 0, r + jitter, -0.08, Math.PI * 1.52);
      ctx.lineTo(r * 0.18, r * 0.08);
      ctx.arc(0, 0, r * 0.58, Math.PI * 1.45, Math.PI * 1.83, true);
      ctx.lineTo(r * 0.78, -r * 0.2);
      ctx.arc(0, 0, r + jitter * 0.4, Math.PI * 1.9, Math.PI * 2 - 0.12);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fill();
      ctx.stroke();

      for (let groove = 0.34; groove <= 0.86; groove += 0.17) {
        ctx.beginPath();
        ctx.arc(0, 0, r * groove + Math.sin(elapsed * 5 + groove * 10) * 0.7, 0.12, Math.PI * 1.46);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = "#050505";
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.88);
      ctx.lineTo(r * 0.32, -r * 0.2);
      ctx.lineTo(r * 0.72, -r * 0.44);
      ctx.stroke();

      if (enemy.mode === 1 || enemy.mode === 2) {
        ctx.strokeStyle = `rgba(255,255,255,${enemy.mode === 2 ? 0.62 : 0.42})`;
        for (let ring = 1.22; ring <= 1.92; ring += 0.18) {
          ctx.beginPath();
          ctx.arc(0, 0, r * ring + Math.sin(elapsed * (enemy.mode === 2 ? 36 : 26) + ring) * 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-r * 1.5, Math.sin(elapsed * 18) * 4);
        ctx.lineTo(r * 1.5, Math.cos(elapsed * 18) * 4);
        ctx.stroke();
      }

      if (enemy.mode === 3) {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    } else if (enemy.kind === 4) {
      // Metronome remnant.
      ctx.beginPath();
      ctx.moveTo(0, -enemy.radius);
      ctx.lineTo(-enemy.radius * 0.7, enemy.radius * 0.8);
      ctx.lineTo(enemy.radius * 0.7, enemy.radius * 0.8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -enemy.radius * 0.55);
      ctx.lineTo(Math.sin(enemy.pulse * 1.15) * enemy.radius * 0.45, enemy.radius * 0.35);
      ctx.stroke();
    } else if (enemy.kind === 5) {
      // Cable creature.
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const t = i / 8;
        const x = -enemy.radius + t * enemy.radius * 2;
        const y = Math.sin(enemy.pulse + t * Math.PI * 2) * enemy.radius * 0.52;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(enemy.radius * 0.85, 0, 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (enemy.kind === 6) {
      // Sharp: a cut-mark of distorted pitch that rushes through space.
      const r = enemy.radius;
      const tremor = enemy.mode === 1 ? Math.sin(elapsed * 58) * 2.8 : Math.sin(elapsed * 20 + enemy.pulse) * 1.2;
      ctx.save();
      ctx.rotate(enemy.mode === 2 ? enemy.pulse : Math.sin(elapsed * 1.5 + enemy.pulse) * 0.18);
      ctx.shadowColor = "rgba(255,255,255,0.48)";
      ctx.shadowBlur = enemy.mode === 1 ? 18 : enemy.mode === 2 ? 15 : 8;
      ctx.strokeStyle = `rgba(255,255,255,${0.64 + hp * 0.28})`;
      ctx.lineWidth = 2.2;

      [-0.34, 0.34].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x * r * 2 + tremor, -r * 1.25);
        ctx.lineTo(x * r * 2 - tremor * 0.4, r * 1.25);
        ctx.stroke();
      });
      [-0.34, 0.34].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(-r * 1.15, y * r * 2 + tremor * 0.3);
        ctx.lineTo(r * 1.15, y * r * 2 - tremor);
        ctx.stroke();
      });

      ctx.strokeStyle = `rgba(255,255,255,${enemy.mode === 1 || enemy.mode === 2 ? 0.46 : 0.18})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const offset = -r * 1.35 + i * r * 0.9;
        ctx.beginPath();
        ctx.moveTo(offset, -r * 1.38 + Math.sin(elapsed * 24 + i) * 3);
        ctx.lineTo(offset + r * 0.45, r * 1.38 + Math.cos(elapsed * 24 + i) * 3);
        ctx.stroke();
      }

      if (enemy.mode === 1 || enemy.mode === 2) {
        ctx.strokeStyle = "rgba(255,255,255,0.42)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-r * 1.75, Math.sin(elapsed * 32) * 4);
        ctx.lineTo(r * 1.75, Math.cos(elapsed * 32) * 4);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Residual monochrome echo.
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = (Math.PI * 2 * i) / 5 + elapsed;
        const r = i % 2 ? enemy.radius * 0.5 : enemy.radius;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  state: GameState,
  elapsed: number,
) {
  const hpRatio = boss.hp / boss.maxHp;
  const enrage = hpRatio < 0.25 ? 2 : hpRatio < 0.5 ? 1 : 0;
  const telegraphProgress =
    boss.telegraphDuration > 0 && boss.telegraphClock > 0
      ? 1 - boss.telegraphClock / boss.telegraphDuration
      : 0;
  const noise =
    enrage * 0.9 +
    telegraphProgress * 2.8 +
    (state.freezeClock > 0 ? Math.sin(elapsed * 44) * 2.2 : 0);

  if (boss.phase === 4) {
    drawWaveBoss(ctx, boss, elapsed, enrage, telegraphProgress, noise);
    return;
  }
  if (boss.phase === 5) {
    drawMetronomeBoss(ctx, boss, state, elapsed, enrage, telegraphProgress, noise);
    return;
  }
  if (boss.phase === 6) {
    drawLostScoreBoss(ctx, boss, elapsed, enrage, telegraphProgress, noise);
    return;
  }

  ctx.save();
  ctx.translate(
    boss.x + Math.sin(elapsed * 37 + boss.id) * noise,
    boss.y + Math.cos(elapsed * 31 + boss.rhythmIndex) * noise * 0.75,
  );
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 8 + enrage * 8 + telegraphProgress * 18;
  ctx.strokeStyle = `rgba(255,255,255,${0.72 + enrage * 0.1 + telegraphProgress * 0.12})`;
  ctx.fillStyle = `rgba(255,255,255,${0.05 + enrage * 0.025 + telegraphProgress * 0.035})`;
  ctx.lineWidth = 2 + enrage * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(255,255,255,${0.14 + enrage * 0.1})`;
  for (let r = boss.radius + 12; r <= boss.radius + 12 + enrage * 16; r += 16) {
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.sin(elapsed * 5 + r) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (telegraphProgress > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + telegraphProgress * 0.42})`;
    for (let i = 0; i < 3; i += 1) {
      const r = boss.radius + 34 - telegraphProgress * (20 + i * 7);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.rotate(boss.targetAngle);
    ctx.strokeStyle = `rgba(255,255,255,${0.22 + telegraphProgress * 0.36})`;
    ctx.beginPath();
    ctx.moveTo(-boss.radius * 1.65, 0);
    ctx.lineTo(boss.radius * 1.95, 0);
    ctx.moveTo(boss.radius * 1.25, -10);
    ctx.lineTo(boss.radius * 1.95, 0);
    ctx.lineTo(boss.radius * 1.25, 10);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = `rgba(255,255,255,${0.2 + enrage * 0.08})`;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    const skew = Math.sin(elapsed * (6 + enrage) + i + telegraphProgress * 6) * (2 + enrage * 1.5);
    ctx.moveTo(-boss.radius * 1.25, -24 + i * 12 + skew);
    ctx.lineTo(boss.radius * 1.25, -24 + i * 12 - skew);
    ctx.stroke();
  }

  const bodyRotation =
    boss.phase === 4
      ? Math.sin(elapsed * 0.72) * 0.08 + telegraphProgress * 0.08
      : boss.phase === 5
        ? Math.sin(elapsed * 0.44) * 0.035
        : elapsed * (boss.phase % 2 === 0 ? 0.45 + enrage * 0.15 : -0.45 - enrage * 0.15) +
          telegraphProgress * (boss.phase % 2 === 0 ? 0.55 : -0.55);
  ctx.rotate(bodyRotation);
  if (boss.phase === 4) {
    const waveAmp = boss.radius * (0.34 + enrage * 0.04 + telegraphProgress * 0.08);
    ctx.fillStyle = `rgba(255,255,255,${0.04 + enrage * 0.03 + telegraphProgress * 0.04})`;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 + enrage * 0.08})`;
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.beginPath();
      for (let i = 0; i <= 36; i += 1) {
        const t = i / 36;
        const x = -boss.radius * 1.45 + t * boss.radius * 2.9;
        const y =
          Math.sin(t * Math.PI * (2.2 + layer * 0.42) + elapsed * (1.7 + layer * 0.25)) *
            (waveAmp - layer * 4) +
          Math.sin(t * Math.PI * 7 + elapsed * 3.1 + layer) * (2 + enrage * 1.5);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i <= 44; i += 1) {
      const t = i / 44;
      const x = -boss.radius * 1.55 + t * boss.radius * 3.1;
      const y =
        Math.sin(t * Math.PI * 2.6 + elapsed * 1.4) * waveAmp +
        Math.sin(t * Math.PI * 11 + elapsed * 4.4) * (3 + enrage * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = 44; i >= 0; i -= 1) {
      const t = i / 44;
      const x = -boss.radius * 1.55 + t * boss.radius * 3.1;
      const y =
        Math.sin(t * Math.PI * 2.6 + elapsed * 1.4) * waveAmp -
        boss.radius * (0.44 + enrage * 0.03) +
        Math.sin(t * Math.PI * 9 + elapsed * 3.2) * 2;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (boss.phase === 5) {
    const swing = Math.sin(elapsed * (1.8 + enrage * 0.35) + boss.rhythmIndex * 0.42);
    ctx.strokeStyle = `rgba(255,255,255,${0.78 + enrage * 0.08})`;
    ctx.fillStyle = `rgba(255,255,255,${0.045 + enrage * 0.02})`;
    ctx.beginPath();
    ctx.moveTo(0, -boss.radius * 1.18);
    ctx.lineTo(-boss.radius * 0.78, boss.radius * 0.92);
    ctx.quadraticCurveTo(0, boss.radius * 1.14, boss.radius * 0.78, boss.radius * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 4; i += 1) {
      const y = -boss.radius * 0.62 + i * boss.radius * 0.3;
      ctx.beginPath();
      ctx.moveTo(-boss.radius * 0.48, y + Math.sin(elapsed * 2 + i) * 2);
      ctx.lineTo(boss.radius * 0.48, y - Math.sin(elapsed * 2 + i) * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.rotate(swing * (0.54 + enrage * 0.08));
    ctx.beginPath();
    ctx.moveTo(0, -boss.radius * 0.78);
    ctx.lineTo(0, boss.radius * 0.76);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, boss.radius * 0.88, 8 + enrage * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, -boss.radius * 0.82, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (boss.phase === 0) {
    ctx.beginPath();
    ctx.moveTo(0, -boss.radius);
    ctx.lineTo(0, boss.radius);
    ctx.moveTo(-boss.radius * 0.65, -boss.radius * 0.2);
    ctx.lineTo(boss.radius * 0.65, boss.radius * 0.2);
    ctx.stroke();
  } else if (boss.phase === 1) {
    ctx.beginPath();
    ctx.moveTo(0, -boss.radius * 0.9);
    ctx.lineTo(-18, boss.radius * 0.2);
    ctx.lineTo(18, boss.radius * 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, boss.radius * 0.45, 13, 0, Math.PI * 2);
    ctx.stroke();
  } else if (boss.phase === 2) {
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    if (state.freezeClock > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.62)";
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius * 1.18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-boss.radius, 0);
    ctx.bezierCurveTo(-30, -34, 30, 34, boss.radius, 0);
    ctx.stroke();
  } else if (boss.phase === 3) {
    ctx.strokeRect(-boss.radius * 0.65, -boss.radius * 0.52, boss.radius * 1.3, boss.radius * 1.04);
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    for (let r = 12; r < boss.radius; r += 13) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMetronomeBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  state: GameState,
  elapsed: number,
  enrage: number,
  telegraphProgress: number,
  noise: number,
) {
  const w = boss.radius * 1.62;
  const h = boss.radius * 2.62;
  const rhythm = elapsed * (1.1 + enrage * 0.28) + boss.rhythmIndex * 0.52;
  const swing =
    Math.sin(rhythm) * (0.56 + enrage * 0.1) +
    Math.sin(elapsed * (5.4 + enrage) + boss.rhythmIndex) * enrage * 0.04;
  const beat = Math.pow(Math.abs(Math.cos(rhythm)), 10);
  const charge = telegraphProgress * (1 + enrage * 0.3);
  const freeze = state.freezeClock > 0;

  ctx.save();
  ctx.translate(
    boss.x + Math.sin(elapsed * 21 + boss.id) * noise * 0.18,
    boss.y + Math.cos(elapsed * 17 + boss.rhythmIndex) * noise * 0.14,
  );
  ctx.rotate(Math.sin(elapsed * 0.22) * 0.01 + enrage * Math.sin(elapsed * 1.3) * 0.012);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = `rgba(255,255,255,${0.06 + enrage * 0.025 + charge * 0.04})`;
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i += 1) {
    const y = -h * 0.18 + i * 17 + Math.sin(elapsed * 0.7 + i) * (2 + enrage);
    ctx.beginPath();
    ctx.moveTo(-w * 1.45, y);
    ctx.lineTo(w * 1.45, y + Math.sin(elapsed * 0.5 + i) * (4 + enrage * 2));
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(255,255,255,${0.12 + charge * 0.12})`;
  ctx.lineWidth = 1.1;
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(0, h * 0.59, w * (0.72 + ring * 0.25), h * (0.044 + ring * 0.018), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 14; i += 1) {
    const px = Math.sin(elapsed * 0.31 + i * 7.17) * w * (0.82 + (i % 3) * 0.18);
    const py = -h * 0.5 + ((i * 37 + elapsed * (8 + i)) % Math.max(1, h * 1.1));
    ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.025 + charge * 0.05})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.1 + (i % 3) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (enrage > 0 || charge > 0 || freeze) {
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + enrage * 0.06 + charge * 0.14})`;
    ctx.lineWidth = 1.4;
    [-3, 3].forEach((offset) => {
      ctx.save();
      ctx.translate(offset * (1 + enrage), Math.sin(elapsed * 18 + offset) * (1 + enrage));
      drawMetronomeBodyPath(ctx, w, h);
      ctx.stroke();
      ctx.restore();
    });
  }

  ctx.shadowColor = "rgba(255,255,255,0.44)";
  ctx.shadowBlur = 14 + charge * 18 + beat * 8;
  const bodyFill = ctx.createLinearGradient(-w * 0.6, -h * 0.48, w * 0.6, h * 0.52);
  bodyFill.addColorStop(0, "rgba(18,18,18,0.98)");
  bodyFill.addColorStop(0.5, "rgba(2,2,2,0.98)");
  bodyFill.addColorStop(1, "rgba(24,24,24,0.96)");
  ctx.fillStyle = bodyFill;
  ctx.strokeStyle = `rgba(255,255,255,${0.9 + charge * 0.08})`;
  ctx.lineWidth = 3;
  drawMetronomeBodyPath(ctx, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(255,255,255,${0.07 + enrage * 0.03})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const x = -w * 0.42 + i * w * 0.093;
    ctx.beginPath();
    ctx.moveTo(x, -h * 0.38);
    ctx.quadraticCurveTo(x + Math.sin(elapsed * 0.4 + i) * 8, 0, x + Math.cos(i) * 4, h * 0.38);
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(255,255,255,${0.05 + beat * 0.035 + charge * 0.03})`;
  ctx.strokeStyle = `rgba(255,255,255,${0.72 + charge * 0.16})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-w * 0.44, -h * 0.48);
  ctx.lineTo(0, -h * 0.72);
  ctx.lineTo(w * 0.44, -h * 0.48);
  ctx.lineTo(w * 0.36, -h * 0.4);
  ctx.lineTo(-w * 0.36, -h * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(255,255,255,${0.08 + beat * 0.04})`;
  ctx.strokeStyle = `rgba(255,255,255,${0.68 + charge * 0.12})`;
  ctx.beginPath();
  ctx.moveTo(-w * 0.73, h * 0.42);
  ctx.lineTo(w * 0.73, h * 0.42);
  ctx.lineTo(w * 0.58, h * 0.56);
  ctx.lineTo(-w * 0.58, h * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = "rgba(255,255,255,0.55)";
  ctx.shadowBlur = 12 + charge * 16 + beat * 12;
  ctx.fillStyle = `rgba(255,255,255,${0.3 + beat * 0.08 + charge * 0.18})`;
  ctx.strokeStyle = `rgba(255,255,255,${0.88 + charge * 0.1})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.rect(-w * 0.08, -h * 0.43, w * 0.16, h * 0.7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.58 + beat * 0.16})`;
  ctx.fillRect(-w * 0.022, -h * 0.4, w * 0.044, h * 0.64);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(0,0,0,0.68)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 18; i += 1) {
    const y = -h * 0.38 + (h * 0.59 * i) / 18;
    const tick = i % 3 === 0 ? w * 0.13 : w * 0.075;
    ctx.beginPath();
    ctx.moveTo(-tick, y);
    ctx.lineTo(tick, y);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(0, -h * 0.43);
  ctx.rotate(swing);
  ctx.shadowColor = "rgba(255,255,255,0.62)";
  ctx.shadowBlur = 10 + charge * 14;
  ctx.strokeStyle = `rgba(255,255,255,${0.92 + charge * 0.06})`;
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, h * 0.94);
  ctx.stroke();

  ctx.fillStyle = `rgba(255,255,255,${0.82 + charge * 0.12})`;
  ctx.strokeStyle = "rgba(0,0,0,0.58)";
  ctx.save();
  ctx.translate(0, h * 0.42);
  ctx.rotate(-0.12);
  ctx.fillRect(-10, -16, 20, 32);
  ctx.strokeRect(-10, -16, 20, 32);
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, h * 0.94, 8 + enrage * 2, 11 + enrage * 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = `rgba(255,255,255,${0.42 + charge * 0.24})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -h * 0.43, 5.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, h * 0.27);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = `rgba(255,255,255,${0.42 + charge * 0.25})`;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-12, -12, 24, 24);
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(w * 0.68, h * 0.18);
  ctx.strokeStyle = `rgba(255,255,255,${0.38 + charge * 0.22})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.2, 0);
  ctx.arc(w * 0.27, 0, 7, 0, Math.PI * 2);
  ctx.moveTo(w * 0.27, -7);
  ctx.lineTo(w * 0.27, 7);
  ctx.moveTo(w * 0.2, 0);
  ctx.lineTo(w * 0.34, 0);
  ctx.stroke();
  ctx.restore();

  if (telegraphProgress > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + charge * 0.3})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      const r = boss.radius * (0.74 + i * 0.22 - telegraphProgress * 0.18);
      ctx.beginPath();
      ctx.ellipse(0, h * 0.08, r, r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (freeze) {
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.arc(0, -h * 0.02, boss.radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawLostScoreBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  elapsed: number,
  enrage: number,
  telegraphProgress: number,
  noise: number,
) {
  const w = boss.radius * 3.2;
  const h = boss.radius * 1.75;
  const tear = enrage * 4 + telegraphProgress * 8;
  const pulse = Math.sin(elapsed * (1.2 + enrage * 0.3) + boss.rhythmIndex) * (2 + enrage * 2);

  ctx.save();
  ctx.translate(
    boss.x + Math.sin(elapsed * 17 + boss.id) * noise * 0.34,
    boss.y + Math.cos(elapsed * 19 + boss.rhythmIndex) * noise * 0.24,
  );
  ctx.rotate(Math.sin(elapsed * 0.32) * 0.035 + telegraphProgress * 0.03);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = `rgba(255,255,255,${0.08 + enrage * 0.05 + telegraphProgress * 0.1})`;
  ctx.lineWidth = 1;
  for (let page = 0; page < 3; page += 1) {
    const offset = (page - 1) * boss.radius * 0.9;
    ctx.save();
    ctx.translate(offset + Math.sin(elapsed * 0.7 + page) * 6, Math.cos(elapsed * 0.5 + page) * 7);
    ctx.rotate((page - 1) * 0.13 + Math.sin(elapsed * 0.4 + page) * 0.04);
    ctx.strokeRect(-boss.radius * 0.58, -boss.radius * 0.46, boss.radius * 1.16, boss.radius * 0.92);
    for (let i = 0; i < 5; i += 1) {
      const y = -boss.radius * 0.28 + i * boss.radius * 0.14;
      ctx.beginPath();
      ctx.moveTo(-boss.radius * 0.46, y);
      ctx.lineTo(boss.radius * 0.46, y + Math.sin(elapsed * 2 + i + page) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 16 + enrage * 10 + telegraphProgress * 18;
  ctx.fillStyle = `rgba(255,255,255,${0.035 + enrage * 0.015 + telegraphProgress * 0.028})`;
  ctx.strokeStyle = `rgba(255,255,255,${0.86 + telegraphProgress * 0.1})`;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.42 + pulse);
  ctx.lineTo(-w * 0.22, -h * 0.5 - tear);
  ctx.lineTo(w * 0.04, -h * 0.38 + tear * 0.4);
  ctx.lineTo(w * 0.32, -h * 0.52 - pulse);
  ctx.lineTo(w * 0.52, -h * 0.18 + tear);
  ctx.lineTo(w * 0.45, h * 0.46 - tear * 0.3);
  ctx.lineTo(w * 0.08, h * 0.34 + pulse);
  ctx.lineTo(-w * 0.16, h * 0.5 - tear);
  ctx.lineTo(-w * 0.48, h * 0.24 + tear * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(255,255,255,${0.24 + enrage * 0.08 + telegraphProgress * 0.18})`;
  ctx.lineWidth = 1.4;
  for (let staff = 0; staff < 5; staff += 1) {
    const y = -h * 0.22 + staff * h * 0.11;
    ctx.beginPath();
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      const x = -w * 0.39 + t * w * 0.78;
      const glitch = Math.sin(t * Math.PI * 4 + elapsed * 4 + staff) * (1.5 + enrage);
      if (i === 0) ctx.moveTo(x, y + glitch);
      else ctx.lineTo(x, y + glitch);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(255,255,255,${0.48 + telegraphProgress * 0.26})`;
  ctx.beginPath();
  ctx.ellipse(-w * 0.18, h * 0.22, boss.radius * 0.18, boss.radius * 0.11, -0.35, 0, Math.PI * 2);
  ctx.moveTo(w * 0.04, h * 0.14);
  ctx.lineTo(w * 0.04, -h * 0.24);
  ctx.quadraticCurveTo(w * 0.3, -h * 0.16, w * 0.06, h * 0.02);
  ctx.stroke();

  if (enrage > 0 || telegraphProgress > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + enrage * 0.07 + telegraphProgress * 0.22})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const y = -h * 0.54 + i * h * 0.18;
      ctx.beginPath();
      ctx.moveTo(-w * 0.58, y + Math.sin(elapsed * 16 + i) * (2 + enrage * 2));
      ctx.lineTo(w * 0.58, y + Math.cos(elapsed * 14 + i) * (2 + enrage * 2));
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMetronomeBodyPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.64);
  ctx.lineTo(-w * 0.43, -h * 0.44);
  ctx.quadraticCurveTo(-w * 0.56, -h * 0.12, -w * 0.63, h * 0.43);
  ctx.quadraticCurveTo(0, h * 0.55, w * 0.63, h * 0.43);
  ctx.quadraticCurveTo(w * 0.56, -h * 0.12, w * 0.43, -h * 0.44);
  ctx.lineTo(0, -h * 0.64);
  ctx.closePath();
}

function drawWaveBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  elapsed: number,
  enrage: number,
  telegraphProgress: number,
  noise: number,
) {
  const width = boss.radius * 4.4;
  const amp = boss.radius * (0.34 + enrage * 0.08 + telegraphProgress * 0.12);
  const distortion = 1 + enrage * 0.55 + telegraphProgress * 1.15;
  const samples = 96;

  ctx.save();
  ctx.translate(
    boss.x + Math.sin(elapsed * 29 + boss.id) * noise * 0.7,
    boss.y + Math.cos(elapsed * 23 + boss.rhythmIndex) * noise * 0.45,
  );
  ctx.rotate(Math.sin(elapsed * 0.58) * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(255,255,255,0.62)";
  ctx.shadowBlur = 22 + enrage * 10 + telegraphProgress * 18;
  ctx.strokeStyle = `rgba(255,255,255,${0.18 + telegraphProgress * 0.12})`;
  ctx.lineWidth = 16 + enrage * 5 + telegraphProgress * 6;
  drawSmoothWavePath(ctx, width, amp, elapsed, distortion, samples, 0);
  ctx.stroke();

  ctx.shadowBlur = 8 + enrage * 5;
  ctx.strokeStyle = `rgba(255,255,255,${0.92 + telegraphProgress * 0.06})`;
  ctx.lineWidth = 3.2 + enrage * 0.8 + telegraphProgress * 1.2;
  drawSmoothWavePath(ctx, width, amp, elapsed, distortion, samples, 0);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,255,255,${0.22 + enrage * 0.08})`;
  ctx.lineWidth = 1.1;
  [-0.55, 0.55].forEach((offset) => {
    drawSmoothWavePath(
      ctx,
      width * 0.96,
      amp * (0.62 + Math.abs(offset) * 0.12),
      elapsed + offset,
      distortion * 0.72,
      samples,
      offset * boss.radius,
    );
    ctx.stroke();
  });

  if (telegraphProgress > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + telegraphProgress * 0.38})`;
    ctx.lineWidth = 1.4;
    const squeeze = 1 - telegraphProgress * 0.36;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * width * 0.56, -amp * 0.92);
      ctx.quadraticCurveTo(side * width * 0.42 * squeeze, 0, side * width * 0.56, amp * 0.92);
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawSmoothWavePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  amp: number,
  elapsed: number,
  distortion: number,
  samples: number,
  yOffset: number,
) {
  ctx.beginPath();
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = -width / 2 + t * width;
    const envelope = Math.sin(t * Math.PI);
    const primary = Math.sin(t * Math.PI * 4 + elapsed * 1.45);
    const harmonic = Math.sin(t * Math.PI * 10 + elapsed * 2.1) * 0.18 * distortion;
    const fineNoise = Math.sin(t * Math.PI * 27 + elapsed * 5.2) * 0.035 * distortion;
    const y = (primary + harmonic + fineNoise) * amp * envelope + yOffset;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const particle of state.particles) {
    const t = 1 - particle.life / particle.maxLife;
    const alpha = 1 - t;
    if (particle.kind === "afterimage") {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.34})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, particle.radius * (0.82 + t * 0.26), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-particle.radius * 1.3, 0);
      ctx.lineTo(particle.radius * 0.9, 0);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (particle.kind === "rest") {
      ctx.save();
      ctx.strokeStyle = `rgba(184,255,166,${alpha * 0.58})`;
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.42})`;
      ctx.shadowColor = "rgba(184,255,166,0.55)";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * (0.45 + t * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 1.4 + t * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (particle.kind === "riff") {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.46})`;
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.3})`;
      ctx.shadowColor = "rgba(255,255,255,0.36)";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, particle.radius * (0.55 + t * 1.15), particle.radius * (0.22 + t * 0.5), t * Math.PI * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 1.1 + t, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.42})`;
    ctx.lineWidth = particle.kind === "wave" ? 2 : 1;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius * t, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.bannerClock <= 0) return;
  const alpha = Math.min(1, state.bannerClock);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(5,5,5,0.62)";
  ctx.fillRect(0, state.height / 2 - 54, state.width, 108);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.moveTo(0, state.height / 2 - 54);
  ctx.lineTo(state.width, state.height / 2 - 54);
  ctx.moveTo(0, state.height / 2 + 54);
  ctx.lineTo(state.width, state.height / 2 + 54);
  ctx.stroke();
  ctx.fillStyle = "#f8f8f8";
  ctx.font = "24px Inter, Avenir, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.bannerText, state.width / 2, state.height / 2 + 8);
  ctx.restore();
}

export default App;
