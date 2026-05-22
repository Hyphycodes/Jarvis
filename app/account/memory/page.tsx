import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listPendingMemoryProposals } from "@/lib/memory/memoryProposals";
import { BackButton, MotionPage } from "@/components";
import { ProposalActions } from "./client-bits";

export const metadata = { title: "Memory · Account" };
export const dynamic = "force-dynamic";

export default async function MemoryReviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/memory");

  const proposals =
    user.role === "owner" ? await safeListPendingMemoryProposals() : [];

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
          <ul className="flex flex-col gap-4">
            {proposals.map((proposal) => (
              <li
                key={proposal.id}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-editorial text-muted-gold">
                    {proposal.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-warm-ivory/45">
                    {Math.round(proposal.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="mt-3 font-serif text-[20px] leading-[1.35] text-warm-ivory">
                  {proposal.content}
                </p>
                <p className="mt-3 text-[13px] leading-[1.55] text-warm-ivory/55">
                  {proposal.reason}
                </p>
                {proposal.evidence.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {proposal.evidence.map((ev) => (
                      <li
                        key={ev}
                        className="rounded-md border border-white/[0.06] px-2 py-0.5 text-[11px] text-warm-ivory/55"
                      >
                        {ev}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ProposalActions proposalId={proposal.id} />
              </li>
            ))}
          </ul>
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
