"use client";

import { FormEvent, useEffect, useState } from "react";
import { get, push, ref, set } from "firebase/database";
import { getFirebaseDatabase, isFirebaseConfigured } from "@/lib/firebase";

const STORAGE_KEY_NAME = "participantName";
const STORAGE_KEY_ID = "participantId";

async function registerParticipant(name: string): Promise<string> {
  const db = getFirebaseDatabase();
  const savedId = localStorage.getItem(STORAGE_KEY_ID);

  if (savedId) {
    const snapshot = await get(ref(db, `users/${savedId}`));
    if (snapshot.exists()) {
      await set(ref(db, `users/${savedId}`), {
        name,
        status: "waiting",
      });
      return savedId;
    }
  }

  const newRef = push(ref(db, "users"));
  const userId = newRef.key;
  if (!userId) throw new Error("Failed to create user");

  await set(newRef, {
    name,
    status: "waiting",
  });

  localStorage.setItem(STORAGE_KEY_ID, userId);
  return userId;
}

export default function ParticipantPage() {
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function restore() {
      const savedName = localStorage.getItem(STORAGE_KEY_NAME);
      if (!savedName) {
        setIsReady(true);
        return;
      }

      if (isFirebaseConfigured()) {
        try {
          await registerParticipant(savedName);
          setName(savedName);
        } catch {
          setError("Firebase への接続に失敗しました。");
        }
      } else {
        setName(savedName);
        setError("Firebase が未設定のため、モニターに表示されません。");
      }

      setIsReady(true);
    }

    restore();
  }, []);

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

      await registerParticipant(trimmed);
      localStorage.setItem(STORAGE_KEY_NAME, trimmed);
      setName(trimmed);
    } catch {
      setError("参加登録に失敗しました。もう一度お試しください。");
    } finally {
      setIsJoining(false);
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
      </main>
    </div>
  );
}
