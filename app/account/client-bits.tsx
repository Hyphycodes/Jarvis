"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";
import { press, ease } from "@/lib/motion";

const MotionLink = motion(Link);

export function PressLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <MotionLink
      href={href}
      className={className}
      whileTap={{
        scale: press.whileTap.scale,
        transition: { duration: 0.14, ease },
      }}
      transition={{ duration: 0.28, ease }}
    >
      {children}
    </MotionLink>
  );
}

export function PressFormButton({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void> | void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form action={action} className="w-full">
      <motion.button
        type="submit"
        className={className}
        whileTap={{
          scale: press.whileTap.scale,
          transition: { duration: 0.14, ease },
        }}
        transition={{ duration: 0.28, ease }}
      >
        {children}
      </motion.button>
    </form>
  );
}
