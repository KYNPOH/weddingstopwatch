"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, remove, set } from "firebase/database";
import confetti from "canvas-confetti";
import { Play, RotateCcw } from "lucide-react";
import { getFirebaseDatabase, isFirebaseConfigured } from "@/lib/firebase";
import {
  TABLES,
  buildRankings,
  formatDiff,
  formatJapaneseTime,
  formatRankAnnouncement,
  getCountdownNumber,
  getEffectivePhase,
  getParticipantByRank,
  isTableId,
  parseGameData,
  type GameData,
  type Participant,
  type RankedParticipant,
  type TableId,
  type UserStatus,
} from "@/lib/game";

type ResultPhase = "playing" | "aggregating" | "announcing" | "done";
type TitlePhase = "hidden" | "center" | "top";

type RankLine = {
  key: number;
  text: string;
  ranks: number[];
  emphasis?: boolean;
};

const RANK_REVEAL_MS = 2500;
const PAUSE_BEFORE_THIRD_MS = 1800;
const PAUSE_BEFORE_TOP_MS = 2200;
const INTRO_CENTER_MS = 1800;
const INTRO_MOVE_MS = 1200;
const TOP_REVEAL_MS = 4500;
const AGGREGATING_MS = 5000;

function parseParticipant(id: string, value: unknown): Participant | null {
  const user = value as {
    name?: string;
    table?: string;
    status?: UserStatus;
    score?: number;
  };
  if (!user.table || !isTableId(user.table)) return null;
  return {
    id,
    name: user.name ?? "名無し",
    table: user.table,
    status: user.status ?? "waiting",
    score: user.score,
  };
}

