"use client";

import { FormEvent, useEffect, useState } from "react";

const STORAGE_KEY = "participantName";

export default function ParticipantPage() {
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setName(savedName);
    }
    setIsReady(true);
  }, []);

  const handleJoin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputName.trim();
    if (!trimmed) return;

    localStorage.setItem(STORAGE_KEY, trimmed);
    setName(trimmed);
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
            <button
              type="submit"
              disabled={!inputName.trim()}
              className="font-serif rounded-lg bg-gradient-to-r from-champagne to-champagne-muted px-4 py-3 font-semibold tracking-wide text-navy transition-all hover:shadow-[0_4px_20px_rgba(212,175,55,0.4)] disabled:cursor-not-allowed disabled:from-navy/20 disabled:to-navy/20 disabled:text-navy/40"
            >
              参加する
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
      </main>
    </div>
  );
}
