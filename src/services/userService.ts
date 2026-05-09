import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type FieldValue,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export type EquippedItems = {
  weapon: string | null;
  relic1: string | null;
  relic2: string | null;
  core: string | null;
};

export type UserSaveData = {
  email: string;
  ownedItems: string[];
  equippedItems: EquippedItems;
  highestStage: number;
  highScore: number;
  playCount: number;
  clearedStages: boolean[];
  stageHighScores: number[];
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
};

const STARTER_ITEM = "starter-tuning-fork";
const STAGE_COUNT = 4;

const DEFAULT_EQUIPMENT: EquippedItems = {
  weapon: STARTER_ITEM,
  relic1: null,
  relic2: null,
  core: null,
};

export function createDefaultUserData(email: string): UserSaveData {
  return {
    email,
    ownedItems: [STARTER_ITEM],
    equippedItems: DEFAULT_EQUIPMENT,
    highestStage: 1,
    highScore: 0,
    playCount: 0,
    clearedStages: Array.from({ length: STAGE_COUNT }, () => false),
    stageHighScores: Array.from({ length: STAGE_COUNT }, () => 0),
  };
}

export async function ensureUserDocument(uid: string, email: string) {
  const ref = doc(db, "users", uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    const data = createDefaultUserData(email);
    await setDoc(ref, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return data;
  }

  const saved = snapshot.data() as Partial<UserSaveData>;
  return normalizeUserData(email, saved);
}

export async function saveUserData(uid: string, data: UserSaveData) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function normalizeUserData(email: string, saved: Partial<UserSaveData>): UserSaveData {
  const fallback = createDefaultUserData(email);
  return {
    email: saved.email ?? email,
    ownedItems: Array.from(new Set([STARTER_ITEM, ...(saved.ownedItems ?? [])])),
    equippedItems: {
      ...fallback.equippedItems,
      ...(saved.equippedItems ?? {}),
    },
    highestStage: saved.highestStage ?? fallback.highestStage,
    highScore: saved.highScore ?? fallback.highScore,
    playCount: saved.playCount ?? fallback.playCount,
    clearedStages: [
      ...(saved.clearedStages ?? fallback.clearedStages),
      false,
      false,
      false,
      false,
    ].slice(0, STAGE_COUNT),
    stageHighScores: [
      ...(saved.stageHighScores ?? fallback.stageHighScores),
      0,
      0,
      0,
      0,
    ].slice(0, STAGE_COUNT),
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}
