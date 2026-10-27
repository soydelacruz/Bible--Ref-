import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { GENRES, getBookGenre } from '../../../core/bible/genres.ts';
import {
  chapterPassageOf,
  formatPassage,
  passageRange,
  toPassageOsisId,
  versePassage,
  type Passage,
} from '../../../core/bible/passage.ts';
import { formatVerseIndexRange, formatVerseRef } from '../../../core/bible/reference-format.ts';
import type { VerseIndex } from '../../../core/bible/verse-ref.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import { elementAt } from '../../../core/lib/array.ts';
import {
  CloseIcon,
  CopiedIcon,
  CopyIcon,
  ExpandIcon,
  GenresIcon,
  IncomingIcon,
  NextIcon,
  OutgoingIcon,
  ReadingIcon,
  PreviousIcon,
  type IconComponent,
} from '../../../shared/ui/icons.tsx';
import type { Translation } from '../../../translations/translation.ts';
import { verseTextOrNote } from '../../../translations/verse-text.ts';
import {
  collectConnections,
  groupByBook,
  landingNote,
  type Connection,
  type LandingNote,
} from '../connections.ts';
import type { LinkFilter } from '../link-filter.ts';
import { canCopy, copyQuote, quotePassage, type PassageQuote } from '../passage-quote.ts';
import type { PathLight } from '../path-light.ts';
import { GENRE_COLORS, GENRE_HEX } from '../palette.ts';
import {
  PANEL_TITLE_ATTRIBUTE,
  pendingFocusRequest,
  returnFocus,
  settleFocusRequest,
} from '../panel-focus.ts';
import { useAnnouncer } from '../use-announcer.ts';
import { useBookNotes } from '../use-study-notes.ts';
import { NotesSection } from './NotesSection.tsx';
import { OriginalWordsSection } from './OriginalWordsSection.tsx';
import { openPanelSection, PANEL_SECTION_ATTRIBUTE, PanelSection } from './PanelSection.tsx';
import { PathSection } from './PathSection.tsx';
import { StudySection } from './StudySection.tsx';
import { VerseLibrary } from './VerseLibrary.tsx';
import library from './VerseLibrary.module.css';
import { entryOf } from '../../../library/library.ts';
import { useLibrary } from '../../../library/use-library.ts';
import type { VizData } from '../viz-data.ts';
import { useLocalization, type Localization } from '../../../i18n/use-locale.tsx';
import styles from './PassagePanel.module.css';

interface PassagePanelProps {
  readonly data: VizData;
  readonly passage: Passage;
  readonly filter: LinkFilter;
  /** Links that open the passage elsewhere, e.g. in another visualization. */
  readonly actions?: ReactNode;
  readonly onSelect: (passage: Passage) => void;
  readonly onClose: () => void;
  /**
   * A connection is pointed at (mouse) or focused (keyboard), or no longer is: the visualization
   * can show that one link, and the whole passage it points to.
   */
  readonly onPreview?: (connection: Connection | null) => void;
  /** A passage's address on the published site, for copied quotes. */
  readonly shareUrl: (passage: Passage) => string;
  /** Where a path found here is drawn on the visualization, and lit up step by step. */
  readonly pathLight?: PathLight;
}

/** Says something through the panel's live region (see `useAnnouncer`). */
type Announce = (message: string) => void;

const INITIAL_ITEMS = 40;
/** How long the copy button shows that it copied. */
const COPIED_FEEDBACK_MS = 1600;

/**
 * Copies a verse or passage, in full, with its reference and link, e.g. to quote it in a
 * discussion. It shows on hover (on touch screens, always, dimmed), and not at all where the page
 * can't use the clipboard. That it copied is said through the panel's live region, not one of its
 * own: a list of links would otherwise carry a silent region for every row.
 */
