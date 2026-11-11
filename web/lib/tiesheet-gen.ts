import type { StructureRound } from "./tournaments";

// Builds a tie-sheet from a list of teams. Pure functions, no network: the Organizer app shows the result, and saves it with the rest.
//  - Knockout: pairs the teams; when the number is not a power of two the first teams in the list get a bye (go straight to round 2).
//    Later rounds hold "Winner of Match N" until the winners are known (the organizer edits them as the matches finish).
//  - League: everyone plays everyone once (round robin), as many rounds as needed.
export type Format = "knockout" | "league";
export type GenOptions = {
  format: Format;
  teams: string[];
  shuffle: boolean;
  thirdPlace: boolean; // knockout only: a play-off between the two beaten semi-finalists
  firstKickOff: string | null; // ISO time of the first match; null = no times
  minutesBetween: number; // from one kick-off to the next
};

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 64;

export function shuffled<T>(list: T[], rnd: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const NAMES = ["Final", "Semi-finals", "Quarter-finals", "Round of 16", "Round of 32", "Round of 64"];
const roundName = (fromEnd: number, index: number) => NAMES[fromEnd] ?? `Round ${index + 1}`;

type M = StructureRound["matches"][number];
const blank = (home: string | null, away: string | null, note: string | null = null): M => ({ home, away, startsAt: null, venue: null, note });

function knockout(teams: string[], thirdPlace: boolean): StructureRound[] {
  const n = teams.length;
  let size = 1;
  while (size < n) size *= 2;
  const byes = size - n;
  const rounds: M[][] = [];
  let counter = 0; // global match number, in playing order
  const winner = (k: number) => `Winner of Match ${k}`;

  // round 1: the teams after the byes play each other
  const byeTeams = teams.slice(0, byes);
  const playing = teams.slice(byes);
  const first: M[] = [];
  const winners: string[] = [];
  for (let i = 0; i < playing.length; i += 2) {
    first.push(blank(playing[i], playing[i + 1]));
    counter++;
    winners.push(winner(counter));
  }
  if (first.length) rounds.push(first);
  // who is in round 2: a team with a bye meets a winner where it can (alternate), the rest meet each other
  const entries: string[] = [];
  for (let i = 0; i < Math.max(byeTeams.length, winners.length); i++) {
    if (i < byeTeams.length) entries.push(byeTeams[i]);
    if (i < winners.length) entries.push(winners[i]);
  }

  // the rest: pair the entries until one match is left (the final)
  let cur = entries;
  while (cur.length > 1) {
    const next: M[] = [];
    const nextEntries: string[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(blank(cur[i], cur[i + 1] ?? null));
      counter++;
      nextEntries.push(winner(counter));
    }
    rounds.push(next);
    cur = nextEntries;
  }

  const out = rounds.map((ms, i) => ({ name: roundName(rounds.length - 1 - i, i), matches: ms }));
  // third place play-off: the two beaten semi-finalists, played in the final's round
  if (thirdPlace && rounds.length >= 2 && rounds[rounds.length - 2].length === 2) {
    const semiStart = counter - 2; // the two semi-finals are matches counter-2 and counter-1, the final is counter
    out[out.length - 1].matches.push(blank(`Loser of Match ${semiStart}`, `Loser of Match ${semiStart + 1}`, "Third place play-off"));
  }
  return out;
}

function league(teams: string[]): StructureRound[] {
  const list: (string | null)[] = [...teams];
  if (list.length % 2 === 1) list.push(null); // a rest round for an odd number of teams
  const n = list.length;
  const rounds: StructureRound[] = [];
  for (let r = 0; r < n - 1; r++) {
    const ms: M[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) ms.push(r % 2 === 0 ? blank(a, b) : blank(b, a));
    }
    rounds.push({ name: `Round ${r + 1}`, matches: ms });
    // rotate everything except the first team
    list.splice(1, 0, list.pop() as string | null);
  }
  return rounds;
}

export function generate(o: GenOptions): StructureRound[] {
  const clean = o.teams.map((t) => t.trim()).filter(Boolean);
  if (clean.length < MIN_TEAMS) return [];
  const teams = o.shuffle ? shuffled(clean) : clean;
  const rounds = o.format === "league" ? league(teams) : knockout(teams, o.thirdPlace);
  // kick-off times, one match after another
  if (o.firstKickOff) {
    const start = new Date(o.firstKickOff).getTime();
    let k = 0;
    for (const r of rounds) for (const m of r.matches) m.startsAt = new Date(start + k++ * Math.max(5, o.minutesBetween) * 60_000).toISOString();
  }
  return rounds;
}

/** Match numbers (1, 2, 3 ...) in playing order, so "Winner of Match 3" can be found on the sheet. */
export const numberMatches = <T extends { matches: unknown[] }>(rounds: T[]) => {
  let n = 0;
  return rounds.map((r) => r.matches.map(() => ++n));
};
