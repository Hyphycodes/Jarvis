/**
 * Centralized fallback copy for PlanBrief.
 *
 * All "Jarvis voice" fallback strings live here so they're version-
 * controlled in one place — never scattered across components. The
 * builder selects from these banks based on the plan's PlanCategory.
 *
 * Truth rule: nothing here invents a real-world fact. Lines are
 * directional guidance ("Confirm parking before you leave.") not
 * specific claims ("Valet is $40 at Lot B.").
 */

import type {
  PlanCategory,
  PlanChapterKey,
  PlanInfoBlock,
} from "@/lib/plans/planBrief";

// ── Hero / summary fallback by category ────────────────────────────────────

const SUMMARY_BY_CATEGORY: Record<PlanCategory, string> = {
  dining: "A night that earns its pace. Sit. Read the room. Don't rush.",
  social: "An evening worth showing up clean for. Make space, then listen.",
  family: "Time that's owed. Show up, stay, leave nothing unsaid.",
  errand: "A clean run. Get in, get out, keep the rest of the day open.",
  creative: "Protect the block. The work compounds when nothing else does.",
  work: "Heads down. Move the needle, then close it cleanly.",
  wellness: "Stack the day around the body. The rest gets easier.",
  travel: "A move worth packing well for. Travel light, arrive ready.",
  purchase: "Slow on the decision. Fast on the execution.",
  unknown: "Worth holding the line for. Confirm the details, then commit.",
};

export function summaryFor(category: PlanCategory): string {
  return SUMMARY_BY_CATEGORY[category];
}

// ── Hero category labels ───────────────────────────────────────────────────

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  dining: "DINING",
  social: "SOCIAL",
  family: "FAMILY",
  errand: "ERRAND",
  creative: "CREATIVE",
  work: "WORK",
  wellness: "WELLNESS",
  travel: "TRAVEL",
  purchase: "PURCHASE",
  unknown: "PLAN",
};

export function categoryLabel(category: PlanCategory): string {
  return CATEGORY_LABEL[category];
}

// ── InfoStrip fallback values ──────────────────────────────────────────────

export const INFO_STRIP_FALLBACK: Record<
  "leaveBy" | "weather" | "parking" | "inArea",
  Omit<PlanInfoBlock, "missing"> & { sub?: string }
> = {
  leaveBy: {
    label: "LEAVE BY",
    value: "Confirm timing",
    sub: "Set a window first",
    icon: "clock",
  },
  weather: {
    label: "WEATHER",
    value: "Not connected",
    sub: "Wire the lat/lng",
    icon: "weather",
  },
  parking: {
    label: "PARKING",
    value: "Confirm",
    sub: "Garage or street",
    icon: "parking",
  },
  inArea: {
    label: "IN THE AREA",
    value: "No one yet",
    sub: "Add a person",
    icon: "person",
  },
};

// ── Chapter row confirmation fallback ──────────────────────────────────────

const CHAPTER_CONFIRMATION_FALLBACK: Record<PlanChapterKey, string> = {
  before: "Essentials staged — fit, timing, what to bring.",
  move: "Flow ready — open, anchor, close.",
  atmosphere: "Room tone pulled from your taste graph.",
  details: "Confirm address and timing before you leave.",
  detours: "Three nearby options if the night opens up.",
  after: "Keep what was worth keeping. Let the rest go.",
  "around-it": "Before, instead, and after — ready if you want them.",
};

export function chapterConfirmationFallback(key: PlanChapterKey): string {
  return CHAPTER_CONFIRMATION_FALLBACK[key];
}

// ── Chapter copy bank (used by /atmosphere /details /detours /after) ──────

export type ChapterCopy = {
  eyebrow: string;
  title: string;        // italic serif
  subtitle: string;     // italic
  closing: string;
  /** When the matching section is missing, this is the body fallback. */
  fallbackBody: string;
};