function CopyQuoteButton({
  reference,
  quote,
  announce,
}: {
  readonly reference: string;
  readonly quote: () => PassageQuote;
  readonly announce: Announce;
}) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  if (!canCopy()) {
    return null;
  }
  return (
    <button
      type="button"
      className={styles.copy}
      data-copied={copied}
      aria-label={t('panel.copy')(reference)}
      title={t('panel.copy.title')}
      onClick={() => {
        void copyQuote(quote()).then(
          () => {
            setCopied(true);
            announce(t('panel.copied')(reference));
          },
          () => undefined,
        );
      }}
    >
      {copied ? <CopiedIcon /> : <CopyIcon />}
    </button>
  );
}

function neighbor(passage: Passage, step: -1 | 1, versification: Versification): Passage | null {
  const range = passageRange(passage, versification);
  const verse = step < 0 ? range.start - 1 : range.end + 1;
  if (!versification.isValidIndex(verse)) {
    return null;
  }
  return passage.kind === 'verse' ? versePassage(verse) : chapterPassageOf(verse, versification);
}

/** A linked passage longer than this shows its first verses, and how many more there are. */
const MAX_PASSAGE_VERSES = 12;

/**
 * The text a connection leads to, in full: a verse, or a passage's verses with their numbers (up
 * to `MAX_PASSAGE_VERSES`; a very long passage says how much more there is).
 */
function ConnectionText({
  translation,
  versification,
  start,
  end,
}: {
  readonly translation: Translation;
  readonly versification: Versification;
  readonly start: VerseIndex;
  readonly end: VerseIndex;
}) {
  const { t, books, n } = useLocalization();
  // The text is in the translation's language, which is not always the interface's: a reader
  // on a Portuguese interface may be reading the KJV. Saying so is what lets a screen reader
  // pronounce it, and a right-to-left text lay itself out.
  const lang = translation.manifest.language;
  const dir = translation.manifest.direction;
  if (start === end) {
    return (
      <span className={styles.snippet} lang={lang} dir={dir}>
        {verseTextOrNote(translation, start)}
      </span>
    );
  }
  const first = versification.refAt(start);
  const last = Math.min(end, start + MAX_PASSAGE_VERSES - 1);
  const verses = Array.from({ length: last - start + 1 }, (_, offset) => start + offset);
  const more = end - last;
  return (
    <span className={styles.snippet} lang={lang} dir={dir}>
      {verses.map((verse) => {
        const ref = versification.refAt(verse);
        const mark =
          ref.book !== first.book
            ? formatVerseRef(ref, books)
            : ref.chapter !== first.chapter
              ? `${String(ref.chapter)}:${String(ref.verse)}`
              : String(ref.verse);
        return (
          <Fragment key={verse}>
            <sup className={styles.verseMark}>{mark}</sup>
            {verseTextOrNote(translation, verse)}{' '}
          </Fragment>
        );
      })}
      {more > 0 && (
        <span className={styles.moreVerses}>{t('panel.moreVerses')(n(more), more)}</span>
      )}
    </span>
  );
}

/** One part of the summary under the title: how much a section holds, and a way to it. */
interface SummaryItem {
  /** The section's `id`, as `PanelSection` has it. */
  readonly section: string;
  readonly text: string;
}

/**
 * The passage at a glance, under its title: how many links go each way and how many notes there
 * are, each a jump to its section. The longer list of links can start a long way down.
 */
