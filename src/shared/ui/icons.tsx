import type { ReactElement } from 'react';
import type { IconType } from 'react-icons';
import {
  LuArrowDownToLine,
  LuArrowLeft,
  LuArrowRight,
  LuArrowRightLeft,
  LuBan,
  LuBookOpenText,
  LuBookmark,
  LuBookmarkCheck,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCopy,
  LuDownload,
  LuEllipsis,
  LuEllipsisVertical,
  LuExternalLink,
  LuGithub,
  LuHand,
  LuImageDown,
  LuLanguages,
  LuLibraryBig,
  LuMonitorDown,
  LuMouse,
  LuMousePointerClick,
  LuNotebookText,
  LuOrbit,
  LuPalette,
  LuPlay,
  LuRainbow,
  LuRefreshCw,
  LuRotateCcw,
  LuRoute,
  LuSearch,
  LuShare,
  LuSlidersHorizontal,
  LuSquare,
  LuSquarePlus,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { MdOutlinePinch, MdOutlineSwipeVertical, MdOutlineTouchApp } from 'react-icons/md';
import styles from './icons.module.css';

interface IconProps {
  readonly className?: string | undefined;
}

/** An icon, as components that show one accept it. */
export type IconComponent = (props: IconProps) => ReactElement;

/**
 * Wraps a glyph as a decorative icon: sized to the text around it and hidden from assistive
 * technology, because that text, or the accessible name of its control, already says what it
 * means.
 */
function decorative(Glyph: IconType): IconComponent {
  return function DecorativeIcon({ className }: IconProps) {
    return (
      <Glyph
        aria-hidden
        className={className === undefined ? styles.icon : `${styles.icon} ${className}`}
      />
    );
  };
}

// One icon family (Lucide) across the UI, with a single exception below. Names say what an icon
// means, not what it depicts, so changing a glyph, or the whole family, touches only this file.

// Visualizations: arcs over the whole Bible, reading a chapter with its threads, and the books
// as clusters of verses.
export const ArcsIcon = decorative(LuRainbow);
export const ReadingIcon = decorative(LuBookOpenText);
export const ClustersIcon = decorative(LuOrbit);

// A guided tour that plays by itself, and stopping it.
export const PlayIcon = decorative(LuPlay);
export const StopIcon = decorative(LuSquare);

// Navigation
export const PreviousIcon = decorative(LuChevronLeft);
export const NextIcon = decorative(LuChevronRight);
export const ExpandIcon = decorative(LuChevronDown);
export const CloseIcon = decorative(LuX);

// Actions
export const SearchIcon = decorative(LuSearch);
export const ResetIcon = decorative(LuRotateCcw);
export const RetryIcon = decorative(LuRefreshCw);
export const CopyIcon = decorative(LuCopy);
export const CopiedIcon = decorative(LuCheck);
export const DoneIcon = decorative(LuCheck);

// Gestures. A mouse's are Lucide's; Lucide has no touch gestures, so those come from Material
// Design Icons (outlined, which sits well beside Lucide's strokes), one family for all of them.
export const ScrollIcon = decorative(LuMouse);
export const DragIcon = decorative(LuHand);
export const ClickIcon = decorative(LuMousePointerClick);
export const TapIcon = decorative(MdOutlineTouchApp);
export const HoldAndSlideIcon = decorative(MdOutlineSwipeVertical);
export const PinchIcon = decorative(MdOutlinePinch);

// The words of the original languages, shown beside a verse.
export const WordsIcon = decorative(LuLanguages);

// The translators' notes on a verse's words.
export const NotesIcon = decorative(LuNotebookText);

// Settings
export const FiltersIcon = decorative(LuSlidersHorizontal);
export const GenresIcon = decorative(LuPalette);
// The phone header's overflow: the controls that have no room of their own there.
export const MoreIcon = decorative(LuEllipsis);

// Link direction: a passage points to others, others point to it, or both. The arrows follow the
// reading-threads layout, where the text is on the left and the rest of the Bible on the right.
export const OutgoingIcon = decorative(LuArrowRight);
export const IncomingIcon = decorative(LuArrowLeft);
export const BothDirectionsIcon = decorative(LuArrowRightLeft);

// A reader's own verses: saved, and the file they travel in.
export const SaveIcon = decorative(LuBookmark);
export const SavedIcon = decorative(LuBookmarkCheck);
export const NoHighlightIcon = decorative(LuBan);
export const ExportIcon = decorative(LuDownload);
export const ImportIcon = decorative(LuUpload);

// A picture of the view, to keep or share.
export const SaveImageIcon = decorative(LuImageDown);

// A chain of links from one passage to another.
export const PathIcon = decorative(LuRoute);

// Study sites elsewhere, and a link that leaves the app for one.
export const StudyIcon = decorative(LuLibraryBig);
export const ExternalLinkIcon = decorative(LuExternalLink);

// The source code, which lives on GitHub. Lucide draws the mark in the same stroke as the rest,
// so the footer's link stays in one family instead of pulling in a second icon set for one glyph.
export const SourceCodeIcon = decorative(LuGithub);

// Installing the app to a home screen or a dock. Each step of the guide names a button of the
// browser's own interface, so each icon is that button's glyph: iOS's share box, Chrome's
// overflow menu, the plus of "Add to Home Screen" and the screen the address bar's install
// button wears.
export const InstallIcon = decorative(LuArrowDownToLine);
export const ShareIcon = decorative(LuShare);
export const BrowserMenuIcon = decorative(LuEllipsisVertical);
export const AddToHomeScreenIcon = decorative(LuSquarePlus);
export const AddressBarInstallIcon = decorative(LuMonitorDown);
