/**
 * Sample PlanBrief — used only when `/plan/sample` is requested and no
 * real plan exists at that slug. Sparrow proper lives at `/plan/sparrow`
 * (static segment) and stays untouched. This is the design dev fallback.
 */

import type { PlanBrief } from "@/lib/plans/planBrief";

export function samplePlanBrief(): PlanBrief {
  return {
    slug: "sample",
    sourceType: "sample",
    title: "Sparrow Tonight",
    category: "dining",
    shape: "experience",
    isSequential: true,
    dateLabel: "Tonight",
    timeLabel: "8:30 PM",
    areaLabel: "West Loop, Chicago",
    locationLabel: "Sparrow · West Loop",
    summary: "Quiet night. Deep food. The kind of room that earns the table.",
    state: "ready",
    fallbackUsed: false,
    confidence: 0.82,
    infoStrip: [
      {
        label: "LEAVE BY",
        value: "7:42 PM",
        sub: "30 min before",
        icon: "clock",
      },
      {
        label: "WEATHER",
        value: "61°",
        sub: "Clearing",
        icon: "weather",
      },
      {
        label: "PARKING",
        value: "Valet",
        sub: "Arrive before 8:15",
        icon: "parking",
      },
      {
        label: "IN THE AREA",
        value: "Marco C.",
        sub: "In West Loop",
        icon: "person",
      },
    ],
    chapters: [
      {
        key: "before",
        title: "BEFORE YOU GO",
        description: "What to wear, bring, and know before you leave.",
        href: "/plan/sample/before",
        icon: "jacket",
        confirmation: "Fit, timing, and essentials are staged.",
        hasContent: true,
      },
      {
        key: "move",
        title: "THE MOVE",
        description: "The flow of the night, step by step.",
        href: "/plan/sample/move",
        icon: "wine",
        confirmation: "Leave window and first move are set.",
        hasContent: true,
      },
      {
        key: "atmosphere",
        title: "ATMOSPHERE",
        description: "Energy, music, lighting, and the mood.",
        href: "/plan/sample/atmosphere",
        icon: "record",
        confirmation: "Low light, low volume — the room reads itself.",
        hasContent: true,
      },
      {
        key: "details",
        title: "THE DETAILS",
        description: "Address, reservation, contacts, and intel.",
        href: "/plan/sample/details",
        icon: "map-pin",
        confirmation: "Reservation held. Address confirmed.",
        hasContent: true,
      },
      {
        key: "detours",
        title: "OPTIONAL DETOURS",
        description: "Places worth considering along the way.",
        href: "/plan/sample/detours",
        icon: "signpost",
        confirmation: "Two stops nearby if the night opens up.",
        hasContent: true,
      },
      {
        key: "after",
        title: "AFTER",
        description: "How the night can end well.",
        href: "/plan/sample/after",
        icon: "moon",
        confirmation: "The walk home is part of the plan.",
        hasContent: true,
      },
    ],
    before: {
      wear: [
        "Quiet luxury. The room is dim — let the fit be subtle.",
        "Charcoal or navy. Tailored, not formal.",
        "Leather loafers, not sneakers. The walk home will be wet.",
        "A jacket. The kitchen runs cool.",
      ],
      bring: [
        "Wallet",
        "Valet ticket (in jacket pocket, not pants)",
        "The small notebook",
        "Reading glasses",
        "Phone on silent",
      ],
      know: [
        "Reservation under your name. Ask for Marco — he's the manager.",
        "They finish dishes with lemon olive oil. Ask for extra.",
        "The wine list is long. Trust the somm.",
      ],
      closing: "Take your time. The night is staged.",
    },
    move: {
      items: [
        {
          time: "7:42 PM",
          title: "Leave home.",
          body: "Slow exit. Don't rush the doorway. The night is staged.",
        },
        {
          time: "8:15 PM",
          title: "Arrive. The bar first.",
          body: "One Old Fashioned while the table settles. Let the room reveal itself.",
          note: "7 MIN WALK FROM VALET",
        },
        {
          time: "8:30 PM",
          title: "Seated.",
          body: "Order slowly. The lemon olive oil — ask for extra. Let them lead the pace.",
        },
        {
          time: "9:10 PM",
          title: "First course.",
          body: "Look up. Talk less. The conversation that matters tonight starts here.",
        },
        {
          time: "10:15 PM",
          title: "The pause.",
          body: "Most evenings end too fast. Order a digestif. Let the night feel longer than it is.",
        },
        {
          time: "11:15 PM",
          title: "Walk home.",
          body: "Rain has cleared. The walk back is part of the plan, not the after.",
          note: "VALET CLOSES AT 11:30",
        },
      ],
      closing: "This is the shape of the night. Don't follow it — let it carry you.",
    },
    atmosphere: {
      body:
        "Low light. Low volume. The room is built for the conversation, not the photo. Sit where you can read the room without performing for it.",
      bullets: [
        "Corner banquette if it's free — the dimmer side reads better.",
        "The vinyl pulls toward the late-set hour — let it.",
      ],
      confirmation: "Room tone matches your taste graph.",
      closing: "Let the room set the pace.",
    },
    details: {
      body:
        "Address, valet timing, and the name to ask for. Confirm before the door closes behind you.",
      bullets: [
        "Reservation: under your name.",
        "Ask for: Marco.",
        "Patio if open — ask quietly.",
      ],
      confirmation: "These hold the plan together.",
      closing: "Settled details are a quiet luxury.",
    },
    detours: {
      body:
        "If the night opens up after the close, two nearby moves work. Skip without losing the night.",
      bullets: [
        "Lone Wolf for a clean nightcap.",
        "A walk along Randolph if the rain stays cleared.",
      ],
      confirmation: "Three considered. Use one, or none.",
      closing: "Skip them without losing the night.",
    },
    after: {
      body:
        "Short notes. Who showed up well, what was worth ordering again, the next move that opened up.",
      bullets: [
        "Note the dishes worth repeating.",
        "Add Marco to the people layer if not already.",
      ],
      confirmation: "Carry the best of it forward.",
      closing: "Carry the best of it forward.",
    },
    quote: {
      body: "Quiet night. Deep food. Good for long conversation and even better for listening.",
      attribution: "— J.",
    },
    truth: { missing: [], assumed: [] },
  };
}
