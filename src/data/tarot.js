// nó-surpresa: modelo preditivo "alternativo" preso à raiz, revelado pelo easter egg.
// escrito na voz de quem confia nas cartas, não na estatística. uma versão por idioma.
const TAROT_BY_LANG = {
  pt: {
    id: 'tarot',
    name: 'Tarot',
    year: 1440,
    diff_siblings:
      'Enquanto os outros ramos preveem a partir de dados do passado, o Tarot lê o presente arquetípico e os fios invisíveis que ligam o consulente ao que está por vir; não estima probabilidades, revela sentido.',
    strengths: [
      'Não exige dados históricos: uma única tiragem já acessa o campo simbólico da questão',
      'Abarca o que nenhuma métrica captura, intenção, timing, o não-dito e o ainda-não-manifesto',
      'Cada leitura é integralmente interpretável: toda carta tem nome, imagem e significado vivo',
    ],
    weaknesses: [
      'A precisão depende da clareza da pergunta e da sintonia de quem conduz a tiragem',
      'Não se valida por backtest: o baralho responde ao momento, e o momento não se repete',
      'Cartas invertidas e vizinhanças mudam tudo; exige anos de leitura para ler bem',
    ],
    recommended_for: [
      'Decisões em que o coração já sabe a resposta e só falta coragem para enxergá-la',
      'Encruzilhadas sem dado nenhum, onde só o símbolo ilumina o caminho',
    ],
    not_recommended_for: [
      'Quem busca um número e uma margem de erro em vez de um espelho',
      'Perguntas feitas por teimosia, repetidas até o baralho dizer o que se quer ouvir',
    ],
    curiosity:
      'Os mais antigos baralhos de tarô que sobreviveram, os Visconti-Sforza, foram pintados à mão por volta de 1440 em Milão; o que nasceu como jogo da nobreza tornou-se, séculos depois, o mais consultado dos oráculos do Ocidente.',
    children: [],
  },
  en: {
    id: 'tarot',
    name: 'Tarot',
    year: 1440,
    diff_siblings:
      'Where the other branches predict from past data, the Tarot reads the archetypal present and the invisible threads tying the querent to what is coming; it does not estimate probabilities, it reveals meaning.',
    strengths: [
      'Needs no historical data: a single spread already taps the symbolic field of the question',
      'Holds what no metric captures, intention, timing, the unspoken and the not-yet-manifest',
      'Every reading is fully interpretable: each card has a name, an image and a living meaning',
    ],
    weaknesses: [
      'Accuracy depends on the clarity of the question and the attunement of the reader',
      'It cannot be backtested: the deck answers the moment, and the moment never repeats',
      'Reversed cards and neighbours change everything; reading well takes years of practice',
    ],
    recommended_for: [
      'Decisions where the heart already knows the answer and only courage to see it is missing',
      'Crossroads with no data at all, where only the symbol lights the way',
    ],
    not_recommended_for: [
      'Those who want a number and a margin of error rather than a mirror',
      'Questions asked out of stubbornness, repeated until the deck says what one wants to hear',
    ],
    curiosity:
      'The oldest surviving tarot decks, the Visconti-Sforza, were hand-painted around 1440 in Milan; what began as a game for the nobility became, centuries later, the most consulted of the Western oracles.',
    children: [],
  },
}

export const TAROT_ID = 'tarot'

// devolve o nó no idioma pedido, com fallback para inglês
export function tarotNode(lang) {
  return TAROT_BY_LANG[lang] ?? TAROT_BY_LANG.en
}
