"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set } from "firebase/database";
import { getFirebaseDatabase, isFirebaseConfigured } from "@/lib/firebase";

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

async function joinAsParticipant(name: string): Promise<void> {
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
  const [isReady, setIsReady] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetToRegistration = useCallback(() => {
    clearParticipantStorage();
    setName("");
    setInputName("");
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
        const [sessionSnap, userSnap] = await Promise.all([
          get(ref(db, "session/id")),
          get(ref(db, `users/${savedId}`)),
        ]);

        const currentSession = String(sessionSnap.val() ?? 0);

        if (savedSession !== currentSession || !userSnap.exists()) {
          clearParticipantStorage();
          setIsReady(true);
          return;
        }

        setName(userSnap.val()?.name ?? savedName);
      } catch {
        clearParticipantStorage();
        setError("Firebase への接続に失敗しました。");
      }

      setIsReady(true);
    }

    restore();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured() || !name) return;

    const sessionRef = ref(getFirebaseDatabase(), "session/id");
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const currentSession = String(snapshot.val() ?? 0);
      const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);

      if (savedSession && savedSession !== currentSession) {
        resetToRegistration();
      }
    });

    return () => unsubscribe();
  }, [name, resetToRegistration]);

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
    } catch {
      setError("参加登録に失敗しました。もう一度お試しください。");
    } finally {
      setIsJoining(false);
    }
  };

  const handleRetry = async () => {
    if (isLeaving) return;
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
    return (
      <div className="bg-luxury-beige flex min-h-screen items-center justify-center px-4">
        <main className="luxury-card animate-float-up w-full max-w-sm rounded-2xl p-8 sm:p-10">
          <p className="font-serif text-center text-xs tracking-[0.3em] text-champagne-muted uppercase">
            Wedding Game
          </p>
          <h1 className="font-serif mt-2 mb-8 text-center text-2xl font-semibold text-navy">
            参加登録
          </h1>
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
        </main>
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
