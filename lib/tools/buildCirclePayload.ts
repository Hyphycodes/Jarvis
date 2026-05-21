import type { CirclePerson, CircleUpdate } from "@/lib/ai/types";

export function buildCirclePayload(input: {
  people?: CirclePerson[];
  updates?: CircleUpdate[];
} = {}): {
  people: CirclePerson[];
  updates: CircleUpdate[];
} {
  return {
    people: input.people ?? [],
    updates: input.updates ?? [],
  };
}
