"use client";

// Last line of defence: shown when even the root layout fails, so an exception never
// leaves a blank or black page. Has its own <html>/<body> and inline styles (the layout's CSS may be missing).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#f2f6fa", color: "#1e2b3a", fontFamily: "Nunito, system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <main style={{ maxWidth: 560, background: "#fff", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Stage Director hit a problem</h1>
          <p style={{ margin: 0, color: "#3d5470", fontSize: 17 }}>
            This page could not be drawn. Nothing was changed on any site. Try again, or go back to your projects.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={reset} style={{ minHeight: 52, borderRadius: 16, border: 0, background: "#2563b8", color: "#fff", fontWeight: 800, fontSize: 17, padding: "0 20px", cursor: "pointer" }}>Try again</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point here: the app shell is broken */}
            <a href="/" style={{ minHeight: 52, borderRadius: 16, background: "#eef2f7", color: "#1e2b3a", fontWeight: 800, fontSize: 17, padding: "0 20px", display: "flex", alignItems: "center", textDecoration: "none" }}>All projects</a>
          </div>
        </main>
      </body>
    </html>
  );
}
