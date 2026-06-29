"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { getFirebaseDatabase, isFirebaseConfigured } from "@/lib/firebase";
import {
  formatScore,
  getCountdownNumber,
  getEffectivePhase,
  getElapsedSeconds,
  isRegistrationOpen,
  parseGameData,
  type GameData,
} from "@/lib/game";

const STORAGE_KEY_NAME = "participantName";
const STORAGE_KEY_ID = "participantId";
const STORAGE_KEY_SESSION = "participantSession";

function clearParticipantStorage() {
  localStorage.removeItem(STORAGE_KEY_NAME);
  localStorage.removeItem(STORAGE_KEY_ID);
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

async function getCurrentSession(): Promise<string> {
  const snap = await get(ref(getFirebaseDatabase(), "session/id"));
  return String(snap.val() ?? 0);
}

async function fetchGameData(): Promise<GameData | null> {
  const snap = await get(ref(getFirebaseDatabase(), "game"));
  return parseGameData(snap.val());
}

async function joinAsParticipant(name: string): Promise<void> {
  const game = await fetchGameData();
  if (!isRegistrationOpen(game)) {
    throw new Error("GAME_IN_PROGRESS");
  }

  const db = getFirebaseDatabase();
  const oldId = localStorage.getItem(STORAGE_KEY_ID);

  if (oldId) {
    try {
      await remove(ref(db, `users/${oldId}`));
    } catch {
      // 既に削除済みの場合は無視
    }
  }

  const newRef = push(ref(db, "users"));
  const userId = newRef.key;
  if (!userId) throw new Error("Failed to create user");

  const sessionId = await getCurrentSession();

  await set(newRef, { name, status: "waiting" });

  localStorage.setItem(STORAGE_KEY_NAME, name);
  localStorage.setItem(STORAGE_KEY_ID, userId);
  localStorage.setItem(STORAGE_KEY_SESSION, sessionId);
}

async function leaveParticipant(): Promise<void> {
  const savedId = localStorage.getItem(STORAGE_KEY_ID);
  if (savedId && isFirebaseConfigured()) {
    try {
      await remove(ref(getFirebaseDatabase(), `users/${savedId}`));
    } catch {
      // 既に削除済みの場合は無視
    }
  }
  clearParticipantStorage();
}

export default function ParticipantPage() {
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<"waiting" | "finished">("waiting");
  const [score, setScore] = useState<number | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isReady, setIsReady] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePhase = getEffectivePhase(game, now);
  const inStopwatch =
    effectivePhase === "armed" ||
    effectivePhase === "countdown" ||
    effectivePhase === "running";
  const countdownNumber =
    effectivePhase === "countdown" && game?.startAt
      ? getCountdownNumber(game.startAt, now)
      : null;
  const elapsed =
    effectivePhase === "running" && game?.startAt
      ? getElapsedSeconds(game.startAt, now)
      : 0;
  const showTimer = effectivePhase === "running" && elapsed < 1;
  const canStop =
    effectivePhase === "running" &&
    userStatus !== "finished" &&
    !isStopping &&
    game?.startAt != null &&
    now >= game.startAt;

  const resetToRegistration = useCallback(() => {
    clearParticipantStorage();
    setName("");
    setInputName("");
    setUserId(null);
    setUserStatus("waiting");
    setScore(null);
    setError(null);
  }, []);

  useEffect(() => {
    async function restore() {
      const savedName = localStorage.getItem(STORAGE_KEY_NAME);
      const savedId = localStorage.getItem(STORAGE_KEY_ID);
      const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);

      if (!savedName || !savedId || !savedSession) {
        clearParticipantStorage();
        setIsReady(true);
        return;
      }

      if (!isFirebaseConfigured()) {
        setError("Firebase が未設定のため、モニターに表示されません。");
        setIsReady(true);
        return;
      }

      try {
        const db = getFirebaseDatabase();
        const [sessionSnap, userSnap, gameSnap] = await Promise.all([
          get(ref(db, "session/id")),
          get(ref(db, `users/${savedId}`)),
          get(ref(db, "game")),
        ]);

        const currentSession = String(sessionSnap.val() ?? 0);

        if (savedSession !== currentSession || !userSnap.exists()) {
          clearParticipantStorage();
          setIsReady(true);
          return;
        }

        const user = userSnap.val();
        setName(user?.name ?? savedName);
        setUserId(savedId);
        setUserStatus(user?.status === "finished" ? "finished" : "waiting");
        if (user?.score != null) setScore(user.score);
        setGame(parseGameData(gameSnap.val()));
      } catch {
        clearParticipantStorage();
        setError("Firebase への接続に失敗しました。");
      }

      setIsReady(true);
    }

    restore();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    const db = getFirebaseDatabase();
    const unsubscribers = [
      onValue(ref(db, "session/id"), (snapshot) => {
        const currentSession = String(snapshot.val() ?? 0);
        const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
        if (savedSession && savedSession !== currentSession) {
          resetToRegistration();
        }
      }),
      onValue(ref(db, "game"), (snapshot) => {
        setGame(parseGameData(snapshot.val()));
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [resetToRegistration]);

  useEffect(() => {
    if (!isFirebaseConfigured() || !userId) return;

    const userRef = ref(getFirebaseDatabase(), `users/${userId}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (!snapshot.exists()) {
        resetToRegistration();
        return;
      }
      const user = snapshot.val();
      setName(user?.name ?? "");
      setUserStatus(user?.status === "finished" ? "finished" : "waiting");
      setScore(user?.score ?? null);
    });

    return () => unsubscribe();
  }, [userId, resetToRegistration]);

  useEffect(() => {
    if (!inStopwatch && userStatus !== "finished") return;

    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [inStopwatch, userStatus]);

  const handleJoin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputName.trim();
    if (!trimmed || isJoining) return;

    setError(null);
    setIsJoining(true);

    try {
      if (!isFirebaseConfigured()) {
        setError("Firebase が未設定です。管理者に連絡してください。");
        return;
      }

      await joinAsParticipant(trimmed);
      setName(trimmed);
      setUserId(localStorage.getItem(STORAGE_KEY_ID));
      setUserStatus("waiting");
      setScore(null);
    } catch (err) {
      if (err instanceof Error && err.message === "GAME_IN_PROGRESS") {
        setError("現在ゲーム中です。次のラウンドをお待ちください。");
      } else {
        setError("参加登録に失敗しました。もう一度お試しください。");
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleRetry = async () => {
    if (isLeaving || inStopwatch) return;
    setIsLeaving(true);

    try {
      await leaveParticipant();
      resetToRegistration();
    } catch {
      setError("やり直しに失敗しました。もう一度お試しください。");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleStop = async () => {
    if (!canStop || !userId || !game?.startAt) return;

    setIsStopping(true);
    const finalScore =
      Math.round(getElapsedSeconds(game.startAt, Date.now()) * 100) / 100;

    try {
      await update(ref(getFirebaseDatabase(), `users/${userId}`), {
        status: "finished",
        score: finalScore,
      });
      setUserStatus("finished");
      setScore(finalScore);
    } catch {
      setError("記録の送信に失敗しました。もう一度お試しください。");
    } finally {
      setIsStopping(false);
    }
  };

  if (!isReady) {
    return (
      <div className="bg-luxury-beige flex min-h-screen items-center justify-center">
        <p className="font-serif text-champagne-muted animate-shimmer">
          読み込み中...
        </p>
      </div>
    );
  }

  if (!name) {
    const gameInProgress = game !== null;

    return (
      <div className="bg-luxury-beige flex min-h-screen items-center justify-center px-4">
        <main className="luxury-card animate-float-up w-full max-w-sm rounded-2xl p-8 sm:p-10">
          <p className="font-serif text-center text-xs tracking-[0.3em] text-champagne-muted uppercase">
            Wedding Game
          </p>
          <h1 className="font-serif mt-2 mb-8 text-center text-2xl font-semibold text-navy">
            {gameInProgress ? "参加受付終了" : "参加登録"}
          </h1>
          {gameInProgress ? (
            <p className="font-serif text-center text-sm leading-relaxed text-navy/60">
              現在ゲーム中です。
              <br />
              次のラウンドまでお待ちください。
            </p>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-5">
              <label
                htmlFor="nickname"
                className="font-serif text-sm text-navy/70"
              >
                名前（ニックネーム）
              </label>
              <input
                id="nickname"
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="例：たろう"
                maxLength={20}
                className="font-serif rounded-lg border border-champagne/40 bg-white/60 px-4 py-3 text-navy outline-none transition-colors placeholder:text-navy/30 focus:border-champagne focus:ring-2 focus:ring-champagne/20"
                autoFocus
              />
              {error && (
                <p className="text-center text-sm text-red-600/80">{error}</p>
              )}
              <button
                type="submit"
                disabled={!inputName.trim() || isJoining}
                className="font-serif rounded-lg bg-gradient-to-r from-champagne to-champagne-muted px-4 py-3 font-semibold tracking-wide text-navy transition-all hover:shadow-[0_4px_20px_rgba(212,175,55,0.4)] disabled:cursor-not-allowed disabled:from-navy/20 disabled:to-navy/20 disabled:text-navy/40"
              >
                {isJoining ? "登録中..." : "参加する"}
              </button>
            </form>
          )}
        </main>
      </div>
    );
  }

  if (userStatus === "finished" && score != null) {
    return (
      <div className="bg-luxury-beige flex min-h-screen items-center justify-center px-4">
        <main className="luxury-card animate-float-up w-full max-w-sm rounded-2xl p-8 text-center sm:p-10">
          <p className="font-serif text-xs tracking-[0.25em] text-champagne-muted uppercase">
            Your Record
          </p>
          <p className="font-serif mt-3 text-lg text-navy/60">{name}</p>
          <p className="font-display mt-6 text-5xl font-bold text-navy">
            {formatScore(score)}
            <span className="ml-1 text-2xl text-navy/50">秒</span>
          </p>
          <div className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-champagne to-transparent" />
          <p className="font-serif mt-4 text-sm text-navy/40">
            お疲れさまでした！
          </p>
        </main>
      </div>
    );
  }

  if (inStopwatch) {
    return (
      <div className="bg-luxury-beige flex min-h-screen flex-col items-center justify-center px-4">
        <p className="font-serif mb-6 text-sm text-navy/50">{name}</p>

        {effectivePhase === "armed" && (
          <p className="font-serif animate-shimmer text-lg text-champagne-muted">
            スタートを待っています...
          </p>
        )}

        {countdownNumber != null && (
          <p className="font-display animate-float-up text-8xl font-bold text-navy">
            {countdownNumber}
          </p>
        )}

        {effectivePhase === "running" && (
          <div className="flex flex-col items-center">
            {showTimer ? (
              <p className="font-display text-6xl font-bold text-navy">
                {formatScore(elapsed)}
              </p>
            ) : (
              <p className="font-serif text-sm text-navy/30">· · ·</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleStop}
          disabled={!canStop}
          className="font-serif mt-12 flex h-36 w-36 items-center justify-center rounded-full border-4 border-champagne bg-gradient-to-br from-champagne-light to-champagne text-xl font-bold tracking-widest text-navy shadow-[0_8px_32px_rgba(212,175,55,0.35)] transition-all active:scale-95 disabled:scale-100 disabled:border-navy/10 disabled:from-navy/5 disabled:to-navy/10 disabled:text-navy/25 disabled:shadow-none"
        >
          STOP
        </button>

        {error && (
          <p className="mt-6 text-center text-sm text-red-600/80">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-luxury-beige flex min-h-screen items-center justify-center px-4">
      <main className="luxury-card animate-float-up animate-gentle-float w-full max-w-sm rounded-2xl p-8 text-center sm:p-10">
        <p className="font-serif text-xs tracking-[0.25em] text-champagne-muted uppercase">
          参加中
        </p>
        <p className="font-serif mt-3 text-3xl font-semibold text-navy">{name}</p>
        <div className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-champagne to-transparent" />
        <p className="font-display mt-4 text-sm text-navy/50">
          8.<span className="text-champagne font-bold">22</span> 秒チャレンジ
        </p>
        {error && (
          <p className="mt-4 text-sm text-red-600/80">{error}</p>
        )}
        <p className="font-serif mt-4 text-sm text-navy/40">待機中...</p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isLeaving}
          className="font-serif mt-8 text-sm text-navy/45 underline decoration-champagne/50 underline-offset-4 transition-colors hover:text-champagne-muted disabled:opacity-50"
        >
          {isLeaving ? "処理中..." : "名前をやり直す"}
        </button>
      </main>
    </div>
  );
}
