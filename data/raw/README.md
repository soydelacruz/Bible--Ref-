# Raw data

Unmodified copies of the upstream files the app is built from. The small ones are committed so
that the site can be rebuilt even if an upstream URL disappears; the KJV archive is not, because
4.4 MB of it is more than a repository should carry for one translation, so `npm run data:build`
downloads it on demand instead. Either way `../sources.json` pins the file by SHA-256 and the build
refuses anything that does not match it, before turning them into the datasets in `public/data/`.

| File                                                        | Source                                                                                                                                                                                                    | License                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bsb.txt`                                                   | [Berean Standard Bible](https://berean.bible/), from <https://bereanbible.com/bsb.txt>, retrieved 2026-09-25                                                                                              | Public domain ("dedicated to the public domain", per the file)                                              |
| `openbible-cross-references.zip`                            | [OpenBible.info cross-references](https://www.openbible.info/labs/cross-references/), from <https://a.openbible.info/data/cross-references.zip>, snapshot 2026-09-21                                      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                                   |
| `bliv-tr_vpl.zip`                                           | [Bíblia Livre](https://sites.google.com/site/biblialivre/) (Textus Receptus edition, February 2018), from the project's own [GitHub release](https://github.com/blivre/BibliaLivre/releases/tag/2018.2.0) | [CC BY 3.0 BR](https://creativecommons.org/licenses/by/3.0/br/)                                             |
| `eng-kjv2006_vpl.zip` (not committed; fetched by the build) | [King James Version](https://ebible.org/Scriptures/details.php?id=eng-kjv2006), from <https://ebible.org/Scriptures/eng-kjv2006_vpl.zip>, retrieved 2026-10-17                                            | Public domain (in the United Kingdom: Crown copyright)                                                      |
| `engwebp_vpl.zip` (not committed; fetched by the build)     | [World English Bible](https://ebible.org/find/details.php?id=engwebp), Protestant canon, from <https://ebible.org/Scriptures/engwebp_vpl.zip>, retrieved 2026-10-19                                       | Public domain ("World English Bible" is a trademark of eBible.org)                                          |
| `eng-asv_vpl.zip` (not committed; fetched by the build)     | [American Standard Version](https://ebible.org/find/details.php?id=eng-asv) (1901), from <https://ebible.org/Scriptures/eng-asv_vpl.zip>, retrieved 2026-10-19                                            | Public domain                                                                                               |
| `engylt_vpl.zip` (not committed; fetched by the build)      | [Young's Literal Translation](https://ebible.org/find/details.php?id=engylt), from <https://ebible.org/Scriptures/engylt_vpl.zip>, retrieved 2026-10-19                                                   | Public domain                                                                                               |
| `net2_vpl.txt`                                              | [NET Bible](https://netbible.org/) text (NET2), extracted from the NET Bible study archive (netbible.org responses, 2026-10-19) by `scripts/data/extract-netbible.ts`                                     | [Used by permission](https://netbible.com/copyright/) (non-commercial, with designation and acknowledgment) |
| `net2-notes.zip`                                            | [NET Bible](https://netbible.org/) notes (NET2), extracted from the same archive by `scripts/data/extract-netbible.ts`: each note's HTML with the place of its marker                                     | Used by permission of Biblical Studies Press (terms in [PRODUCT.md](../../PRODUCT.md))                      |
| `stepbible-*.txt` (not committed; fetched by the build)     | [STEPBible](https://github.com/STEPBible/STEPBible-Data) tagged Hebrew (TAHOT) and Greek (TAGNT) with the TBESH and TBESG lexicons, retrieved 2026-10-16                                                  | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                                   |

Attribution for the scripture texts: _Berean Standard Bible (BSB), dedicated to the public
domain._ and _King James Version (Authorized Version), the 1769 text; public domain in the United
States and most of the world, Crown copyright in the United Kingdom._ And, for the Portuguese:
_Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio e Marco Teles, fevereiro de 2018,
licensed under CC BY 3.0 Brasil (<http://creativecommons.org/licenses/by/3.0/br/>)._ Modified:
whitespace is normalized, which touches **271 verses in 23 books** — 270 where the spacing around
a colon moves (a space before it moves to after it, and a missing space after one is inserted)
and one, Zechariah 7:13, where a non-breaking space becomes an ordinary one. Not one
non-whitespace character of the Bíblia Livre differs from the source.

The King James text is changed in one way of its own: the pilcrows that mark a paragraph in
eBible's edition are removed, in **2,970 verses across 42 books**. They are a typographic mark
rather than wording, and the app sets paragraphs itself. The text is public domain, so this
carries no licence condition; it is recorded here because the repository should say what its
build does to every text it ships.

The square brackets the translators put around words they supplied are **kept**. They are not
typography: in the source they are an explicit `\added` element, the convention printed Bibles set
in italics, and they mark the difference between what the Greek and Hebrew say and what Portuguese
needed added to read. They cover 4,838 verses in 62 books, and removing them would present a
translator's own additions as original text — which is the kind of change the integrity of a work
protects against, quite apart from what the licence permits. The same reasoning keeps them in the
KJV, where they cover 14,241 verses. The
translators ask that the edition's date always be given, because the work is ongoing; the manifest
in `src/translations/registry.ts` carries it, and the app shows it where the translation is chosen.

The project's own repository states CC BY 3.0 Brasil, while eBible.org's rebuild of the same text
states CC BY 4.0 — citing a Brazil-ported 4.0 that does not exist, since 4.0 was never ported to
national jurisdictions. What is pinned here is the authors' own release asset, so the licence that
came with this copy is the one they published with it. Both versions permit redistributing the
whole text with attribution, but they are not interchangeable: 3.0 terminates automatically on a
breach with no cure, where 4.0 reinstates if the breach is cured within thirty days. 3.0 BR is the
stricter of the two and the one the app complies with.

The World English Bible, the American Standard Version and Young's Literal Translation are public
domain; only their text entry is pinned, as for the KJV. Not one character of the ASV or YLT is
changed. In the WEB three non-breaking spaces (John 5:11, Acts 20:35 and 22:21) become ordinary
ones, and the three verses of the doxology it numbers Romans 14:24–26 are filed under Romans
16:25–27, where the KJV numbering has them; its words are untouched, so it is still the World
English Bible, which is all its trademark asks. The brackets the ASV and YLT put around supplied
words are kept, for the reason given above.

`net2_vpl.txt` is not a download but an extract. The NET Bible study archive holds the responses
netbible.org served on 2026-10-19; each of its Bible responses pairs the NET with another
translation whose licence keeps it out of this repository, so the archive stays outside it and
`node scripts/data/extract-netbible.ts --archive <NETBible-Archive>` writes the NET's text alone,
in eBible's verse-per-line form. Left out, as eBible leaves them out of its own text editions: verse
numbers, note markers, section headings, the acrostic letters of Lamentations and the speakers named
in the Song of Songs. The divine name the NET sets in small capitals is written LORD. The file is
committed and pinned like a download, but never downloaded (its `extractedBy` in `sources.json`
names the script that makes it): re-extract only from a newer archive, then re-pin the new file
from disk with `npm run data:fetch -- --update`.

`net2-notes.zip` comes from the same run. It holds `net2-notes.jsonl`, one line for each of the
NET's 58,422 notes: its book and number, the verse its marker stands in and how many characters of
that verse's NET text come before the marker, and the note's HTML exactly as netbible.org served
it. Turning that HTML into the app's own structure is the build's job, so the pinned file stays
the source's own words. The pin covers the entry, not the archive; the archive is written with a
fixed date, so extracting the same archive again writes the same file.

Attribution for the original-language words: _STEP Bible (<https://www.STEPBible.org>), based on
work at Tyndale House, Cambridge, licensed under CC BY 4.0
(<https://creativecommons.org/licenses/by/4.0/>)._ Modified: reduced to the dictionary form of each
word used in each verse, keyed to KJV verse numbering, with psalm superscriptions (which that
numbering has no slot for) left out. The 96 MB of tagged text is not committed
here: STEPBible asks that it be fetched from them rather than passed on second-hand, which is also
what `npm run data:build` does, against the pins in `../sources.json`.

Attribution for the cross-references: _Cross-reference data: OpenBible.info
(<https://www.openbible.info/labs/cross-references/>), licensed under CC BY 4.0
(<https://creativecommons.org/licenses/by/4.0/>)._ The files here are unmodified; the datasets built
from them are re-indexed to KJV verse numbering.

The MIT license of this repository's code does not apply to these files.
