import { AppFrame, BottomNav } from "@/components";
import { EmptyTab } from "@/components/empty/EmptyTab";
import { SunriseVisual } from "@/components/empty/Visuals";
import { GuestActions } from "@/components/empty/GuestActions";
import { dateLabel } from "@/lib/dateLabel";

export function TodayEmpty() {
  return (
    <AppFrame>
      <EmptyTab
        title="Today"
        date={dateLabel()}
        copy="The day is quiet. I'll surface what matters when it does."
        visual={<SunriseVisual />}
        headline="Nothing pressing yet."
        actions={
          <GuestActions
            prompts={[
              {
                label: "What's on my plate today?",
                icon: <ChatIcon />,
              },
              {
                label: "Anything I should prepare for?",
                icon: <SparkleIcon />,
              },
            ]}
          />
        }
      />
      <BottomNav active="Today" />
    </AppFrame>
  );
}

function ChatIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5h16v12H8l-4 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4l1.4 4.3L18 10l-4.6 1.7L12 16l-1.4-4.3L6 10l4.6-1.7z" />
    </svg>
  );
}
