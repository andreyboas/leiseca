# Lei Seca — Plataforma de Estudo de Legislação

Plataforma web **local-first** e instalável (**PWA**) desenvolvida para concurseiros e estudantes de Direito estudarem legislação seca artigo por artigo, com grifos multicoloridos, anotações vinculadas ao texto, repetição espaçada, modo memorização (cloze) e exportação esquematizada.

---

## 1. Arquitetura e Stack Utilizada

- **Front-end**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Estado & Histórico Undo/Redo**: Zustand (`src/store/useLeiSecaStore.ts`)
- **Persistência Local-First (Offline)**: IndexedDB via Dexie (`src/db/database.ts`), com contrato de sincronização preparado em `src/db/syncAdapter.ts` para futura integração com Supabase, Firebase ou API Node + PostgreSQL
- **Processamento em Segundo Plano**: Web Worker dedicado (`src/workers/parser.worker.ts`) usando `pdfjs-dist` (PDF), `mammoth` (DOCX) e decodificação UTF-8 (TXT)
- **Virtualização**: `@tanstack/react-virtual` para lista contínua fluida com mais de 5.000 artigos
- **Exportação**: `jsPDF` (PDF com capa, legenda e marcações coloridas reais), `docx` (Word), Markdown (`.md`), CSV compatível com Anki e Backup completo `.json`
- **PWA Offline**: `vite-plugin-pwa` com Workbox e manifest configurados

### Modelo de Dados (`src/types/domain.ts`)
- **Codigo**: diploma legal importado (`id`, `nome`, `sigla`, `totalArtigos`, `fonteArquivo`, `syncVersion`)
- **Artigo**: unidade isolada com `numero`, `numeroSort`, `hierarquia` (`parte`, `livro`, `titulo`, `capitulo`, `secao`, `subsecao`), `epigrafe`, `blocos` (`caput`, `paragrafo`, `inciso`, `alinea`, `item`) e `textoIntegral`
- **Grifo**: marca-texto ancorado por `artigoId`, `blocoId`, offsets `inicio`/`fim`, `trecho` e `contextoAntes`/`contextoDepois` para re-ancoragem segura
- **Anotacao**: nota vinculada a um trecho ou geral do artigo (`conteudoHtml`, `conteudoTexto`, `jurisprudencia`, `tags`, `grifoId`)
- **Tag**: etiquetas reutilizáveis para organização e filtro
- **Colecao**: listas personalizadas de artigos (ex.: *"Artigos mais cobrados"*)
- **Progresso**: status por artigo (`nao_estudado`, `estudado`, `revisar`, `dominado`) e ciclo de repetição espaçada (`1, 3, 7, 15, 30 dias`)

---

## 2. Como Instalar, Rodar e Testar

```bash
# 1. Instalar dependências
npm install

# 2. Executar em desenvolvimento (porta 3000)
npm run dev

# 3. Rodar testes automatizados do parser (Vitest)
npm test

# 4. Verificar tipos TypeScript
npm run lint

# 5. Gerar build de produção (inclui Service Worker PWA)
npm run build
```

---

## 3. Como Testar as Principais Funcionalidades

1. **Importação / Amostra**: Na tela **Início** ou **Biblioteca**, envie um PDF/DOCX/TXT de Vade Mecum (revise a detecção automática de múltiplos códigos antes de confirmar) ou clique em **Carregar amostra oficial (CF/88, CP e CDC)**.
2. **Leitura e Marca-texto**: Abra um código no **Leitor**, alterne entre modo **Foco** e **Lista**, teste os temas **Claro / Sépia / Escuro**, selecione qualquer trecho e pressione as teclas `1`–`5` (ou clique na cor / botão **Anotar**).
3. **Persistência Offline**: Feche e reabra o navegador — todos os códigos, grifos, anotações e histórico de metas continuam salvos no IndexedDB local.
4. **Memorização, Revisão e Anki**: Ative o botão **Memorizar** no leitor para ocultar palavras-chave; marque artigos como **Revisar** para usar a fila espaçada; gere flashcards dos seus grifos e exporte em CSV para o Anki.
5. **Exportação Esquematizada**: Na aba **Exportar**, visualize a prévia ao vivo e baixe em **PDF**, **DOCX**, **Markdown** ou **JSON** (com restauração em outro dispositivo).