function PassageSummary({
  id,
  items,
  onJump,
}: {
  readonly id: string;
  readonly items: readonly SummaryItem[];
  readonly onJump: (section: string) => void;
}) {
  return (
    <p id={id} className={styles.summary}>
      {items.map((item, index) => (
        <Fragment key={item.section}>
          {index > 0 && (
            <span className={styles.summarySeparator} aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            className={styles.summaryLink}
            onClick={() => {
              onJump(item.section);
            }}
          >
            {item.text}
          </button>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * Details of the focused passage: its text, every connection grouped by book (and by genre, at a
 * glance), then the tools for reading further. Every connection is a button that travels there,
 * so nothing depends on hover.
 */
export function PassagePanel({
  data,
  passage,
  filter,
  actions,
  onSelect,
  onClose,
  onPreview,
  shareUrl,
  pathLight,
}: PassagePanelProps) {
  const { t, books, n, genreName } = useLocalization();
  const { versification, translation, crossReferences, verseGenres } = data;
  const connections = useMemo(
    () =>
      collectConnections(
        crossReferences.index,
        passageRange(passage, versification),
        filter,
        verseGenres,
      ),
    [crossReferences.index, passage, versification, filter, verseGenres],
  );
  const range = passageRange(passage, versification);
  const book = versification.bookAt(range.start);
  const genre = getBookGenre(book.id);
  const previous = neighbor(passage, -1, versification);
  const next = neighbor(passage, 1, versification);
  const isVerse = passage.kind === 'verse';
  const passageId = toPassageOsisId(passage, versification);
  const title = formatPassage(passage, versification, books);
  // Outside the part keyed by passage, so that it outlives a step along the path to it.
  const [destination, setDestination] = useState<Passage | null>(null);
  const { library: kept } = useLibrary(versification);
  const highlight = isVerse ? entryOf(kept, passage.verse).highlight : null;
  // The same notes the notes section shows, for the summary's count: they are fetched once.
  const bookNotes = useBookNotes(isVerse ? book.id : null);
  const noteCount = isVerse ? (bookNotes?.notesOn(passage.verse).length ?? 0) : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Where focus goes back to when the panel closes.
  const opener = useRef<HTMLElement | null>(null);
  // The passage last shown, `null` before the first.
  const shown = useRef<string | null>(null);
  const [regionRef, announce] = useAnnouncer<HTMLParagraphElement>();
  const summaryId = useId();

  const outgoing = connections.outgoing.length;
  const incoming = connections.incoming.length;
  const linkSummary: readonly SummaryItem[] = [
    ...(outgoing > 0
      ? [{ section: 'references', text: t('panel.summary.references')(n(outgoing), outgoing) }]
      : []),
    ...(incoming > 0
      ? [
          {
            section: 'referenced-by',
            text: t('panel.summary.referencedBy')(n(incoming), incoming),
          },
        ]
      : []),
  ];
  const summary: readonly SummaryItem[] =
    noteCount > 0
      ? [
          ...linkSummary,
          { section: 'net-notes', text: t('panel.summary.notes')(n(noteCount), noteCount) },
        ]
      : linkSummary;
  // What a screen reader hears when the passage changes somewhere it is not looking. The notes
  // arrive later than the passage does, so they are left to the summary.
  const announcement = t('panel.announce')(
    title,
    linkSummary.length > 0
      ? linkSummary.map((item) => item.text).join(' · ')
      : t('panel.summary.none'),
  );

  // A new passage, from wherever it came. Following a link replaces the button that was pressed,
  // and focus would fall to the page; it lands on the title instead, which is read out. Where
  // focus is somewhere it can stay (the arcs, the tour's button, the next-verse button), it
  // stays, and the change is said instead. The first passage, from the address, moves nothing.
  const showPassage = useEffectEvent((id: string) => {
    const root = rootRef.current;
    const heading = titleRef.current;
    if (!root || !heading) {
      return;
    }
    const first = shown.current === null;
    shown.current = id;
    const focused = document.activeElement;
    const lost = focused === null || focused === document.body;
    const request = pendingFocusRequest();
    if (request?.returnTo) {
      opener.current = request.returnTo;
    } else if (focused instanceof HTMLElement && !lost && !root.contains(focused)) {
      opener.current = focused;
    }
    if (focused !== heading && (request !== null || (lost && !first))) {
      heading.focus({ preventScroll: true });
      // An inert view's panel cannot take focus, and leaves the request to the one on screen.
      if (document.activeElement === heading) {
        settleFocusRequest();
        return;
      }
    }
    if (!lost || !first) {
      announce(announcement);
    }
  });
  useEffect(() => {
    showPassage(passageId);
  }, [passageId]);

  const close = () => {
    const target = opener.current;
    onClose();
    returnFocus(target, rootRef.current);
  };

  const jumpTo = (section: string) => {
    openPanelSection(section);
    const scroll = scrollRef.current;
    const target = scroll?.querySelector<HTMLElement>(`[${PANEL_SECTION_ATTRIBUTE}="${section}"]`);
    if (!scroll || !target) {
      return;
    }
    // The panel's own scroll, not the page's: on a phone the page is not what moves.
    scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    target.querySelector('button')?.focus({ preventScroll: true });
  };

  // After every link, not before them: it is a tool for going further once the links are read.
  // Its answer appears where it was asked for.
  const path = (
    <PathSection
      data={data}
      passage={passage}
      filter={filter}
      destination={destination}
      onDestinationChange={setDestination}
      onSelect={onSelect}
      light={pathLight}
    />
  );

  return (
    <div ref={rootRef} className={styles.panel}>
      {/* The panel's one live region, there before anything is said in it. */}
      <p ref={regionRef} className={styles.visuallyHidden} role="status" />
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>
            <span className={styles.key} style={{ background: GENRE_COLORS[genre.id] }} />
            {genreName(genre.id)} ·{' '}
            {book.testament === 'OT' ? t('testament.OT') : t('testament.NT')}
          </p>
          <h2
            ref={titleRef}
            className={styles.title}
            tabIndex={-1}
            aria-describedby={summary.length > 0 ? summaryId : undefined}
            {...{ [PANEL_TITLE_ATTRIBUTE]: '' }}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!previous}
          aria-label={t(isVerse ? 'panel.previousVerse' : 'panel.previousChapter')}
          onClick={() => {
            if (previous) onSelect(previous);
          }}
        >
          <PreviousIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!next}
          aria-label={t(isVerse ? 'panel.nextVerse' : 'panel.nextChapter')}
          onClick={() => {
            if (next) onSelect(next);
          }}
        >
          <NextIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('panel.close')}
          onClick={close}
        >
          <CloseIcon />
        </button>
        {/* A line of its own under the title and the buttons, so that on a phone it does not
            wrap round them. */}
        {summary.length > 0 && <PassageSummary id={summaryId} items={summary} onJump={jumpTo} />}
      </header>

      {/* Keyed by passage: following a link starts the new passage's details at the top. */}
      <div key={passageId} ref={scrollRef} className={styles.scroll}>
        {/* A verse's links follow its text; a chapter's come before its (long) list of verses. */}
        {passage.kind === 'verse' ? (
          <>
            <div className={styles.quotable}>
              <p
                className={styles.verseText}
                lang={translation.manifest.language}
                dir={translation.manifest.direction}
              >
                <span
                  className={highlight === null ? undefined : library.highlighted}
                  data-color={highlight ?? undefined}
                >
                  {verseTextOrNote(translation, passage.verse)}
                </span>
              </p>
              <CopyQuoteButton
                reference={title}
                quote={() =>
                  quotePassage({
                    translation,
                    versification,
                    names: books,
                    start: passage.verse,
                    end: passage.verse,
                    url: shareUrl(passage),
                  })
                }
                announce={announce}
              />
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
            <VerseLibrary verse={passage.verse} versification={versification} />
          </>
        ) : (
          <>
            {actions && <div className={styles.actions}>{actions}</div>}
            <ChapterVerses
              start={range.start}
              end={range.end}
              translation={translation}
              connections={[...connections.outgoing, ...connections.incoming]}
              onSelect={onSelect}
            />
          </>
        )}
        {/* What the panel is for comes first: where the passage leads, and what leads to it. */}
        <GenreBreakdown
          connections={[...connections.outgoing, ...connections.incoming]}
          verseGenres={verseGenres}
        />
        <ConnectionSection
          id="references"
          icon={OutgoingIcon}
          title={t('panel.references')}
          description={t('panel.references.note')}
          countLabel={t('panel.passages')}
          connections={connections.outgoing}
          showSourceVerse={passage.kind === 'chapter'}
          data={data}
          onSelect={onSelect}
          onPreview={onPreview}
          shareUrl={shareUrl}
          announce={announce}
        />
        <ConnectionSection
          id="referenced-by"
          icon={IncomingIcon}
          title={t('panel.referencedBy')}
          description={t('panel.referencedBy.note')}
          countLabel={t('panel.passages')}
          connections={connections.incoming}
          showSourceVerse={passage.kind === 'chapter'}
          data={data}
          onSelect={onSelect}
          onPreview={onPreview}
          shareUrl={shareUrl}
          announce={announce}
        />
        {path}
        {/* A verse at a time: a chapter's notes and words would be most of a book's. */}
        {passage.kind === 'verse' && (
          <>
            <NotesSection verse={passage.verse} data={data} onSelect={onSelect} />
            <OriginalWordsSection verse={passage.verse} data={data} onSelect={onSelect} />
          </>
        )}
        <StudySection passage={passage} versification={versification} />
      </div>
    </div>
  );
}

function ChapterVerses({
  start,
  end,
  translation,
  connections,
  onSelect,
}: {
  readonly start: VerseIndex;
  readonly end: VerseIndex;
  readonly translation: Translation;
  readonly connections: readonly Connection[];
  readonly onSelect: (passage: Passage) => void;
}) {
  const { t, n } = useLocalization();
  const counts = new Map<VerseIndex, number>();
  for (const connection of connections) {
    counts.set(connection.here, (counts.get(connection.here) ?? 0) + 1);
  }
  const verses = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  return (
    <PanelSection
      id="verses"
      icon={ReadingIcon}
      title={t('panel.verses')}
      description={t('panel.verses.note')}
      count={verses.length}
      countLabel={t('panel.versesCounted')}
    >
      {verses.map((verse, offset) => {
        const count = counts.get(verse) ?? 0;
        return (
          <button
            key={verse}
            type="button"
            className={styles.verseRow}
            onClick={() => {
              onSelect(versePassage(verse));
            }}
          >
            <span className={styles.verseNumber}>{offset + 1}</span>
            <span
              className={styles.snippet}
              lang={translation.manifest.language}
              dir={translation.manifest.direction}
            >
              {verseTextOrNote(translation, verse)}
            </span>
            <span className={styles.count}>
              {n(count)}
              <span className={styles.visuallyHidden}> {t('panel.linksUnit')(count)}</span>
            </span>
          </button>
        );
      })}
    </PanelSection>
  );
}

/**
 * Puts a connection's landing note into words: where in the passage this link meets it. The
 * note itself is data (see `landingNote`), so that the sentence can be built in the reader's
 * own language here rather than in the code that works out the connections.
 */
function describeLandingNote(
  note: LandingNote,
  versification: Versification,
  { t, books, n }: Localization,
): string {
  switch (note.kind) {
    case 'range':
      return t('note.toRange')(formatVerseIndexRange(versification, books, note.start, note.end));
    case 'from-verse':
      return t('note.fromVerse')(n(note.verse));
    case 'to-verse':
      return t('note.toVerse')(n(note.verse));
  }
}

/**
 * Where the passage's links go, by genre. It starts as a quiet summary (a strip in the genres'
 * colors and the number of links), so the connections themselves stay the focus; the reader can
 * open the details, and the choice is remembered.
 */
function GenreBreakdown({
  connections,
  verseGenres,
}: {
  readonly connections: readonly Connection[];
  readonly verseGenres: Uint8Array;
}) {
  const { t, n, genreName } = useLocalization();
  if (connections.length === 0) {
    return null;
  }
  const counts = new Array<number>(GENRES.length).fill(0);
  for (const connection of connections) {
    const genre = elementAt(verseGenres, connection.otherStart);
    counts[genre] = (counts[genre] ?? 0) + 1;
  }
  const max = Math.max(...counts);
  const present = GENRES.filter((genre) => (counts[genre.ordinal] ?? 0) > 0);
  return (
    <PanelSection
      id="connects-to"
      icon={GenresIcon}
      title={t('panel.connectsTo')}
      description={t('panel.connectsTo.note')(present.length)}
      count={connections.length}
      countLabel={t('panel.linksCounted')}
      defaultOpen={false}
      trailing={
        <span className={styles.strip} aria-hidden="true">
          {present.map((genre) => (
            <span
              key={genre.id}
              style={{
                flexGrow: counts[genre.ordinal] ?? 0,
                background: elementAt(GENRE_HEX, genre.ordinal),
              }}
            />
          ))}
        </span>
      }
    >
      <div className={styles.breakdown}>
        {present.map((genre) => {
          const count = counts[genre.ordinal] ?? 0;
          return (
            <div key={genre.id} style={{ display: 'contents' }}>
              <span>{genreName(genre.id)}</span>
              <span
                className={styles.bar}
                style={{
                  inlineSize: `${Math.max((count / max) * 100, 2)}%`,
                  background: elementAt(GENRE_HEX, genre.ordinal),
                }}
              />
              <span className={styles.count}>
                {n(count)}
                <span className={styles.visuallyHidden}> {t('panel.linksUnit')(count)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </PanelSection>
  );
}

function ConnectionSection({
  id,
  icon: Icon,
  title,
  description,
  countLabel,
  connections,
  showSourceVerse,
  data,
  onSelect,
  onPreview,
  shareUrl,
  announce,
}: {
  /** Identifies the section in storage, so a reader's choice to close it lasts. */
  readonly id: string;
  /** The link direction, drawn as in the reading-threads direction switch. */
  readonly icon: IconComponent;
  readonly title: string;
  readonly description: string;
  readonly countLabel: string;
  readonly connections: readonly Connection[];
  readonly showSourceVerse: boolean;
  readonly data: VizData;
  readonly onSelect: (passage: Passage) => void;
  readonly onPreview: ((connection: Connection | null) => void) | undefined;
  readonly shareUrl: (passage: Passage) => string;
  readonly announce: Announce;
}) {
  const localization = useLocalization();
  const { t, books, n } = localization;
  const [limit, setLimit] = useState(INITIAL_ITEMS);
  const { versification, translation } = data;
  const visible = connections.slice(0, limit);
  return (
    <PanelSection
      id={id}
      icon={Icon}
      title={title}
      description={description}
      count={connections.length}
      countLabel={countLabel}
    >
      {connections.length === 0 && <p className={styles.muted}>{t('panel.none')}</p>}
      {groupByBook(visible, versification).map((group) => (
        <div
          key={`${group.book}-${String(group.connections[0]?.otherStart)}`}
          className={styles.group}
        >
          <p className={styles.groupHeader}>
            <span
              className={styles.key}
              style={{ background: GENRE_COLORS[getBookGenre(group.book).id] }}
            />
            {books[group.book].name}
            <span className={styles.count}>
              {n(group.connections.length)}
              <span className={styles.visuallyHidden}>
                {' '}
                {t('panel.passagesUnit')(group.connections.length)}
              </span>
            </span>
          </p>
          {group.connections.map((connection) => {
            const note = landingNote(connection, versification, showSourceVerse);
            const reference = formatVerseIndexRange(
              versification,
              books,
              connection.otherStart,
              connection.otherEnd,
            );
            return (
              <div
                key={`${String(connection.link.id)}-${connection.direction}`}
                className={styles.quotable}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onPreview?.(connection);
                }}
                onPointerLeave={() => {
                  onPreview?.(null);
                }}
              >
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => {
                    onSelect(versePassage(connection.otherStart));
                  }}
                  onFocus={() => {
                    onPreview?.(connection);
                  }}
                  onBlur={() => {
                    onPreview?.(null);
                  }}
                >
                  <span className={styles.itemRef}>
                    <strong>{reference}</strong>
                    {note !== null && (
                      <span className={styles.muted}>
                        {describeLandingNote(note, versification, localization)}
                      </span>
                    )}
                  </span>
                  <ConnectionText
                    translation={translation}
                    versification={versification}
                    start={connection.otherStart}
                    end={connection.otherEnd}
                  />
                </button>
                <CopyQuoteButton
                  reference={reference}
                  quote={() =>
                    quotePassage({
                      translation,
                      versification,
                      names: books,
                      start: connection.otherStart,
                      end: connection.otherEnd,
                      url: shareUrl(versePassage(connection.otherStart)),
                    })
                  }
                  announce={announce}
                />
              </div>
            );
          })}
        </div>
      ))}
      {connections.length > limit && (
        <button
          type="button"
          className={styles.more}
          onClick={() => {
            setLimit(connections.length);
          }}
        >
          {t('panel.showAll')(n(connections.length))}
          <ExpandIcon />
        </button>
      )}
    </PanelSection>
  );
}
