import type { LocaleMessages } from './types.ts';

/** The interface in Portuguese. Anything left out falls back to the English word. */
export const pt: LocaleMessages = {
  // A name, so the same in every language.
  'app.name': 'Bible SoyDeLaCruz-Reference',
  'app.name.short': 'SoyDeLaCruz',

  'view.arcs': 'Arcos',
  'view.arcs.short': 'Arcos',
  'view.arcs.open': 'Ver nos Arcos',
  'view.threads': 'Fios',
  'view.threads.short': 'Fios',
  'view.threads.open': 'Ler no contexto',
  'view.clusters': 'Aglomerados',
  'view.clusters.short': 'Aglomerados',
  'view.clusters.open': 'Ver em Aglomerados',
  'view.switch': 'Visualizações',

  'search.label': 'Ir para uma referência bíblica, ou buscar palavras no texto',
  'search.placeholder': 'João 3:16, Sl 23 ou palavras…',
  'search.noResults': (query) =>
    `Nenhum versículo contém “${query}”. Para abrir uma passagem, digite uma referência como ` +
    `“João 3:16”.`,
  'search.results': (count, plural, query) =>
    plural === 1 ? `1 versículo contém “${query}”.` : `${count} versículos contêm “${query}”.`,
  'search.results.limited': (shown) =>
    `Exibindo os primeiros ${shown}; acrescente uma palavra para refinar a busca.`,
  'search.results.label': 'Versículos que contêm as palavras',
  'search.results.close': 'Fechar os resultados',

  'reference.unreadable': 'Digite uma referência como “João 3:16” ou “Sl 23”.',
  'reference.unknownBook': (query) => `Livro desconhecido “${query}”.`,
  'reference.ambiguous': (query, candidates) => `“${query}” pode ser ${candidates}.`,
  'reference.or': ' ou ',
  'reference.chapters': (book, count) => `${book} tem ${count} capítulos.`,
  'reference.verses': (reference, chapter, count) =>
    `${reference} ${chapter} tem ${count} versículos.`,

  // Plural and masculine, agreeing with "Filtros".
  'menu.filtersChanged': 'Filtros (alterados)',
  'menu.filters': 'Filtros',
  'menu.filters.votes': 'Votos da comunidade',
  'menu.filters.votes.all': 'Todos',
  'menu.filters.votes.atLeast': (votes) => `≥ ${String(votes)}`,
  'menu.filters.note': (shown, total, threshold, hidden) =>
    `Os votos indicam o quanto os leitores do OpenBible.info acharam uma ligação útil; não ` +
    `provam que ela esteja certa ou errada. Exibindo ${shown} de ${total} ligações ` +
    `(${threshold}${hidden}).`,
  'menu.filters.hiddenGenres': (count) =>
    count === 1 ? ', 1 gênero oculto' : `, ${String(count)} gêneros ocultos`,
  'filter.allLinks': 'todas as ligações',
  'filter.noDownvoted': 'ligações com votos negativos ficam ocultas',
  'filter.atLeastVotes': (votes, plural) => (plural === 1 ? `≥ ${votes} voto` : `≥ ${votes} votos`),
  'menu.filters.tip': 'Dica: toque num gênero na legenda para ocultá-lo ou exibi-lo.',
  'menu.filters.reset': 'Restaurar filtros',

  'attribution.bsb': 'Texto bíblico: Berean Standard Bible (BSB), dedicada ao domínio público.',
  'attribution.kjv':
    'Texto bíblico: King James Version (Authorized Version), texto de 1769. Em domínio público ' +
    'nos Estados Unidos e na maior parte do mundo; no Reino Unido, uma carta-patente reserva o ' +
    'direito de imprimi-lo aos impressores da Coroa — Cambridge University Press, Oxford ' +
    'University Press e Collins.',
  'attribution.web':
    'Texto bíblico: World English Bible (WEB), em domínio público. “World English Bible” é uma marca da eBible.org.',
  'attribution.asv': 'Texto bíblico: American Standard Version (ASV), 1901, em domínio público.',
  'attribution.ylt':
    "Texto bíblico: Young's Literal Translation (YLT), Robert Young, 1898, em domínio público.",
  'attribution.net':
    'Escrituras citadas com permissão. As citações marcadas (NET) são da NET Bible®, ' +
    'copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com Todos os ' +
    'direitos reservados.',
  'attribution.blivre':
    'Texto bíblico: Bíblia Livre (BLIVRE), © Diego Santos, Mario Sérgio e Marco Teles, ' +
    'fevereiro de 2018 (edição Textus Receptus), https://sites.google.com/site/biblialivre/. ' +
    'Alterações: os espaços foram normalizados; nenhuma palavra foi alterada.',
  'attribution.rv1909': 'Texto bíblico: Reina-Valera 1909 (RV1909), em domínio público.',
  'license.publicDomain': 'Domínio público',
  'menu.translation': 'Tradução',
  'menu.translation.failed': (name) => `Não foi possível carregar ${name}.`,
  'menu.translation.error': (message) => `${message} Verifique sua conexão e tente novamente.`,
  'menu.language': 'Idioma',

  'genres.label': 'Gêneros',
  // Plural and masculine, agreeing with "Gêneros".
  'genres.labelChanged': 'Gêneros (alterados)',
  'genres.show': 'Exibir gêneros',
  'genres.hide': 'Ocultar gêneros',
  'genres.hideOne': (name) => `Ocultar ${name}`,
  'genres.showOne': (name) => `Exibir ${name}`,
  'testament.OT': 'Antigo Testamento',
  'testament.NT': 'Novo Testamento',

  'stats.label': 'Resumo',
  'stats.verses': (count) => [{ strong: count }, ' versículos'],
  'stats.links': (shown, total) =>
    total === null
      ? [{ strong: shown }, ' ligações exibidas']
      : [{ strong: shown }, ` de ${total} ligações exibidas`],
  // "dos versículos conectados" would read as "of the connected verses"; this says that they are.
  'stats.connected': (share) => [{ strong: share }, ' dos versículos estão conectados'],
  'stats.crossTestament': (count) => [{ strong: count }, ' ligações entre os testamentos'],
  'hint.zoom': 'para ampliar',
  'hint.pan': 'para mover',
  'hint.focus': 'para focar',
  'hint.hold': 'segure para pré-visualizar',

  'panel.details': 'Detalhes',
  'panel.expand': 'Expandir detalhes',
  'panel.collapse': 'Recolher detalhes',
  'panel.close': 'Fechar',
  'panel.previousVerse': 'Versículo anterior',
  'panel.nextVerse': 'Próximo versículo',
  'panel.previousChapter': 'Capítulo anterior',
  'panel.nextChapter': 'Próximo capítulo',
  'panel.copy': (reference) => `Copiar ${reference} com um link`,
  'panel.copy.title': 'Copiar com um link',
  'panel.copied': (reference) => `${reference} copiado`,
  'panel.omitted': (abbreviation) => `Omitido na ${abbreviation}.`,
  'panel.moreVerses': (count, plural) =>
    plural === 1 ? `+ ${count} versículo` : `+ ${count} versículos`,
  'panel.showAll': (count) => `Ver todas as ${count}`,

  'note.toRange': (range) => `para ${range}`,
  'note.fromVerse': (verse) => `do v. ${verse}`,
  'note.toVerse': (verse) => `para o v. ${verse}`,

  'panel.connectsTo': 'Ligações por gênero',
  'panel.connectsTo.note': (count) => (count === 1 ? '1 gênero' : `${String(count)} gêneros`),
  'panel.references': 'Referências',
  'panel.references.note': 'para onde esta passagem aponta',
  'panel.referencedBy': 'Referenciado por',
  'panel.referencedBy.note': 'que apontam para cá',
  'panel.verses': 'Versículos',
  'panel.verses.note': 'escolha um para lê-lo',
  'panel.none': 'Nenhuma',
  'panel.items': 'itens',
  'panel.passages': 'passagens',
  'panel.linksCounted': 'ligações',
  'panel.versesCounted': 'versículos',
  'panel.linksUnit': (plural) => (plural === 1 ? 'ligação' : 'ligações'),
  'panel.passagesUnit': (plural) => (plural === 1 ? 'passagem' : 'passagens'),
  'panel.summary.references': (count, plural) =>
    plural === 1 ? `${count} referência` : `${count} referências`,
  'panel.summary.referencedBy': (count, plural) =>
    plural === 1 ? `${count} aponta para cá` : `${count} apontam para cá`,
  'panel.summary.notes': (count, plural) => (plural === 1 ? `${count} nota` : `${count} notas`),
  'panel.summary.none': 'Nenhuma referência cruzada',
  'panel.announce': (passage, summary) => `${passage} · ${summary}`,

  // The language names are already in the case Portuguese wants them: a message puts its
  // arguments in place, it does not reshape them.
  'library.save': 'Salvar versículo',
  'library.saved': 'Salvo',
  'library.highlights': 'Destaque',
  'library.highlight.yellow': 'Amarelo',
  'library.highlight.green': 'Verde',
  'library.highlight.blue': 'Azul',
  'library.highlight.pink': 'Rosa',
  'library.highlight.none': 'Sem destaque',
  'library.note': 'Nota',
  'library.note.placeholder': 'Escreva uma nota sobre este versículo…',
  'saved.menu': 'Versículos salvos',
  'saved.empty':
    'Nenhum versículo salvo ainda. Clique num versículo e depois em Salvar versículo — você ' +
    'pode destacá-lo e escrever uma nota.',
  'saved.count': (count, plural) =>
    plural === 1
      ? '1 versículo salvo neste dispositivo.'
      : `${count} versículos salvos neste dispositivo.`,
  'saved.export': 'Exportar',
  'saved.import': 'Importar',
  'saved.imported': (count, plural) =>
    plural === 1 ? '1 versículo importado.' : `${count} versículos importados.`,
  'saved.importFailed': 'Esse arquivo não contém versículos salvos deste aplicativo.',
  'saved.note':
    'Guardado só neste dispositivo. Exporte uma cópia para mantê-la segura ou levá-la a outro ' +
    'dispositivo.',

  'image.save': 'Salvar como imagem',
  'image.failed': 'Não foi possível salvar a imagem.',

  'path.title': 'Caminho',
  'path.note': 'a cadeia de ligações até outra passagem',
  'path.label': 'Passagem até a qual encontrar um caminho',
  'path.placeholder': 'Até…  Ap 12:9',
  'path.find': 'Buscar',
  'path.clear': 'Limpar caminho',
  'path.summary': (from, to, count, plural) =>
    plural === 1
      ? `De ${from} a ${to} em ${count} ligação:`
      : `De ${from} a ${to} em ${count} ligações:`,
  'path.arrived': (to) => `Esta passagem é ${to}, ou a contém.`,
  'path.none': (to) =>
    `Nenhuma cadeia de ligações chega a ${to} com os filtros atuais. Mostrar mais ligações em ` +
    `Filtros pode encontrar uma.`,
  'path.references': 'faz referência a',
  'path.referencedBy': 'é referenciado por',
  'path.votes': (count, plural) => (plural === 1 ? `${count} voto` : `${count} votos`),

  'words.heading': (language) => `Mesma palavra ${language}`,
  'words.note': 'onde mais ela aparece',
  'words.counted': 'palavras',
  'words.versesUnit': (plural) => (plural === 1 ? 'versículo' : 'versículos'),
  'words.showMore': (count) => `Ver mais ${count}`,
  'language.hebrew': 'hebraica',
  'language.greek': 'grega',
  'words.credit': (max) =>
    `, baseado no trabalho da Tyndale House, Cambridge; reduzido às formas de dicionário. ` +
    `Palavras usadas em mais de ${max} versículos ficam de fora.`,
  'words.creditLabel': 'Palavras:',

  'study.title': 'Estudar em outros sites',
  'study.note': 'notas, léxicos e comentários em outros sites',
  'study.net': 'Notas da NET Bible',
  'study.blueLetterBible': 'Interlinear e léxico da Blue Letter Bible',
  'study.bibleHubCommentaries': 'Comentários do BibleHub',
  'study.bibleHubParallel': 'Traduções paralelas do BibleHub',
  'study.bibleHubChapter': 'Página de estudo do BibleHub',
  'study.stepBible': 'Estudo de palavras no STEPBible',
  'study.label': (link, passage) => `${link} sobre ${passage}`,

  'notes.title': 'Notas da NET',
  'notes.note': 'os tradutores, sobre as palavras (em inglês)',
  'notes.counted': 'notas',
  'notes.kind.translation': 'Redação',
  'notes.kind.study': 'Estudo',
  'notes.kind.text-critical': 'Crítica textual',
  'notes.kind.map': 'Mapa',
  'notes.filter': 'Mostrar as notas de um tipo',
  'notes.all': 'Todas',
  'notes.otherTranslation': (abbreviation) =>
    `As notas comentam a redação da NET; o texto acima é da ${abbreviation}.`,
  'notes.readAll': 'Ler a nota inteira',
  'notes.readLess': 'Mostrar menos',
  'notes.cite': (passage) => `Ir para ${passage}`,
  'notes.marker': (kind, words) => (words ? `${kind}: nota sobre “${words}”` : `${kind}: nota`),
  'notes.close': 'Fechar a nota',

  'loading.data': (verses, links) =>
    `Carregando ${verses} versículos e ${links} referências cruzadas…`,
  'error.datasetUnavailable':
    'Não foi possível carregar esta parte dos dados da Bíblia. Verifique sua conexão e tente novamente.',
  'error.retry': 'Tentar novamente',
  'error.viewFailed': (view, message) => `Não foi possível iniciar ${view}: ${message}`,

  'threads.direction': 'Direção dos fios',
  'threads.outgoing': 'Para onde aponta',
  'threads.incoming': 'O que aponta para cá',
  'threads.both': 'Ambos',
  'threads.verse': (number) => `Versículo ${number}: ver suas referências cruzadas`,
  'threads.hint':
    'Os fios vão de cada versículo até onde suas referências cruzadas chegam · o número à ' +
    'direita diz quantas são · clique em um versículo para vê-las',
  'threads.hint.touch':
    'Os fios vão de cada versículo até onde suas referências cruzadas chegam · o número à ' +
    'direita diz quantas são · toque em um versículo para vê-las',
  'threads.links': (plural) => (plural === 1 ? 'ligação' : 'ligações'),
  'threads.omitted': (abbreviation) =>
    `Omitido na ${abbreviation} (não consta nos manuscritos mais antigos).`,
  'threads.spineHover': (count, plural) =>
    plural === 1 ? `${count} fio daqui · clique para ler` : `${count} fios daqui · clique para ler`,
  'threads.chapters': 'Capítulos',
  'threads.previousChapter': 'Capítulo anterior',
  'threads.nextChapter': 'Próximo capítulo',
  'threads.stage':
    'Fios que vão dos versículos deste capítulo até onde suas referências cruzadas chegam na ' +
    'Bíblia, exibidos como uma barra vertical com todos os 66 livros.',
  'clusters.book': 'Livro',
  'clusters.wholeBible': 'Bíblia inteira',
  'clusters.openBook': 'clique para abri-lo',
  'clusters.hint':
    'Aponte para um versículo para iluminar suas ligações, ou para o nome ou a borda de um ' +
    'livro para todas elas · clique no nome de um livro para abri-lo',
  'clusters.tour.start': 'Ver um passeio por versículos conhecidos',
  'clusters.tour.stop': 'Parar o passeio',
  'clusters.stage':
    'Cada versículo com referências cruzadas é um ponto, reunido em um aglomerado por livro: o ' +
    'Antigo Testamento de um lado, o Novo do outro, com as ligações entre eles em traço leve. ' +
    'Aponte para um livro ou versículo para iluminar suas ligações, clique em um versículo para ' +
    'focá-lo e em um livro para abri-lo capítulo por capítulo.',
  'arcs.connections': (count, plural) => (plural === 1 ? `${count} conexão` : `${count} conexões`),
  'arcs.stage':
    'Diagrama em arcos das referências cruzadas. Arraste ou use as setas para mover, role ou ' +
    '+/- para ampliar, clique para focar uma passagem, Esc para limpar. Numa tela sensível ao ' +
    'toque, toque e segure para pré-visualizar uma passagem.',

  'credits.links': 'Ligações:',
  'credits.fromTsk': ', do Treasury of Scripture Knowledge',
  'credits.reindexed': ', reindexadas',
  'credits.toKjv': ' para a numeração de versículos da KJV',
  'credits.text': 'Texto:',
  'credits.inspiredBy': 'Inspirado por',
  'credits.inspiration': (title, author) => `${title}, por ${author}`,

  'footer.source': 'Código-fonte no GitHub',
  'footer.sourceLabel': 'GitHub',

  'install.link': 'Instalar o aplicativo',
  'install.linkLabel': 'Instalar',
  'install.title': 'Instalar o aplicativo',
  'install.lede':
    'Deixe na sua tela inicial e leia sem conexão. Sem loja de aplicativos, sem conta.',
  'install.now': 'Instalar agora',
  'install.device': 'Dispositivo',
  'install.close': 'Fechar',
  'install.whileOnline':
    'Abra o aplicativo uma vez com conexão: é nesse momento que ele guarda o texto bíblico e as ' +
    'referências cruzadas no seu dispositivo.',
};
