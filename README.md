# Bible SoyDeLaCruz-Reference

[![Bible SoyDeLaCruz-Reference: 344,799 connections between 31,102 verses, from Genesis to Revelation](public/social-preview.jpg)](https://bible-ref.vercel.app/)

See how the Bible is woven together, and read any passage with its connections in view.

**▶ [Open Bible SoyDeLaCruz-Reference](https://bible-ref.vercel.app/)**

This is a copy of [Bible Cross-References](https://github.com/trekhleb/bible-cross-references) by
Oleksii Trekhleb, under its MIT license, with three additions: searching the text for words,
finding the path of cross-references between two passages, and a third view, Clusters.

## Why this exists

For centuries, readers of the Bible have followed cross-references: the small notes in the margin
that send you from one passage to another that echoes, quotes or fulfills it. The _Treasury of
Scripture Knowledge_ alone lists hundreds of thousands of them. On paper you can only follow them
one at a time, so the bigger picture stays hidden: how the prophets echo the Law, how the New
Testament quotes the Psalms and Isaiah, how far a single verse reaches.

This project draws all 344,799 of them at once. You can start from a bird's-eye view of the whole
Bible, zoom down to a single verse, and read it in context with every connection one click away.
It aims to be two things: a picture of how deeply the Bible is interconnected, and a practical
companion while reading.

It is free, open source, and built only on openly licensed data (see [Data](#data)).

## What you can do

### Arcs: the whole Bible at once

![Arcs: every verse of the Bible on one line, with its cross-references drawn as arcs](public/screenshots/arcs.jpg)

- All 31,102 verses sit on one line, from Genesis to Revelation, and every cross-reference is an
  arc colored by the genres it connects.
- Zoom from the whole Bible down to single verses; hover a passage to see how many connections it
  has.
- Search for any reference ("John 3:16", "Ps 23") or click a passage to see where its links land.
- Read it in the Berean Standard Bible or the King James Version; the choice is remembered and
  travels in the link you share
  ([`?t=kjv`](https://bible-ref.vercel.app/?ref=John.3.16&t=kjv)).

### Focus a passage

![Arcs with John 3:16 focused: its connections highlighted, and a panel with its text and references](public/screenshots/arcs-verse.jpg)

The details panel shows the passage's text, where its connections go by genre, and every reference
with its text. Each one is a link: follow it to travel there. "Read in context" opens the passage in
Threads.

A verse also lists the Hebrew or Greek words behind it — the dictionary form, how it is said and
what it means — and, under each one, every other verse that uses the same word, least common
first. It is a different kind of link from a cross-reference and is kept apart from it: a
cross-reference is somebody's judgement that two passages belong together, while this is the plain
fact that they share a word. Acts 5:14 and Luke 5:6, for instance, share πλῆθος (_plēthos_,
"multitude"), which no cross-reference joins. Words used in more than 100 verses are left out, and
the text of the verse in its original language is never shown: only the dictionary form.

Last, _Study elsewhere_ links the verse or chapter to study sites that the app cannot carry itself,
each opening in a new tab: the NET Bible's translators' notes first, then Blue Letter Bible's
interlinear and lexicon, BibleHub's commentaries and parallel translations, and STEPBible. They are
links only; nothing of those sites is copied into the app. The NET Bible's notes are outside the
free licence of its text; they are coming into the app by the publisher's permission (see
[Data](#data)), and until the app shows them they are linked to.

### Search the text

The search box takes words as well as references. Anything that is not a reference, such as
`living water`, lists every verse that contains it, in the translation being read, with the words
marked; choose one to open it. Put a word in quotation marks (`"mark"`) to search for a book's name
instead of opening the book.

### Find the path between two passages

The details panel has a _Path_ section: name another passage and it shows the shortest chain of
cross-references that joins the two — Ruth 1:16 to John 3:16, say, in three links. A link counts
whichever way it points, and among chains of the same length the one readers voted for most is
chosen. It uses only the links the filters show, so showing more of them can find a path where
there was none. Choose a step to travel there; the path is then drawn again from where you are.

### Threads: read with the connections in view

![Threads: Psalm 23 with threads from each verse to where its cross-references land](public/screenshots/threads.jpg)

- Read a chapter while each verse sends threads to where its cross-references land in the whole
  Bible, shown as a bar of all 66 books.
- Switch between what a verse points to, what points to it, or both.
- Tap a verse for its connections and follow them from passage to passage. "Show in Arcs" leads
  back to the big picture.

### Clusters: every book at a glance

Inspired by Chris Woods's [Bible Fascinator](https://designs.drawingwithdata.com/fascinator).

- Every verse with a cross-reference is a dot, gathered into one cluster per book: the Old
  Testament on one side, the New on the other (one above the other on a tall screen), with every
  link drawn as a faint haze between them. A book's verses spiral out from its center in reading
  order, so a cluster's size is how much of it is connected.
- Point at a book to light up all of its links, or at a verse to watch its links grow out to where
  they land; click a verse to focus it and read it in the details panel.
- Click a book (or pick one from the book menu) to open it chapter by chapter, in the middle, with
  the rest of the Bible around it showing only what that book connects to.
- The play button starts a guided tour of well-known verses, from Genesis 1:1 to Revelation 22:13,
  each shown with its text and links for a few seconds. Anything the reader does — a touch, a key,
  a scroll or Back — stops it, and Back leaves the tour in one step. Open the page at
  [`clusters/?tour`](https://bible-ref.vercel.app/clusters/?tour) to start it by itself.

The book clusters are placed by a small force simulation (d3-force) over their 66 circles; the dots
inside them are a sunflower spiral, so the layout is instant and the same every time even with
30,000 verses on screen. It uses the same filters as the other views.

### On your phone

![Both views on a phone: Arcs with Psalm 23:1 focused, and Threads with John 1](public/screenshots/phone.jpg)

Both views work on phones. On the arcs, touch and hold, then slide, to preview passages (on the book
bar, just slide), and pinch to zoom. The details open in a sheet that you drag up to read and pull
down to close. Every passage has its own link, filters included, e.g.
[`?ref=John.3.16`](https://bible-ref.vercel.app/?ref=John.3.16), so you can share
exactly what you are looking at.

### Install it, and read with no connection

Every footer carries a quiet **Install** link — an arrow alone on phones — which opens the steps
for the device you are reading on. The same guide opens at
[`#install`](https://bible-ref.vercel.app/#install), so that address can be sent to
someone who asks for "the app". Inside the installed app the link is gone, since the browser tells
the page it is already running as one.

| Device          | How                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| iPhone and iPad | Safari's share button, then _Add to Home Screen_. Other iOS browsers offer the same item where they support it (iOS 16.4 and later). |
| Android         | Chrome's menu, then _Install app_.                                                                                                   |
| Chrome, Edge    | The install button at the end of the address bar.                                                                                    |
| Safari on a Mac | _Share → Add to Dock_.                                                                                                               |

Open it once while you are online. The service worker ([`sw/`](sw/)) then keeps the pages, this
version's code and the datasets on the device, so the whole Bible, its 344,799 cross-references and
the text you are reading all work with no connection, and open instantly on the next visit. On an
iPhone or iPad that first visit has to happen inside the installed app: a home-screen app there has
storage of its own, apart from Safari's. On Android and the desktop the two share it, so the visit
that installed the app has already done the work.

## Languages

The app speaks English, Portuguese and Spanish. Which it speaks is settled in this order: the address
(`?lang=pt`), then the reader's last choice, then what their browser asks for, then English. On a
first visit the Bible follows the interface — a browser asking for Portuguese arrives at the
Bíblia Livre without being asked — and after that the two are independent, so a Portuguese
interface can read an English text, or the other way round. Both are chosen in one menu, because
the header has no room for a sixth button.

Everything the interface says lives in [`src/i18n/`](src/i18n/):

```text
src/i18n/messages/   every word the interface says; en.ts is the source of truth
src/i18n/books/      the 66 book names, their short forms and what a reader may type
src/i18n/genres/     the ten genre names
src/i18n/install/    the install steps, which are rich text and name real browser buttons
```

English is written `as const`, and `Messages` is derived from it, so a locale that misspells a key
or gives a value the wrong shape does not compile. A locale may leave a key out — the English word
is used instead, so a half-finished translation still ships something useful — and a test reports
what is missing. Messages that take values are small functions rather than strings with
placeholders: the compiler then checks the arguments, and each language can order its words and
count its plurals its own way (`Intl.PluralRules` is in the platform for the languages that need
three or more forms).

Book names are matched on what was typed before accents are folded away, because in Portuguese
the accent is the whole difference between two books: `Jo` is the usual abbreviation for João and
`Jó` is Job. Typing without accents still works everywhere it is unambiguous — `genesis` finds
Gênesis, `josue` finds Josué.

**To add a language:** add its tag to `LOCALE_IDS` in `src/i18n/locale-id.ts`, and the compiler
will name every file that needs an entry. The Bible text is a separate job — see
[Data](#data) — and neither waits on the other: a language can have an interface with no Bible of
its own, which is the right answer where no translation can be licensed.

Some things stay in English whatever the reader's language. The `/debug/` page is one, because
it is for whoever is working on the data. The rest come from the page being static HTML with one
copy per view: the installed app's name, which a web manifest has only one of, and everything a
reader never sees but a crawler does — the `<meta name="description">`, `og:locale`, the
structured data's `inLanguage`, and the `<noscript>` text. A Portuguese link shared on a social
network therefore previews in English, even though the page itself opens in Portuguese. The
`lang` attribute and the document title are both corrected before the first paint.

## Data

The app is built on openly licensed datasets only:

| Dataset          | Source                                                                                                                                                  | License                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Bible text       | [Berean Standard Bible](https://berean.bible/) (BSB), the default                                                                                       | [Public domain](https://berean.bible/terms.htm)                                                                             |
| Bible text       | [King James Version](https://ebible.org/Scriptures/details.php?id=eng-kjv2006) (KJV), the 1769 text, from eBible.org                                    | [Public domain](https://ebible.org/Scriptures/details.php?id=eng-kjv2006) (see the note below)                              |
| Bible text       | [World English Bible](https://ebible.org/find/details.php?id=engwebp) (WEB), a modern translation, Protestant canon, from eBible.org                    | [Public domain](https://ebible.org/find/details.php?id=engwebp) ("World English Bible" is a trademark of eBible.org)        |
| Bible text       | [American Standard Version](https://ebible.org/find/details.php?id=eng-asv) (ASV), 1901, a formal translation, from eBible.org                          | [Public domain](https://ebible.org/find/details.php?id=eng-asv)                                                             |
| Bible text       | [Young's Literal Translation](https://ebible.org/find/details.php?id=engylt) (YLT), Robert Young, 1898, a literal translation, from eBible.org          | [Public domain](https://ebible.org/find/details.php?id=engylt)                                                              |
| Bible text       | [NET Bible](https://netbible.org/) (NET), the text without its notes, from the NET Bible study archive (netbible.org, 2026-10-19)                       | [Used by permission](https://netbible.com/copyright/): free for non-commercial use, with its designation and acknowledgment |
| Bible text       | [Bíblia Livre](https://sites.google.com/site/biblialivre/) (BLIVRE), Brazilian Portuguese, Textus Receptus edition                                      | [CC BY 3.0 BR](https://creativecommons.org/licenses/by/3.0/br/)                                                             |
| Bible text       | [Reina-Valera 1909](https://ebible.org/Scriptures/details.php?id=spaRV1909) (RV1909), Spanish, from eBible.org                                          | [Public domain](https://ebible.org/Scriptures/details.php?id=spaRV1909)                                                     |
| Study notes      | [NET Bible](https://netbible.org/) notes: translators', study, text-critical and map notes, from the NET Bible study archive (netbible.org, 2026-10-19) | Used by permission of Biblical Studies Press (see the note below)                                                           |
| Cross-references | [OpenBible.info](https://www.openbible.info/labs/cross-references/), largely from the public-domain _Treasury of Scripture Knowledge_                   | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                                                   |
| Original words   | [STEPBible](https://github.com/STEPBible/STEPBible-Data) (TAHOT, TAGNT and their lexicons), from Tyndale House, Cambridge                               | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                                                   |

A note on the KJV: it is public domain in the United States and most of the world, but in the
United Kingdom letters patent that do not expire reserve the right to **print** it, and to import
printed copies, to the Crown's patentees — Cambridge University Press, Oxford University Press
and Collins. That is a restriction on printing rather than on a web page, and it has no effect
outside the UK. The app says so where the translation is chosen. It is offered alongside the BSB, never instead of it, and
its text is only downloaded for readers who ask for it.

A note on the WEB, ASV and YLT: three more English texts, a modern, a formal and a literal one, to
read a verse against. The ASV and YLT number every verse as the KJV does. The WEB follows the
manuscripts that close Romans 14 with the doxology the KJV prints as Romans 16:25–27, so the
importer moves those three verses back to the KJV's place. Verses a translation leaves out (four in
the WEB, sixteen in the ASV, as in the BSB) are kept as empty verses and listed in the dataset's
notices. All three are only downloaded for readers who choose them.

A note on the NET: the NET Bible's text, without the translators' notes it is known for, is free
for non-commercial use on three conditions, which the app keeps wherever it shows the text: the
designation (NET) after a quotation, the publisher's acknowledgment (in the credits, and appended to
every quotation copied from the app), and "NET" linked to netbible.org. It comes from a local copy of
the NET Bible study archive, the responses netbible.org served on 2026-10-19, from which
`scripts/data/extract-netbible.ts` writes the NET's own text alone; the archive is not part of the
repository. It numbers verses as the KJV does. Seventeen verses have no text: the sixteen the BSB
also leaves out, and Acts 24:7, which the NET keeps in a note. It is only downloaded for readers who
choose it.

A note on the NET's notes: the 58,422 notes of its translators (on the wording, the manuscripts,
and the history and meaning of the text, with its map notes) are not part of that licence, and are
used by a permission of their own, recorded in [PRODUCT.md](PRODUCT.md). The same extract keeps each note with the verse and the place in the NET's text
where its marker stands. The build turns each note's HTML into a small structure of its own (plain
text, a few styles, and citations of passages) and refuses any markup it has not been taught, so no
HTML from the source ever reaches the page. Citations by the Hebrew or Greek verse numbering, or of
books outside the 66, are kept as text rather than linked to the wrong verse. The notes come one
book to a file, fetched the first time a reader opens that book.

A note on the Bíblia Livre: it is an independent volunteer translation, updated from João Ferreira
de Almeida's, and the edition used here follows the Textus Receptus — the same textual basis as the
KJV, which is why it fits the app's verse numbering exactly, all 31,102 of them, with nothing
dropped or merged. Attribution and the edition's date are shown where the translation is chosen.

A note on what the links mean: they are the _Treasury of Scripture Knowledge_'s cross-references,
which connect passages by shared themes, words, people and events. OpenBible.info readers have
voted on how helpful each link is; the votes rank the links, they don't prove them right or wrong.
By default the site shows the links with at least 4 votes, the best supported 44% (153,419). That
hides the links readers voted down (0.4%) and the loosest ones; the Filters menu shows more, down to
every link.

The smaller files are committed to [`data/raw/`](data/raw/) exactly as downloaded;
[`data/sources.json`](data/sources.json) pins every source by SHA-256, and anything not committed
(the eBible.org archives, about 4 MB each, and STEPBible's tagged text) is downloaded by the build
and checked against its pin, so a dataset is never built from a file nobody vouched for.
`npm run dev` and `npm run build` turn them into the app's datasets in `public/data/` (generated,
git-ignored), validated against the canonical KJV versification (31,102 verses).

One eBible.org text is committed all the same: the World English Bible's. The KJV, ASV and YLT are
finished texts, but the WEB is a living translation whose editors keep correcting it, and each
revision replaces the file eBible.org serves. Downloaded by the build, every revision stopped
matching the pin and failed every deploy until someone re-pinned it; committed, the site builds
from the copy that was reviewed, and adopting a revision is an ordinary pull request
([`data/raw/README.md`](data/raw/README.md) has the details).

To adopt a newer upstream version (OpenBible.info updates its vote counts from time to time, and
the WEB's editors publish their corrections as they make them, sometimes days apart):

```sh
npm run data:fetch -- --update       # check every source upstream, show what changed, re-pin it
npm run data:fetch -- --update web   # or only the sources named
npm run data:build                   # rebuild, then review the numbers on /debug/
```

Then commit `data/raw/` and `data/sources.json`, and say in the pull request what changed upstream.

## Development

Requirements: [Node.js](https://nodejs.org/) 24 or newer (see `.nvmrc`).

```sh
npm install
npm run dev
```

Then open <http://localhost:5173/> for the app, or <http://localhost:5173/debug/> for an internal
page that shows the datasets behind it.

| Script                  | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `npm run dev`           | Build the datasets and start the Vite dev server                |
| `npm run build`         | Build the datasets, type-check, and build the site into `dist/` |
| `npm run preview`       | Serve the built site locally, at its deployed path (see below)  |
| `npm run data`          | Verify the raw files, or fetch missing ones, and build datasets |
| `npm run check`         | The gate: type check, lint, format check, unit tests + coverage |
| `npm run test`          | Run the unit tests                                              |
| `npm run test:watch`    | Run the unit tests in watch mode                                |
| `npm run test:coverage` | Run the unit tests and check the coverage thresholds            |
| `npm run test:e2e`      | Run the end-to-end tests against the built site                 |
| `npm run format`        | Format all files with Prettier                                  |

### Project structure

```text
data/                    Upstream data (raw/, committed) and its pins (sources.json)
scripts/data/            Data pipeline: fetch and build CLIs, one importer per source
index.html, threads/     Page entries of the app (the same app, one per view)
debug/                   Page entry of the internal data page
vite/                    Build plugins: page metadata, first frame, offline cache, analytics
sw/                      The service worker that caches the site for offline use
public/                  Icons, the social preview image and README screenshots
src/core/                Framework-free domain code shared by the app and the pipeline
  bible/                 Books, genres, versification, verse references, passages
  datasets/              Dataset IDs, file formats and their runtime validation
src/translations/        Translation plugins: manifests, registry, loading, text search
src/words/               Original-language words: manifest, registry, per-verse index
src/cross-references/    Cross-reference plugins: manifests, registry, bidirectional index
src/app/                 The app: its views, the URL state and the view switch
src/visualizations/      One folder per visualization (Arcs, Threads, Clusters), plus shared blocks
src/features/debug/      The /debug/ page
src/shared/              Reusable UI (footer, icons, tables), styles, formatting and loading
tests/                   Repository-level tests, and tests/e2e/ the end-to-end suite
```

Visualizations never import each other; `src/app/views.ts` lists them, and the app connects them.

### Tests

Two suites, and a pull request has to pass both.

```sh
npm run check      # types, lint, formatting, unit tests, coverage thresholds
npm run test:e2e   # the flows, in a real browser against the built site
```

**Unit tests** (`*.test.ts` beside the code, Vitest with happy-dom) cover the domain code, the
data pipeline, the build plugins and the components. They are the gate on coverage: `npm run
check` fails below **98% of statements, lines and functions** (`test.coverage.thresholds` in
`vite.config.ts`). Branches are held at 88% instead, because `noUncheckedIndexedAccess` makes
TypeScript demand a fallback on every array read and most of those cannot happen.

Three kinds of file are left out of that measurement, each for a reason, and all three are
covered by the end-to-end suite instead:

- **Entry points** (`src/app/main.tsx`, `scripts/data/build.ts`, …), which run on import, so
  importing them is running them.
- **GPU drawing** (shaders, the WebGL scenes, the canvas painters): a fake DOM cannot give them a
  context, and a mock of one would only test the mock.
- **Touch choreography and the views that host a canvas** (`use-bottom-sheet.ts`,
  `ArcsExplorer.tsx`, …): a fake DOM can be made to report any pointer path and any transform.

**End-to-end tests** (`tests/e2e/`, Playwright against `npm run preview`) cover what only a real
browser can answer: that a reader can read a chapter, open a verse, follow a cross-reference, see
the Hebrew and Greek, filter and switch translation; that the layout holds from 320px to 1920px;
and that the offline cache stores the app, serves it with the network gone, and — the one failure
that could strand an audience on a stale version — **replaces itself when a new release ships**.
They run in three projects: `desktop`, `phone` (Pixel 7), and `offline`, which runs last on its
own because it rewrites the built worker to stand in for a new release.

**The gallery** (`npm run test:visual`) photographs every major screen at desktop and phone size
into `tests/e2e/visual.spec.ts-snapshots/` — open that folder to see what the app looks like. It
is deliberately outside CI and outside `npm run test:e2e`, because a pixel baseline belongs to the
machine that drew it; `tests/e2e/README.md` explains how to regenerate them.

To run any of them locally you need the browser once: `npx playwright install --with-deps chromium`.

### Deployment

The site is static, hosted on Vercel, which builds and publishes every push to `main` (the
settings are in [`vercel.json`](vercel.json)). Vercel Authentication keeps it private: only people
signed in to Vercel with access to the project can open it. The CI workflow
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the checks and the end-to-end tests
on every push and pull request. Builds are served at the root of the domain (`DEPLOY_BASE` in
[`vite/site.ts`](vite/site.ts)), whose name a Vercel build reads from
`VERCEL_PROJECT_PRODUCTION_URL`, and `npm run preview` serves the build at
<http://localhost:4173/>. Besides the pages, the build writes:

- the page metadata: canonical URLs, Open Graph and Twitter cards, and structured data;
- `sitemap.xml`;
- a web app manifest and a service worker (from [`sw/`](sw/)). The worker is scoped to the site's
  path, so it never touches the rest of the domain.

Each release caches under a name of its own, a hash of the files it was built from. A new worker
installs beside the running one, takes over, and deletes the previous release's cache; pages are
fetched from the network first, so an online reader always has the newest one. Every visit asks
for the newest worker ([`src/app/register-offline-cache.ts`](src/app/register-offline-cache.ts))
rather than leaving that to the browser's own check, which it may put off for a day.

If the offline cache ever has to be withdrawn, replace the body of
[`sw/service-worker.ts`](sw/service-worker.ts) with a worker that removes itself, keeping the
`declare const self` line at the top, and deploy that:

```ts
self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('bible-cross-references')) {
          await caches.delete(name);
        }
      }
      await self.registration.unregister();
    })(),
  );
});
```

One visit then unregisters the worker and deletes every cache it made, and the site goes on as an
ordinary one. Taking `sw.js` off the server does not do this: the registration survives a 404.

The build includes the original site's Google Analytics tag, which only reports from trekhleb.dev:
this deployment at bible-ref.vercel.app, local previews and other forks send nothing, so no visits
are counted here. To count them, put a property of your own in `vite/analytics.ts`. To build for another location, set the path and
the origin:

```sh
BASE_PATH=/ SITE_ORIGIN=https://example.org npm run build
```

## License

The code is released under the [MIT License](LICENSE). The data keeps its own licenses (see
[Data](#data)):

> Cross-reference data: OpenBible.info (CC BY 4.0), largely from the public-domain Treasury of
> Scripture Knowledge. Modified: re-indexed to KJV verse numbering.
> Scripture text: Berean Standard Bible (BSB), dedicated to the public domain.
> Scripture text: King James Version (Authorized Version), the 1769 text, public domain in the
> United States and most of the world; in the United Kingdom, letters patent reserve the right to
> print it to the Crown's patentees — Cambridge University Press, Oxford University Press and
> Collins.
> Scripture text: World English Bible (WEB), in the public domain. "World English Bible" is a
> trademark of eBible.org.
> Scripture text: American Standard Version (ASV), 1901, in the public domain.
> Scripture text: Young's Literal Translation (YLT), Robert Young, 1898, in the public domain.
> Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright
> ©1996, 2019 by Biblical Studies Press, L.L.C. <http://netbible.com> All rights reserved.
> Scripture text: Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio e Marco Teles,
> fevereiro de 2018, <http://sites.google.com/site/biblialivre/>, licensed under CC BY 3.0 Brasil
> (<http://creativecommons.org/licenses/by/3.0/br/>). Modified: whitespace is normalized in 271
> verses, which moves whitespace only.
> Original-language words: STEP Bible (CC BY 4.0), based on work at Tyndale House, Cambridge.
> Modified: reduced to the dictionary forms used in each verse, keyed to KJV verse numbering,
> with psalm superscriptions left out.

UI icons are from [Lucide](https://lucide.dev/) (ISC License), plus the touch-gesture icons from
[Material Design Icons](https://fonts.google.com/icons) (Apache License 2.0), via
[react-icons](https://react-icons.github.io/react-icons/) (MIT). The views are original designs:
Arcs is inspired by Chris Harrison and Christoph Römhild's
[Bible Cross-References](https://www.chrisharrison.net/index.php/Visualizations/BibleViz), and the
genre colors by Drawing with Data's [Bible Fascinator](https://designs.drawingwithdata.com/fascinator).
