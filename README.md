# replace, don't diff

A tiny demo of Chrome's
[Declarative Partial Updates](https://developer.chrome.com/blog/declarative-partial-updates)
API making the case that you often don't need a virtual DOM.

**Live:** <https://dpu-replace-dont-diff.paulkinlan-ea.deno.net>. Best viewed in Chrome
148+ with `chrome://flags/#enable-experimental-web-platform-features`.

A live leaderboard reshuffles every second. Instead of diffing the previous list
against the next one and patching the changes (what React / Vue / a virtual DOM
do), the **server re-renders the whole list and streams it as a
`<template for="board">`** that replaces the region in place. No virtual DOM, no
diffing, no reconciliation, no client-side framework, and for the update itself,
no client JavaScript at all.

The whole thing is one `server.ts`.

## Run it

```sh
deno task dev
# open http://localhost:3000
```

Needs **Chrome 148+** with
`chrome://flags/#enable-experimental-web-platform-features` (or the
[`template-for` polyfill](https://github.com/GoogleChromeLabs/template-for-polyfill)).
Without the API the first board still renders, so the page degrades to a static
snapshot rather than breaking.

## How it works

The page ships a marked region:

```html
<ol>
  <?start name="board">
    …initial rows…
  <?end>
</ol>
```

The response never finishes. Every second the server flushes a template that
replaces everything between `<?start name="board">` and `<?end>`:

```html
<template for="board">
  …the whole freshly-sorted list…
</template>
```

The browser swaps the region in place. Each row carries a stable
`view-transition-name`, so a browser that opts into view transitions animates the
reshuffle for free, but that's a pure-CSS enhancement, not required for the
replacement to work.

## The point

The virtual DOM exists to avoid re-rendering everything: diff, then patch only
what changed. When the platform can replace a whole named region declaratively
from streamed HTML, a large class of "you need a framework for this" UIs become a
server that prints HTML. This one does live, sorted, animated updates with zero
client-side reconciliation.

## Recording it

The response stays open, so a normal screenshot hangs. Capture it as a GIF with
the [`capture.mjs`](https://github.com/PaulKinlan/declarative-partial-updates-experiments/blob/main/capture.mjs)
helper from the experiments repo.
