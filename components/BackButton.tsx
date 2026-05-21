"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ease } from "@/lib/motion";

type Props = {
  fallbackHref?: string;
};

export function BackButton({ fallbackHref = "/" }: Props) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-label="Back"
      className="-ml-1 inline-flex h-9 w-9 items-center justify-center text-warm-ivory/70 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory focus:outline-none"
      whileTap={{
        scale: 0.92,
        transition: { duration: 0.12, ease },
      }}
      transition={{ duration: 0.28, ease }}
    >
      <ChevronLeft size={20} strokeWidth={1.5} />
    </motion.button>
  );
}
