"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, remove, set } from "firebase/database";
import confetti from "canvas-confetti";
import { Play, RotateCcw } from "lucide-react";
import { getFirebaseDatabase, isFirebaseConfigured } from "@/lib/firebase";
import {
  TARGET_TIME,
  formatDiff,
  formatScore,
  getCountdownNumber,
  getEffectivePhase,
  parseGameData,
  type GameData,
  type UserStatus,
} from "@/lib/game";

type Participant = {
  id: string;
  name: string;
  status: UserStatus;
  score?: number;
};

type ResultPhase = "playing" | "aggregating" | "results";

function findWinner(participants: Participant[]): string | null {
  let winnerId: string | null = null;
  let bestDiff = Infinity;

  for (const p of participants) {
    if (p.status !== "finished" || p.score == null) continue;
    const diff = Math.abs(p.score - TARGET_TIME);
    if (diff < bestDiff) {
      bestDiff = diff;
      winnerId = p.id;
    }
  }

  return winnerId;
}

function fireConfettiBurst() {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ["#D4AF37", "#E8D5A3", "#C9A962", "#F5F0E8"];

  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 6,
      spread: 100,
      origin: { x: 0.5, y: 0.4 },
      colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  frame();
}

export default function MonitorPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [game, setGame] = useState<GameData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resultPhase, setResultPhase] = useState<ResultPhase>("playing");
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(isFirebaseConfigured());
  const confettiFiredRef = useRef(false);
  const roundStartedRef = useRef(false);
  const participantsRef = useRef<Participant[]>([]);

  const effectivePhase = getEffectivePhase(game, now);
  const countdownNumber =
    effectivePhase === "countdown" && game?.startAt
      ? getCountdownNumber(game.startAt, now)
      : null;

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setFirebaseReady(false);
      return;
    }

    setFirebaseReady(true);
    const db = getFirebaseDatabase();

    const unsubUsers = onValue(ref(db, "users"), (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setParticipants([]);
        participantsRef.current = [];
        return;
      }

      const list: Participant[] = Object.entries(data).map(([id, value]) => {
        const user = value as {
          name?: string;
          status?: UserStatus;
          score?: number;
        };
        return {
          id,
          name: user.name ?? "名無し",
          status: user.status ?? "waiting",
          score: user.score,
        };
      });

      setParticipants(list);
      participantsRef.current = list;
    });

    const unsubGame = onValue(ref(db, "game"), (snapshot) => {
      setGame(parseGameData(snapshot.val()));
    });

    return () => {
      unsubUsers();
      unsubGame();
    };
  }, []);

  useEffect(() => {
    if (effectivePhase !== "countdown" && effectivePhase !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [effectivePhase]);

  const allFinished =
    participants.length > 0 &&
    participants.every((p) => p.status === "finished");

  useEffect(() => {
    if (!allFinished) {
      setResultPhase("playing");
      setWinnerId(null);
      confettiFiredRef.current = false;
      roundStartedRef.current = false;
      return;
    }

    if (roundStartedRef.current) return;
    roundStartedRef.current = true;
    setResultPhase("aggregating");

    const timer = setTimeout(() => {
      setResultPhase("results");
      setWinnerId(findWinner(participantsRef.current));
    }, 3000);

    return () => clearTimeout(timer);
  }, [allFinished]);

  useEffect(() => {
    if (resultPhase === "results" && winnerId && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      fireConfettiBurst();
    }
  }, [resultPhase, winnerId]);

  const handleArmGame = useCallback(async () => {
    if (!isFirebaseConfigured() || participants.length === 0) return;
    await set(ref(getFirebaseDatabase(), "game"), { phase: "armed" });
  }, [participants.length]);

  const handleStartCountdown = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    await set(ref(getFirebaseDatabase(), "game"), {
      phase: "countdown",
      startAt: Date.now() + 3000,
    });
  }, []);

  const handleReset = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    if (!window.confirm("全員のデータをリセットしますか？")) return;

    const db = getFirebaseDatabase();
    await set(ref(db, "session/id"), Date.now());
    await remove(ref(db, "users"));
    await remove(ref(db, "game"));

    setResultPhase("playing");
    setWinnerId(null);
    confettiFiredRef.current = false;
    roundStartedRef.current = false;
  }, []);

  const showDiff = resultPhase === "results";
  const canArmGame =
    effectivePhase === "idle" &&
    participants.length > 0 &&
    participants.every((p) => p.status === "waiting");
  const canStartCountdown = effectivePhase === "armed";

  if (!firebaseReady) {
    return (
      <div className="bg-luxury-navy flex min-h-screen items-center justify-center px-4 text-white">
        <div className="luxury-card-dark animate-float-up max-w-lg rounded-2xl p-8">
          <h1 className="font-serif text-xl font-semibold text-champagne-light">
            Firebase 設定が必要です
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            プロジェクトのルートに{" "}
            <code className="text-champagne-light">.env.local</code>{" "}
            を作成し、Firebase コンソールの設定値を入力してください。
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-white/50">
            <li>
              <code className="text-white/70">.env.local.example</code> を{" "}
              <code className="text-white/70">.env.local</code> にコピー
            </li>
            <li>Firebase コンソール → プロジェクト設定 → マイアプリ から各値を取得</li>
            <li>
              Realtime Database を有効化し、{" "}
              <code className="text-white/70">NEXT_PUBLIC_FIREBASE_DATABASE_URL</code>{" "}
              を設定
            </li>
            <li>
              開発サーバーを再起動（<code className="text-white/70">npm run dev</code>）
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-luxury-navy relative min-h-screen text-white">
      <header className="px-6 py-6 text-center">
        <p className="font-serif text-xs tracking-[0.35em] text-champagne-muted uppercase">
          Wedding Celebration
        </p>
        <h1 className="font-serif mt-2 text-3xl font-semibold tracking-wide sm:text-4xl">
          <span className="text-gold-gradient">8.22</span>
          <span className="text-white">秒チャレンジ</span>
        </h1>
        <p className="font-display mt-2 text-sm text-champagne-light/70">
          目標{" "}
          <span className="font-bold text-champagne">{TARGET_TIME.toFixed(2)}</span>{" "}
          秒に最も近い人が勝利
        </p>
        <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-champagne to-transparent" />
      </header>

      <main className="px-4 pb-28">
        {participants.length === 0 ? (
          <div className="flex h-[50vh] items-center justify-center">
            <p className="font-serif animate-shimmer text-xl text-champagne-light/60">
              参加者を待っています...
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-3 gap-3 sm:gap-4">
            {participants.map((p, index) => {
              const isWinner = showDiff && p.id === winnerId;
              const isFinished = p.status === "finished";
              const isMeasuring =
                effectivePhase === "running" && !isFinished;
              const isPreparing =
                (effectivePhase === "armed" ||
                  effectivePhase === "countdown") &&
                !isFinished;

              return (
                <div
                  key={p.id}
                  style={{ animationDelay: `${index * 80}ms` }}
                  className={`animate-float-up flex flex-col items-center justify-center rounded-xl px-3 py-4 transition-all duration-700 sm:px-4 sm:py-6 ${
                    isWinner
                      ? "luxury-card-winner animate-gentle-float z-10 scale-110"
                      : "luxury-card-dark"
                  }`}
                >
                  <p className="font-serif mb-2 truncate text-base font-semibold text-champagne-light sm:text-lg">
                    {p.name}
                  </p>

                  {isMeasuring && (
                    <p className="font-serif animate-shimmer text-sm text-champagne sm:text-base">
                      計測中...
                    </p>
                  )}

                  {isFinished && p.score != null && (
                    <>
                      <p
                        className={`font-display text-lg font-bold sm:text-xl ${
                          isWinner ? "text-champagne-light" : "text-white/90"
                        }`}
                      >
                        スコア（{formatScore(p.score)}）
                      </p>
                      {showDiff && (
                        <p
                          className={`font-display mt-1 text-sm sm:text-base ${
                            isWinner ? "text-champagne" : "text-white/45"
                          }`}
                        >
                          {formatDiff(p.score)}
                        </p>
                      )}
                    </>
                  )}

                  {!isMeasuring && !isFinished && (
                    <p className="font-serif text-sm text-white/35">
                      {isPreparing ? "準備中..." : "待機中..."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {countdownNumber != null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/60 backdrop-blur-sm">
          <p className="font-display text-9xl font-bold text-champagne-light sm:text-[12rem]">
            {countdownNumber}
          </p>
        </div>
      )}

      {resultPhase === "aggregating" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/85 backdrop-blur-md">
          <div className="animate-float-up text-center">
            <p className="font-display text-5xl font-bold tracking-wider text-champagne-light sm:text-7xl">
              FINISH!!
            </p>
            <p className="font-serif mt-4 text-2xl text-white/80 sm:text-4xl">
              集計中...
            </p>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 left-4 right-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {canArmGame && (
            <button
              type="button"
              onClick={handleArmGame}
              className="font-serif flex items-center gap-2 rounded-lg border border-champagne/40 bg-champagne/20 px-4 py-2 text-sm text-champagne-light transition-colors hover:bg-champagne/30"
            >
              <Play className="h-4 w-4" />
              ゲーム開始
            </button>
          )}
          {canStartCountdown && (
            <button
              type="button"
              onClick={handleStartCountdown}
              className="font-serif flex items-center gap-2 rounded-lg border border-champagne bg-champagne px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-champagne-light"
            >
              スタート
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg border border-champagne/20 bg-navy-light/80 px-3 py-2 text-xs text-white/40 backdrop-blur transition-colors hover:border-champagne/50 hover:text-champagne-light sm:text-sm"
          title="全データリセット"
        >
          <RotateCcw className="h-4 w-4" />
          リセット
        </button>
      </div>
    </div>
  );
}
