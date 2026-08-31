import type { ReactNode, SVGProps } from "react";

type IconName = "home" | "calendar" | "users" | "sparkles" | "user" | "wallet" | "briefcase" | "file" | "clock" | "receipt" | "shield" | "package" | "cart" | "arrows" | "activity" | "chart" | "trend" | "settings";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></>,
  users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 11a3.5 3.5 0 1 0-1-6.8M21 20v-1.5a4 4 0 0 0-3-3.8"/></>,
  sparkles: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
  wallet: <><path d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9A2 2 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10A2.5 2.5 0 0 1 5.5 5H18"/><path d="M17 13h4"/></>,
  briefcase: <><rect x="3" y="6.5" width="18" height="13" rx="2"/><path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3 12h18"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
  receipt: <><path d="M5 3.5h14v17l-3-1.7-4 1.7-4-1.7-3 1.7z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
  cart: <><path d="M3 4h2l2.2 11h10.9L21 7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></>,
  arrows: <><path d="M7 7h13l-3-3M17 17H4l3 3M20 7l-3 3M4 17l3-3"/></>,
  activity: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
  chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></>,
  trend: <><path d="M4 17 10 11l4 4 6-8"/><path d="M15 7h5v5"/></>,
  settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1M8 18l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1M6 8l-.1-.1A2 2 0 0 1 8.7 5l.1.1M16 6l.1-.1A2 2 0 0 1 18.9 8l-.1.1M12 3v2M12 19v2M3 12h2M19 12h2"/></>,
};

export function NavIcon({ name, size = 18, ...props }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
