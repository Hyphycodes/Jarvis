import { fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { getWhiteSoxTeamId } from "@/lib/env";

/**
 * MLB Stats API — no key required.
 * https://statsapi.mlb.com
 */

const BASE = "https://statsapi.mlb.com/api/v1";

export type MlbGame = {
  gamePk: number;
  gameDate: string;
  status?: { detailedState?: string };
  teams: {
    home: {
      team: { id: number; name: string };
      score?: number;
    };
    away: {
      team: { id: number; name: string };
      score?: number;
    };
  };
  venue?: { name?: string };
};

export async function getTeamSchedule(input: {
  teamId: number;
  startDate: string;
  endDate: string;
}): Promise<MlbGame[]> {
  const key = `mlb:schedule:${input.teamId}:${input.startDate}:${input.endDate}`;
  return cached(key, TTL.events, async () => {
    const data = await fetchJson<{
      dates?: { games?: MlbGame[] }[];
    }>(`${BASE}/schedule`, {
      service: "mlb",
      query: {
        sportId: 1,
        teamId: input.teamId,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    return (data.dates ?? []).flatMap((d) => d.games ?? []);
  });
}

export async function getWhiteSoxSchedule(input: {
  startDate: string;
  endDate: string;
}): Promise<MlbGame[]> {
  return getTeamSchedule({
    teamId: getWhiteSoxTeamId(),
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getGameDetails(gamePk: number): Promise<MlbGame | null> {
  const key = `mlb:game:${gamePk}`;
  return cached(key, TTL.short, async () => {
    try {
      const data = await fetchJson<{ gameData?: unknown }>(
        `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
        { service: "mlb" },
      );
      return data as unknown as MlbGame;
    } catch {
      return null;
    }
  });
}
