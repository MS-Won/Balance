"use client";

import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextMidnightKST } from "@/lib/countdown";

export function Countdown() {
  const [label, setLabel] = useState(() => formatCountdown(msUntilNextMidnightKST()));

  useEffect(() => {
    const interval = setInterval(() => {
      setLabel(formatCountdown(msUntilNextMidnightKST()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className="font-mono text-sm">⏰ {label}</span>;
}
