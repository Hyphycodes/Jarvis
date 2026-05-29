import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listPendingMemoryProposals } from "@/lib/memory/memoryProposals";
import { BackButton, MotionPage } from "@/components";
import { ProposalReview } from "./client-bits";

export const metadata = { title: "Memory · Account" };
export const dynamic = "force-dynamic";

export default async function MemoryReviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/memory");

  const proposals =
    user.role === "owner" ? await safeListPendingMemoryProposals() : [];

  const pendingCount = proposals.length;

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/account" />
          <Link
            href="/account"
            className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Done
          </Link>
        </header>

        <section className="mt-6">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Memory · Proposals
            {pendingCount > 0 ? (
              <span className="ml-2 rounded-full bg-muted-gold/20 px-2 py-0.5 text-[10px] text-muted-gold">
                {pendingCount} pending
              </span>
            ) : null}
          </span>
          <h1 className="mt-2 font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
            What Jarvis is learning.
          </h1>
          <p className="mt-4 max-w-[40ch] font-serif text-[22px] italic leading-[1.25] text-warm-ivory/70">
            Patterns from your behavior. Nothing becomes long-term memory
            until you accept it.
          </p>
        </section>

        <div className="my-8 h-px w-full" style={{ background: "rgba(255, 250, 240, 0.06)" }} />

        {proposals.length === 0 ? (
          <p className="text-[14px] text-warm-ivory/55">
            No pending proposals. Use the app — saves, passes, and completions
            will surface here when patterns emerge.
          </p>
        ) : (
          <ProposalReview proposals={proposals} />
        )}
      </MotionPage>
    </main>
  );
}

async function safeListPendingMemoryProposals() {
  try {
    return await listPendingMemoryProposals();
  } catch (error) {
    console.error("[surface-loader] account.memory.proposals", error);
    return [];
  }
}
