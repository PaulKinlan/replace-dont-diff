// replace, don't diff — a Declarative Partial Updates demo.
//
// A live leaderboard whose whole list is RE-RENDERED and REPLACED by the server
// on every tick. No virtual DOM, no diffing, no reconciliation, no client-side
// framework, and (for the core update) no client JavaScript at all. The server
// streams a `<template for="board">` that replaces the marked region in place.
//
//   deno task dev     # http://localhost:3000
//
// Needs Chrome 148+ with chrome://flags/#enable-experimental-web-platform-features
// (or the template-for polyfill). Without the API the first board still renders,
// so the page degrades to a static snapshot instead of breaking.

const encoder = new TextEncoder();

/** Minimal streaming HTML response: call `write(chunk)` as content becomes ready. */
function streamingResponse(
  source: (write: (chunk: string) => Promise<void>) => Promise<void>,
): Response {
  let aborted = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = async (chunk: string) => {
        if (aborted) throw new Error("aborted");
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          aborted = true;
          throw new Error("aborted");
        }
      };
      try {
        await source(write);
      } catch (_) {
        // client closed the tab; stop quietly
      } finally {
        if (!aborted) {
          try {
            controller.close();
          } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      aborted = true;
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── The "data" — a few teams whose scores random-walk each tick ──
type Row = { name: string; score: number };
const teams: Row[] = [
  { name: "Astro Foxes", score: 42 },
  { name: "Quantum Owls", score: 39 },
  { name: "Neon Yaks", score: 37 },
  { name: "Pixel Pandas", score: 35 },
  { name: "Turbo Newts", score: 31 },
  { name: "Velvet Crabs", score: 28 },
];

function tick(): Row[] {
  for (const t of teams) {
    t.score = Math.max(0, t.score + Math.round((Math.random() - 0.45) * 6));
  }
  return [...teams].sort((a, b) => b.score - a.score);
}

/** Render the ordered rows. Each row carries a stable view-transition-name so a
 *  browser that opts into transitions animates the reshuffle for free — but the
 *  replacement itself needs none of that. */
function rows(sorted: Row[]): string {
  const max = Math.max(...sorted.map((t) => t.score), 1);
  return sorted.map((t, i) => {
    const slug = t.name.toLowerCase().replace(/[^a-z]+/g, "-");
    const pct = Math.round((t.score / max) * 100);
    return `    <li style="view-transition-name:row-${slug}">
      <span class="rank">${i + 1}</span>
      <span class="name">${t.name}</span>
      <span class="bar"><span class="fill" style="width:${pct}%"></span></span>
      <span class="score">${t.score}</span>
    </li>`;
  }).join("\n");
}

const SHELL = (initial: string) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>replace, don't diff — declarative partial updates</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --card:#161a20; --line:#262b33; --fg:#e6e9ef; --muted:#9aa4b2; --accent:#6ea8fe; --fill:#3b82f6; }
  @media (prefers-color-scheme: light) { :root { --bg:#f7f8fa; --card:#fff; --line:#e5e7eb; --fg:#111827; --muted:#6b7280; --accent:#2563eb; --fill:#3b82f6; } }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:640px; margin:0 auto; padding:2.5rem 1.25rem 4rem; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; }
  .lede { color:var(--muted); margin:0 0 1.5rem; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em; background:color-mix(in srgb,var(--fg) 9%,transparent); padding:.1em .35em; border-radius:.3em; }
  .board { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:.5rem; }
  /* Each tick emits a fresh <ol class="frame">; show only the newest. */
  .board .frame:not(:last-of-type) { display:none; }
  ol { list-style:none; margin:0; padding:0; }
  li { display:grid; grid-template-columns:2rem 8.5rem 1fr 2.5rem; align-items:center; gap:.75rem; padding:.55rem .6rem; border-radius:8px; }
  li + li { border-top:1px solid var(--line); }
  .rank { color:var(--muted); font-variant-numeric:tabular-nums; text-align:center; }
  .name { font-weight:600; }
  .bar { height:.55rem; background:color-mix(in srgb,var(--fg) 8%,transparent); border-radius:999px; overflow:hidden; }
  .fill { display:block; height:100%; background:var(--fill); border-radius:999px; }
  .score { font-variant-numeric:tabular-nums; text-align:right; color:var(--accent); font-weight:600; }
  .note { color:var(--muted); font-size:.85rem; margin-top:1.25rem; }
  a { color:var(--accent); }
  /* Opt every element into cross-fade view transitions so the reshuffle animates
     — a pure-CSS enhancement, not required for the update to work. */
  @view-transition { navigation: auto; }
  ::view-transition-group(*) { animation-duration:.35s; }
</style>
</head>
<body>
<main>
  <h1>replace, don't diff</h1>
  <p class="lede">This leaderboard reshuffles every second. The server re-renders the
  <em>whole</em> list and streams it as a <code>&lt;template for="board"&gt;</code> that
  replaces the region in place. No virtual DOM, no diffing, no framework — and no client
  JavaScript.</p>

  <div class="board">
    <?start name="board"><ol class="frame">
${initial}
    </ol><?end>
  </div>

  <p class="note">Open DevTools' Network panel: it's one response that never finishes,
  flushing a fresh template each tick. Refresh to restart. Needs Chrome 148+ with
  <code>#enable-experimental-web-platform-features</code>; without it you'll see the first
  board as a static snapshot.</p>
  <p class="note">Built with Chrome's
  <a href="https://developer.chrome.com/blog/declarative-partial-updates">Declarative Partial Updates</a>
  API (<a href="https://github.com/WICG/declarative-partial-updates">WICG explainer</a>).</p>
</main>
</body>
</html>
`;

const PORT = Number(Deno.env.get("PORT") ?? 3000);
Deno.serve({ port: PORT }, (req) => {
  const path = new URL(req.url).pathname;
  if (path !== "/" && path !== "/index.html") {
    return new Response("Not found", { status: 404 });
  }
  return streamingResponse(async (write) => {
    await write(SHELL(rows(tick())));
    // Never-ending: each tick replaces the whole list. When the client closes,
    // the next write throws and the loop ends quietly.
    while (true) {
      await sleep(1000);
      // Re-emit the <?start>/<?end> marker inside each template so the region
      // stays addressable for the next tick — the whole list is replaced in place.
      await write(
        `<template for="board"><?start name="board"><ol class="frame">\n${
          rows(tick())
        }\n</ol><?end></template>\n`,
      );
    }
  });
});

console.log(`replace-dont-diff on http://localhost:${PORT}`);
