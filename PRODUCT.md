# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily the owner (SoyDeLaCruz), for personal Bible study: reading a passage closely, following
where it connects, and preparing to teach or reflect. The site is public and free, so other readers
use it too, on desktop and on phones, sometimes installed as an app and offline.

## Product Purpose

See how the Bible is woven together, and read any passage with its connections in view: a picture
of how deeply the Bible is interconnected, and a practical companion while reading. Success is a
reader who can start anywhere, from the whole Bible down to one verse, and reach every connection,
note and comment on a passage without leaving it.

## Positioning

It draws all 344,799 cross-references of the Treasury of Scripture Knowledge at once (Arcs, Threads,
Clusters), finds the chain of links between any two passages, and shows the Hebrew and Greek words a
verse shares with others, keeping judgement (a cross-reference, a note) visibly apart from fact (a
shared word). Next, it brings the NET Bible's translators' notes and classic commentaries into that
same connected reading.

## Operating Context

- Static site on Vercel (bible-ref.vercel.app), installable, readable offline after one visit; the
  datasets are cached on each reader's device.
- Interface in English, Portuguese and Spanish; texts BSB (default), KJV, WEB, ASV, YLT, Bíblia
  Livre, Reina-Valera 1909.
- Every passage, filter and translation has its own shareable URL; saved verses, highlights and
  notes stay on the device, with export and import.
- A copy of the NET Bible study archive (downloaded from netbible.org on 2026-10-19) is held
  locally by the owner; it is not part of the repository.

## Capabilities and Constraints

- Educational and hobby-only, never commercial.
- Data must be openly licensed, public domain, or used by permission, and every source is pinned by
  SHA-256 in `data/sources.json`. Bundled text is stored on readers' devices, so its terms must
  allow that.
- The canonical coordinate system is the KJV versification (31,102 verses); every dataset maps to it
  and lists what it omits or moves.
- NET Bible text: free for non-commercial electronic use with the (NET) designation, the copyright
  acknowledgment, and "NET" hyperlinked to netbible.org.
- NET Bible notes and Dr. Thomas L. Constable's Notes: the owner reports permission received
  (2026-10-19). Open: record the permission's exact terms (scope, offline storage on readers'
  devices, attribution wording) in the repository before publishing.
- Matthew Henry's Commentary and Alexander Maclaren's Expositions: public domain.
- Out of scope: NASB, ESV, HCSB, ISV and MSG text (commercial licences); the archive's map imagery.
- No server: everything is built at build time and served as static files.

## Brand Commitments

- Name: Bible Cross-References. A copy of Oleksii Trekhleb's MIT-licensed project, credited in the
  README and LICENSE.
- The footer names SoyDeLaCruz.dev, which leads to the "Soy de la cruz" page (/soydelacruz/).

## Evidence on Hand

- `data/raw/` and `data/sources.json`: every upstream source, pinned.
- NET archive (local, outside the repository): NET2 text, 31,086 verses (16 omitted on textual
  grounds, all within the KJV numbering); 58,422 NET notes (45,945 translators', 9,532 study, 2,295
  text-critical, 648 map); Constable 1,187 chapters; Matthew Henry 1,188 chapters; Maclaren 580
  chapters. Its journal catalog (21,681 links) carries no passage references.

## Product Principles

1. Every connection one click away: reading never loses its place to show what a passage touches.
2. Judgement and fact stay apart: whose note, comment or link it is, and why, is always visible.
3. Verifiable data only: pinned, attributed, and used within its terms.
4. Reading first: the pictures serve the reading, on a phone as well as a desk, online or not.

## Accessibility & Inclusion

Respects reduced motion, works by keyboard and screen reader (every control named), and reads in
three interface languages.
