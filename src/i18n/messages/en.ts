import type { Emphasized } from './types.ts';

/**
 * Every word the interface says, in English.
 *
 * This file is the source of truth: `Messages` is derived from it, so a locale that misspells a
 * key, or gives a value the wrong shape, fails to compile. Values that take arguments are
 * functions rather than strings with placeholders — the compiler then checks the arguments too,
 * and each language can put the words in its own order and use as many plural forms as it needs.
 */
export const en = {
  'app.name': 'Bible SoyDeLaCruz-Reference',
  // Shown instead of the full name where the header has no room for it.
  'app.name.short': 'SoyDeLaCruz',

  'view.arcs': 'Arcs',
  'view.arcs.short': 'Arcs',
  'view.arcs.open': 'Show in Arcs',
  'view.threads': 'Threads',
  'view.threads.short': 'Threads',
  'view.threads.open': 'Read in Threads',
  'view.clusters': 'Clusters',
  'view.clusters.short': 'Clusters',
  'view.clusters.open': 'Show in Clusters',
  'view.switch': 'Visualizations',

  'search.label': 'Go to a Bible reference, or search the text for words',
  'search.placeholder': 'John 3:16, Ps 23 or words…',
  // On a phone, until the box is focused: the box starts too narrow for the example, which would
  // be cut to "Joh".
  'search.placeholder.short': 'Search',
  // Finding nothing is an answer, not a mistake, so it says what to try next.
  'search.noResults': (query: string) =>
    `No verse contains “${query}”. Try other words, or a reference like “John 3:16”.`,
  'search.results': (count: string, plural: number, query: string) =>
    plural === 1 ? `1 verse contains “${query}”.` : `${count} verses contain “${query}”.`,
  'search.results.limited': (shown: string) =>
    `Showing the first ${shown}; add a word to narrow it down.`,
  'search.results.label': 'Verses that contain the words',
  'search.results.close': 'Close the results',

  'reference.unreadable': 'Enter a reference like “John 3:16” or “Ps 23”.',
  'reference.unknownBook': (query: string) =>
    `No book is called “${query}”. Try a name or abbreviation, like “Rev 12:9”.`,
  'reference.ambiguous': (query: string, candidates: string) =>
    `“${query}” could be ${candidates}.`,
  'reference.or': ' or ',
  'reference.chapters': (book: string, count: string) => `${book} has ${count} chapters.`,
  'reference.verses': (reference: string, chapter: string, count: string) =>
    `${reference} ${chapter} has ${count} verses.`,

  'menu.filtersChanged': 'Filters (changed)',
  'menu.filters': 'Filters',
  // The label reads into the choice below it: "Show links with" / "4 or more votes".
  'menu.filters.votes': 'Show links with',
  'menu.filters.votes.all': 'Any number of votes',
  'menu.filters.votes.atLeast': (votes: number) => `${String(votes)} or more votes`,
  // The parenthesis opens and closes inside the message: a sentence a translator cannot see the
  // end of is one they cannot punctuate, and not every language closes a clause the way English
  // does. `hidden` is the genre clause, or empty.
  'menu.filters.note': (shown: string, total: string, threshold: string, hidden: string) =>
    `Votes rank how helpful OpenBible.info readers found a cross-reference; they don’t prove it ` +
    `right or wrong. Showing ${shown} of ${total} links (${threshold}${hidden}).`,
  'menu.filters.hiddenGenres': (count: number) =>
    count === 1 ? ', 1 genre hidden' : `, ${String(count)} genres hidden`,
  'filter.allLinks': 'all links',
  'filter.noDownvoted': 'links voted down are hidden',
  // The same words as the choice in the menu, inside the note's parenthesis.
  'filter.atLeastVotes': (votes: string) => `${votes} or more votes`,
  'menu.filters.tip': 'Choose a genre in the legend to hide or show it.',
  'menu.filters.reset': 'Reset filters',

  'attribution.bsb': 'Scripture text: Berean Standard Bible (BSB), dedicated to the public domain.',
  'attribution.kjv':
    'Scripture text: King James Version (Authorized Version), the 1769 text. Public domain in ' +
    'the United States and most of the world; in the United Kingdom, letters patent reserve ' +
    'the right to print it to the Crown’s patentees — Cambridge University Press, Oxford ' +
    'University Press and Collins.',
  'attribution.web':
    'Scripture text: World English Bible (WEB), in the public domain. “World English Bible” is a trademark of eBible.org.',
  'attribution.asv': 'Scripture text: American Standard Version (ASV), 1901, in the public domain.',
  'attribution.ylt':
    "Scripture text: Young's Literal Translation (YLT), Robert Young, 1898, in the public domain.",
  'attribution.net':
    'Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® ' +
    'copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights ' +
    'reserved.',
  'attribution.blivre':
    'Scripture text: Bíblia Livre (BLIVRE), © Diego Santos, Mario Sérgio and Marco Teles, ' +
    'February 2018 (Textus Receptus edition), https://sites.google.com/site/biblialivre/. ' +
    'Changed: whitespace was normalized; no word was altered.',
  'attribution.rv1909': 'Scripture text: Reina-Valera 1909 (RV1909), in the public domain.',
  'license.publicDomain': 'Public domain',
  'menu.translation': 'Translation',
  'menu.translation.failed': (name: string) => `${name} could not be loaded.`,
  'menu.translation.error': (message: string) => `${message} Check your connection and try again.`,
  'menu.language': 'Language',

  'genres.label': 'Genres',
  'genres.labelChanged': 'Genres (changed)',
  'genres.show': 'Show genres',
  'genres.hide': 'Hide genres',
  'genres.hideOne': (name: string) => `Hide ${name}`,
  'genres.showOne': (name: string) => `Show ${name}`,
  'testament.OT': 'Old Testament',
  'testament.NT': 'New Testament',

  'stats.label': 'Summary',
  'stats.verses': (count: string): Emphasized => [{ strong: count }, ' verses'],
  // The summary is where a reader first meets the word, so it says "cross-references" in full;
  // "links" is its short form everywhere after.
  'stats.links': (shown: string, total: string | null): Emphasized =>
    total === null
      ? [{ strong: shown }, ' cross-references shown']
      : [{ strong: shown }, ` of ${total} cross-references shown`],
  // While the default filter is on. It hides more than half the links without the Filters menu
  // showing it as changed, so the line says plainly that these are a selection; a link to the
  // Filters menu follows it.
  'stats.links.bestRated': (shown: string, total: string): Emphasized => [
    { strong: shown },
    ` best-rated of ${total} cross-references`,
  ],
  'stats.connected': (share: string): Emphasized => [{ strong: share }, ' of verses have links'],
  'stats.crossTestament': (count: string): Emphasized => [
    { strong: count },
    ' links between the testaments',
  ],
  'hint.zoom': 'to zoom',
  'hint.pan': 'to pan',
  // A click or tap opens the passage in the panel, to read.
  'hint.focus': 'to read',
  'hint.hold': 'hold to preview',

  'panel.details': 'Details',
  'panel.expand': 'Expand details',
  'panel.collapse': 'Collapse details',
  'panel.close': 'Close',
  // One key per unit rather than a word slotted into a sentence: languages agree in gender
  // and number, and "previous" is not the same word before "verse" as before "chapter".
  'panel.previousVerse': 'Previous verse',
  'panel.nextVerse': 'Next verse',
  'panel.previousChapter': 'Previous chapter',
  'panel.nextChapter': 'Next chapter',
  'panel.copy': (reference: string) => `Copy ${reference} with a link`,
  'panel.copy.title': 'Copy with a link',
  'panel.copied': (reference: string) => `${reference} copied`,
  'panel.omitted': (abbreviation: string) => `Omitted in the ${abbreviation}.`,
  'panel.moreVerses': (count: string, plural: number) =>
    plural === 1 ? `+ ${count} more verse` : `+ ${count} more verses`,
  'panel.showAll': (count: string) => `Show all ${count}`,

  'note.toRange': (range: string) => `to ${range}`,
  'note.fromVerse': (verse: string) => `from v. ${verse}`,
  'note.toVerse': (verse: string) => `to v. ${verse}`,

  'panel.connectsTo': 'Links by genre',
  'panel.connectsTo.note': (count: number) => (count === 1 ? '1 genre' : `${String(count)} genres`),
  'panel.references': 'References',
  'panel.references.note': 'where this passage points',
  'panel.referencedBy': 'Referenced by',
  'panel.referencedBy.note': 'passages that point here',
  'panel.verses': 'Verses',
  'panel.verses.note': 'choose one to read it',
  'panel.none': 'None',
  'panel.items': 'items',
  'panel.passages': 'passages',
  'panel.linksCounted': 'links',
  'panel.versesCounted': 'verses',
  // What a bare number in the panel counts, for a reader who hears it rather than sees it.
  'panel.linksUnit': (plural: number): string => (plural === 1 ? 'link' : 'links'),
  'panel.passagesUnit': (plural: number): string => (plural === 1 ? 'passage' : 'passages'),
  // The line under the passage's title, each part a jump to its section: "23 references ·
  // 73 referenced by · 4 notes".
  'panel.summary.references': (count: string, plural: number) =>
    plural === 1 ? `${count} reference` : `${count} references`,
  // The same words either way in English; the number is there for languages where they differ.
  'panel.summary.referencedBy': (count: string, plural: number) =>
    plural === 1 ? `${count} referenced by` : `${count} referenced by`,
  'panel.summary.notes': (count: string, plural: number) =>
    plural === 1 ? `${count} note` : `${count} notes`,
  'panel.summary.none': 'No cross-references',
  // Said when the passage changes out of the reader's sight, e.g. from the arcs or the tour.
  'panel.announce': (passage: string, summary: string) => `${passage} · ${summary}`,

  'library.save': 'Save verse',
  'library.saved': 'Saved',
  'library.highlights': 'Highlight',
  'library.highlight.yellow': 'Yellow',
  'library.highlight.green': 'Green',
  'library.highlight.blue': 'Blue',
  'library.highlight.pink': 'Pink',
  'library.highlight.none': 'No highlight',
  'library.note': 'Note',
  'library.note.placeholder': 'Write a note about this verse…',
  'saved.menu': 'Saved verses',
  'saved.empty':
    'No saved verses yet. Click any verse, then Save verse — you can highlight it and add a note.',
  'saved.count': (count: string, plural: number) =>
    plural === 1 ? '1 verse saved on this device.' : `${count} verses saved on this device.`,
  'saved.export': 'Export',
  'saved.import': 'Import',
  'saved.imported': (count: string, plural: number) =>
    plural === 1 ? 'Imported 1 verse.' : `Imported ${count} verses.`,
  'saved.importFailed': 'That file holds no saved verses from this app.',
  'saved.note':
    'Kept on this device only. Export a copy to keep it safe or to bring it to another device.',

  'image.save': 'Save as image',
  'image.failed': 'The image could not be saved.',

  'path.title': 'Path',
  'path.note': 'the chain of links to another passage',
  'path.label': 'Passage to find a path to',
  'path.placeholder': 'Another passage, e.g. Rev 12:9',
  'path.find': 'Find path',
  'path.clear': 'Clear path',
  'path.summary': (from: string, to: string, count: string, plural: number) =>
    plural === 1 ? `${from} to ${to} in ${count} link:` : `${from} to ${to} in ${count} links:`,
  'path.arrived': (to: string) => `This passage is ${to}, or contains it.`,
  'path.none': (to: string) =>
    `No chain of links reaches ${to} with the current filters. Showing more links in Filters ` +
    `may find one.`,
  // Read between two steps of the path: "Genesis 3:15 references Romans 16:20, which is
  // referenced by Revelation 12:9".
  'path.references': 'references',
  'path.referencedBy': 'is referenced by',
  'path.votes': (count: string, plural: number) =>
    plural === 1 ? `${count} vote` : `${count} votes`,

  'words.heading': (language: string) => `Same ${language} word`,
  'words.note': 'where else it is used',
  'words.counted': 'words',
  'words.versesUnit': (plural: number): string => (plural === 1 ? 'verse' : 'verses'),
  'words.showMore': (count: string) => `Show ${count} more`,
  'language.hebrew': 'Hebrew',
  'language.greek': 'Greek',
  'words.credit': (max: string) =>
    `, based on work at Tyndale House, Cambridge; reduced to dictionary forms. Words used in ` +
    `more than ${max} verses are left out.`,
  'words.creditLabel': 'Words:',

  'study.title': 'Study elsewhere',
  'study.note': 'notes, lexicons and commentaries on other sites',
  'study.net': 'NET Bible notes',
  'study.blueLetterBible': 'Blue Letter Bible interlinear and lexicon',
  'study.bibleHubCommentaries': 'BibleHub commentaries',
  'study.bibleHubParallel': 'BibleHub parallel translations',
  'study.bibleHubChapter': 'BibleHub study page',
  'study.stepBible': 'STEPBible word study',
  // The link's own words, then the passage it opens, e.g. "NET Bible notes on John 3:16".
  'study.label': (link: string, passage: string) => `${link} on ${passage}`,

  'notes.title': 'NET notes',
  'notes.note': 'the translators on its words',
  'notes.counted': 'notes',
  'notes.kind.translation': 'Wording',
  'notes.kind.study': 'Study',
  'notes.kind.text-critical': 'Text-critical',
  'notes.kind.map': 'Map',
  'notes.filter': 'Show the notes of one kind',
  'notes.all': 'All',
  'notes.otherTranslation': (abbreviation: string) =>
    `The notes discuss the NET's wording; the text above is the ${abbreviation}.`,
  'notes.readAll': 'Read the whole note',
  'notes.readLess': 'Show less',
  'notes.cite': (passage: string) => `Go to ${passage}`,
  'notes.marker': (kind: string, words: string) =>
    words ? `${kind} note on “${words}”` : `${kind} note`,
  'notes.close': 'Close the note',

  'loading.data': (verses: string, links: string) =>
    `Loading ${verses} verses and ${links} cross-references…`,
  // What a reader meets when a dataset will not load: almost always the network, and almost
  // always on a device that is offline rather than a machine missing a build step.
  'error.datasetUnavailable':
    'This part of the Bible data could not be loaded. Check your connection and try again.',
  'error.retry': 'Retry',
  'error.viewFailed': (view: string, message: string) => `${view} could not start: ${message}`,

  'threads.direction': 'Thread direction',
  'threads.outgoing': 'Where it points',
  'threads.incoming': 'What points here',
  'threads.both': 'Both ways',
  'threads.verse': (number: string) => `Verse ${number}: show its cross-references`,
  // Under the chapter's heading, until the reader scrolls: what the picture and the numbers are.
  'threads.hint':
    'Threads run from each verse to where its cross-references land · the number on the right ' +
    'is how many · click a verse to see them',
  'threads.hint.touch':
    'Threads run from each verse to where its cross-references land · the number on the right ' +
    'is how many · tap a verse to see them',
  // Said after the number beside a verse, for a reader who hears it rather than sees it: "4 links".
  'threads.links': (plural: number): string => (plural === 1 ? 'link' : 'links'),
  'threads.omitted': (abbreviation: string) =>
    `Omitted in the ${abbreviation} (not in the earliest manuscripts).`,
  'threads.spineHover': (count: string, plural: number) =>
    plural === 1
      ? `${count} thread from here · click to read`
      : `${count} threads from here · click to read`,
  'threads.chapters': 'Chapters',
  'threads.previousChapter': 'Previous chapter',
  'threads.nextChapter': 'Next chapter',
  'threads.stage':
    'Threads from the verses of this chapter to where their cross-references land in the Bible, ' +
    'shown as a vertical bar of all 66 books.',
  'clusters.book': 'Book',
  'clusters.wholeBible': 'Whole Bible',
  'clusters.openBook': 'click to open it',
  'clusters.hint':
    'Point at a verse to light up its links, or at a book’s name or edge for all of them · ' +
    'click a verse to read it, or a book’s name to open it',
  // A touch screen has nothing to point with, so its hint is about the tap alone.
  'clusters.hint.touch': 'Tap a verse to read it, or a book’s name to open it',
  // The button's visible word; the start and stop messages are its full name.
  'clusters.tour.label': 'Tour',
  'clusters.tour.start': 'Play a tour of well-known verses',
  'clusters.tour.stop': 'Stop the tour',
  'clusters.stage':
    'Every verse with cross-references as a dot, gathered into one cluster per book: the Old ' +
    'Testament on one side, the New on the other, with the links between them drawn faintly. ' +
    'Point at a book or a verse to light up its links, click a verse to read it, and click a ' +
    'book to open it chapter by chapter.',
  // A count in a tooltip or beside a verse, in every view.
  'arcs.connections': (count: string, plural: number) =>
    plural === 1 ? `${count} cross-reference` : `${count} cross-references`,
  'arcs.stage':
    'Arc diagram of cross-references. Drag or use the arrow keys to pan, scroll or +/- to zoom, ' +
    'click a passage to read it, Escape to clear. On a touch screen, touch and hold to preview a ' +
    'passage.',

  'credits.links': 'Cross-references:',
  'credits.fromTsk': ', from the Treasury of Scripture Knowledge',
  'credits.reindexed': ', re-indexed',
  'credits.toKjv': ' to KJV verse numbering',
  'credits.text': 'Text:',
  'credits.inspiredBy': 'Inspired by',
  'credits.inspiration': (title: string, author: string) => `${title}, by ${author}`,

  'footer.source': 'Source code on GitHub',
  'footer.sourceLabel': 'GitHub',

  'install.link': 'Install the app',
  'install.linkLabel': 'Install',
  'install.title': 'Install the app',
  'install.lede':
    'Keep it on your home screen and read it with no connection. No app store, no account.',
  'install.now': 'Install now',
  'install.device': 'Device',
  'install.close': 'Close',
  'install.whileOnline':
    'Open the app once while you are online: that is when it stores the Bible text and the ' +
    'cross-references on your device.',
} as const;
