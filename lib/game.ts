export const TARGET_TIME = 8.22;

export type GamePhase = "idle" | "armed" | "countdown" | "running";
export type UserStatus = "waiting" | "running" | "finished";

export type GameData = {
  phase: "armed" | "countdown" | "running";
  startAt?: number;
};

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

export function formatDiff(score: number): string {
  const diff = score - TARGET_TIME;
  if (diff >= 0) return `+${diff.toFixed(2)}`;
  return diff.toFixed(2);
}

export function isRegistrationOpen(game: GameData | null): boolean {
  return game === null;
}
