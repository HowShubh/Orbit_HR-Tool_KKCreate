import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TEAM_STOPWORDS = new Set(["and", "of", "the", "&", "for", "to"]);

// Initials for a team name: split on spaces, hyphens, slashes and plus signs,
// skip connector words, take the first two letters. e.g. "Short-form KKC+Learn"
// -> "SF", "HR and Operations" -> "HO".
export function teamInitials(name: string) {
  const letters = name
    .split(/[\s\-+/]+/)
    .filter((p) => p && !TEAM_STOPWORDS.has(p.toLowerCase()))
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || name.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-violet-400 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-indigo-400 to-violet-500",
  "from-lime-400 to-emerald-500",
  "from-cyan-400 to-sky-500",
];

export function avatarGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