function RankRevealLine({ line }: { line: RankLine }) {
  return (
    <p
      className={`animate-slide-in-right w-full overflow-hidden text-center font-serif leading-relaxed ${
        line.emphasis
          ? "text-xl text-champagne-light sm:text-3xl"
          : "text-base text-white/90 sm:text-xl"
      }`}
    >
      {line.text}
    </p>
  );
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
  const [titlePhase, setTitlePhase] = useState<TitlePhase>("hidden");
  const [rankLines, setRankLines] = useState<RankLine[]>([]);
  const [highlightedRanks, setHighlightedRanks] = useState<Set<number>>(
    new Set()
  );
  const [firebaseReady, setFirebaseReady] = useState(isFirebaseConfigured());
  const roundStartedRef = useRef(false);
  const participantsRef = useRef<Participant[]>([]);
  const announceAbortRef = useRef(false);
  const lineKeyRef = useRef(0);
  const confettiFiredRef = useRef(false);

  const effectivePhase = getEffectivePhase(game, now);
  const countdownNumber =
    effectivePhase === "countdown" && game?.startAt
      ? getCountdownNumber(game.startAt, now)
      : null;

  const participantsByTable = participants.reduce<
    Record<TableId, Participant | undefined>
  >(
    (acc, p) => {
      acc[p.table] = p;
      return acc;
    },
    {} as Record<TableId, Participant | undefined>
  );

  const rankings = useMemo(() => buildRankings(participants), [participants]);
  const rankByParticipantId = useMemo(
    () => new Map(rankings.map((r) => [r.id, r.rank])),
    [rankings]
  );

  const pushRankLine = useCallback(
    (text: string, ranks: number[], emphasis = false) => {
      lineKeyRef.current += 1;
      setRankLines((prev) => [
        ...prev,
        { key: lineKeyRef.current, text, ranks, emphasis },
      ]);
      setHighlightedRanks((prev) => new Set([...prev, ...ranks]));
    },
    []
  );

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

      const list = Object.entries(data)
        .map(([id, value]) => parseParticipant(id, value))
        .filter((p): p is Participant => p !== null);

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

  const resetAnnouncement = useCallback(() => {
    announceAbortRef.current = true;
    setResultPhase("playing");
    setTitlePhase("hidden");
    setRankLines([]);
    setHighlightedRanks(new Set());
    lineKeyRef.current = 0;
    confettiFiredRef.current = false;
    roundStartedRef.current = false;
  }, []);

  useEffect(() => {
    if (!allFinished) {
      resetAnnouncement();
      return;
    }

    if (roundStartedRef.current) return;
    roundStartedRef.current = true;
    announceAbortRef.current = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    async function revealRank(p: RankedParticipant, emphasis = false) {
      pushRankLine(formatRankAnnouncement(p), [p.rank], emphasis);
      await wait(emphasis ? RANK_REVEAL_MS + 800 : RANK_REVEAL_MS);
    }

    async function runAnnouncement() {
      setResultPhase("aggregating");
      setTitlePhase("hidden");
      setRankLines([]);
      await wait(AGGREGATING_MS);
      if (announceAbortRef.current) return;

      setResultPhase("announcing");
      setTitlePhase("center");
      await wait(INTRO_CENTER_MS);
      if (announceAbortRef.current) return;

      setTitlePhase("top");
      await wait(INTRO_MOVE_MS);
      if (announceAbortRef.current) return;

      const currentRankings = buildRankings(participantsRef.current);
      const total = currentRankings.length;
      if (total === 0) {
        setResultPhase("done");
        return;
      }

      for (let rank = total; rank >= 4; rank--) {
        const p = getParticipantByRank(currentRankings, rank);
        if (!p) continue;
        await revealRank(p);
        if (announceAbortRef.current) return;
      }

      if (total >= 3) {
        await wait(PAUSE_BEFORE_THIRD_MS);
        if (announceAbortRef.current) return;
        const third = getParticipantByRank(currentRankings, 3)!;
        await revealRank(third, true);
        if (announceAbortRef.current) return;
      }

      if (total >= 2) {
        await wait(PAUSE_BEFORE_TOP_MS);
        if (announceAbortRef.current) return;
        const second = getParticipantByRank(currentRankings, 2)!;
        const first = getParticipantByRank(currentRankings, 1)!;
        pushRankLine(formatRankAnnouncement(second), [2], true);
        await wait(180);
        if (announceAbortRef.current) return;
        pushRankLine(formatRankAnnouncement(first), [1], true);
        await wait(TOP_REVEAL_MS);
        if (announceAbortRef.current) return;
      } else if (total === 1) {
        const first = getParticipantByRank(currentRankings, 1)!;
        await revealRank(first, true);
        if (announceAbortRef.current) return;
      }

      setResultPhase("done");
      if (!confettiFiredRef.current) {
        confettiFiredRef.current = true;
        fireConfettiBurst();
      }
    }

    runAnnouncement();
  }, [allFinished, pushRankLine, resetAnnouncement]);

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

    resetAnnouncement();

    const db = getFirebaseDatabase();
    await set(ref(db, "session/id"), Date.now());
    await remove(ref(db, "users"));
    await remove(ref(db, "game"));
  }, [resetAnnouncement]);

  const canArmGame =
    effectivePhase === "idle" &&
    participants.length > 0 &&
    participants.every((p) => p.status === "waiting");
  const canStartCountdown = effectivePhase === "armed";
  const showAggregating = resultPhase === "aggregating";
  const showResultOverlay =
    resultPhase === "announcing" || resultPhase === "done";

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
        </div>
      </div>
    );
  }

  return (
    <div className="bg-luxury-navy relative min-h-screen overflow-x-hidden text-white">
      <header className="px-4 py-4 text-center sm:px-6 sm:py-5">
        <p className="font-serif text-xs tracking-[0.35em] text-champagne-muted uppercase">
          Wedding Celebration
        </p>
        <h1 className="font-serif mt-1 text-2xl font-semibold tracking-wide sm:text-3xl">
          <span className="text-gold-gradient">8.22</span>
          <span className="text-white">秒チャレンジ</span>
        </h1>
        <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-champagne to-transparent" />
      </header>

      <main className="px-3 pb-28 sm:px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-4 gap-2 sm:gap-3">
          {TABLES.map((tableId, index) => {
            const p = participantsByTable[tableId];
            const isFinished = p?.status === "finished";
            const isMeasuring =
              !!p && effectivePhase === "running" && !isFinished;
            const isPreparing =
              !!p &&
              (effectivePhase === "armed" || effectivePhase === "countdown") &&
              !isFinished;
            const rank = p ? rankByParticipantId.get(p.id) : undefined;
            const isHighlighted =
              rank != null && highlightedRanks.has(rank);

            return (
              <div
                key={tableId}
                style={{ animationDelay: `${index * 50}ms` }}
                className={`animate-float-up luxury-card-dark flex min-h-[88px] flex-col justify-center rounded-xl px-2 py-3 transition-all duration-500 sm:min-h-[100px] sm:px-3 ${
                  isHighlighted
                    ? "ring-2 ring-champagne shadow-[0_0_24px_rgba(212,175,55,0.35)]"
                    : ""
                }`}
              >
                <p className="font-display text-xs text-champagne-muted sm:text-sm">
                  {tableId}卓
                </p>

                {!p && (
                  <p className="font-serif mt-1 text-sm text-white/20">—</p>
                )}

                {p && (
                  <>
                    <p className="font-serif mt-1 truncate text-sm font-semibold text-champagne-light sm:text-base">
                      {p.name}
                    </p>

                    {isMeasuring && (
                      <p className="font-serif animate-shimmer mt-1 text-xs text-champagne sm:text-sm">
                        計測中...
                      </p>
                    )}

                    {isFinished && p.score != null && (
                      <div className="mt-1">
                        <p className="font-display text-base font-bold text-white sm:text-lg">
                          {formatJapaneseTime(p.score)}
                        </p>
                        <p className="font-display text-xs text-champagne-light/70 sm:text-sm">
                          {formatDiff(p.score)}
                        </p>
                      </div>
                    )}

                    {!isMeasuring && !isFinished && (
                      <p className="font-serif mt-1 text-xs text-white/35">
                        {isPreparing ? "準備中..." : "待機中..."}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {countdownNumber != null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/60 backdrop-blur-sm">
          <p className="font-display text-9xl font-bold text-champagne-light sm:text-[12rem]">
            {countdownNumber}
          </p>
        </div>
      )}

      {showAggregating && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="animate-slow-blink text-center">
            <p className="font-display text-4xl font-bold tracking-wider text-champagne-light drop-shadow-lg sm:text-6xl">
              FINISH!!
            </p>
            <p className="font-serif mt-2 text-xl text-white/90 drop-shadow-lg sm:text-3xl">
              集計中...
            </p>
          </div>
        </div>
      )}

      {showResultOverlay && titlePhase !== "hidden" && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden bg-navy/92 backdrop-blur-md">
          <p
            className={`announce-title-motion font-serif absolute left-1/2 -translate-x-1/2 font-semibold text-champagne-light drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] ${
              titlePhase === "center"
                ? "top-1/2 -translate-y-1/2 text-5xl tracking-wide sm:text-7xl"
                : "top-14 translate-y-0 text-xl tracking-[0.35em] sm:text-3xl"
            }`}
          >
            結果発表！
          </p>

          <div className="scrollbar-hide absolute inset-x-0 top-28 flex max-h-[calc(100vh-8rem)] flex-col items-center overflow-x-hidden overflow-y-auto px-6 sm:top-32 sm:px-12">
            <div className="flex w-full max-w-4xl flex-col items-center gap-3 sm:gap-4">
              {rankLines.map((line) => (
                <RankRevealLine key={line.key} line={line} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 left-4 right-4 z-[60] flex items-center justify-between gap-3">
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
