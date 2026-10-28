import type { LocaleMessages } from './types.ts';

/** The interface in Spanish. Anything left out falls back to the English word. */
export const es: LocaleMessages = {
  // A name, so the same in every language.
  'app.name': 'Bible SoyDeLaCruz-Reference',
  'app.name.short': 'SoyDeLaCruz',

  'view.arcs': 'Arcos',
  'view.arcs.short': 'Arcos',
  'view.arcs.open': 'Ver en Arcos',
  'view.threads': 'Hilos',
  'view.threads.short': 'Hilos',
  'view.threads.open': 'Leer en Hilos',
  'view.clusters': 'Cúmulos',
  'view.clusters.short': 'Cúmulos',
  'view.clusters.open': 'Ver en Cúmulos',
  'view.switch': 'Visualizaciones',

  'search.label': 'Ir a una referencia bíblica, o buscar palabras en el texto',
  'search.placeholder': 'Juan 3:16, Sal 23 o palabras…',
  'search.placeholder.short': 'Buscar',
  'search.noResults': (query) =>
    `Ningún versículo contiene “${query}”. Prueba con otras palabras, o con una referencia como ` +
    `“Juan 3:16”.`,
  'search.results': (count, plural, query) =>
    plural === 1 ? `1 versículo contiene “${query}”.` : `${count} versículos contienen “${query}”.`,
  'search.results.limited': (shown) =>
    `Se muestran los primeros ${shown}; añade una palabra para afinar la búsqueda.`,
  'search.results.label': 'Versículos que contienen las palabras',
  'search.results.close': 'Cerrar los resultados',

  // Not "Pasear": the clusters' tour is already a "Recorrido", and a stroll would sound like one.
  'wander.label': 'Sorpréndeme',
  'wander.hint': 'Ir a un versículo con muchos enlaces que quizá no conozcas',
  'wander.arrived': (passage) => `Sorpresa: ${passage}`,
  'wander.none': 'Ningún versículo tiene enlaces con estos filtros.',

  'reference.unreadable': 'Escribe una referencia como “Juan 3:16” o “Sal 23”.',
  'reference.unknownBook': (query) =>
    `Ningún libro se llama “${query}”. Prueba con un nombre o una abreviatura, como “Ap 12:9”.`,
  'reference.ambiguous': (query, candidates) => `“${query}” puede ser ${candidates}.`,
  'reference.or': ' o ',
  'reference.chapters': (book, count) => `${book} tiene ${count} capítulos.`,
  'reference.verses': (reference, chapter, count) =>
    `${reference} ${chapter} tiene ${count} versículos.`,

  // Plural and masculine, agreeing with "Filtros".
  'menu.filtersChanged': 'Filtros (cambiados)',
  'menu.filters': 'Filtros',
  'menu.filters.votes': 'Mostrar enlaces con',
  'menu.filters.votes.all': 'Cualquier número de votos',
  'menu.filters.votes.atLeast': (votes) => `${String(votes)} o más votos`,
  'menu.filters.note': (shown, total, threshold, hidden) =>
    `Los votos indican cuán útil les pareció una referencia cruzada a los lectores de ` +
    `OpenBible.info; no prueban que sea correcta o incorrecta. Se muestran ${shown} de ${total} ` +
    `enlaces (${threshold}${hidden}).`,
  'menu.filters.hiddenGenres': (count) =>
    count === 1 ? ', 1 género oculto' : `, ${String(count)} géneros ocultos`,
  'filter.allLinks': 'todos los enlaces',
  'filter.noDownvoted': 'se ocultan los enlaces con votos negativos',
  'filter.atLeastVotes': (votes) => `${votes} o más votos`,
  'menu.filters.tip': 'Elige un género en la leyenda para ocultarlo o mostrarlo.',
  'menu.filters.reset': 'Restablecer filtros',

  'attribution.bsb': 'Texto bíblico: Berean Standard Bible (BSB), dedicada al dominio público.',
  'attribution.kjv':
    'Texto bíblico: King James Version (Authorized Version), texto de 1769. De dominio público ' +
    'en los Estados Unidos y en la mayor parte del mundo; en el Reino Unido, una patente real ' +
    'reserva el derecho a imprimirla a los impresores de la Corona: Cambridge University Press, ' +
    'Oxford University Press y Collins.',
  'attribution.web':
    'Texto bíblico: World English Bible (WEB), de dominio público. «World English Bible» es una marca de eBible.org.',
  'attribution.asv': 'Texto bíblico: American Standard Version (ASV), 1901, de dominio público.',
  'attribution.ylt':
    "Texto bíblico: Young's Literal Translation (YLT), Robert Young, 1898, de dominio público.",
  'attribution.net':
    'Escrituras citadas con permiso. Las citas marcadas (NET) son de la NET Bible®, ' +
    'copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com Todos los ' +
    'derechos reservados.',
  'attribution.blivre':
    'Texto bíblico: Bíblia Livre (BLIVRE), © Diego Santos, Mario Sérgio y Marco Teles, ' +
    'febrero de 2018 (edición Textus Receptus), https://sites.google.com/site/biblialivre/. ' +
    'Cambios: se normalizaron los espacios; no se alteró ninguna palabra.',
  'attribution.rv1909': 'Texto bíblico: Reina-Valera 1909 (RV1909), de dominio público.',
  'license.publicDomain': 'Dominio público',
  'menu.translation': 'Traducción',
  'menu.translation.failed': (name) => `No se pudo cargar ${name}.`,
  'menu.translation.error': (message) => `${message} Revisa tu conexión e inténtalo de nuevo.`,
  'menu.language': 'Idioma',
  'menu.more': 'Más',
  'menu.moreChanged': 'Más (géneros ocultos)',

  'genres.label': 'Géneros',
  // Plural and masculine, agreeing with "Géneros".
  'genres.labelChanged': 'Géneros (cambiados)',
  'genres.hideOne': (name) => `Ocultar ${name}`,
  'genres.showOne': (name) => `Mostrar ${name}`,
  'testament.OT': 'Antiguo Testamento',
  'testament.NT': 'Nuevo Testamento',

  'stats.label': 'Resumen',
  'stats.verses': (count) => [{ strong: count }, ' versículos'],
  'stats.links': (shown, total) =>
    total === null
      ? [{ strong: shown }, ' referencias cruzadas mostradas']
      : [{ strong: shown }, ` de ${total} referencias cruzadas mostradas`],
  // With its article, as Spanish wants a selection named: "las 153.419 mejor valoradas".
  'stats.links.bestRated': (shown, total) => [
    'las ',
    { strong: shown },
    ` mejor valoradas de ${total} referencias cruzadas`,
  ],
  'stats.connected': (share) => [{ strong: share }, ' de los versículos tienen enlaces'],
  'stats.crossTestament': (count) => [{ strong: count }, ' enlaces entre los testamentos'],
  'hint.zoom': 'para acercar',
  'hint.pan': 'para mover',
  'hint.focus': 'para leer',
  'hint.hold': 'mantén pulsado para previsualizar',

  'panel.details': 'Detalles',
  'panel.expand': 'Expandir detalles',
  'panel.collapse': 'Contraer detalles',
  'panel.close': 'Cerrar',
  'panel.previousVerse': 'Versículo anterior',
  'panel.nextVerse': 'Versículo siguiente',
  'panel.previousChapter': 'Capítulo anterior',
  'panel.nextChapter': 'Capítulo siguiente',
  'panel.copy': (reference) => `Copiar ${reference} con un enlace`,
  'panel.copy.title': 'Copiar con un enlace',
  'panel.copied': (reference) => `${reference} copiado`,
  'panel.omitted': (abbreviation) => `Omitido en la ${abbreviation}.`,
  'panel.moreVerses': (count, plural) =>
    plural === 1 ? `+ ${count} versículo más` : `+ ${count} versículos más`,
  'panel.showAll': (count) => `Ver los ${count}`,

  'note.toRange': (range) => `a ${range}`,
  'note.fromVerse': (verse) => `desde el v. ${verse}`,
  'note.toVerse': (verse) => `al v. ${verse}`,

  'panel.connectsTo': 'Enlaces por género',
  'panel.connectsTo.note': (count) => (count === 1 ? '1 género' : `${String(count)} géneros`),
  'panel.references': 'Referencias',
  'panel.references.note': 'adonde apunta este pasaje',
  'panel.referencedBy': 'Referido por',
  'panel.referencedBy.note': 'pasajes que apuntan aquí',
  'panel.verses': 'Versículos',
  'panel.verses.note': 'elige uno para leerlo',
  'panel.none': 'Ninguno',
  'panel.items': 'elementos',
  'panel.passages': 'pasajes',
  'panel.linksCounted': 'enlaces',
  'panel.versesCounted': 'versículos',
  'panel.linksUnit': (plural) => (plural === 1 ? 'enlace' : 'enlaces'),
  'panel.passagesUnit': (plural) => (plural === 1 ? 'pasaje' : 'pasajes'),
  'panel.summary.references': (count, plural) =>
    plural === 1 ? `${count} referencia` : `${count} referencias`,
  'panel.summary.referencedBy': (count, plural) =>
    plural === 1 ? `${count} apunta aquí` : `${count} apuntan aquí`,
  'panel.summary.notes': (count, plural) => (plural === 1 ? `${count} nota` : `${count} notas`),
  'panel.summary.none': 'Ninguna referencia cruzada',
  'panel.announce': (passage, summary) => `${passage} · ${summary}`,

  'library.save': 'Guardar versículo',
  'library.saved': 'Guardado',
  'library.highlights': 'Resaltado',
  'library.highlight.yellow': 'Amarillo',
  'library.highlight.green': 'Verde',
  'library.highlight.blue': 'Azul',
  'library.highlight.pink': 'Rosa',
  'library.highlight.none': 'Sin resaltar',
  'library.note': 'Nota',
  'library.note.placeholder': 'Escribe una nota sobre este versículo…',
  'saved.menu': 'Versículos guardados',
  'saved.empty':
    'Aún no hay versículos guardados. Haz clic en un versículo y luego en Guardar versículo: ' +
    'puedes resaltarlo y añadir una nota.',
  'saved.count': (count, plural) =>
    plural === 1
      ? '1 versículo guardado en este dispositivo.'
      : `${count} versículos guardados en este dispositivo.`,
  'saved.export': 'Exportar',
  'saved.import': 'Importar',
  'saved.imported': (count, plural) =>
    plural === 1 ? '1 versículo importado.' : `${count} versículos importados.`,
  'saved.importFailed': 'Ese archivo no contiene versículos guardados de esta aplicación.',
  'saved.note':
    'Se guarda solo en este dispositivo. Exporta una copia para conservarla o llevarla a otro ' +
    'dispositivo.',

  'image.save': 'Guardar como imagen',
  'image.failed': 'No se pudo guardar la imagen.',
  'clip.save': 'Guardar como video',
  'clip.label': 'Video',
  'clip.making': 'Creando el video…',
  'clip.cancel': 'Cancelar',
  'clip.ready': 'Tu video está listo.',
  'clip.share': 'Compartir',
  'clip.download': 'Guardar',
  'clip.close': 'Cerrar',
  'clip.failed': 'No se pudo crear el video.',

  'path.title': 'Camino',
  'path.note': 'la cadena de enlaces hasta otro pasaje',
  'path.label': 'Pasaje hasta el que buscar un camino',
  'path.placeholder': 'Otro pasaje, p. ej. Ap 12:9',
  'path.find': 'Buscar camino',
  'path.clear': 'Borrar camino',
  'path.replay': 'Ver de nuevo',
  'path.replay.hint': 'Iluminar el camino de nuevo, enlace por enlace',
  'path.summary': (from, to, count, plural) =>
    plural === 1
      ? `De ${from} a ${to} en ${count} enlace:`
      : `De ${from} a ${to} en ${count} enlaces:`,
  'path.arrived': (to) => `Este pasaje es ${to}, o lo contiene.`,
  'path.none': (to) =>
    `Ninguna cadena de enlaces llega a ${to} con los filtros actuales. Mostrar más enlaces en ` +
    `Filtros puede encontrar una.`,
  'path.references': 'hace referencia a',
  'path.referencedBy': 'es referido por',
  'path.votes': (count, plural) => (plural === 1 ? `${count} voto` : `${count} votos`),

  'words.heading': (language) => `Misma palabra ${language}`,
  'words.note': 'dónde más se usa',
  'words.counted': 'palabras',
  'words.versesUnit': (plural) => (plural === 1 ? 'versículo' : 'versículos'),
  'words.showMore': (count) => `Ver ${count} más`,
  'language.hebrew': 'hebrea',
  'language.greek': 'griega',
  'words.credit': (max) =>
    `, basado en el trabajo de Tyndale House, Cambridge; reducido a las formas de diccionario. ` +
    `Se omiten las palabras usadas en más de ${max} versículos.`,
  'words.creditLabel': 'Palabras:',

  'study.title': 'Estudiar en otros sitios',
  'study.note': 'notas, léxicos y comentarios en otros sitios',
  'study.net': 'Notas de la NET Bible',
  'study.blueLetterBible': 'Interlineal y léxico de Blue Letter Bible',
  'study.bibleHubCommentaries': 'Comentarios de BibleHub',
  'study.bibleHubParallel': 'Traducciones paralelas de BibleHub',
  'study.bibleHubChapter': 'Página de estudio de BibleHub',
  'study.stepBible': 'Estudio de palabras en STEPBible',
  'study.label': (link, passage) => `${link} sobre ${passage}`,

  'notes.title': 'Notas de la NET',
  'notes.note': 'los traductores, sobre sus palabras (en inglés)',
  'notes.counted': 'notas',
  'notes.kind.translation': 'Redacción',
  'notes.kind.study': 'Estudio',
  'notes.kind.text-critical': 'Crítica textual',
  'notes.kind.map': 'Mapa',
  'notes.filter': 'Mostrar las notas de un tipo',
  'notes.all': 'Todas',
  'notes.otherTranslation': (abbreviation) =>
    `Las notas comentan la redacción de la NET; el texto de arriba es de la ${abbreviation}.`,
  'notes.readAll': 'Leer la nota entera',
  'notes.readLess': 'Mostrar menos',
  'notes.cite': (passage) => `Ir a ${passage}`,
  'notes.marker': (kind, words) => (words ? `${kind}: nota sobre «${words}»` : `${kind}: nota`),
  'notes.close': 'Cerrar la nota',

  'loading.data': (verses, links) =>
    `Cargando ${verses} versículos y ${links} referencias cruzadas…`,
  'loading.text': 'Cargando el texto…',
  'error.datasetUnavailable':
    'No se pudo cargar esta parte de los datos de la Biblia. Revisa tu conexión e inténtalo de nuevo.',
  'error.retry': 'Reintentar',
  'error.viewFailed': (view, message) => `No se pudo iniciar ${view}: ${message}`,

  'threads.direction': 'Dirección de los hilos',
  'threads.outgoing': 'Adónde apunta',
  'threads.incoming': 'Qué apunta aquí',
  'threads.both': 'Ambos',
  'threads.verse': (number) => `Versículo ${number}: ver sus referencias cruzadas`,
  'threads.hint':
    'Los hilos van de cada versículo a donde llegan sus referencias cruzadas · el número a la ' +
    'derecha dice cuántas son · haz clic en un versículo para verlas',
  'threads.hint.touch':
    'Los hilos van de cada versículo a donde llegan sus referencias cruzadas · el número a la ' +
    'derecha dice cuántas son · toca un versículo para verlas',
  'threads.links': (plural) => (plural === 1 ? 'enlace' : 'enlaces'),
  'threads.omitted': (abbreviation) =>
    `Omitido en la ${abbreviation} (no está en los manuscritos más antiguos).`,
  'threads.spineHover': (count, plural) =>
    plural === 1
      ? `${count} hilo desde aquí · clic para leer`
      : `${count} hilos desde aquí · clic para leer`,
  'threads.chapters': 'Capítulos',
  'threads.previousChapter': 'Capítulo anterior',
  'threads.nextChapter': 'Capítulo siguiente',
  'threads.stage':
    'Hilos desde los versículos de este capítulo hasta donde llegan sus referencias cruzadas en ' +
    'la Biblia, mostrada como una barra vertical con los 66 libros.',
  'clusters.book': 'Libro',
  'clusters.wholeBible': 'Toda la Biblia',
  'clusters.openBook': 'clic para abrirlo',
  'clusters.hint':
    'Señala un versículo para iluminar sus enlaces, o el nombre o el borde de un libro para ' +
    'todos ellos · haz clic en un versículo para leerlo, o en el nombre de un libro para abrirlo',
  'clusters.hint.touch': 'Toca un versículo para leerlo, o el nombre de un libro para abrirlo',
  'clusters.tour.label': 'Recorrido',
  'clusters.tour.start': 'Ver un recorrido por versículos conocidos',
  'clusters.tour.stop': 'Detener el recorrido',
  'clusters.stage':
    'Cada versículo con referencias cruzadas es un punto, reunido en un cúmulo por libro: el ' +
    'Antiguo Testamento a un lado, el Nuevo al otro, con los enlaces entre ellos en trazo tenue. ' +
    'Señala un libro o un versículo para iluminar sus enlaces, haz clic en un versículo para ' +
    'leerlo y en un libro para abrirlo capítulo por capítulo.',
  'arcs.connections': (count, plural) =>
    plural === 1 ? `${count} referencia cruzada` : `${count} referencias cruzadas`,
  'arcs.stage':
    'Diagrama de arcos de las referencias cruzadas. Arrastra o usa las flechas para mover, la ' +
    'rueda o +/- para acercar, haz clic en un pasaje para leerlo, Esc para limpiar. En una ' +
    'pantalla táctil, mantén pulsado para previsualizar un pasaje.',
  'arcs.minimap': 'Toda la Biblia',
  'arcs.minimap.inView': (range) => `${range} a la vista`,
  'arcs.minimap.help':
    'Arrastra la ventana a lo largo de la Biblia, o sus bordes para acercar, y arrastra sobre ' +
    'libros para iluminar sus referencias cruzadas. Las flechas mueven la ventana, + y − la ' +
    'acercan, Enter ilumina los libros a la vista y Esc apaga la iluminación.',
  // A gerund, so it reads the same for one book or many.
  'arcs.minimap.lit': (books, count) => `Iluminando ${books}: ${count}`,
  'arcs.minimap.cleared': 'Los libros ya no están iluminados',
  'tour.invite': '¿Primera vez en los arcos? Un recorrido de 45 segundos muestra lo que unen.',
  'tour.start': 'Hacer el recorrido',
  'tour.dismiss': 'Ahora no',
  'tour.region': 'Recorrido guiado',
  'tour.progress': (position, count) => `Recorrido · ${position} de ${count}`,
  'tour.paused': 'En pausa',
  'tour.pause': 'Pausar el recorrido',
  'tour.resume': 'Reanudar el recorrido',
  'tour.close': 'Terminar el recorrido',
  'tour.announce': (position, count, title, passages) =>
    `Recorrido, ${position} de ${count}: ${title}. ${passages}`,
  'tour.stop.beginning.title': 'En el principio',
  'tour.stop.beginning.line':
    'Las primeras palabras de la Biblia vuelven como las primeras de Juan.',
  'tour.stop.shema.title': 'Oye, Israel',
  'tour.stop.shema.line':
    'Cuando le preguntan cuál es el primer mandamiento, Jesús responde con el Shemá.',
  'tour.stop.forsaken.title': 'Dios mío, Dios mío',
  'tour.stop.forsaken.line': 'Un salmo de David, clamado desde la cruz; mucho de él resuena allí.',
  'tour.stop.servant.title': 'Como un cordero',
  'tour.stop.servant.line': 'El siervo sufriente de Isaías, leído en voz alta camino de Gaza.',
  'tour.stop.spirit.title': 'Derramaré mi Espíritu',
  'tour.stop.spirit.line': 'La promesa de Joel, citada por Pedro en Pentecostés.',
  'tour.finale.title': 'Del Edén al final',
  'tour.finale.line':
    'Una sola cadena de referencias cruzadas, de la primera promesa a «Yo soy el Alfa y la Omega».',

  // Feminine plural, as "reindexadas" below agrees with it.
  'credits.links': 'Referencias cruzadas:',
  'credits.fromTsk': ', del Treasury of Scripture Knowledge',
  'credits.reindexed': ', reindexadas',
  'credits.toKjv': ' a la numeración de versículos de la KJV',
  'credits.text': 'Texto:',
  'credits.inspiredBy': 'Inspirado en',
  'credits.inspiration': (title, author) => `${title}, de ${author}`,

  'footer.source': 'Código fuente en GitHub',
  'footer.sourceLabel': 'GitHub',

  'install.link': 'Instalar la aplicación',
  'install.linkLabel': 'Instalar',
  'install.title': 'Instalar la aplicación',
  'install.lede':
    'Tenla en tu pantalla de inicio y léela sin conexión. Sin tienda de aplicaciones, sin cuenta.',
  'install.now': 'Instalar ahora',
  'install.device': 'Dispositivo',
  'install.close': 'Cerrar',
  'install.whileOnline':
    'Abre la aplicación una vez con conexión: es entonces cuando guarda el texto bíblico y las ' +
    'referencias cruzadas en tu dispositivo.',
};
