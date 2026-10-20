import type { TranslationId } from '../core/datasets/ids.ts';
import type { TranslationManifest } from './translation-manifest.ts';

const TRANSLATIONS: Readonly<Record<TranslationId, TranslationManifest>> = {
  bsb: {
    id: 'bsb',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: { name: 'Public domain', url: 'https://berean.bible/terms.htm', publicDomain: true },
    attribution: 'Scripture text: Berean Standard Bible (BSB), dedicated to the public domain.',
    homepage: 'https://berean.bible/',
    access: 'bundled',
  },
  kjv: {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Public domain',
      url: 'https://ebible.org/Scriptures/details.php?id=eng-kjv2006',
      publicDomain: true,
    },
    // The United Kingdom is the exception to "public domain", and the app says so wherever the
    // translation is chosen: rights there are a perpetual royal patent, not an expiring copyright.
    attribution:
      'Scripture text: King James Version (Authorized Version), the 1769 text. Public domain in ' +
      'the United States and most of the world; in the United Kingdom, letters patent reserve ' +
      'the right to print it to the Crown’s patentees — Cambridge University Press, Oxford ' +
      'University Press and Collins.',
    homepage: 'https://ebible.org/Scriptures/details.php?id=eng-kjv2006',
    access: 'bundled',
  },
  web: {
    id: 'web',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Public domain',
      url: 'https://ebible.org/find/details.php?id=engwebp',
      publicDomain: true,
    },
    attribution:
      'Scripture text: World English Bible (WEB), in the public domain. “World English Bible” is a trademark of eBible.org.',
    homepage: 'https://ebible.org/find/details.php?id=engwebp',
    access: 'bundled',
  },
  asv: {
    id: 'asv',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Public domain',
      url: 'https://ebible.org/find/details.php?id=eng-asv',
      publicDomain: true,
    },
    attribution: 'Scripture text: American Standard Version (ASV), 1901, in the public domain.',
    homepage: 'https://ebible.org/find/details.php?id=eng-asv',
    access: 'bundled',
  },
  ylt: {
    id: 'ylt',
    name: "Young's Literal Translation",
    abbreviation: 'YLT',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Public domain',
      url: 'https://ebible.org/find/details.php?id=engylt',
      publicDomain: true,
    },
    attribution:
      "Scripture text: Young's Literal Translation (YLT), Robert Young, 1898, in the public domain.",
    homepage: 'https://ebible.org/find/details.php?id=engylt',
    access: 'bundled',
  },
  // Free for non-commercial use, on three conditions the app keeps everywhere the text appears:
  // the designation (NET) after a quotation, this acknowledgment, and "NET" linked to
  // netbible.org (the credits link the abbreviation to the homepage). The NET's notes are a
  // separate permission and are not part of this text.
  net: {
    id: 'net',
    name: 'NET Bible',
    abbreviation: 'NET',
    language: 'en',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Used by permission',
      url: 'https://netbible.com/copyright/',
      publicDomain: false,
    },
    attribution:
      'Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® ' +
      'copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights ' +
      'reserved.',
    homepage: 'https://netbible.org/',
    access: 'bundled',
  },
  blivre: {
    id: 'blivre',
    name: 'Bíblia Livre',
    abbreviation: 'BLIVRE',
    language: 'pt-BR',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'CC BY 3.0 BR',
      url: 'https://creativecommons.org/licenses/by/3.0/br/',
    },
    // CC BY asks for the authors, the licence, the URI the licensor designated and a note
    // that the material was changed. The edition date is included because the translators
    // ask for it: the work is ongoing.
    attribution:
      'Scripture text: Bíblia Livre (BLIVRE), © Diego Santos, Mario Sérgio and Marco Teles, ' +
      'February 2018 (Textus Receptus edition), https://sites.google.com/site/biblialivre/. ' +
      'Changed: whitespace was normalized; no word was altered.',
    homepage: 'https://sites.google.com/site/biblialivre/',
    access: 'bundled',
  },
  rv1909: {
    id: 'rv1909',
    name: 'Reina-Valera 1909',
    abbreviation: 'RV1909',
    language: 'es',
    direction: 'ltr',
    versification: 'kjv',
    license: {
      name: 'Public domain',
      url: 'https://ebible.org/Scriptures/details.php?id=spaRV1909',
      publicDomain: true,
    },
    attribution: 'Scripture text: Reina-Valera 1909 (RV1909), in the public domain.',
    homepage: 'https://ebible.org/Scriptures/details.php?id=spaRV1909',
    access: 'bundled',
  },
};

/** Every translation the app can show, in the order the picker lists them. */
export const TRANSLATION_MANIFESTS: readonly TranslationManifest[] = Object.values(TRANSLATIONS);

/** The translation shown when the user has not picked one. */
export const DEFAULT_TRANSLATION_ID: TranslationId = 'bsb';

export function getTranslationManifest(id: TranslationId): TranslationManifest {
  return TRANSLATIONS[id];
}
