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