const CHAPTER_COPY: Record<PlanChapterKey, ChapterCopy> = {
  before: {
    eyebrow: "BEFORE YOU GO",
    title: "Ready the night.",
    subtitle:
      "What to wear, what to bring, what to know. Set yourself before you set out.",
    closing: "Take your time. The night is staged.",
    fallbackBody:
      "Keep the prep clean. Wear what works for the room, bring only what serves the plan, and confirm timing before you step out.",
  },
  move: {
    eyebrow: "THE MOVE",
    title: "The flow of the night.",
    subtitle:
      "Move slowly — let it breathe. The shape carries you, not the other way around.",
    closing:
      "This is the shape of the night. Don't follow it — let it carry you.",
    fallbackBody:
      "Leave with time. Arrive without rush. Anchor the main moment, take one breath at the middle, then close cleanly.",
  },
  atmosphere: {
    eyebrow: "ATMOSPHERE",
    title: "Energy, mood, room.",
    subtitle: "The shape of the night beyond the plan itself.",
    closing: "Let the room set the pace.",
    fallbackBody:
      "Atmosphere lives in the room. Low light, low volume, low pretense — whatever serves the conversation. Read what the space wants, then match it.",
  },
  details: {
    eyebrow: "THE DETAILS",
    title: "Address, timing, contacts.",
    subtitle: "The intel that keeps the plan clean.",
    closing: "These hold the plan together.",
    fallbackBody:
      "Confirm the specifics before you leave. Address, arrival window, parking, and the name to ask for if there is one. The plan runs better when the details are settled.",
  },
  detours: {
    eyebrow: "OPTIONAL DETOURS",
    title: "If the night opens up.",
    subtitle: "Three places worth considering, no more.",
    closing: "Skip them without losing the night.",
    fallbackBody:
      "Detours are optional by design. If the energy is right after the main move, one more stop can extend the night. If it isn't, head home — the plan was already enough.",
  },
  after: {
    eyebrow: "AFTER",
    title: "When the night closes.",
    subtitle: "What to remember when it's done.",
    closing: "Carry the best of it forward.",
    fallbackBody:
      "After is short. Note what worked, who showed up, what's worth doing again. Then put the day down. The plan ends when you do.",
  },
  "around-it": {
    eyebrow: "AROUND IT",
    title: "Before, instead, and after.",
    subtitle: "The satellites worth holding near the main move.",
    closing: "All optional. None of it required.",
    fallbackBody:
      "Around the main move sits everything optional — a stop before, an alternative instead, a way to end after. Hold them loosely. Reach for one only if the night asks for it.",
  },
};

export function chapterCopy(key: PlanChapterKey): ChapterCopy {
  return CHAPTER_COPY[key];
}

// ── Before section fallback by category ────────────────────────────────────

type BeforeBank = {
  wear: string[];
  bring: string[];
  know: string[];
  closing?: string;
};

