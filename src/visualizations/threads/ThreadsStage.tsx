import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { type BookId } from '../../core/bible/books.ts';
import { getBookGenre } from '../../core/bible/genres.ts';
import { chapterPassageOf, versePassage, type Passage } from '../../core/bible/passage.ts';
import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { NextIcon, PreviousIcon } from '../../shared/ui/icons.tsx';
import { collectConnections, type Connection } from '../shared/connections.ts';
import type { LinkFilter } from '../shared/link-filter.ts';
import { GENRE_COLORS } from '../shared/palette.ts';
import { provideLocator, screenBox } from '../shared/passage-spot.ts';
import { useElementSize } from '../shared/use-element-size.ts';
import type { VizData } from '../shared/viz-data.ts';
import { FrameScheduler, MAX_PIXEL_RATIO } from '../shared/frames.ts';
import { computeSpineLayout } from './spine-layout.ts';
import { drawThreads, spineBar, type VerseAnchor } from './threads-drawing.ts';
import styles from './ThreadsStage.module.css';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { formatVerseIndexRange } from '../../core/bible/reference-format.ts';
import { citedPassage, notePhrases } from '../../notes/note-anchors.ts';
import { getNoteSourceManifest } from '../../notes/registry.ts';
import type { CitationHandlers } from '../shared/components/NoteText.tsx';
import { useBookNotes } from '../shared/use-study-notes.ts';
import { InlineNote, VerseWithNotes } from './VerseWithNotes.tsx';
import { revealBlock } from './verse-in-view.ts';

export type ThreadDirection = 'outgoing' | 'incoming' | 'both';

interface ThreadsStageProps {
  readonly data: VizData;
  /** Whether the view is on screen: out of sight, the selected verse is brought in at once. */
  readonly active: boolean;
  readonly book: BookId;
  readonly chapter: number;
  readonly selectedVerse: VerseIndex | null;
  readonly filter: LinkFilter;
  readonly direction: ThreadDirection;
  /**
   * A connection pointed at in the details panel: its thread stands out, and its whole passage is
   * marked where the chapter holds it (the selected verse keeps its own highlight).
   */
  readonly preview: Connection | null;
  readonly onSelect: (passage: Passage | null) => void;
  /**
   * The view's own controls (the threads' direction), above the threads they steer and level
   * with the chapter bar; the threads start under it.
   */
  readonly toolbar?: ReactNode;
}

/** Room for the spine bar and its labels, right of the thread area. */
const SPINE_WIDTH = { wide: 96, compact: 18 } as const;
const SPINE_TOP = 16;
const SPINE_BOTTOM_PADDING = 14;

interface SpineHover {
  readonly book: BookId;
  readonly y: number;
  readonly count: number;
}

