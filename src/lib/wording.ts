import type { ProjectConfig } from "@/lib/types";

/**
 * Words that differ between a website and an app people download (`type: app`).
 * A website goes "live" and is "opened"; an app is "released to users" and its
 * beta is "downloaded". Stage names still come from stagedirector.yml.
 */
export interface Wording {
  isApp: boolean;
  /** The button and step that move a change to the last stage. */
  putLive: string;               // "Put on live" | "Release to users"
  /** The confirm button in the put-live dialog. */
  confirmPutLive: string;        // "Yes, put it live" | "Yes, release it"
  /** Open the middle stage (staging / beta). */
  openMiddle: (name: string) => string; // "Open staging" | "Download the beta"
  /** Open the last stage. */
  openLast: (name: string) => string;   // "Open live site" | "See the release"
  /** Per-change link to the middle stage. */
  seeOnMiddle: (name: string) => string;
  /** Per-change link to the last stage. */
  seeLast: string;
  /** Who may move changes to the last stage. */
  lockNote: string;
  /** Short label for the last stage in lists ("Live updated 2 h ago" | "Released 2 h ago"). */
  lastUpdated: string;
  /** Heading of the review page, and of the to-do list for after the last stage. */
  reviewTitle: string;          // "Before you put it live" | "Before you release it to users"
  todoTitle: string;            // "To-do on live afterwards" | "To-do after releasing"
  /** Whether site-only tools make sense: out-of-sync check, Save a backup, Copy live to staging. */
  siteTools: boolean;
}

export function wording(config: Pick<ProjectConfig, "type">): Wording {
  if (config.type === "app") {
    return {
      isApp: true,
      putLive: "Release to users",
      confirmPutLive: "Yes, release it",
      openMiddle: (name) => (name.toLowerCase() === "beta" ? "Download the beta" : `Download the ${name.toLowerCase()}`),
      openLast: () => "See the release",
      seeOnMiddle: () => "Download the beta",
      seeLast: "See the release",
      lockNote: "Only code owners can release to users",
      lastUpdated: "Released",
      reviewTitle: "Before you release it to users",
      todoTitle: "To-do after releasing",
      siteTools: false,
    };
  }
  return {
    isApp: false,
    putLive: "Put on live",
    confirmPutLive: "Yes, put it live",
    openMiddle: (name) => `Open ${name.toLowerCase()}`,
    openLast: (name) => `Open ${name.toLowerCase()}`,
    seeOnMiddle: (name) => `See on ${name.toLowerCase()}`,
    seeLast: "See live now",
    lockNote: "Only code owners can put changes live",
    lastUpdated: "Live updated",
    reviewTitle: "Before you put it live",
    todoTitle: "To-do on live afterwards",
    siteTools: true,
  };
}

/** "v1.4.0 · 41ab2c9", or just the short commit when there is no version. */
export function commitLabel(commit: string | null | undefined, version?: string | null): string | null {
  if (!commit) return null;
  const short = commit.slice(0, 7);
  return version ? `${version} · ${short}` : short;
}
