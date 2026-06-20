import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const LS_LANG = 'modeltree.lang'

// idiomas conhecidos antes do manifesto carregar (fallback)
const DEFAULT_LANGS = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'English' },
]

// Tabelas de tradução da INTERFACE (o conteúdo dos dados é traduzido à parte).
const STRINGS = {
  pt: {
    'app.loading': 'Carregando...',
    'app.error': 'Erro',

    'nav.title': 'Taxonomia de Modelos',
    'nav.collapse': 'Recolher navegação',
    'nav.open': 'Abrir navegação',
    'nav.expandItem': 'Expandir',
    'nav.collapseItem': 'Colapsar',

    'search.placeholder': 'Buscar modelos...',
    'search.clear': 'Limpar busca',

    'controls.save': 'Salvar layout',
    'controls.saving': 'Salvando…',
    'controls.saved': 'Salvo ✓',
    'controls.saveTitle': 'Salvar a sua organização (fica guardada neste navegador)',
    'controls.reset': 'Resetar',
    'controls.resetTitle': 'Voltar à sua última config salva',
    'controls.hardReset': 'restaurar padrão',
    'controls.hardResetTitle': 'Restaurar layout padrão do app (descarta suas mudanças)',
    'controls.hardResetConfirm': 'Restaurar o layout padrão do app? Isso descarta as suas mudanças salvas.',
    'controls.zoomIn': 'Aproximar',
    'controls.zoomOut': 'Afastar',
    'controls.fit': 'Enquadrar tudo',

    'panel.strengths': 'Pontos fortes',
    'panel.weaknesses': 'Pontos fracos',
    'panel.recommended': 'Recomendado para',
    'panel.notRecommended': 'Não recomendado para',
    'panel.curiosity': 'Curiosidade',
    'panel.close': 'Fechar',

    'chat.open': 'Pergunte ao tutor',
    'chat.title': 'Pergunte ao tutor',
    'chat.placeholder': 'Descreva seu problema, dados e restrições...',
    'chat.send': 'Enviar',
    'chat.thinking': 'Pensando...',
    'chat.error': 'Falha de conexão com o servidor',
    'chat.level.beginner': 'Iniciante',
    'chat.level.intermediate': 'Básico',
    'chat.level.advanced': 'Avançado',
    'chat.level.title': 'Ajuste a profundidade da resposta ao seu nível',
    'chat.reset': 'Nova conversa',

    'about.title': 'Sobre o projeto',
    'about.body': 'Este projeto nasceu para transformar o mapa disperso dos modelos preditivos em uma única árvore navegável. Em vez de caçar definições por artigos e blogs, você explora a taxonomia inteira, vê o que distingue cada modelo dos irmãos, quando usar e quando evitar, e conta com um tutor que recomenda o caminho certo para o seu problema. A ideia é servir tanto de material de estudo para quem aprende quanto de ferramenta de consulta para quem constrói.',
    'about.noteBefore': 'Nota: alguns ',
    'about.noteLink': 'modelos',
    'about.noteAfter': ' preditivos não estão indexados nesta árvore.',
    'about.open': 'Sobre o projeto',

    'lang.switch': 'Idioma',
  },
  en: {
    'app.loading': 'Loading...',
    'app.error': 'Error',

    'nav.title': 'Model Taxonomy',
    'nav.collapse': 'Collapse navigation',
    'nav.open': 'Open navigation',
    'nav.expandItem': 'Expand',
    'nav.collapseItem': 'Collapse',

    'search.placeholder': 'Search models...',
    'search.clear': 'Clear search',

    'controls.save': 'Save layout',
    'controls.saving': 'Saving…',
    'controls.saved': 'Saved ✓',
    'controls.saveTitle': 'Save your arrangement (kept in this browser)',
    'controls.reset': 'Reset',
    'controls.resetTitle': 'Back to your last saved setup',
    'controls.hardReset': 'restore default',
    'controls.hardResetTitle': 'Restore the app default layout (discards your changes)',
    'controls.hardResetConfirm': 'Restore the app default layout? This discards your saved changes.',
    'controls.zoomIn': 'Zoom in',
    'controls.zoomOut': 'Zoom out',
    'controls.fit': 'Fit all',

    'panel.strengths': 'Strengths',
    'panel.weaknesses': 'Weaknesses',
    'panel.recommended': 'Recommended for',
    'panel.notRecommended': 'Not recommended for',
    'panel.curiosity': 'Curiosity',
    'panel.close': 'Close',

    'chat.open': 'Ask the tutor',
    'chat.title': 'Ask the tutor',
    'chat.placeholder': 'Describe your problem, data and constraints...',
    'chat.send': 'Send',
    'chat.thinking': 'Thinking...',
    'chat.error': 'Connection to the server failed',
    'chat.level.beginner': 'Beginner',
    'chat.level.intermediate': 'Basic',
    'chat.level.advanced': 'Advanced',
    'chat.level.title': 'Tune the answer depth to your level',
    'chat.reset': 'New chat',

    'about.title': 'About the project',
    'about.body': 'This project was born to turn the scattered map of predictive models into a single navigable tree. Instead of hunting for definitions across papers and blogs, you explore the whole taxonomy, see what sets each model apart from its siblings, when to use it and when to avoid it, and get a tutor that points you to the right approach for your problem. It aims to be both study material for those learning and a reference tool for those building.',
    'about.noteBefore': 'Note: some predictive ',
    'about.noteLink': 'models',
    'about.noteAfter': ' are not indexed in this tree.',
    'about.open': 'About the project',

    'lang.switch': 'Language',
  },
}

const LangContext = createContext({
  lang: 'en', setLang: () => {}, t: (k) => k, languages: DEFAULT_LANGS,
})

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(LS_LANG) || 'en')
  // lista de idiomas vinda do manifesto data/languages.json (auto-descoberta)
  const [languages, setLanguages] = useState(DEFAULT_LANGS)

  useEffect(() => {
    fetch('/languages.json')
      .then(r => (r.ok ? r.json() : null))
      .then(list => {
        if (Array.isArray(list) && list.length) setLanguages(list)
      })
      .catch(() => { /* mantém o default */ })
  }, [])

  const setLang = useCallback((l) => {
    setLangState(l)
    localStorage.setItem(LS_LANG, l)
  }, [])

  // t(key): tabela do idioma ativo → fallback en → pt → própria chave.
  // (idioma com dados mas sem tabela de UI cai no en.)
  const t = useCallback(
    (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? STRINGS.pt[key] ?? key,
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t, languages }), [lang, setLang, t, languages])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
