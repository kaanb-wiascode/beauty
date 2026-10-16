"use client";

import { useEffect } from "react";

export function ExperienceMotion() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.dataset.revealState = "visible");
      return;
    }

    targets.forEach((target) => {
      target.dataset.revealState = target.getBoundingClientRect().top < window.innerHeight * 0.92
        ? "visible"
        : "pending";
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.revealState = "visible";
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    targets
      .filter((target) => target.dataset.revealState === "pending")
      .forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  return null;
}
