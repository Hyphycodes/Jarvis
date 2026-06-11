"use client";

import { useState } from "react";

/**
 * Image slot that can never render broken: while the URL works it shows the
 * image; on error (or no URL) it collapses to a quiet dark placeholder.
 */
export function Thumb({
  src,
  alt,
  className = "",
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className={`overflow-hidden bg-charcoal ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`bg-charcoal ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(184,146,74,0.08), transparent 62%), linear-gradient(180deg, #19191B, #08080A)",
      }}
    />
  );
}