const BEFORE_BANK: Record<PlanCategory, BeforeBank> = {
  dining: {
    wear: [
      "Quiet luxury. The room is dim — let the fit be subtle.",
      "Charcoal or navy. Tailored, not formal.",
      "Leather, not sneakers.",
    ],
    bring: ["Wallet", "Reservation reference", "Phone on silent"],
    know: [
      "Confirm the reservation before leaving.",
      "Ask for the table that fits the night — corner, banquette, by the window.",
      "Pace the room. Don't lead the meal.",
    ],
    closing: "Take your time. The night is staged.",
  },
  social: {
    wear: [
      "Sharp but unbothered. Look like you weren't trying.",
      "Match the venue — refined doesn't mean overdressed.",
    ],
    bring: ["Wallet", "Phone on silent", "One thing worth talking about"],
    know: [
      "Show up on time, leave on time.",
      "Listen more than you talk.",
    ],
    closing: "Bring presence. The night does the rest.",
  },
  family: {
    wear: ["What you'd wear at home — clean, comfortable, present."],
    bring: ["What was promised", "Phone on silent"],
    know: [
      "Phone away. The time is the gift.",
      "Don't perform. Just be there.",
    ],
    closing: "Stay until staying matters more than leaving.",
  },
  errand: {
    wear: ["What lets you move — clean, fast, weather-aware."],
    bring: ["Wallet", "Lists or references you need"],
    know: ["One purpose. Don't multi-stack."],
    closing: "Clean run. Keep the rest of the day open.",
  },
  creative: {
    wear: ["Whatever puts you in the work — no thought required."],
    bring: ["The tool", "The reference", "Phone on silent"],
    know: ["Close every other tab. The work is the only meeting."],
    closing: "Protect the block. The work compounds in silence.",
  },
  work: {
    wear: ["What signals you're here to move it."],
    bring: ["The doc", "The agenda", "The number"],
    know: ["Start with the hardest thing. Close it before lunch."],
    closing: "Heads down. Then close the day.",
  },
  wellness: {
    wear: ["What lets the body do its job."],
    bring: ["Water", "Recovery on standby"],
    know: ["Warm up. Then warm up again."],
    closing: "Stack the day around this. The rest gets easier.",
  },
  travel: {
    wear: ["Layer for the trip — what holds up across the day."],
    bring: ["Wallet", "Passport / ID", "Charger", "Headphones"],
    know: ["Confirm everything the day before. Then confirm again."],
    closing: "Travel light. Arrive ready.",
  },
  purchase: {
    wear: ["What it's for — wear-test it if you can."],
    bring: ["Reference photos", "Measurements", "Budget cap"],
    know: ["Don't be talked up. Walk if it's wrong."],
    closing: "Slow on the decision. Fast on the execution.",
  },
  unknown: {
    wear: ["What works for the room you're walking into."],
    bring: ["Wallet", "Phone on silent", "Whatever the plan requires"],
    know: ["Confirm the details before you leave."],
    closing: "Hold the line. The plan is the plan.",
  },
};

export function beforeBank(category: PlanCategory): BeforeBank {
  return BEFORE_BANK[category];
}

// ── Move timeline fallback (used when LoadedPlan.timeline is empty) ───────

export const FALLBACK_MOVE_ITEMS = [
  {
    time: "—",
    title: "Leave.",
    body: "Walk out without rushing. The night is staged.",
  },
  {
    time: "—",
    title: "Arrive.",
    body: "Take the room in before you act on it.",
  },
  {
    time: "—",
    title: "Start.",
    body: "Open the first move slowly. Let the pace land.",
  },
  {
    time: "—",
    title: "The main moment.",
    body: "Whatever this plan was actually for — be present for it.",
  },
  {
    time: "—",
    title: "Pause.",
    body: "Don't let it end too fast. Hold the middle.",
  },
  {
    time: "—",
    title: "Close.",
    body: "Leave clean. The walk back is part of it.",
    note: "CONFIRM ANY DETAILS BEFORE YOU GO",
  },
] as const;

// ── Quote fallback (used when no cautions[0] available) ────────────────────

const QUOTE_BY_CATEGORY: Record<PlanCategory, string> = {
  dining: "Quiet night. Deep food. Good for long conversation and even better for listening.",
  social: "Show up clean. Listen well. The night reads people, not plans.",
  family: "The hours you give back are the only ones that count twice.",
  errand: "Clean lines. Light load. The day stays yours.",
  creative: "The work doesn't care if you feel like it.",
  work: "Move the thing. Then close the day.",
  wellness: "The body keeps the schedule. Everything else follows.",
  travel: "Pack light. Arrive without baggage that isn't yours.",
  purchase: "If you have to talk yourself into it, it isn't right.",
  unknown: "Hold the line. The plan does the rest.",
};

export function quoteFor(category: PlanCategory): string {
  return QUOTE_BY_CATEGORY[category];
}