/** A chapter to read on the left; threads from each verse to where its links land on the right. */
export function ThreadsStage({
  data,
  active,
  book,
  chapter,
  selectedVerse,
  filter,
  direction,
  preview,
  onSelect,
  toolbar,
}: ThreadsStageProps) {
  const { t, n, books, genreName } = useLocalization();
  const { versification, translation, crossReferences, verseGenres } = data;
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const verseElements = useRef(new Map<VerseIndex, HTMLElement>());
  // Read when the selected verse is brought into view, which showing the view must not do again:
  // the reader's own scrolling is kept.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const canvasSize = useElementSize(canvasHostRef);
  const barRef = useRef<HTMLDivElement>(null);
  // The NET's notes are marked in the NET's own words, so they show only while it is the text.
  const netNotes = useBookNotes(
    translation.manifest.id === getNoteSourceManifest('net').translationId ? book : null,
  );
  const chapterKey = `${book}.${String(chapter)}`;
  const [openNote, setOpenNote] = useState<{
    readonly chapterKey: string;
    readonly verse: VerseIndex;
    readonly number: number;
  } | null>(null);
  const noteHandlers: CitationHandlers = {
    onCite: (passage) => {
      onSelect(citedPassage(passage, versification));
    },
    describe: ([first, last]) =>
      t('notes.cite')(formatVerseIndexRange(versification, books, first, last)),
  };
  const [hoverVerse, setHoverVerse] = useState<VerseIndex | null>(null);
  const [condensed, setCondensed] = useState(false);
  const [topVerse, setTopVerse] = useState<VerseIndex | null>(null);
  const [spineHover, setSpineHover] = useState<SpineHover | null>(null);

  const range = versification.chapterRange(book, chapter) ?? { start: 0, end: 0 };
  const { start, end } = range;
  const compact = canvasSize.width < 120;
  const gutterWidth = canvasSize.width - (compact ? SPINE_WIDTH.compact : SPINE_WIDTH.wide);

  const connectionsByVerse = useMemo(() => {
    const connections = collectConnections(
      crossReferences.index,
      { start, end },
      filter,
      verseGenres,
    );
    const shown: Connection[] = [
      ...(direction === 'incoming' ? [] : connections.outgoing),
      ...(direction === 'outgoing' ? [] : connections.incoming),
    ];
    const byVerse = new Map<VerseIndex, Connection[]>();
    for (const connection of shown) {
      byVerse.set(connection.here, [...(byVerse.get(connection.here) ?? []), connection]);
    }
    return byVerse;
  }, [crossReferences.index, start, end, filter, verseGenres, direction]);

  const spine = useMemo(
    () =>
      computeSpineLayout(versification, SPINE_TOP, canvasSize.height - SPINE_BOTTOM_PADDING, {
        book: compact ? 0.5 : 1,
        genre: compact ? 3 : 5,
      }),
    [versification, canvasSize.height, compact],
  );

  const emphasizedVerse = hoverVerse ?? selectedVerse;
  const emphasizedBook = spineHover?.book ?? null;
  // Only a thread that is drawn (the direction switch may hide it) can stand out alone.
  const emphasizedLink = useMemo(() => {
    const id = preview?.link.id;
    if (id === undefined) return null;
    for (const list of connectionsByVerse.values()) {
      if (list.some((connection) => connection.link.id === id)) return id;
    }
    return null;
  }, [preview, connectionsByVerse]);
  const linked = preview && { start: preview.link.targetStart, end: preview.link.targetEnd };

  // Redraw on any input change, and on every scroll frame of the reading pane.
  useEffect(() => {
    const canvas = canvasRef.current;
    const reading = readingRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !reading || !context || canvasSize.width === 0) {
      return undefined;
    }
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const scheduler = new FrameScheduler(() => {
      const top = canvas.getBoundingClientRect().top;
      // Verses scrolled under the sticky chapter bar send no threads.
      const clipTop = (barRef.current?.getBoundingClientRect().bottom ?? top) - top;
      const anchors: VerseAnchor[] = [];
      for (const [verse, element] of verseElements.current) {
        const rect = element.getBoundingClientRect();
        // Threads leave from a verse's first line, so long verses stay readable.
        const y = rect.top - top + Math.min(rect.height / 2, 15);
        if (y >= clipTop && y <= canvasSize.height) {
          anchors.push({ verse, y });
        }
      }
      drawThreads(context, {
        names: books,
        width: canvasSize.width,
        height: canvasSize.height,
        gutterWidth,
        compact,
        spine,
        anchors,
        connectionsByVerse,
        verseGenres,
        chapter: { start, end },
        emphasizedVerse,
        emphasizedBook,
        emphasizedLink,
      });
    });
    scheduler.request();
    const onScroll = () => {
      scheduler.request();
    };
    reading.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      reading.removeEventListener('scroll', onScroll);
      scheduler.dispose();
    };
  }, [
    canvasSize,
    gutterWidth,
    compact,
    spine,
    connectionsByVerse,
    verseGenres,
    start,
    end,
    emphasizedVerse,
    emphasizedBook,
    emphasizedLink,
    // The spine is lettered: a change of language repaints it.
    books,
  ]);

  // Condense the chapter bar once the chapter's heading has scrolled away above it, and track the
  // verse at the top.
  //
  // The bar keeps one height in both states, so condensing never moves the text. It used to: the
  // whole heading shrank into the bar, the page got shorter, the browser's scroll anchoring pulled
  // the reading back above the point where it condenses, and the bar flipped every frame.
  useEffect(() => {
    const reading = readingRef.current;
    const bar = barRef.current;
    if (!reading || !bar) {
      return undefined;
    }
    const scheduler = new FrameScheduler(() => {
      const paneTop = reading.getBoundingClientRect().top;
      const { top: barTop, bottom: barBottom } = bar.getBoundingClientRect();
      // Stuck to the pane's top: the heading above it is out of sight.
      setCondensed(barTop - paneTop < 1);
      let first: VerseIndex | null = null;
      for (const [verse, element] of verseElements.current) {
        if (element.getBoundingClientRect().bottom > barBottom + 4) {
          first = first === null ? verse : Math.min(first, verse);
        }
      }
      setTopVerse(first);
    });
    scheduler.request();
    const onScroll = () => {
      scheduler.request();
    };
    reading.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      reading.removeEventListener('scroll', onScroll);
      scheduler.dispose();
    };
  }, [start, end]);

  // Keep the selected verse in view: when it changes (e.g. after following a cross-reference), and
  // when the pane gets shorter under it (on a phone, the details sheet takes the bottom of the
  // screen). In view means below the chapter bar, which hides what scrolls under it.
  useEffect(() => {
    const reading = readingRef.current;
    const bar = barRef.current;
    if (selectedVerse === null || !reading || !bar) {
      return undefined;
    }
    const reveal = () => {
      const element = verseElements.current.get(selectedVerse);
      if (!element) return;
      const verse = element.getBoundingClientRect();
      const pane = reading.getBoundingClientRect();
      const block = revealBlock({
        verseTop: verse.top,
        verseBottom: verse.bottom,
        paneTop: pane.top,
        paneBottom: pane.bottom,
        barBottom: bar.getBoundingClientRect().bottom,
      });
      if (block) {
        // Out of sight there is nothing to watch, and a switch to the view must find the verse
        // where it lands: the passage beacon goes to it then.
        const still =
          !activeRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.scrollIntoView({ block, behavior: still ? 'auto' : 'smooth' });
      }
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(reading);
    return () => {
      observer.disconnect();
    };
    // The pane is remade for each chapter, so a new chapter observes the new one.
  }, [selectedVerse, chapterKey]);

  // Where a passage is in the reading, for the passage beacon: a verse's number, or the chapter's
  // heading. A verse is in sight below the chapter bar, which hides what scrolls under it.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    return provideLocator(stage, (passage) => {
      const reading = readingRef.current;
      const bar = barRef.current;
      const mark =
        passage.kind === 'verse'
          ? verseElements.current.get(passage.verse)?.querySelector('button')
          : passage.book === book && passage.chapter === chapter
            ? titleRef.current
            : null;
      if (!reading || !bar || !mark) {
        return null;
      }
      const pane = screenBox(reading.getBoundingClientRect());
      const rect = mark.getBoundingClientRect();
      const top = passage.kind === 'verse' ? bar.getBoundingClientRect().bottom : pane.top;
      return {
        // The number's figures sit at the end of its column; the heading's name at its start.
        point: {
          x: passage.kind === 'verse' ? rect.right - rect.height / 2 : rect.left,
          y: rect.top + rect.height / 2,
        },
        bounds: { ...pane, top },
      };
    });
  }, [book, chapter]);

  const verseAtSpine = (event: MouseEvent<HTMLElement>): VerseIndex | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    return x >= spineBar({ gutterWidth, compact }).left - 6
      ? spine.verseAt(event.clientY - rect.top)
      : null;
  };

  const verses = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  const genre = getBookGenre(book);
  const previousChapter = start > 0 ? chapterPassageOf(start - 1, versification) : null;
  const nextChapter =
    end + 1 < versification.verseCount ? chapterPassageOf(end + 1, versification) : null;

  return (
    <div ref={stageRef} className={styles.stage}>
      {/* Keyed by chapter: a new chapter is a new scroll container, so it starts at the top. */}
      <div key={`${book}.${chapter}`} ref={readingRef} className={styles.reading}>
        <header className={styles.chapterHeader}>
          <div className={styles.column}>
            <p className={styles.eyebrow}>
              <span className={styles.key} style={{ background: GENRE_COLORS[genre.id] }} />
              {genreName(genre.id)} ·{' '}
              {genre.testament === 'OT' ? t('testament.OT') : t('testament.NT')}
            </p>
            <h2 ref={titleRef} className={styles.title}>
              {books[book].name} {chapter}
            </h2>
          </div>
        </header>
        {/* Sticks to the top once the heading above has scrolled away, and then says where the
            reader is ("John 1:14"); the heading itself stays the page's title for a screen reader. */}
        <div ref={barRef} className={styles.chapterBar} data-condensed={condensed}>
          <div className={`${styles.column} ${styles.barRow}`}>
            <p className={styles.barTitle} aria-hidden="true">
              {books[book].name} {chapter}
              {topVerse !== null && (
                <span className={styles.position}>:{versification.refAt(topVerse).verse}</span>
              )}
            </p>
            <nav className={styles.chapterNav} aria-label={t('threads.chapters')}>
              <button
                type="button"
                disabled={!previousChapter}
                aria-label={t('threads.previousChapter')}
                onClick={() => {
                  if (previousChapter) onSelect(previousChapter);
                }}
              >
                <PreviousIcon />
                <span className={styles.navLabel}>{t('threads.previousChapter')}</span>
              </button>
              <button
                type="button"
                disabled={!nextChapter}
                aria-label={t('threads.nextChapter')}
                onClick={() => {
                  if (nextChapter) onSelect(nextChapter);
                }}
              >
                <span className={styles.navLabel}>{t('threads.nextChapter')}</span>
                <NextIcon />
              </button>
            </nav>
          </div>
        </div>
        <div className={styles.column}>
          {/* One of the two is shown, by whether the screen can hover: a finger taps, a mouse clicks. */}
          <p className={styles.hint}>
            <span className={styles.hintPointer}>{t('threads.hint')}</span>
            <span className={styles.hintTouch}>{t('threads.hint.touch')}</span>
          </p>
          <ol className={styles.verses}>
            {verses.map((verse, offset) => {
              const text = translation.verseText(verse);
              const count = connectionsByVerse.get(verse)?.length ?? 0;
              const verseNotes = text ? (netNotes?.notesOn(verse) ?? []) : [];
              const phrases = verseNotes.length > 0 ? notePhrases(text, verseNotes) : null;
              const opened =
                openNote?.chapterKey === chapterKey && openNote.verse === verse
                  ? verseNotes.find((note) => note.number === openNote.number)
                  : undefined;
              const noteId = `net-note-${String(verse)}`;
              // The verse is in the translation's language, not the interface's: unmarked, a
              // screen reader reads the KJV in a Portuguese voice under a Portuguese interface.
              const language = text
                ? { lang: translation.manifest.language, dir: translation.manifest.direction }
                : {};
              return (
                <li
                  key={verse}
                  ref={(element) => {
                    const elements = verseElements.current;
                    if (element) elements.set(verse, element);
                    return () => {
                      elements.delete(verse);
                    };
                  }}
                  className={styles.verse}
                  data-selected={verse === selectedVerse}
                  data-linked={linked !== null && verse >= linked.start && verse <= linked.end}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') setHoverVerse(verse);
                  }}
                  onPointerLeave={() => {
                    setHoverVerse(null);
                  }}
                  onClick={() => {
                    onSelect(
                      verse === selectedVerse
                        ? { kind: 'chapter', book, chapter }
                        : versePassage(verse),
                    );
                  }}
                >
                  <button
                    type="button"
                    className={styles.number}
                    aria-label={t('threads.verse')(n(offset + 1))}
                    aria-pressed={verse === selectedVerse}
                  >
                    {offset + 1}
                  </button>
                  <span
                    className={text ? styles.text : `${styles.text} ${styles.omitted}`}
                    {...language}
                  >
                    {phrases ? (
                      <VerseWithNotes
                        text={text}
                        notes={verseNotes}
                        phrases={phrases}
                        openNumber={opened?.number ?? null}
                        noteId={noteId}
                        onToggle={(note) => {
                          setOpenNote(
                            opened?.number === note.number
                              ? null
                              : { chapterKey, verse, number: note.number },
                          );
                        }}
                      />
                    ) : (
                      text || t('threads.omitted')(translation.manifest.abbreviation)
                    )}
                  </span>
                  <span className={styles.count}>
                    {count > 0 && (
                      <>
                        {n(count)}
                        <span className={styles.visuallyHidden}> {t('threads.links')(count)}</span>
                      </>
                    )}
                  </span>
                  {opened && (
                    <InlineNote
                      id={noteId}
                      note={opened}
                      phrase={phrases?.get(opened.number) ?? null}
                      source={getNoteSourceManifest('net')}
                      handlers={noteHandlers}
                      onClose={() => {
                        setOpenNote(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {toolbar !== undefined && <div className={styles.toolbar}>{toolbar}</div>}
      <div
        ref={canvasHostRef}
        className={styles.canvasHost}
        onPointerMove={(event) => {
          // A finger has no hover, and the tooltip says "click": a tap on the spine just opens.
          const verse = event.pointerType === 'touch' ? null : verseAtSpine(event);
          if (verse === null) {
            setSpineHover(null);
            return;
          }
          const target = versification.bookAt(verse).id;
          let count = 0;
          for (const list of connectionsByVerse.values()) {
            count += list.filter(
              (connection) => versification.bookAt(connection.otherStart).id === target,
            ).length;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setSpineHover({ book: target, y: event.clientY - rect.top, count });
        }}
        onPointerLeave={() => {
          setSpineHover(null);
        }}
        onClick={(event) => {
          const verse = verseAtSpine(event);
          if (verse !== null) onSelect(chapterPassageOf(verse, versification));
        }}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          role="img"
          aria-label={t('threads.stage')}
        />
        {spineHover && (
          <div className={styles.tooltip} style={{ top: spineHover.y }}>
            {books[spineHover.book].name}{' '}
            <span>· {t('threads.spineHover')(n(spineHover.count), spineHover.count)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
