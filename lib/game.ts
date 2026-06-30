export const TARGET_TIME = 8.22;

export const TABLES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
] as const;

export type TableId = (typeof TABLES)[number];

export type GamePhase = "idle" | "armed" | "countdown" | "running";
export type UserStatus = "waiting" | "running" | "finished";

export type GameData = {
  phase: "armed" | "countdown" | "running";
  startAt?: number;
};

export type Participant = {
  id: string;
  name: string;
  table: TableId;
  status: UserStatus;
  score?: number;
};

export type RankedParticipant = Participant & {
  rank: number;
  diffFromTarget: number;
};

export function isTableId(value: string): value is TableId {
  return (TABLES as readonly string[]).includes(value);
}

export function parseGameData(data: unknown): GameData | null {
  if (!data || typeof data !== "object") return null;
  const game = data as { phase?: string; startAt?: number };
  if (
    game.phase !== "armed" &&
    game.phase !== "countdown" &&
    game.phase !== "running"
  ) {
    return null;
  }
  return { phase: game.phase, startAt: game.startAt };
}

export function getEffectivePhase(
  game: GameData | null,
  now: number
): GamePhase {
  if (!game) return "idle";
  if (game.phase === "armed") return "armed";
  if (game.phase === "countdown" || game.phase === "running") {
    if (game.startAt && now >= game.startAt) return "running";
    if (game.phase === "countdown" && game.startAt) return "countdown";
    if (game.phase === "running") return "running";
  }
  return "idle";
}

export function getCountdownNumber(
  startAt: number,
  now: number
): number | null {
  const remaining = startAt - now;
  if (remaining <= 0) return null;
  return Math.min(3, Math.max(1, Math.ceil(remaining / 1000)));
}

export function getElapsedSeconds(startAt: number, now: number): number {
  return Math.max(0, (now - startAt) / 1000);
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function formatJapaneseTime(score: number): string {
  const rounded = Math.round(score * 100) / 100;
  const seconds = Math.floor(rounded);
  const centis = Math.round((rounded - seconds) * 100);
  return `${seconds}秒${centis.toString().padStart(2, "0")}`;
}

export function formatDiff(score: number): string {
  const diff = Math.round((score - TARGET_TIME) * 100) / 100;
  if (diff >= 0) return `+${diff.toFixed(2)}`;
  return diff.toFixed(2);
}

export function isRegistrationOpen(game: GameData | null): boolean {
  return game === null;
}

export function buildRankings(participants: Participant[]): RankedParticipant[] {
  const finished = participants.filter(
    (p) => p.status === "finished" && p.score != null
  );

  const sortedBestFirst = [...finished].sort((a, b) => {
    const diffA = Math.abs(a.score! - TARGET_TIME);
    const diffB = Math.abs(b.score! - TARGET_TIME);
    if (diffA !== diffB) return diffA - diffB;
    return a.score! - b.score!;
  });

  return sortedBestFirst.map((p, index) => ({
    ...p,
    rank: index + 1,
    diffFromTarget: Math.abs(p.score! - TARGET_TIME),
  }));
}

export function getParticipantByRank(
  rankings: RankedParticipant[],
  rank: number
): RankedParticipant | undefined {
  return rankings.find((p) => p.rank === rank);
}

export function formatRankAnnouncement(p: RankedParticipant): string {
  return `${p.rank}位　${p.table}卓 ${p.name}　${formatJapaneseTime(p.score!)}（${formatDiff(p.score!)}）`;
}
