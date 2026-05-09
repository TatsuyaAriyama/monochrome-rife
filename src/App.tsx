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
  kind?: "orb" | "laser" | "wave";
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
  kind: "ripple" | "spark" | "text" | "wave" | "afterimage" | "rest";
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
];

const BOSSES = ["WAVE REMNANT", "RESONANCE", "BROKEN METRONOME"];

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
    dropItemId: "broken-metronome",
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
  };

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
  private mode: "home" | "game" = "game";
  private stageIndex = 0;
  private bossLayer = false;
  private settings: Settings = DEFAULT_SETTINGS;

  async start(settings: Settings, mode: "home" | "game" = "game", stageIndex = 0) {
    this.ensure();
    if (this.mode !== mode || this.stageIndex !== stageIndex) {
      this.stop();
      this.step = 0;
    }
    this.mode = mode;
    this.stageIndex = stageIndex;
    this.bossLayer = false;
    this.setSettings(settings);
    if (!this.context) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.startBgm();
  }

  setGameStage(stageIndex: number, bossLayer = false) {
    if (this.stageIndex === stageIndex && this.bossLayer === bossLayer) return;
    this.stageIndex = stageIndex;
    this.bossLayer = bossLayer;
    this.step = 0;
    if (this.mode === "game" && this.bgmTimer) {
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
    this.bgmTimer = window.setInterval(
      () => this.playBgmStep(),
      this.mode === "home" ? 760 : this.stageIndex === 2 ? 860 : this.stageIndex === 1 ? 430 : 640,
    );
  }

  private playBgmStep() {
    if (!this.context || !this.bgm) return;
    if (this.mode === "home") {
      this.playHomePianoStep();
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

    const drone = [41.2, 49, 55, 49];
    const note = index % drone.length;
    this.tone(drone[note], 1.6, this.bossLayer ? 0.08 : 0.055, "sine", this.bgm);
    if (note === 1) this.tone(196, 1.2, 0.026, "sine", this.delay, 0.2);
    if (note === 3) this.noise(0.34, this.bossLayer ? 0.044 : 0.026, 720, this.bgm);
    if (this.bossLayer) {
      this.tone(note === 0 ? 880 : 660, 0.028, note === 0 ? 0.045 : 0.026, "square", this.bgm, 0.02);
      if (note === 2) this.pianoTone(220, 1.1, 0.026, this.delay, 0.12);
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

  if (!hasLegacyItems && !hasLegacyEquipment) return data;

  return {
    ...data,
    ownedItems: Array.from(new Set([...data.ownedItems, STARTER_ITEM, ...legacyItems])),
    equippedItems: {
      ...data.equippedItems,
      ...legacyEquipment,
    },
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
            void audioEngine.start(settings, "game", stageIndex);
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
              clearedStages: [false, false, false],
              stageHighScores: [0, 0, 0],
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
  const maxPlayable = Math.min(Math.max(user.highestStage - 1, 0), STAGES.length - 1);

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
        "64分休符: スコア1000ごとに、黄緑色の64分休符が出現する。倒すとHPを10回復。",
      ],
    },
    {
      title: "ボス記録",
      lines: [
        "WAVE REMNANT: 崩壊した波形生命体。身体は一定の形を保てない。",
        "RESONANCE: 響きだけが残った存在。安全な間を波で測らせる。",
        "BROKEN METRONOME: 壊れた時間。振り子は拍ではなく亀裂を刻む。",
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
        silenceAmount: initialStageIndex === 2 ? 0.18 : 0,
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
              {snapshot.stageNumber === 3 ? "New Run" : "Next Stage"}
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
    const speed = 245;
    state.player.dodgeCooldown = Math.max(0, state.player.dodgeCooldown - dt);
    state.player.dodgeTrail = Math.max(0, state.player.dodgeTrail - dt);

    if (state.player.dodgeTime > 0) {
      const previousDodgeTime = state.player.dodgeTime;
      state.player.dodgeTime = Math.max(0, state.player.dodgeTime - dt);
      state.player.x += state.player.dodgeVx * dt;
      state.player.y += state.player.dodgeVy * dt;
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
    const spawnLimit = Math.round(5 + difficulty * 3);
    const spawnDelay = clamp(0.95 - difficulty * 0.13, 0.34, 0.95);

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
    state.silenceAmount = state.stageIndex === 2 ? 0.18 : 0;
    state.bannerText = `STAGE ${state.stageIndex + 1}  ${STAGES[state.stageIndex].name}`;
    state.bannerClock = 2;
    checkRestSpawn(state);
    audioRef.current.setGameStage(state.stageIndex, false);
  }

  function updateWhiteRequiemMood(state: GameState, dt: number) {
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
        }
        state.freezeReason = null;
        addRipple(state, state.width / 2, state.height / 2, 460, "wave");
      }
      return;
    }

    if (state.phase !== "boss" || !state.boss) return;
    state.freezeCooldown -= dt;
    if (state.freezeCooldown <= 0 && state.freezeClock <= 0) {
      state.freezeClock = 2.25;
      state.freezeCooldown = 12;
      state.freezeReason = "stop";
      state.bannerText = "TIME STOPS";
      state.bannerClock = 1.4;
      addRipple(state, state.width / 2, state.height / 2, 360, "wave");
      audioRef.current.wavePulse();
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
    const kindPool = [0, 0, 0, 0, 0, 1, 1, 1, 3, 3];
    const kind = kindPool[Math.floor(Math.random() * kindPool.length)];
    const radius = 11 + Math.min(kind, 4) * 2;
    const difficulty = stage.enemyLevel + (state.runLoop - 1) * 0.65;
    const baseHp = 22 + difficulty * 10 + Math.min(kind, 4) * 7;
    const hp = kind === 3 ? baseHp * 2.64 : baseHp;
    const speedBoost = kind === 3 ? 26 : kind === 4 ? 92 : kind === 5 ? 38 : kind === 6 ? -8 : 0;
    state.enemies.push({
      id: state.nextId++,
      x,
      y,
      radius,
      hp,
      maxHp: hp,
      speed: 48 + difficulty * 13 + speedBoost + Math.random() * 24,
      damage: 9 + Math.min(kind, 4) * 2 + state.stageIndex,
      kind,
      pulse: Math.random() * Math.PI * 2,
      attackClock: kind === 1 ? 1.4 + Math.random() * 1.2 : kind === 3 ? 1.1 : 0,
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
    const baseHp = [1380, 1880, 3050][state.stageIndex];
    const maxHp = baseHp + (state.runLoop - 1) * 360;
    state.boss = {
      id: state.nextId++,
      name: stage.boss,
      x: state.width / 2,
      y: state.stageIndex === 2 ? 138 : 125,
      radius: state.stageIndex === 2 ? 58 : 48 + state.stageIndex * 6,
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
    audioRef.current.setGameStage(state.stageIndex, true);
    audioRef.current.boss();
    if (state.stageIndex === 2) {
      const introBossId = state.boss.id;
      state.freezeClock = 1.65;
      state.freezeCooldown = 8.4;
      state.freezeReason = "intro";
      state.bannerText = "";
      [0, 820, 1180, 1540].forEach((delay, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live && live.boss?.id === introBossId && !live.gameOver) {
            audioRef.current.metronomeTick(index === 0);
          }
        }, delay);
      });
    }
  }

  function updateBoss(state: GameState, dt: number) {
    if (!state.boss) return;
    if (state.freezeClock > 0) return;
    const boss = state.boss;
    const hpRatio = boss.hp / boss.maxHp;
    const enrage = hpRatio < 0.25 ? 2 : hpRatio < 0.5 ? 1 : 0;
    const time = state.bossElapsed;
    const motionScale = boss.phase === 5 ? 0.72 : 1;
    const targetX =
      state.width / 2 +
      Math.sin(time * (0.62 + enrage * 0.12) + boss.phase * 1.8) *
        (76 + state.stageIndex * 18 + enrage * 22) *
        motionScale +
      Math.sin(time * 0.23 + boss.rhythmIndex) * 24 * motionScale;
    const targetY =
      118 +
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
    const base = state.stageIndex === 0 ? 1.55 : state.stageIndex === 1 ? 1.28 : 1.16;
    return clamp(base - enrage * 0.2 - state.runLoop * 0.02, state.stageIndex === 2 ? 0.74 : 0.86, base);
  }

  function beginBossTelegraph(state: GameState, boss: Boss, enrage: number) {
    boss.pattern = chooseBossPattern(state, boss, enrage);
    boss.telegraphDuration =
      state.stageIndex === 0 ? 1.08 : state.stageIndex === 1 ? 1.02 : 1.24;
    boss.telegraphClock = boss.telegraphDuration;
    boss.targetX = state.player.x;
    boss.targetY = state.player.y;
    boss.targetAngle = Math.atan2(state.player.y - boss.y, state.player.x - boss.x);
    boss.rhythmIndex += 1;
    addRipple(state, boss.x, boss.y, 78 + state.stageIndex * 18, "spark");
    state.shake = settings.reducedMotion ? 0 : 0.45 + enrage * 0.3;
    if (state.stageIndex === 2) audioRef.current.metronomeTick(boss.rhythmIndex % 4 === 1);
    audioRef.current.wavePulse();
  }

  function chooseBossPattern(state: GameState, boss: Boss, enrage: number) {
    if (state.stageIndex === 0) return boss.rhythmIndex % 3 === 2 && enrage > 0 ? 1 : 0;
    if (state.stageIndex === 1) return boss.rhythmIndex % 4;
    return boss.rhythmIndex % 3;
  }

  function fireBossPattern(state: GameState, boss: Boss, enrage: number) {
    if (state.stageIndex === 0) {
      fireStageOneBoss(state, boss, enrage);
    } else if (state.stageIndex === 1) {
      fireStageTwoBoss(state, boss, enrage);
    } else {
      fireStageThreeBoss(state, boss, enrage);
    }
    addRipple(state, boss.x, boss.y, 96 + enrage * 20, "wave");
  }

  function fireStageOneBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 1) {
      [-0.24, 0, 0.24].forEach((offset, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live?.boss?.id === boss.id && !live.gameOver) {
            spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle + offset, 136 + enrage * 16, 11, 9);
          }
        }, index * 160);
      });
      return;
    }
    spawnWaveHazard(state, boss.x, boss.y, boss.targetAngle, 124 + enrage * 12, 12, 9);
    window.setTimeout(() => {
      const live = stateRef.current;
      if (live?.boss?.id === boss.id && !live.gameOver) {
        spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle, 124 + enrage * 12, 12, 9);
      }
    }, 240);
  }

  function fireStageTwoBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 0) {
      [-0.38, -0.18, 0.18, 0.38].forEach((offset) => {
        spawnWaveHazard(state, boss.x, boss.y, boss.targetAngle + offset, 132 + enrage * 14, 10, 9);
      });
      return;
    }
    if (boss.pattern === 1) {
      const lanes = [0.22, 0.38, 0.54, 0.7];
      const gap = boss.rhythmIndex % lanes.length;
      for (let i = 0; i < lanes.length; i += 1) {
        if (i === gap) continue;
        const y = state.height * lanes[i];
        spawnWaveHazard(state, boss.x, boss.y, Math.atan2(y - boss.y, state.width * 0.5 - boss.x), 118 + enrage * 16, 13, 10);
      }
      return;
    }
    if (boss.pattern === 2) {
      [-0.28, 0, 0.28].forEach((offset, index) => {
        window.setTimeout(() => {
          const live = stateRef.current;
          if (live?.boss?.id === boss.id && !live.gameOver) {
            spawnWaveHazard(live, boss.x, boss.y, boss.targetAngle + offset, 146 + enrage * 12, 11, 10);
          }
        }, index * 210);
      });
      return;
    }
    for (let i = 0; i < 5 + enrage; i += 1) {
      const angle = -Math.PI * 0.82 + (Math.PI * 0.64 * i) / (4 + enrage);
      spawnWaveHazard(state, boss.x, boss.y, angle, 112 + enrage * 12, 12, 9);
    }
  }

  function fireStageThreeBoss(state: GameState, boss: Boss, enrage: number) {
    if (boss.pattern === 0) {
      const count = enrage > 0 ? 8 : 6;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.PI * 0.18 + (Math.PI * 0.64 * i) / (count - 1);
        spawnWaveHazard(state, boss.x, boss.y, angle, 104 + enrage * 14, 14, 9);
      }
      audioRef.current.metronomeTick(true);
      return;
    }
    if (boss.pattern === 1) {
      const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
      const angle = Math.PI / 2 + swing * (0.5 + enrage * 0.08);
      spawnBossLaser(state, boss.x, boss.y + boss.radius * 0.2, angle, 24 + enrage * 2, 10, 0.72);
      audioRef.current.metronomeTick(true);
      return;
    }
    const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
    const angle = Math.PI / 2 + swing * (0.62 + enrage * 0.08);
    spawnBossLaser(state, boss.x, boss.y + boss.radius * 0.2, angle, 26, 10, 0.86, swing * 0.26);
    [150, enrage > 0 ? 360 : 460].forEach((delay, index) => {
      window.setTimeout(() => {
        const live = stateRef.current;
        if (live?.boss?.id === boss.id && !live.gameOver) {
          const offset = index === 0 ? -0.18 * swing : 0.18 * swing;
          spawnWaveHazard(live, boss.x, boss.y, Math.PI / 2 + offset, 124 + enrage * 16, 15, 9);
          audioRef.current.metronomeTick(index === 1);
        }
      }, delay);
    });
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
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
      });
      state.hazards.forEach((hazard) => {
        if (hazard.kind === "laser" && hazard.angularVelocity) {
          hazard.angle = (hazard.angle ?? 0) + hazard.angularVelocity * dt;
        }
        hazard.x += hazard.vx * dt;
        hazard.y += hazard.vy * dt;
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

      const forward = enemy.speed * 0.58;
      const drift = 46;
      enemy.x += (toPlayer.x * forward + side.x * Math.sin(enemy.pulse) * drift) * dt;
      enemy.y += (toPlayer.y * forward + side.y * Math.cos(enemy.pulse) * drift) * dt;
    });
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
        addRipple(state, enemy.x, enemy.y, 28, "spark");
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
        addRipple(state, bullet.x, bullet.y, 34, "spark");
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
      const hit =
        hazard.kind === "laser"
          ? laserHitsPlayer(hazard, state.player)
          : distance(state.player, hazard) <= state.player.radius + hazard.radius;
      if (hit) {
        damagePlayer(state, hazard.damage);
        if (hazard.kind !== "laser") hazard.life = 0;
        return;
      }
    }
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
    state.bannerText = result.item?.rarity === "Legendary" ? "LEGENDARY DROP" : "DROP FOUND";
    state.bannerClock = 2.4;
    state.shake = result.item?.rarity === "Legendary" && !settings.reducedMotion ? 3 : 1;
    addRipple(state, state.width / 2, state.height / 2, 280, "wave");
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
    };
    const angles = stats.split ? [-0.07, 0.07] : [0];
    angles.forEach((angle) => {
      const dir = rotate(aim, angle);
      state.bullets.push({
        id: state.nextId++,
        x: state.player.x + dir.x * 18,
        y: state.player.y + dir.y * 18,
        vx: dir.x * speed,
        vy: dir.y * speed,
        ...base,
      });
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
  drawBullets(ctx, state);
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
    const collapse = state.stageIndex === 2 ? Math.sin(elapsed * 1.7 + y * 0.02) * silence * 42 : 0;
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
      const missing = state.stageIndex === 2 && Math.sin(x * 0.04 + elapsed * 1.5) < silence - 0.28;
      const y = 48 + Math.sin(x * 0.025 + elapsed * 1.3) * 11;
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
    ctx.fillStyle = "rgba(255,255,255,0.58)";
    ctx.font = "12px Inter, Avenir, Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("frozen notation", state.width / 2, state.height / 2 + 4);
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
    if (boss.pattern === 1) {
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
  } else if (boss.pattern === 1) {
    const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
    drawTelegraphLine(
      ctx,
      boss.x,
      boss.y + boss.radius * 0.2,
      Math.PI / 2 + swing * 0.5,
      Math.hypot(state.width, state.height),
      alpha * 1.18,
      25,
    );
  } else if (boss.pattern === 2) {
    const swing = boss.rhythmIndex % 2 === 0 ? -1 : 1;
    [-0.16, 0, 0.16].forEach((offset, index) =>
      drawTelegraphLine(
        ctx,
        boss.x,
        boss.y + boss.radius * 0.2,
        Math.PI / 2 + swing * 0.62 + offset,
        Math.hypot(state.width, state.height),
        alpha * (index === 1 ? 1.2 : 0.58),
        index === 1 ? 26 : 10,
      ),
    );
  } else {
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI * 0.18 + (Math.PI * 0.64 * i) / (count - 1);
      drawTelegraphLine(ctx, boss.x, boss.y, angle, Math.hypot(state.width, state.height), alpha * 0.78, 13);
    }
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

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (const bullet of state.bullets) {
    const dir = normalize(bullet.vx, bullet.vy);
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bullet.x - dir.x * 18, bullet.y - dir.y * 18);
    ctx.lineTo(bullet.x + dir.x * 7, bullet.y + dir.y * 7);
    ctx.stroke();
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
      // Distorted score fragment and white-black echo body.
      ctx.strokeRect(-enemy.radius * 0.92, -enemy.radius * 0.62, enemy.radius * 1.84, enemy.radius * 1.24);
      for (let i = 0; i < 4; i += 1) {
        const y = -enemy.radius * 0.36 + i * enemy.radius * 0.24;
        ctx.beginPath();
        ctx.moveTo(-enemy.radius * 0.72, y + Math.sin(enemy.pulse + i) * 2);
        ctx.lineTo(enemy.radius * 0.72, y - Math.sin(enemy.pulse + i) * 2);
        ctx.stroke();
      }
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
