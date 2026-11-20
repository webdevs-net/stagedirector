"use client";

import Link from "next/link";

// Shown when a page cannot be drawn at all: usually GitHub's hourly limit is used up
// and there is no saved copy yet (first start). Pages with a saved copy never get here.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const limit = /rate limit|held this GitHub call back|hourly limit/i.test(error.message);
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 rounded-[24px] bg-white p-6">
      <h1 className="text-2xl font-extrabold">{limit ? "Waiting for GitHub" : "Something went wrong"}</h1>
      <p className="text-soft">
        {limit
          ? "GitHub's hourly limit is used up and there is no saved copy of this page yet. It fills in by itself once the limit resets. The GitHub API usage page shows when."
          : "This page could not be loaded. Try again in a moment."}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="min-h-[52px] rounded-2xl bg-blue px-5 font-extrabold text-white">Try again</button>
        <Link href="/" className="flex min-h-[52px] items-center rounded-2xl bg-chip px-5 font-extrabold">All projects</Link>
        <a href="/usage" className="flex min-h-[52px] items-center rounded-2xl bg-chip px-5 font-extrabold">GitHub API usage</a>
      </div>
    </div>
  );
}
