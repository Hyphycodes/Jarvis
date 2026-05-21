import type {
  CirclePerson,
  CircleUpdate,
  IntelligenceResult,
  NorthPayload,
  PlanDetailPayload,
  RadarCard,
  RoutedPayloads,
  TodayPayload,
} from "@/lib/ai/types";
import { buildCirclePayload } from "@/lib/tools/buildCirclePayload";
import { buildNorthPayload } from "@/lib/tools/buildNorthPayload";
import { buildRadarPayload } from "@/lib/tools/buildRadarPayload";
import { buildTodayPayload } from "@/lib/tools/buildTodayPayload";

export function routeIntelligence(result: IntelligenceResult): RoutedPayloads {
  const radar: RadarCard[] = [];
  const people: CirclePerson[] = [];
  const updates: CircleUpdate[] = [];
  const planDetails: PlanDetailPayload[] = [];
  let today: TodayPayload | undefined;
  let north: NorthPayload | undefined;

  for (const item of result.routed) {
    switch (item.destination) {
      case "today.hero":
      case "today.timeline":
      case "today.grabList":
      case "today.livePlan":
        today = mergeToday(today, item.payload);
        break;
      case "radar.feed":
      case "radar.saved":
      case "radar.passed":
        if (isObject(item.payload)) radar.push(item.payload as RadarCard);
        break;
      case "circle.person":
        if (isObject(item.payload)) people.push(item.payload as CirclePerson);
        break;
      case "circle.update":
        if (isObject(item.payload)) updates.push(item.payload as CircleUpdate);
        break;
      case "north.goal":
      case "north.pillar":
        north = mergeNorth(north, item.payload);
        break;
      case "plan.detail":
        if (isObject(item.payload)) planDetails.push(item.payload as PlanDetailPayload);
        break;
      default:
        break;
    }
  }

  return {
    today,
    radar: radar.length ? buildRadarPayload(radar) : undefined,
    circle: people.length || updates.length ? buildCirclePayload({ people, updates }) : undefined,
    north,
    planDetails: planDetails.length ? planDetails : undefined,
    memoryProposals: result.memoryProposals,
  };
}

function mergeToday(current: TodayPayload | undefined, payload: unknown): TodayPayload {
  if (!isObject(payload)) return current ?? buildTodayPayload();
  return buildTodayPayload({
    ...(current ?? buildTodayPayload()),
    ...(payload as Partial<TodayPayload>),
  });
}

function mergeNorth(current: NorthPayload | undefined, payload: unknown): NorthPayload {
  if (!isObject(payload)) return current ?? buildNorthPayload();
  return buildNorthPayload({
    ...(current ?? buildNorthPayload()),
    ...(payload as Partial<NorthPayload>),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
