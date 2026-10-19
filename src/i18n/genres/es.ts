import type { GenreId } from '../../core/bible/genres.ts';

/** The ten genres in Spanish. */
export const esGenres: Readonly<Record<GenreId, string>> = {
  law: 'Ley',
  history: 'Historia',
  poetry: 'Poesía y Sabiduría',
  'major-prophets': 'Profetas Mayores',
  'minor-prophets': 'Profetas Menores',
  gospels: 'Evangelios',
  acts: 'Hechos',
  'pauline-epistles': 'Epístolas Paulinas',
  'general-epistles': 'Epístolas Generales',
  revelation: 'Apocalipsis',
};
