import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Video,
  BookOpen,
  FileText,
  Search,
  RefreshCw,
  Sparkles,
  Database,
  PlayCircle,
  Wand2,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  List as ListIcon,
  Filter,
  Folder,
  FolderOpen,
  Menu,
  X,
  LayoutTemplate,
} from 'lucide-react';

const HISTORY_ITEMS_PER_PAGE = 6;
const HISTORY_FETCH_LIMIT = 120;

function normalizeFlashcards(rawFlashcards) {
  if (!Array.isArray(rawFlashcards)) return [];

  return rawFlashcards.map((card, index) => ({
    id: card.id ?? `card-${index}`,
    question: card.question ?? card.pergunta ?? '',
    answer: card.answer ?? card.resposta ?? '',
    preceptorNote: card.preceptorNote ?? card.nota_preceptor ?? null,
    difficulty: card.difficulty || 'medium',
    reviewed:
      typeof card.reviewed === 'boolean'
        ? card.reviewed
        : Boolean((card.question ?? card.pergunta) && (card.answer ?? card.resposta)),
  }));
}

function buildHistoryPreview(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Sem prévia disponível.';
  return clean.length > 160 ? `${clean.slice(0, 160).trim()}...` : clean;
}

function mapRunToHistoryItem(run) {
  const flashcards = normalizeFlashcards(run.enriched_flashcards || run.flashcards);
  return {
    id: run.id,
    title: run.original_filename || 'Sem título',
    date: run.created_at,
    flashcards,
    flashcardsCount: flashcards.length,
    hasFlashcards: flashcards.length > 0,
    type: run.video_url ? 'video' : 'text',
    preview: run.transcript_preview || buildHistoryPreview(run.transcript),
    transcript: run.transcript || '',
    videoUrl: run.video_url || null,
    hasAnalysis: Boolean(run.has_analysis),
    lastAnalysisAt: run.last_analysis_at || null,
    raw: run,
    isFavorite: Boolean(run.is_favorite),
    studyTag: run.study_tag || '',
    specialty: run.specialty || '',
    secondaryTopics: Array.isArray(run.secondary_topics) ? run.secondary_topics : [],
    autoTags: Array.isArray(run.auto_tags) ? run.auto_tags : [],
  };
}

export default function AdvancedFlashcardPoC() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const videoInputRef = useRef(null);
  
  const uploadSectionRef = useRef(null);
  const transcriptSectionRef = useRef(null);
  const flashcardsSectionRef = useRef(null);
  const evidenceSectionRef = useRef(null);
  const enrichedSectionRef = useRef(null);
  const metricsSectionRef = useRef(null);
  const historySectionRef = useRef(null);
  const librarySectionRef = useRef(null);
  const studySessionSectionRef = useRef(null);
  const [isSectionSidebarExpanded, setIsSectionSidebarExpanded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [generateFlashcardsNow, setGenerateFlashcardsNow] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingSavedFlashcards, setIsGeneratingSavedFlashcards] = useState(false);
  
  const [transcript, setTranscript] = useState('');
  const [flashcards, setFlashcards] = useState([]);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [currentFilename, setCurrentFilename] = useState('');

  const [flashcardsViewMode, setFlashcardsViewMode] = useState('grid');
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const [historyData, setHistoryData] = useState([]);
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [currentFolder, setCurrentFolder] = useState('all');
  const [historyViewMode, setHistoryViewMode] = useState('grid');
  const [historyPage, setHistoryPage] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHistorySidebarExpanded, setIsHistorySidebarExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyHasMoreOnBackend, setHistoryHasMoreOnBackend] = useState(false);
  const [isHistoryDetailsOpen, setIsHistoryDetailsOpen] = useState(false);
  const [libraryDecks, setLibraryDecks] = useState([]);
  const [libraryCards, setLibraryCards] = useState([]);
  const [libraryViewMode, setLibraryViewMode] = useState('tree');
  const [selectedDeckId, setSelectedDeckId] = useState('');

  const [deckTree, setDeckTree] = useState([]);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState('');
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);

  const [moveTargetDeckId, setMoveTargetDeckId] = useState('');
  const [libraryAnalytics, setLibraryAnalytics] = useState(null);
  const [isLoadingLibraryAnalytics, setIsLoadingLibraryAnalytics] = useState(false);

  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySpecialtyFilter, setLibrarySpecialtyFilter] = useState('');
  const [libraryMode, setLibraryMode] = useState('deck');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isSavingCardsToLibrary, setIsSavingCardsToLibrary] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckSpecialty, setNewDeckSpecialty] = useState('');
  const [newDeckSubSpecialty, setNewDeckSubSpecialty] = useState('');
  const [activeSmartDeck, setActiveSmartDeck] = useState(null);
  const [editingLibraryCardId, setEditingLibraryCardId] = useState(null);
  const [editingLibraryCardForm, setEditingLibraryCardForm] = useState({
    question: '',
    answer: '',
    preceptor_note: '',
    difficulty: 'medium',
    deck_id: '',
  });
  const [isSavingLibraryCardEdit, setIsSavingLibraryCardEdit] = useState(false);
  const [studyQueue, setStudyQueue] = useState([]);
  const [studySourceType, setStudySourceType] = useState('library');
  const [studyMode, setStudyMode] = useState('due');
  const [currentLibraryStudyIndex, setCurrentLibraryStudyIndex] = useState(0);
  const [isLibraryStudyFlipped, setIsLibraryStudyFlipped] = useState(false);
  const [studySessionStats, setStudySessionStats] = useState({
    totalSeen: 0,
    correctCount: 0,
    hardCount: 0,
    easyCount: 0,
  });
  const [error, setError] = useState(null);

  const [isAnalyzingEvidence, setIsAnalyzingEvidence] = useState(false);
  const [autoAnalyzeEvidence, setAutoAnalyzeEvidence] = useState(false);
  const [evidenceAnalysis, setEvidenceAnalysis] = useState(null);
  const [evidenceSources, setEvidenceSources] = useState([]);
  const [referenceVideos, setReferenceVideos] = useState([]);
  const [enrichmentReferenceVideos, setEnrichmentReferenceVideos] = useState([]);
  const [isGeneratingEnrichedTranscript, setIsGeneratingEnrichedTranscript] = useState(false);
  const [isGeneratingEnrichedFlashcards, setIsGeneratingEnrichedFlashcards] = useState(false);
  const [enrichedTranscript, setEnrichedTranscript] = useState('');
  const [enrichedSummary, setEnrichedSummary] = useState(null);
  const [enrichedGeneratedAt, setEnrichedGeneratedAt] = useState(null);
  const [enrichedFlashcardsGeneratedAt, setEnrichedFlashcardsGeneratedAt] = useState(null);
  const [comparisonMode, setComparisonMode] = useState('enriched');
  const [isExportingStudyPack, setIsExportingStudyPack] = useState(false);
  const [studyCoverageMetrics, setStudyCoverageMetrics] = useState(null);
  const [automationPreset, setAutomationPreset] = useState('manual');
  const [autoRunOnProcess, setAutoRunOnProcess] = useState(false);
  const [autoRunOnOpenHistory, setAutoRunOnOpenHistory] = useState(false);
  const [autoGenerateEnrichment, setAutoGenerateEnrichment] = useState(false);
  const [autoGenerateBetterFlashcards, setAutoGenerateBetterFlashcards] = useState(false);
  const [currentSpecialty, setCurrentSpecialty] = useState('');
  const [currentSecondaryTopics, setCurrentSecondaryTopics] = useState([]);
  const [currentAutoTags, setCurrentAutoTags] = useState([]);
  const [reviewState, setReviewState] = useState({});
  const [reviewStats, setReviewStats] = useState({});
  const [isSavingReview, setIsSavingReview] = useState(false);

  const parseResponseSafely = async (response) => {
    const rawText = await response.text();

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 250)}`);
    }
  };

  const resetAll = () => {
    setVideoFile(null);
    setGenerateFlashcardsNow(true);
    setIsProcessing(false);
    setIsGeneratingSavedFlashcards(false);
    setTranscript('');
    setFlashcards([]);
    setCurrentRunId(null);
    setCurrentFilename('');
    setFlashcardsViewMode('grid');
    setCurrentStudyIndex(0);
    setIsFlipped(false);
    setError(null);
    setIsAnalyzingEvidence(false);
    setEvidenceAnalysis(null);
    setEvidenceSources([]);
    setReferenceVideos([]);
    setEnrichmentReferenceVideos([]);
    setIsGeneratingEnrichedTranscript(false);
    setIsGeneratingEnrichedFlashcards(false);
    setEnrichedTranscript('');
    setEnrichedSummary(null);
    setEnrichedGeneratedAt(null);
    setEnrichedFlashcardsGeneratedAt(null);
    setReviewState({});
    setReviewStats({});
    setIsSavingReview(false);
    setCurrentSpecialty('');
    setCurrentSecondaryTopics([]);
    setCurrentAutoTags([]);

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const loadHistory = async (searchValue = historySearch) => {
    setIsLoadingHistory(true);

    try {
      const params = new URLSearchParams({
        page: '1',
        limit: String(HISTORY_FETCH_LIMIT),
      });

      if (searchValue.trim()) {
        params.set('search', searchValue.trim());
      }

      const response = await fetch(`${API_BASE}/api/history?${params.toString()}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar histórico.');
      }

      const runs = Array.isArray(data.runs) ? data.runs : [];
      setHistoryData(runs.map(mapRunToHistoryItem));
      setHistoryHasMoreOnBackend(Boolean(data.hasMore));
    } catch (err) {
      console.error(err);
      setError(`Falha ao carregar histórico: ${err.message}`);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadHistoryTimeoutRef = useRef(null);

  const loadHistoryDebounced = (searchValue = historySearch) => {
    if (loadHistoryTimeoutRef.current) {
      clearTimeout(loadHistoryTimeoutRef.current);
    }

    loadHistoryTimeoutRef.current = setTimeout(() => {
      loadHistoryTimeoutRef.current = null;
      loadHistory(searchValue);
    }, 300);
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLibraryDecks();
    loadDeckTree();
    loadLibraryAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLibraryCards({
      deckId: selectedDeckId,
      specialty: librarySpecialtyFilter,
      favorites: libraryMode === 'favorites',
      dueOnly: libraryMode === 'due',
      search: librarySearch,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeckId, librarySpecialtyFilter, libraryMode]);

  useEffect(() => {
    return () => {
      if (loadHistoryTimeoutRef.current) {
        clearTimeout(loadHistoryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCurrentStudyIndex(0);
    setIsFlipped(false);
  }, [flashcards]);

  const transcriptWordCount = useMemo(() => {
    return transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  }, [transcript]);

  const enrichedWordCount = useMemo(() => {
    return enrichedTranscript.trim() ? enrichedTranscript.trim().split(/\s+/).length : 0;
  }, [enrichedTranscript]);

  useEffect(() => {
    const detectedTopics = Array.isArray(evidenceAnalysis?.topics_detected)
      ? evidenceAnalysis.topics_detected.length
      : 0;

    const missingTopics = Array.isArray(evidenceAnalysis?.missing_topics)
      ? evidenceAnalysis.missing_topics.length
      : 0;

    const suggestions = Array.isArray(evidenceAnalysis?.improvement_suggestions)
      ? evidenceAnalysis.improvement_suggestions.length
      : 0;

    const mnemonics = Array.isArray(evidenceAnalysis?.mnemonics)
      ? evidenceAnalysis.mnemonics.length
      : 0;

    const flashcardsCount = Array.isArray(flashcards) ? flashcards.length : 0;

    setStudyCoverageMetrics({
      detectedTopics,
      missingTopics,
      suggestions,
      mnemonics,
      flashcardsCount,
      transcriptWordCount,
      enrichedWordCount,
      enrichmentGain:
        transcriptWordCount > 0
          ? Math.max(0, enrichedWordCount - transcriptWordCount)
          : 0,
    });
  }, [
    evidenceAnalysis,
    flashcards,
    transcriptWordCount,
    enrichedWordCount,
  ]);

  const smartFolders = useMemo(() => {
    const allCount = historyData.length;
    const withFlashcardsCount = historyData.filter((item) => item.hasFlashcards).length;
    const transcriptOnlyCount = historyData.filter((item) => !item.hasFlashcards).length;
    const withVideoCount = historyData.filter((item) => item.type === 'video').length;

    return [
      { id: 'all', name: 'Todas as Transcrições', count: allCount, icon: Database },
      {
        id: 'favorites',
        name: 'Favoritos',
        count: historyData.filter((item) => item.isFavorite).length,
        icon: FolderOpen,
      },
      { id: 'with-flashcards', name: 'Com Flashcards', count: withFlashcardsCount, icon: FolderOpen },
      { id: 'transcript-only', name: 'Só Transcrição', count: transcriptOnlyCount, icon: Folder },
      { id: 'with-video', name: 'Com Vídeo', count: withVideoCount, icon: Video },
    ];
  }, [historyData]);

  const specialtyFolders = useMemo(() => {
    const counts = historyData.reduce((acc, item) => {
      const name = String(item.specialty || '').trim();
      if (!name) return acc;

      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([name, count]) => ({
        id: `specialty:${name}`,
        name,
        count,
        icon: FolderOpen,
      }));
  }, [historyData]);

  const allFolders = useMemo(() => {
    return [...smartFolders, ...specialtyFolders];
  }, [smartFolders, specialtyFolders]);

  const filteredAndSortedHistory = useMemo(() => {
    let result = [...historyData];

    if (currentFolder === 'with-flashcards') {
      result = result.filter((item) => item.hasFlashcards);
    } else if (currentFolder === 'transcript-only') {
      result = result.filter((item) => !item.hasFlashcards);
    } else if (currentFolder === 'with-video') {
      result = result.filter((item) => item.type === 'video');
    } else if (currentFolder === 'favorites') {
      result = result.filter((item) => item.isFavorite);
    } else if (currentFolder.startsWith('specialty:')) {
      const specialtyName = currentFolder.replace('specialty:', '');
      result = result.filter((item) => item.specialty === specialtyName);
    }

    if (filterType === 'flashcards') {
      result = result.filter((item) => item.hasFlashcards);
    } else if (filterType === 'transcript') {
      result = result.filter((item) => !item.hasFlashcards);
    }

    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      result.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    return result;
  }, [historyData, currentFolder, filterType, sortBy]);

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(filteredAndSortedHistory.length / HISTORY_ITEMS_PER_PAGE)
  );

  const currentHistoryItems = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_ITEMS_PER_PAGE;
    return filteredAndSortedHistory.slice(start, start + HISTORY_ITEMS_PER_PAGE);
  }, [filteredAndSortedHistory, historyPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [currentFolder, filterType, sortBy, historySearch]);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    setHistorySearch(historySearchInput.trim());
    await loadHistory(historySearchInput.trim());
  };

  const clearSearch = async () => {
    setHistorySearchInput('');
    setHistorySearch('');
    await loadHistory('');
  };

  const applyAutomationPreset = (preset) => {
    setAutomationPreset(preset);

    if (preset === 'manual') {
      setAutoRunOnProcess(false);
      setAutoRunOnOpenHistory(false);
      setAutoAnalyzeEvidence(false);
      setAutoGenerateEnrichment(false);
      setAutoGenerateBetterFlashcards(false);
      return;
    }

    if (preset === 'standard') {
      setAutoRunOnProcess(true);
      setAutoRunOnOpenHistory(false);
      setAutoAnalyzeEvidence(true);
      setAutoGenerateEnrichment(true);
      setAutoGenerateBetterFlashcards(false);
      return;
    }

    if (preset === 'deep') {
      setAutoRunOnProcess(true);
      setAutoRunOnOpenHistory(false);
      setAutoAnalyzeEvidence(true);
      setAutoGenerateEnrichment(true);
      setAutoGenerateBetterFlashcards(true);
      return;
    }

    if (preset === 'reopen-smart') {
      setAutoRunOnProcess(true);
      setAutoRunOnOpenHistory(true);
      setAutoAnalyzeEvidence(true);
      setAutoGenerateEnrichment(true);
      setAutoGenerateBetterFlashcards(true);
    }
  };

  const buildAutomationGoal = () => {
    if (automationPreset === 'manual') {
      return 'ver se faltam informações e sugerir mnemônicos';
    }

    if (automationPreset === 'standard') {
      return 'identificar lacunas relevantes, sugerir melhorias práticas e mnemônicos úteis para revisão médica';
    }

    if (automationPreset === 'deep' || automationPreset === 'reopen-smart') {
      return 'fazer análise aprofundada de residência médica, identificar lacunas, melhorar cobertura do tema, sugerir mnemônicos e orientar geração de flashcards melhores';
    }

    return 'ver se faltam informações e sugerir mnemônicos';
  };

  const deleteHistoryItem = async (id) => {
    const confirmed = window.confirm(
      'Tem certeza que deseja deletar este item do histórico? Essa ação não poderá ser desfeita.'
    );

    if (!confirmed) return;

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/history/${id}`, {
        method: 'DELETE',
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao deletar item do histórico.');
      }

      if (currentRunId === id) {
        resetAll();
      }

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha ao deletar item do histórico: ${err.message}`);
    }
  };

  const toggleFavoriteHistoryItem = async (item) => {
    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/history/${item.id}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_favorite: !item.isFavorite,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar favorito.');
      }

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha ao atualizar favorito: ${err.message}`);
    }
  };

  const saveCurrentSpecialty = async (specialty) => {
    if (!currentRunId) return;

    try {
      setCurrentSpecialty(specialty);

      const response = await fetch(`${API_BASE}/api/history/${currentRunId}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar especialidade.');
      }

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha ao salvar especialidade: ${err.message}`);
    }
  };

  const exportStudyPack = async () => {
    try {
      setIsExportingStudyPack(true);
      setError(null);

      const content = `
  # Estudo exportado

  ## Arquivo
  ${currentFilename || 'Sem nome'}

  ## Transcrição original
  ${transcript || 'Sem conteúdo'}

  ## Texto enriquecido
  ${enrichedTranscript || 'Sem conteúdo enriquecido'}

  ## Flashcards
  ${flashcards
    .map(
      (card, index) => `
  ${index + 1}. PERGUNTA: ${card.question}
  RESPOSTA: ${card.answer}
  NOTA: ${card.preceptorNote || '-'}
  `
    )
    .join('\n')}

  ## Tópicos detectados
  ${(evidenceAnalysis?.topics_detected || []).map((x) => `- ${x}`).join('\n')}

  ## Lacunas
  ${(evidenceAnalysis?.missing_topics || []).map((x) => `- ${x}`).join('\n')}

  ## Sugestões
  ${(evidenceAnalysis?.improvement_suggestions || [])
    .map((x) => `- ${x.title}: ${x.content}`)
    .join('\n')}

  ## Mnemônicos
  ${(evidenceAnalysis?.mnemonics || [])
    .map((x) => `- ${x.title}: ${x.mnemonic} (${x.explanation})`)
    .join('\n')}
  `.trim();

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${(currentFilename || 'estudo').replace(/[^\w.-]+/g, '_')}_estudo.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Falha ao exportar estudo: ${err.message}`);
    } finally {
      setIsExportingStudyPack(false);
    }
  };

  const processVideo = async () => {
    if (!videoFile) {
      setError('Selecione um vídeo antes de processar.');
      return;
    }

    setEnrichedTranscript('');
    setEnrichedSummary(null);
    setEnrichedGeneratedAt(null);
    setEnrichedFlashcardsGeneratedAt(null);
    setIsProcessing(true);
    setError(null);
    setTranscript('');
    setFlashcards([]);
    setCurrentRunId(null);
    setCurrentFilename('');
    setEvidenceAnalysis(null);
    setEvidenceSources([]);
    setReferenceVideos([]);
    setEnrichmentReferenceVideos([]);
    setReviewState({});
    setReviewStats({});
    setCurrentSpecialty('');
    setCurrentSecondaryTopics([]);
    setCurrentAutoTags([]);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('generateFlashcards', String(generateFlashcardsNow));

      const response = await fetch(`${API_BASE}/api/process-video`, {
        method: 'POST',
        body: formData,
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar o vídeo.');
      }

      const savedRun = data.savedRun ?? null;

      setTranscript(data.transcript || '');
      setFlashcards(normalizeFlashcards(data.flashcards || []));
      setCurrentRunId(savedRun?.id ?? null);
      if (savedRun?.id) {
        await loadSavedEvidenceAnalysis(savedRun.id);
        await loadSavedEnrichment(savedRun.id);
      }
      setCurrentFilename(savedRun?.original_filename || videoFile.name || '');
      setCurrentSpecialty(data.detectedSpecialty || savedRun?.specialty || '');
      setCurrentSecondaryTopics(
        Array.isArray(data.detectedSecondaryTopics)
          ? data.detectedSecondaryTopics
          : Array.isArray(savedRun?.secondary_topics)
            ? savedRun.secondary_topics
            : []
      );
      setCurrentAutoTags(
        Array.isArray(data.detectedAutoTags)
          ? data.detectedAutoTags
          : Array.isArray(savedRun?.auto_tags)
            ? savedRun.auto_tags
            : []
      );
      setFlashcardsViewMode('grid');

      loadHistoryDebounced(historySearch);

      if (autoRunOnProcess && savedRun?.id) {
        await runAutomationPipeline(savedRun);
      }
    } catch (err) {
      setError(`Falha no processamento: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const openHistoryItem = async (id) => {
    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/history/${id}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar item do histórico.');
      }

      const run = data.run;
      setCurrentRunId(run.id);
      setCurrentFilename(run.original_filename || '');
      setTranscript(run.transcript || '');
      setFlashcards(normalizeFlashcards(run.enriched_flashcards || run.flashcards || []));
      setCurrentSpecialty(run.specialty || '');
      setCurrentSecondaryTopics(Array.isArray(run.secondary_topics) ? run.secondary_topics : []);
      setCurrentAutoTags(Array.isArray(run.auto_tags) ? run.auto_tags : []);
      setFlashcardsViewMode('grid');
      setReviewState(run.review_state || {});
      setReviewStats(run.review_stats || {});
      setEvidenceAnalysis(null);
      setEvidenceSources([]);
      setReferenceVideos([]);
      setEnrichmentReferenceVideos([]);
      setEnrichedTranscript('');
      setEnrichedSummary(null);
      setEnrichedGeneratedAt(null);
      setEnrichedFlashcardsGeneratedAt(null);

      await loadSavedEvidenceAnalysis(run.id);
      await loadSavedEnrichment(run.id);

      if (autoRunOnOpenHistory) {
        await runAutomationPipeline(run);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setError(`Falha ao abrir item do histórico: ${err.message}`);
        throw err;
      }
  };

  const openHistoryDetails = async (id) => {
    try {
      await openHistoryItem(id);
      setIsHistoryDetailsOpen(true);
    } catch {
      setIsHistoryDetailsOpen(false);
    }
  };

  const generateFlashcardsFromSavedRun = async (forceRegenerate = false) => {
    if (!currentRunId) {
      setError('Nenhuma transcrição salva está aberta.');
      return;
    }

    setIsGeneratingSavedFlashcards(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/generate-flashcards-from-run/${currentRunId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forceRegenerate }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar flashcards.');
      }

      const run = data.run;
      setTranscript(run.transcript || '');
      setFlashcards(normalizeFlashcards(run.flashcards || []));
      setCurrentFilename(run.original_filename || '');
      setFlashcardsViewMode('grid');

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha ao gerar flashcards: ${err.message}`);
    } finally {
      setIsGeneratingSavedFlashcards(false);
    }
  };

  const loadSavedEvidenceAnalysis = async (runId) => {
    if (!runId) return;

    try {
      const response = await fetch(`${API_BASE}/api/analyze-run/${runId}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar análise de evidência.');
      }

      setEvidenceAnalysis(data.analysis || null);
      setEvidenceSources(Array.isArray(data.sources) ? data.sources : []);
      setReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);
    } catch (err) {
      setEvidenceAnalysis(null);
      setEvidenceSources([]);
      setReferenceVideos([]);
      console.error('Falha ao carregar análise salva:', err.message);
    }
  };

  const loadSavedEnrichment = async (runId) => {
    if (!runId) return;

    try {
      const response = await fetch(`${API_BASE}/api/enrich-run/${runId}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar texto enriquecido.');
      }

      setEnrichedTranscript(data.enrichedTranscript || '');
      setEnrichedSummary(data.enrichedSummary || null);
      setEnrichedGeneratedAt(data.enrichedGeneratedAt || null);
      setEnrichedFlashcardsGeneratedAt(data.enrichedFlashcardsGeneratedAt || null);
      setEnrichmentReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);
    } catch (err) {
      setEnrichedTranscript('');
      setEnrichedSummary(null);
      setEnrichedGeneratedAt(null);
      setEnrichedFlashcardsGeneratedAt(null);
      setEnrichmentReferenceVideos([]);
      console.error('Falha ao carregar enriquecimento salvo:', err.message);
    }
  };

  const analyzeEvidenceFromCurrentRun = async (
      runIdParam = null,
      filenameParam = '',
      goalParam = ''
    ) => {
    const targetRunId = runIdParam || currentRunId;
    const targetFilename = filenameParam || currentFilename;
    const targetGoal = goalParam || buildAutomationGoal();

    if (!targetRunId) {
      setError('Nenhuma transcrição salva está aberta para análise.');
      return;
    }

    setIsAnalyzingEvidence(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/analyze-run/${targetRunId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: '',
          lesson: targetFilename || '',
          goal: targetGoal,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao analisar evidência.');
      }

      setEvidenceAnalysis(data.analysis || null);
      setEvidenceSources(Array.isArray(data.sources) ? data.sources : []);
      setReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha na análise de evidência: ${err.message}`);
    } finally {
      setIsAnalyzingEvidence(false);
    }
  };

  const generateEnrichedTranscriptFromCurrentRun = async (runIdParam = null) => {
    const targetRunId = runIdParam || currentRunId;

    if (!targetRunId) {
      setError('Nenhuma transcrição salva está aberta para enriquecimento.');
      return;
    }

    setIsGeneratingEnrichedTranscript(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/enrich-run/${targetRunId}`, {
        method: 'POST',
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar texto enriquecido.');
      }

      setEnrichedTranscript(data.enrichedTranscript || '');
      setEnrichedSummary(data.enrichedSummary || null);
      setEnrichedGeneratedAt(data.enrichedGeneratedAt || null);
      setEnrichmentReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);

      loadHistoryDebounced(historySearch);
      return data;
    } catch (err) {
      setError(`Falha ao gerar texto enriquecido: ${err.message}`);
      throw err;
    } finally {
      setIsGeneratingEnrichedTranscript(false);
    }
  };

  const generateFlashcardsFromEnrichedRun = async (runIdParam = null) => {
    const targetRunId = runIdParam || currentRunId;

    if (!targetRunId) {
      setError('Nenhuma transcrição salva está aberta.');
      return;
    }

    setIsGeneratingEnrichedFlashcards(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/generate-flashcards-from-enriched-run/${targetRunId}`,
        {
          method: 'POST',
        }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar flashcards do texto enriquecido.');
      }

      setFlashcards(normalizeFlashcards(data.flashcards || []));
      setEnrichedFlashcardsGeneratedAt(data.enrichedFlashcardsGeneratedAt || null);
      setFlashcardsViewMode('grid');

      loadHistoryDebounced(historySearch);
      return data;
    } catch (err) {
      setError(`Falha ao gerar flashcards do texto enriquecido: ${err.message}`);
      throw err;
    } finally {
      setIsGeneratingEnrichedFlashcards(false);
    }
  };

  const runAutomationPipeline = async (run) => {
    if (!run?.id) return;

    let analysisReady = Boolean(run.has_analysis || run.hasAnalysis || evidenceAnalysis);
    let enrichmentReady = Boolean(run.enriched_transcript || enrichedTranscript);
    let betterFlashcardsReady =
      Array.isArray(run.enriched_flashcards)
        ? run.enriched_flashcards.length > 0
        : Array.isArray(run.enrichedFlashcards)
          ? run.enrichedFlashcards.length > 0
          : false;

    if (autoAnalyzeEvidence && !analysisReady) {
      await analyzeEvidenceFromCurrentRun(
        run.id,
        run.original_filename || '',
        buildAutomationGoal()
      );
      analysisReady = true;
    }

    if (autoGenerateEnrichment && analysisReady && !enrichmentReady) {
      const enrichmentData = await generateEnrichedTranscriptFromCurrentRun(run.id);
      if (enrichmentData?.enrichedTranscript) {
        enrichmentReady = true;
      }
    }

    if (autoGenerateBetterFlashcards && enrichmentReady && !betterFlashcardsReady) {
      await generateFlashcardsFromEnrichedRun(run.id);
      betterFlashcardsReady = true;
    }
  };

  const loadLibraryDecks = async (specialty = librarySpecialtyFilter) => {
    try {
      setIsLoadingLibrary(true);
      const params = new URLSearchParams();

      if (String(specialty || '').trim()) {
        params.set('specialty', String(specialty).trim());
      }

      const response = await fetch(`${API_BASE}/api/flashcard-decks?${params.toString()}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar decks.');
      }

      setLibraryDecks(Array.isArray(data.decks) ? data.decks : []);
    } catch (err) {
      setError(`Falha ao carregar decks: ${err.message}`);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const loadDeckTree = async (specialty = librarySpecialtyFilter) => {
    try {
      setIsLoadingLibrary(true);

      const params = new URLSearchParams();

      if (String(specialty || '').trim()) {
        params.set('specialty', String(specialty).trim());
      }

      const response = await fetch(`${API_BASE}/api/flashcard-decks/tree?${params.toString()}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar árvore de decks.');
      }

      setDeckTree(Array.isArray(data.tree) ? data.tree : []);
    } catch (err) {
      setError(`Falha ao carregar árvore da biblioteca: ${err.message}`);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const loadLibraryAnalytics = async ({
    specialty = librarySpecialtyFilter,
    deckId = selectedDeckId,
  } = {}) => {
    try {
      setIsLoadingLibraryAnalytics(true);

      const params = new URLSearchParams();

      if (String(specialty || '').trim()) {
        params.set('specialty', String(specialty).trim());
      }

      if (String(deckId || '').trim()) {
        params.set('deckId', String(deckId).trim());
      }

      const response = await fetch(`${API_BASE}/api/library-analytics?${params.toString()}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar analytics.');
      }

      setLibraryAnalytics(data || null);
    } catch (err) {
      setError(`Falha ao carregar analytics da biblioteca: ${err.message}`);
    } finally {
      setIsLoadingLibraryAnalytics(false);
    }
  };

  const loadLibraryCards = async ({
    deckId = selectedDeckId,
    specialty = librarySpecialtyFilter,
    favorites = libraryMode === 'favorites',
    dueOnly = libraryMode === 'due',
    search = librarySearch,
  } = {}) => {
    try {
      setIsLoadingLibrary(true);

      const params = new URLSearchParams();

      if (String(deckId || '').trim()) params.set('deckId', String(deckId).trim());
      if (String(specialty || '').trim()) params.set('specialty', String(specialty).trim());
      if (favorites) params.set('favorites', 'true');
      if (dueOnly) params.set('dueOnly', 'true');
      if (String(search || '').trim()) params.set('search', String(search).trim());

      const response = await fetch(`${API_BASE}/api/flashcards-library?${params.toString()}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar flashcards da biblioteca.');
      }

      setLibraryCards(Array.isArray(data.cards) ? data.cards : []);
    } catch (err) {
      setError(`Falha ao carregar biblioteca: ${err.message}`);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const createLibraryDeck = async () => {
    if (!newDeckName.trim()) {
      setError('Digite um nome para o deck.');
      return;
    }

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/flashcard-decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDeckName.trim(),
          specialty: newDeckSpecialty.trim(),
          sub_specialty: newDeckSubSpecialty.trim(),
          deck_type: 'manual',
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar deck.');
      }

      setNewDeckName('');
      setNewDeckSubSpecialty('');
      setSelectedDeckId(data.deck?.id || '');
      await loadLibraryDecks();
    } catch (err) {
      setError(`Falha ao criar deck: ${err.message}`);
    }
  };

  const saveCurrentFlashcardsToLibrary = async () => {
    if (!selectedDeckId) {
      setError('Selecione um deck da biblioteca antes de salvar.');
      return;
    }

    if (!flashcards.length) {
      setError('Não há flashcards carregados para salvar.');
      return;
    }

    try {
      setIsSavingCardsToLibrary(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/flashcard-decks/${selectedDeckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards: flashcards,
          source_run_id: currentRunId || null,
          specialty: currentSpecialty || '',
          secondary_topics: currentSecondaryTopics,
          auto_tags: currentAutoTags,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar flashcards na biblioteca.');
      }

      await loadLibraryCards({ deckId: selectedDeckId });
      await loadLibraryDecks();
      await loadDeckTree();
      await loadLibraryAnalytics();
    } catch (err) {
      setError(`Falha ao salvar na biblioteca: ${err.message}`);
    } finally {
      setIsSavingCardsToLibrary(false);
    }
  };

  const toggleLibraryCardFavorite = async (card) => {
    try {
      const response = await fetch(`${API_BASE}/api/flashcards-library/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_favorite: !card.is_favorite,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar card.');
      }

      await loadLibraryCards();
    } catch (err) {
      setError(`Falha ao atualizar card: ${err.message}`);
    }
  };

  const moveLibraryCard = async (cardId, targetDeckId) => {
    if (!cardId || !targetDeckId) {
      setError('Selecione um deck de destino.');
      return;
    }

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/flashcards-library/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck_id: targetDeckId,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao mover card.');
      }

      await loadLibraryCards({
        deckId: selectedDeckId,
        specialty: librarySpecialtyFilter,
        favorites: libraryMode === 'favorites',
        dueOnly: libraryMode === 'due',
        search: librarySearch,
      });

      await loadDeckTree();
      await loadLibraryAnalytics();
      setMoveTargetDeckId('');
    } catch (err) {
      setError(`Falha ao mover card: ${err.message}`);
    }
  };

  const fetchLibraryCardsDirectly = async ({
    deckId = '',
    specialty = '',
    favorites = false,
    dueOnly = false,
    search = '',
  } = {}) => {
    const params = new URLSearchParams();

    if (String(deckId || '').trim()) params.set('deckId', String(deckId).trim());
    if (String(specialty || '').trim()) params.set('specialty', String(specialty).trim());
    if (favorites) params.set('favorites', 'true');
    if (dueOnly) params.set('dueOnly', 'true');
    if (String(search || '').trim()) params.set('search', String(search).trim());

    const response = await fetch(`${API_BASE}/api/flashcards-library?${params.toString()}`);
    const data = await parseResponseSafely(response);

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao carregar fila de estudo.');
    }

    return Array.isArray(data.cards) ? data.cards : [];
  };

  const buildLibraryStudyQueue = async (mode = studyMode) => {
    try {
      setActiveSmartDeck(null);
      setIsLoadingLibrary(true);

      let queue = [];

      if (mode === 'due') {
        queue = await fetchLibraryCardsDirectly({
          specialty: librarySpecialtyFilter,
          dueOnly: true,
        });
      } else if (mode === 'favorites') {
        queue = await fetchLibraryCardsDirectly({
          specialty: librarySpecialtyFilter,
          favorites: true,
        });
      } else {
        queue = await fetchLibraryCardsDirectly({
          deckId: selectedDeckId,
          specialty: librarySpecialtyFilter,
        });
      }
      
      setStudyMode(mode);
      setStudyQueue(queue);
      setLibraryCards(queue);
      setCurrentLibraryStudyIndex(0);
      setIsLibraryStudyFlipped(false);
      setStudySessionStats({
        totalSeen: 0,
        correctCount: 0,
        hardCount: 0,
        easyCount: 0,
      });
    } catch (err) {
      setError(`Falha ao montar sessão de estudo: ${err.message}`);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const buildNextLibraryReviewState = (card, grade) => {
    const now = new Date();
    const existing = card?.review_state || {
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      dueAt: null,
      lastGrade: null,
    };

    let repetitions = existing.repetitions || 0;
    let easeFactor = existing.easeFactor || 2.5;
    let intervalDays = existing.intervalDays || 0;

    if (grade <= 2) {
      repetitions = 0;
      intervalDays = 1;
    } else {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 3;
      else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }

    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    );

    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + intervalDays);

    return {
      ...existing,
      repetitions,
      easeFactor: Number(easeFactor.toFixed(2)),
      intervalDays,
      dueAt: dueAt.toISOString(),
      lastReviewedAt: now.toISOString(),
      lastGrade: grade,
    };
  };

  const rateLibraryStudyCard = async (grade) => {
    if (!currentLibraryStudyCard) return;

    const nextReviewState = buildNextLibraryReviewState(currentLibraryStudyCard, grade);

    const previousStats = currentLibraryStudyCard.review_stats || {};
    const nextReviewStats = {
      totalReviewed: Number(previousStats.totalReviewed || 0) + 1,
      correctCount: Number(previousStats.correctCount || 0) + (grade >= 3 ? 1 : 0),
      hardCount: Number(previousStats.hardCount || 0) + (grade === 2 ? 1 : 0),
      easyCount: Number(previousStats.easyCount || 0) + (grade === 4 ? 1 : 0),
      lastReviewedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(
        `${API_BASE}/api/flashcards-library/${currentLibraryStudyCard.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade,
            review_state: nextReviewState,
            review_stats: nextReviewStats,
            session_mode: studyMode,
            session_source: 'library',
          }),
        }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar revisão.');
      }

      setStudySessionStats((prev) => ({
        totalSeen: prev.totalSeen + 1,
        correctCount: prev.correctCount + (grade >= 3 ? 1 : 0),
        hardCount: prev.hardCount + (grade === 2 ? 1 : 0),
        easyCount: prev.easyCount + (grade === 4 ? 1 : 0),
      }));

      setIsLibraryStudyFlipped(false);
      setTimeout(() => {
        setCurrentLibraryStudyIndex((prev) =>
          Math.min(prev + 1, Math.max(0, studyQueue.length - 1))
        );
      }, 150);
    } catch (err) {
      setError(`Falha ao registrar revisão da biblioteca: ${err.message}`);
    }
  };

  const buildNextReviewState = (cardId, grade) => {
    const now = new Date();
    const existing = reviewState?.[cardId] || {
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      dueAt: null,
      lastGrade: null,
    };

    let repetitions = existing.repetitions || 0;
    let easeFactor = existing.easeFactor || 2.5;
    let intervalDays = existing.intervalDays || 0;

    if (grade <= 2) {
      repetitions = 0;
      intervalDays = 1;
    } else {
      repetitions += 1;

      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 3;
      else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }

    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    );

    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + intervalDays);

    return {
      ...existing,
      repetitions,
      easeFactor: Number(easeFactor.toFixed(2)),
      intervalDays,
      dueAt: dueAt.toISOString(),
      lastReviewedAt: now.toISOString(),
      lastGrade: grade,
    };
  };

  const saveReviewStateToBackend = async (nextReviewState, nextReviewStats) => {
    if (!currentRunId) return;

    setIsSavingReview(true);

    try {
      const response = await fetch(`${API_BASE}/api/history/${currentRunId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_state: nextReviewState,
          review_stats: nextReviewStats,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar revisão.');
      }
    } catch (err) {
      setError(`Falha ao salvar revisão: ${err.message}`);
    } finally {
      setIsSavingReview(false);
    }
  };

  const rateStudyCard = async (grade) => {
    if (!currentStudyCard) return;

    const cardId = currentStudyCard.id || `card-${currentStudyIndex}`;
    const nextCardState = buildNextReviewState(cardId, grade);

    const nextReviewState = {
      ...reviewState,
      [cardId]: nextCardState,
    };

    const previousStats = reviewStats || {};
    const totalReviewed = Number(previousStats.totalReviewed || 0) + 1;
    const correctCount = Number(previousStats.correctCount || 0) + (grade >= 3 ? 1 : 0);

    const nextReviewStats = {
      totalReviewed,
      correctCount,
      hardCount: Number(previousStats.hardCount || 0) + (grade === 2 ? 1 : 0),
      easyCount: Number(previousStats.easyCount || 0) + (grade === 4 ? 1 : 0),
      lastReviewedAt: new Date().toISOString(),
    };

    setReviewState(nextReviewState);
    setReviewStats(nextReviewStats);

    await saveReviewStateToBackend(nextReviewState, nextReviewStats);

    if (currentStudyIndex < flashcards.length - 1) {
      handleNextStudyCard();
    }
  };

  const handleNextStudyCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentStudyIndex((prev) => Math.min(prev + 1, flashcards.length - 1));
    }, 150);
  };

  const handlePrevStudyCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentStudyIndex((prev) => Math.max(prev - 1, 0));
    }, 150);
  };

  const currentStudyCard =
    flashcards.length > 0 && currentStudyIndex >= 0 && currentStudyIndex < flashcards.length
      ? flashcards[currentStudyIndex]
      : null;

  const recommendedHistoryItems = useMemo(() => {
    const missingTopics = Array.isArray(evidenceAnalysis?.missing_topics)
      ? evidenceAnalysis.missing_topics.map((x) => String(x).toLowerCase())
      : [];

    if (!missingTopics.length) return [];

    return historyData
      .filter((item) => item.id !== currentRunId)
      .filter((item) => {
        const haystack = `
          ${item.title}
          ${item.preview}
          ${item.studyTag}
          ${item.specialty || ''}
          ${(item.secondaryTopics || []).join(' ')}
          ${(item.autoTags || []).join(' ')}
        `.toLowerCase();
        return missingTopics.some((topic) => haystack.includes(topic));
      })
      .slice(0, 5);
  }, [evidenceAnalysis, historyData, currentRunId]);

  const reviewAccuracy = useMemo(() => {
    const total = Number(reviewStats?.totalReviewed || 0);
    const correct = Number(reviewStats?.correctCount || 0);

    if (!total) return 0;
    return Math.round((correct / total) * 100);
  }, [reviewStats]);

  const cardsDueCount = useMemo(() => {
    const now = new Date();

    return Object.values(reviewState || {}).filter((item) => {
      if (!item?.dueAt) return false;
      return new Date(item.dueAt) <= now;
    }).length;
  }, [reviewState]);

  const scrollToSection = (ref) => {
    if (!ref?.current) return;

    ref.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const smartDeckCounters = useMemo(() => {
    const now = new Date();

    return {
      due: libraryCards.filter((card) => {
        const dueAt = card?.review_state?.dueAt;
        return dueAt && new Date(dueAt) <= now;
      }).length,
      new: libraryCards.filter((card) => {
        return !card?.review_stats?.totalReviewed;
      }).length,
      hard: libraryCards.filter((card) => {
        return Number(card?.review_stats?.hardCount || 0) >= 2;
      }).length,
      favorites: libraryCards.filter((card) => Boolean(card?.is_favorite)).length,
    };
  }, [libraryCards]);

  const smartFilteredCards = useMemo(() => {
    if (!activeSmartDeck) return libraryCards;

    const now = new Date();

    if (activeSmartDeck === 'due') {
      return libraryCards.filter((card) => {
        const dueAt = card?.review_state?.dueAt;
        return dueAt && new Date(dueAt) <= now;
      });
    }

    if (activeSmartDeck === 'new') {
      return libraryCards.filter((card) => {
        return !card?.review_stats?.totalReviewed;
      });
    }

    if (activeSmartDeck === 'hard') {
      return libraryCards.filter((card) => {
        return Number(card?.review_stats?.hardCount || 0) >= 2;
      });
    }

    if (activeSmartDeck === 'favorites') {
      return libraryCards.filter((card) => Boolean(card?.is_favorite));
    }

    return libraryCards;
  }, [libraryCards, activeSmartDeck]);

  const startEditingLibraryCard = (card) => {
    if (!card) return;

    setEditingLibraryCardId(card.id);
    setEditingLibraryCardForm({
      question: card.question || '',
      answer: card.answer || '',
      preceptor_note: card.preceptor_note || '',
      difficulty: card.difficulty || 'medium',
      deck_id: card.deck_id || '',
    });
  };

  const cancelEditingLibraryCard = () => {
    setEditingLibraryCardId(null);
    setEditingLibraryCardForm({
      question: '',
      answer: '',
      preceptor_note: '',
      difficulty: 'medium',
      deck_id: '',
    });
  };

  const saveLibraryCardEdit = async () => {
    if (!editingLibraryCardId) return;

    try {
      setIsSavingLibraryCardEdit(true);
      setError(null);

      const response = await fetch(
        `${API_BASE}/api/flashcards-library/${editingLibraryCardId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: editingLibraryCardForm.question,
            answer: editingLibraryCardForm.answer,
            preceptor_note: editingLibraryCardForm.preceptor_note,
            difficulty: editingLibraryCardForm.difficulty,
            deck_id: editingLibraryCardForm.deck_id || null,
          }),
        }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar edição do flashcard.');
      }

      await loadLibraryCards({
        deckId: selectedDeckId,
        specialty: librarySpecialtyFilter,
        favorites: libraryMode === 'favorites',
        dueOnly: libraryMode === 'due',
        search: librarySearch,
      });

      cancelEditingLibraryCard();
    } catch (err) {
      setError(`Falha ao salvar edição do flashcard: ${err.message}`);
    } finally {
      setIsSavingLibraryCardEdit(false);
    }
  };

  const sectionNavItems = [
    {
      id: 'upload',
      label: 'Novo Estudo',
      icon: LayoutTemplate,
      ref: uploadSectionRef,
      alwaysVisible: true,
    },
    {
      id: 'transcript',
      label: 'Transcrição',
      icon: FileText,
      ref: transcriptSectionRef,
      visible: Boolean(transcript),
    },
    {
      id: 'flashcards',
      label: 'Flashcards',
      icon: BookOpen,
      ref: flashcardsSectionRef,
      visible: Boolean(transcript),
    },
    {
      id: 'evidence',
      label: 'Evidência',
      icon: Sparkles,
      ref: evidenceSectionRef,
      visible: Boolean(transcript),
    },
    {
      id: 'enriched',
      label: 'Enriquecido',
      icon: Wand2,
      ref: enrichedSectionRef,
      visible: Boolean(transcript),
    },
    {
      id: 'metrics',
      label: 'Métricas',
      icon: Database,
      ref: metricsSectionRef,
      visible: Boolean(transcript && studyCoverageMetrics),
    },
    {
      id: 'library',
      label: 'Biblioteca',
      icon: Folder,
      ref: librarySectionRef,
      alwaysVisible: true,
    },
    {
      id: 'study-session',
      label: 'Sessão de Estudo',
      icon: Lightbulb,
      ref: studySessionSectionRef,
      alwaysVisible: true,
    },
    {
      id: 'history',
      label: 'Histórico',
      icon: FolderOpen,
      ref: historySectionRef,
      alwaysVisible: true,
    },
  ].filter((item) => item.alwaysVisible || item.visible);

  const flattenDeckTree = (nodes = []) => {
    const result = [];

    const walk = (items) => {
      items.forEach((item) => {
        result.push(item);
        if (Array.isArray(item.children) && item.children.length > 0) {
          walk(item.children);
        }
      });
    };

    walk(nodes);
    return result;
  };

  const flatDeckTree = useMemo(() => flattenDeckTree(deckTree), [deckTree]);

  useEffect(() => {
    if (!selectedTreeNodeId) {
      setSelectedTreeNode(null);
      return;
    }

    const found = flatDeckTree.find((item) => item.id === selectedTreeNodeId) || null;
    setSelectedTreeNode(found);
  }, [selectedTreeNodeId, flatDeckTree]);

  const currentLibraryStudyCard =
  studyQueue.length > 0 &&
  currentLibraryStudyIndex >= 0 &&
  currentLibraryStudyIndex < studyQueue.length
    ? studyQueue[currentLibraryStudyIndex]
    : null;

  const librarySpecialties = useMemo(() => {
    const set = new Set();

    historyData.forEach((item) => {
      if (item.specialty) set.add(item.specialty);
    });

    libraryDecks.forEach((deck) => {
      if (deck.specialty) set.add(deck.specialty);
    });

    libraryCards.forEach((card) => {
      if (card.specialty) set.add(card.specialty);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [historyData, libraryDecks, libraryCards]);

  const smartFilteredLibraryTree = useMemo(() => {
    const grouped = {};

    smartFilteredCards.forEach((card) => {
      const specialty = card.specialty || 'Sem especialidade';
      const subgroup = card.sub_specialty || 'Geral';

      if (!grouped[specialty]) {
        grouped[specialty] = {
          name: specialty,
          count: 0,
          subgroups: {},
        };
      }

      grouped[specialty].count += 1;

      if (!grouped[specialty].subgroups[subgroup]) {
        grouped[specialty].subgroups[subgroup] = {
          name: subgroup,
          cards: [],
        };
      }

      grouped[specialty].subgroups[subgroup].cards.push(card);
    });

    return Object.values(grouped).map((specialtyGroup) => ({
      name: specialtyGroup.name,
      count: specialtyGroup.count,
      subgroups: Object.values(specialtyGroup.subgroups).sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      ),
    }));
  }, [smartFilteredCards]);

  useEffect(() => {
    if (!error) return;

    setIsClosing(false);

    const timer = setTimeout(() => {
      fecharNotificacao();
    }, 5000);

    return () => clearTimeout(timer);
  }, [error]);

  const fecharNotificacao = () => {
    setIsClosing(true);

    setTimeout(() => {
      setError(null);
      setIsClosing(false);
    }, 300);
  };

  return (
    <>
    <div className="min-h-screen bg-[#f5f7fb] font-sans text-slate-800">
      <aside
        className={`hidden lg:flex fixed top-6 left-6 z-40 h-[calc(100vh-48px)] ${
          isSectionSidebarExpanded ? 'w-60' : 'w-20'
        } flex-col rounded-[28px] border border-slate-200 bg-white/95 backdrop-blur shadow-xl shadow-slate-200/60 transition-all duration-300 overflow-hidden`}
        onMouseEnter={() => setIsSectionSidebarExpanded(true)}
        onMouseLeave={() => setIsSectionSidebarExpanded(false)}
      >
        <div
          className={`w-full border-b border-slate-100 transition-all duration-300 ${
            isSectionSidebarExpanded
              ? 'flex items-center gap-3 px-4 py-5 min-h-[76px] justify-start'
              : 'grid place-items-center py-5 min-h-[76px]'
          }`}
        >
          <div className="w-11 h-11 rounded-2xl bg-[#0f172a] text-white flex items-center justify-center shrink-0">
            <LayoutTemplate size={20} />
          </div>

          {isSectionSidebarExpanded && (
            <div className="transition-all duration-300">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Navegação
              </p>
              <h2 className="text-sm font-bold text-slate-900">Seções do estudo</h2>
            </div>
          )}
        </div>

        <div
          className={`flex-1 flex flex-col transition-all duration-300 ${
            isSectionSidebarExpanded
              ? 'p-3 gap-2 items-stretch'
              : 'py-3 px-0 gap-3 items-center justify-start'
          }`}
        >
          {sectionNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.ref)}
                className={`text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ${
                  isSectionSidebarExpanded
                    ? 'w-full flex items-center justify-start gap-3 rounded-2xl px-3 py-3'
                    : 'w-16 h-16 flex items-center justify-center rounded-2xl mx-auto'
                }`}
              >
                <div
                  className={`rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 transition-all duration-300 ${
                    isSectionSidebarExpanded ? 'w-11 h-11' : 'w-12 h-12'
                  }`}
                >
                  <Icon size={18} />
                </div>

                {isSectionSidebarExpanded && (
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <div
        className={`w-full transition-[padding] duration-300 ease-out ${
          isSectionSidebarExpanded ? 'lg:pl-[304px]' : 'lg:pl-[96px]'
        }`}
      >
        <div className="w-full px-4 md:px-5 lg:px-5 pt-7">

        <div className="mb-6">
          <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 md:px-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                {
                  title: '1. Enviar',
                  subtitle: 'Seu vídeo',
                  icon: Video,
                  iconWrap: 'bg-indigo-50 text-indigo-600',
                },
                {
                  title: '2. Transcrever',
                  subtitle: 'Lendo o conteúdo',
                  icon: FileText,
                  iconWrap: 'bg-violet-50 text-violet-600',
                },
                {
                  title: '3. IA em Ação',
                  subtitle: 'Criando material',
                  icon: Sparkles,
                  iconWrap: 'bg-amber-50 text-amber-600',
                },
                {
                  title: '4. Estudar',
                  subtitle: 'Tudo salvo',
                  icon: BookOpen,
                  iconWrap: 'bg-emerald-50 text-emerald-600',
                },
              ].map((step, index) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.title}
                    className="flex items-center gap-4 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4"
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${step.iconWrap}`}>
                      <Icon size={20} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900 leading-none">{step.title}</p>
                      <p className="text-sm text-slate-500 mt-1">{step.subtitle}</p>
                    </div>

                    {index < 3 && (
                      <ChevronRight size={18} className="hidden xl:block ml-auto text-slate-300 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <section
            ref={uploadSectionRef}
            className="scroll-mt-24 rounded-[32px] border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            <div className="p-4 md:p-5 bg-slate-50/70">
              <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.06),_transparent_38%),linear-gradient(to_bottom,_#f8fafc,_#f5f7fb)] p-6 md:p-8">

              <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-6">
                <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)] flex flex-col h-full">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold shadow-md">
                      1
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Mídia Base</h2>
                  </div>

                  
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    className="flex-1 border-2 border-dashed border-indigo-100 rounded-[30px] min-h-[420px] bg-[linear-gradient(to_bottom,_rgba(248,250,252,0.96),_rgba(241,245,249,0.92))] hover:bg-[linear-gradient(to_bottom,_rgba(245,243,255,0.98),_rgba(237,233,254,0.94))] hover:border-violet-300 transition-all cursor-pointer flex flex-col items-center justify-center text-center px-6 md:px-10 group shadow-inner"
                  >
                    <input
                      type="file"
                      ref={videoInputRef}
                      hidden
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setVideoFile(file);
                        setError(null);
                      }}
                    />

                    <div className="w-24 h-24 rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_rgba(15,23,42,0.06)] flex items-center justify-center mb-8 group-hover:scale-105 transition-transform">
                      <Upload className="text-slate-400 group-hover:text-violet-600 transition-colors" size={38} />
                    </div>

                    <p className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                      {videoFile ? 'Arquivo selecionado' : 'Selecione a aula para começar'}
                    </p>

                    <p className="text-base text-slate-500 mt-4">
                      {videoFile ? videoFile.name : (
                        <>
                          ou <span className="text-violet-600 font-semibold underline">clique para procurar</span>
                        </>
                      )}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                      {['MP4', 'MOV', 'AVI', 'MKV', 'WebM'].map((format) => (
                        <span
                          key={format}
                          className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-500"
                        >
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto pt-5">
                    {videoFile ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:p-5">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 mb-2">
                              Arquivo pronto
                            </p>
                            <p className="text-base font-bold text-slate-900 truncate">
                              {videoFile.name}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                              Revise as configurações ao lado e inicie o processamento.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
                              <Video size={14} />
                              Vídeo carregado
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:p-5">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                          Sugestão de uso
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          Combine com preset adequado
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          Use o painel da direita para definir se quer fluxo manual, padrão ou profundo.
                        </p>
                      </div>
                    )}
                  </div>

                  {(videoFile || transcript || flashcards.length > 0 || error) && !isProcessing && (
                    <div className="flex items-center justify-between mt-5">
                      <button
                        onClick={resetAll}
                        className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors"
                      >
                        Limpar tudo
                      </button>

                      {(transcript || flashcards.length > 0) && (
                        <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                          <CheckCircle2 size={18} />
                          Processado
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)] flex flex-col">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shadow-md">
                      2
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Configuração da IA</h2>
                  </div>

                  <div className="space-y-5 flex-1">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        Preset de Automação
                      </label>
                      <select
                        value={automationPreset}
                        onChange={(e) => applyAutomationPreset(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700"
                      >
                        <option value="manual">Manual</option>
                        <option value="standard">Padrão (Flashcards Automáticos)</option>
                        <option value="deep">Profundo</option>
                        <option value="reopen-smart">Profundo + reabrir histórico</option>
                      </select>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(to_bottom,_#f8fafc,_#f4f6fb)] p-5">
                      <div className="mb-3 text-xs text-amber-600 font-medium">
                        Defina se a IA deve rodar automaticamente após o processamento.
                      </div>
                      
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 mb-5">
                        Execução automática
                      </p>

                      <div className="space-y-4">
                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={autoRunOnProcess}
                            onChange={(e) => setAutoRunOnProcess(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Rodar automação ao processar</span>
                        </label>

                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={autoAnalyzeEvidence}
                            onChange={(e) => setAutoAnalyzeEvidence(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Analisar evidências no PubMed</span>
                        </label>

                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={autoGenerateEnrichment}
                            onChange={(e) => setAutoGenerateEnrichment(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Gerar texto enriquecido</span>
                        </label>

                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={autoGenerateBetterFlashcards}
                            onChange={(e) => setAutoGenerateBetterFlashcards(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Gerar flashcards aprimorados</span>
                        </label>

                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={autoRunOnOpenHistory}
                            onChange={(e) => setAutoRunOnOpenHistory(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Rodar automação ao abrir no histórico</span>
                        </label>

                        <label className="flex items-start gap-3 text-base text-slate-700">
                          <input
                            type="checkbox"
                            checked={generateFlashcardsNow}
                            onChange={(e) => setGenerateFlashcardsNow(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded"
                          />
                          <span>Gerar flashcards junto com a transcrição</span>
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-slate-500">
                      Modo atual: {automationPreset === 'manual' ? 'Manual' :
                                  automationPreset === 'standard' ? 'Automático padrão' :
                                  automationPreset === 'deep' ? 'Automático profundo' :
                                  'Reopen inteligente'}
                    </div>
                    <button
                      onClick={processVideo}
                      disabled={!videoFile || isProcessing}
                      className="w-full mt-2 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-[0_14px_30px_rgba(15,23,42,0.18)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-base"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          Processando vídeo...
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          Iniciar Processamento
                        </>
                      )}
                    </button>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Presets aplicam uma configuração inicial, mas você pode ajustar cada etapa manualmente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

          {transcript && (
            <section
              ref={transcriptSectionRef}
              className="scroll-mt-24 p-6 rounded-3xl border bg-emerald-50 border-emerald-200 shadow-sm"
            >
              <div className="mb-6 space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <h2 className="font-bold text-lg flex items-center gap-3 text-slate-800">
                    <span className="w-8 h-8 rounded-full bg-slate-900 text-white text-sm flex items-center justify-center">
                      2
                    </span>
                    Transcrição salva
                  </h2>

                  <div className="text-right text-xs text-slate-500">
                    {currentFilename ? (
                      <p className="font-medium text-slate-700 max-w-[280px] truncate">{currentFilename}</p>
                    ) : null}
                    <p>{transcriptWordCount} palavras</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                      Especialidade
                    </label>
                    <select
                      value={currentSpecialty}
                      onChange={(e) => saveCurrentSpecialty(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700"
                    >
                      <option value="">Sem especialidade</option>
                      <option value="Neurologia">Neurologia</option>
                      <option value="Cardiologia">Cardiologia</option>
                      <option value="Pneumologia">Pneumologia</option>
                      <option value="Endocrinologia">Endocrinologia</option>
                      <option value="Infectologia">Infectologia</option>
                      <option value="Gastroenterologia">Gastroenterologia</option>
                      <option value="Nefrologia">Nefrologia</option>
                      <option value="Reumatologia">Reumatologia</option>
                      <option value="Hematologia">Hematologia</option>
                      <option value="Ginecologia e Obstetrícia">Ginecologia e Obstetrícia</option>
                      <option value="Pediatria">Pediatria</option>
                      <option value="Clínica Médica">Clínica Médica</option>
                    </select>
                  </div>

                  {currentSecondaryTopics.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                        Tópicos secundários detectados
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {currentSecondaryTopics.map((topic, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentAutoTags.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                        Tags automáticas
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {currentAutoTags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-emerald-100 text-sm text-slate-700 max-h-72 overflow-y-auto leading-relaxed shadow-inner whitespace-pre-wrap">
                <p className="font-bold text-emerald-800 mb-2 text-xs uppercase tracking-wider flex items-center gap-2">
                  <FileText size={14} />
                  Texto transcrito
                </p>
                {transcript}
              </div>
            </section>
          )}

          {transcript && (
            <section
              ref={flashcardsSectionRef}
              className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="bg-[#0f172a] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                    3
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Flashcards</h2>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={() => generateFlashcardsFromSavedRun(false)}
                    disabled={!currentRunId || isGeneratingSavedFlashcards}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isGeneratingSavedFlashcards ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Wand2 size={16} />
                    )}
                    Usar salvos / gerar se faltar
                  </button>

                  <button
                    onClick={() => generateFlashcardsFromSavedRun(true)}
                    disabled={!currentRunId || isGeneratingSavedFlashcards}
                    className="flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw size={16} />
                    Regenerar
                  </button>

                  <button
                    onClick={() => analyzeEvidenceFromCurrentRun()}
                    disabled={!currentRunId || isAnalyzingEvidence}
                    className="flex items-center justify-center gap-2 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAnalyzingEvidence ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    Analisar evidência
                  </button>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setFlashcardsViewMode('grid')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      flashcardsViewMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-500'
                    }`}
                  >
                    Grade
                  </button>

                  <button
                    onClick={() => setFlashcardsViewMode('study')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      flashcardsViewMode === 'study'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-500'
                    }`}
                  >
                    Estudo
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 bg-slate-50/30 min-h-[500px]">
                {flashcards.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center min-h-[320px]">
                    <BookOpen className="text-slate-300 mb-4" size={32} />
                    <h3 className="text-lg font-semibold text-slate-800">
                      Nenhum flashcard disponível ainda
                    </h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-md">
                      A transcrição já está salva. Use os botões acima para carregar os flashcards salvos
                      ou regenerar um conjunto novo a partir do texto.
                    </p>
                  </div>
                ) : (
                  <>
                    {flashcardsViewMode === 'grid' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {flashcards.map((card, index) => (
                          <div
                            key={card.id || index}
                            className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-shadow flex flex-col h-full"
                          >
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-[#6366f1] text-xs font-bold tracking-wider uppercase">
                                Flashcard {String(index + 1).padStart(2, '0')}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                  card.difficulty === 'hard'
                                    ? 'bg-red-100 text-red-700'
                                    : card.difficulty === 'easy'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {card.difficulty === 'hard'
                                  ? 'Difícil'
                                  : card.difficulty === 'easy'
                                    ? 'Fácil'
                                    : 'Médio'}
                              </span>
                              {card.reviewed && (
                                <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                                  <Sparkles size={14} className="text-amber-400" />
                                  Revisão médica
                                </span>
                              )}
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mb-6 leading-snug">
                              {card.question}
                            </h3>

                            <hr className="border-slate-100 mb-5" />

                            <div className="flex-1 flex flex-col">
                              <span className="text-slate-400 text-xs font-bold tracking-widest mb-2 uppercase">
                                Resposta
                              </span>
                              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                                {card.answer}
                              </p>

                              {card.preceptorNote && (
                                <div className="mt-auto bg-amber-50/80 border border-amber-100 rounded-xl p-4 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                                  <span className="block text-amber-600 text-[10px] font-bold tracking-widest mb-1.5 uppercase">
                                    Nota do Preceptor
                                  </span>
                                  <p className="text-amber-900/80 text-sm leading-relaxed">
                                    {card.preceptorNote}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {flashcardsViewMode === 'study' && currentStudyCard && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <div className="flex items-center justify-between w-full max-w-2xl mb-6">
                          <span className="text-sm font-semibold text-slate-500">
                            Cartão {currentStudyIndex + 1} de {flashcards.length}
                          </span>
                          <div className="flex gap-1">
                            {flashcards.map((_, idx) => (
                              <div
                                key={idx}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  idx === currentStudyIndex ? 'w-6 bg-blue-600' : 'w-2 bg-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div
                          className="relative w-full max-w-2xl h-[420px] cursor-pointer group [perspective:1000px]"
                          onClick={() => setIsFlipped(!isFlipped)}
                        >
                          <div
                            className={`w-full h-full relative transition-all duration-500 [transform-style:preserve-3d] shadow-lg rounded-3xl ${
                              isFlipped ? '[transform:rotateY(180deg)]' : ''
                            }`}
                          >
                            <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center [backface-visibility:hidden]">
                              <span className="absolute top-6 left-6 text-[#6366f1] text-xs font-bold tracking-wider uppercase">
                                Flashcard {String(currentStudyIndex + 1).padStart(2, '0')}
                              </span>
                              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-500">
                                <Lightbulb size={32} />
                              </div>
                              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                                {currentStudyCard.question}
                              </h3>
                              <p className="absolute bottom-6 text-slate-400 text-sm flex items-center gap-2">
                                <RefreshCw
                                  size={14}
                                  className="group-hover:rotate-180 transition-transform duration-700"
                                />
                                Clique para virar
                              </p>
                            </div>

                            <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-8 md:p-10 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto">
                              <div className="flex items-center gap-2 mb-6">
                                <CheckCircle2 size={20} className="text-green-500" />
                                <span className="text-slate-900 font-bold tracking-widest uppercase text-sm">
                                  Resposta
                                </span>
                              </div>

                              <p className="text-slate-700 text-lg leading-relaxed mb-8">
                                {currentStudyCard.answer}
                              </p>

                              {currentStudyCard.preceptorNote && (
                                <div className="mt-auto bg-amber-50 border border-amber-100 rounded-2xl p-5 relative">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={16} className="text-amber-500" />
                                    <span className="text-amber-700 text-xs font-bold tracking-widest uppercase">
                                      Nota do Preceptor
                                    </span>
                                  </div>
                                  <p className="text-amber-900 text-sm leading-relaxed">
                                    {currentStudyCard.preceptorNote}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-8">
                          <button
                            onClick={handlePrevStudyCard}
                            disabled={currentStudyIndex === 0}
                            className="p-3 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <span className="text-sm font-medium text-slate-500 w-24 text-center">
                            Use as setas
                          </span>
                          <button
                            onClick={handleNextStudyCard}
                            disabled={currentStudyIndex === flashcards.length - 1}
                            className="p-3 rounded-full bg-[#0f172a] text-white hover:bg-[#1e293b] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                          >
                            <ChevronRight size={24} />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                          <button
                            onClick={() => rateStudyCard(1)}
                            className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
                          >
                            Errei
                          </button>

                          <button
                            onClick={() => rateStudyCard(2)}
                            className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors"
                          >
                            Difícil
                          </button>

                          <button
                            onClick={() => rateStudyCard(3)}
                            className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                          >
                            Bom
                          </button>

                          <button
                            onClick={() => rateStudyCard(4)}
                            className="px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            Fácil
                          </button>
                        </div>

                        {isSavingReview && (
                          <p className="text-xs text-slate-400 text-center mt-3">
                            Salvando revisão...
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {transcript && (
  <section
    ref={evidenceSectionRef}
    className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
  >
    <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-[#0f172a] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
          4
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Análise de Evidência</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => generateEnrichedTranscriptFromCurrentRun()}
          disabled={!currentRunId || !evidenceAnalysis || isGeneratingEnrichedTranscript}
          className="flex items-center justify-center gap-2 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          {isGeneratingEnrichedTranscript ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          Gerar texto enriquecido
        </button>

        <button
          onClick={() => generateFlashcardsFromEnrichedRun()}
          disabled={!currentRunId || !enrichedTranscript || isGeneratingEnrichedFlashcards}
          className="flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isGeneratingEnrichedFlashcards ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Wand2 size={16} />
          )}
          Gerar flashcards melhores
        </button>

        {isAnalyzingEvidence && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Analisando...
          </div>
        )}
      </div>
    </div>

    <div className="p-6 md:p-8 bg-slate-50/30">
      {evidenceAnalysis && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-700">
            Análise carregada automaticamente
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            Esta execução já possuía uma análise salva e ela foi aberta junto com o estudo.
          </p>
        </div>
      )}
      {!evidenceAnalysis ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Sparkles className="mx-auto mb-4 text-slate-300" size={30} />
          <h3 className="text-lg font-semibold text-slate-800">
            Nenhuma análise gerada ainda
          </h3>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl mx-auto">
            Clique em <span className="font-medium">Analisar evidência</span> para comparar a transcrição
            com referências médicas e identificar lacunas, sugestões de melhoria e possíveis mnemônicos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Tópicos detectados
            </h3>
            <div className="flex flex-wrap gap-2">
              {(evidenceAnalysis.topics_detected || []).map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Lacunas identificadas
            </h3>
            {(evidenceAnalysis.missing_topics || []).length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma lacuna importante identificada.</p>
            ) : (
              <ul className="space-y-2">
                {(evidenceAnalysis.missing_topics || []).map((item, index) => (
                  <li key={index} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {referenceVideos.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 xl:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Vídeos de referência usados
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {referenceVideos.map((video, index) => (
                <div
                  key={video.id || index}
                  className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {video.title}
                      </p>
                      <p className="text-xs text-violet-700 font-semibold mt-1">
                        {video.specialty || 'Sem especialidade'}
                      </p>
                    </div>

                    {typeof video.score === 'number' && (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white border border-violet-200 text-violet-700">
                        score {video.score}
                      </span>
                    )}
                  </div>

                  {video.summary ? (
                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                      {video.summary}
                    </p>
                  ) : null}

                  {Array.isArray(video.key_points) && video.key_points.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Pontos-chave
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {video.key_points.map((point, pointIndex) => (
                          <span
                            key={pointIndex}
                            className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-700"
                          >
                            {point}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(video.common_pitfalls) && video.common_pitfalls.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Armadilhas comuns
                      </p>
                      <ul className="space-y-1.5">
                        {video.common_pitfalls.slice(0, 3).map((pitfall, pitfallIndex) => (
                          <li key={pitfallIndex} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>{pitfall}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 xl:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Sugestões de melhoria
            </h3>

            {(evidenceAnalysis.improvement_suggestions || []).length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma sugestão adicional retornada.</p>
            ) : (
              <div className="space-y-4">
                {(evidenceAnalysis.improvement_suggestions || []).map((item, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <h4 className="font-semibold text-slate-900">{item.title}</h4>
                    <p className="text-sm text-slate-700 mt-2 leading-relaxed">{item.content}</p>
                    <p className="text-xs text-slate-500 mt-3">
                      <span className="font-semibold">Por que importa:</span> {item.why_it_matters}
                    </p>
                    {(item.source_numbers || []).length > 0 && (
                      <p className="text-xs text-slate-400 mt-2">
                        Fontes relacionadas: {(item.source_numbers || []).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 min-w-0 max-h-[640px] overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Mnemônicos sugeridos
            </h3>

            {(evidenceAnalysis.mnemonics || []).length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum mnemônico sugerido.</p>
            ) : (
              <div className="space-y-4">
                {(evidenceAnalysis.mnemonics || []).map((item, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <h4 className="font-semibold text-amber-900">{item.title}</h4>
                    <p className="text-sm text-amber-800 mt-2">
                      <span className="font-bold">Mnemônico:</span> {item.mnemonic}
                    </p>
                    <p className="text-sm text-amber-900/90 mt-2">{item.explanation}</p>
                    <p className="text-xs text-amber-700 mt-3">
                      <span className="font-semibold">Uso:</span> {item.use_case}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 min-w-0 max-h-[640px] overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Fontes encontradas
            </h3>

            {evidenceSources.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma fonte retornada.</p>
            ) : (
              <div className="space-y-3 pr-2 w-full">
                {evidenceSources.map((source, index) => (
                  <a
                    key={source.id || index}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition-colors"
                  >
                    <p className="text-sm font-semibold text-slate-900 break-words">
                      [{index + 1}] {source.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{source.source_name}</p>
                    <p className="text-xs text-indigo-600 mt-2 break-all">{source.url}</p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </section>
)}

{transcript && (
  <section
    ref={enrichedSectionRef}
    className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
  >
    <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-[#0f172a] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
          5
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Texto enriquecido</h2>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mt-4 md:mt-0">
        <button
          onClick={() => setComparisonMode('original')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            comparisonMode === 'original'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-500'
          }`}
        >
          Original
        </button>

        <button
          onClick={() => setComparisonMode('enriched')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            comparisonMode === 'enriched'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-500'
          }`}
        >
          Enriquecido
        </button>

        <button
          onClick={() => setComparisonMode('split')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            comparisonMode === 'split'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-500'
          }`}
        >
          Comparar
        </button>
      </div>

      {enrichedGeneratedAt ? (
        <span className="text-xs text-slate-400">
          Gerado em {new Date(enrichedGeneratedAt).toLocaleString('pt-BR')}
        </span>
      ) : null}
    </div>

    <div className="p-6 md:p-8 bg-slate-50/30">

      {!enrichedTranscript ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <FileText className="mx-auto mb-4 text-slate-300" size={30} />
          <h3 className="text-lg font-semibold text-slate-800">
            Nenhum texto enriquecido gerado ainda
          </h3>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl mx-auto">
            Gere o texto enriquecido para transformar a análise em uma versão mais completa da aula.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {enrichedSummary?.applied_topics?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                Pontos adicionados
              </h3>
              <div className="flex flex-wrap gap-2">
                {enrichedSummary.applied_topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {enrichedSummary?.applied_mnemonics?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                Mnemônicos incorporados
              </h3>
              <div className="flex flex-wrap gap-2">
                {enrichedSummary.applied_mnemonics.map((item, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {enrichmentReferenceVideos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                Base pedagógica usada no enriquecimento
              </h3>

              <div className="flex flex-wrap gap-2">
                {enrichmentReferenceVideos.map((video, index) => (
                  <span
                    key={video.id || index}
                    className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-sm font-medium"
                  >
                    {video.title}
                  </span>
                ))}
              </div>

              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                Estes vídeos de referência foram usados como apoio didático para reforçar explicações,
                organização do conteúdo e cobertura dos pontos mais relevantes.
              </p>
            </div>
          )}

          {comparisonMode === 'original' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-sm text-slate-700 max-h-[420px] overflow-y-auto leading-relaxed shadow-inner whitespace-pre-wrap">
              {transcript}
            </div>
          )}

          {comparisonMode === 'enriched' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-sm text-slate-700 max-h-[420px] overflow-y-auto leading-relaxed shadow-inner whitespace-pre-wrap">
              {enrichedTranscript}
            </div>
          )}

          {comparisonMode === 'split' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 text-sm text-slate-700 max-h-[420px] overflow-y-auto leading-relaxed shadow-inner whitespace-pre-wrap">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Original
                </p>
                {transcript}
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 text-sm text-slate-700 max-h-[420px] overflow-y-auto leading-relaxed shadow-inner whitespace-pre-wrap">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Enriquecido
                </p>
                {enrichedTranscript}
              </div>
            </div>
          )}

          {enrichedFlashcardsGeneratedAt ? (
            <p className="text-xs text-slate-400">
              Flashcards enriquecidos gerados em{' '}
              {new Date(enrichedFlashcardsGeneratedAt).toLocaleString('pt-BR')}
            </p>
          ) : null}
        </div>
      )}
    </div>
  </section>
)}

{transcript && studyCoverageMetrics && (
  <section
    ref={metricsSectionRef}
    className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
  >
    <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-[#0f172a] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
          6
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Métricas de estudo</h2>
      </div>

      <button
        onClick={exportStudyPack}
        disabled={isExportingStudyPack}
        className="flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
      >
        {isExportingStudyPack ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <FileText size={16} />
        )}
        Exportar estudo
      </button>
    </div>

    <div className="p-6 md:p-8 bg-slate-50/30">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Tópicos</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.detectedTopics}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Lacunas</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.missingTopics}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Sugestões</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.suggestions}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Mnemônicos</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.mnemonics}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Flashcards</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.flashcardsCount}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Palavras originais</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.transcriptWordCount}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Ganho de conteúdo</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {studyCoverageMetrics.enrichmentGain}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Precisão</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {reviewAccuracy}%
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[90px] flex flex-col items-center justify-center text-center">
          <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Cards vencidos</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {cardsDueCount}
          </p>
        </div>

      </div>
    </div>
  </section>
)}

{recommendedHistoryItems.length > 0 && (
  <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
    <div className="p-6 md:p-8 border-b border-slate-100">
      <h2 className="text-2xl font-bold text-slate-900">Recomendações de estudo</h2>
      <p className="text-sm text-slate-500 mt-2">
        Com base nas lacunas identificadas nesta análise.
      </p>
    </div>

    <div className="p-6 md:p-8 bg-slate-50/30">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {recommendedHistoryItems.map((item) => (
          <button
            key={item.id}
            onClick={() => openHistoryDetails(item.id)}
            className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            <p className="font-semibold text-slate-900">{item.title}</p>
            <p className="text-sm text-slate-500 mt-2 line-clamp-2">{item.preview}</p>
            <p className="text-xs text-indigo-600 mt-3">Abrir recomendação</p>
          </button>
        ))}
      </div>
    </div>
  </section>
)}

{isHistoryDetailsOpen && currentRunId && (
  <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
    <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 mb-2">
          Sessão exclusiva do item
        </p>
        <h2 className="text-2xl md:text-3xl font-black text-slate-900">
          {currentFilename || 'Item selecionado'}
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          Visualize, organize e edite rapidamente este estudo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {currentSpecialty ? (
          <span className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
            {currentSpecialty}
          </span>
        ) : (
          <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
            Sem especialidade
          </span>
        )}

        <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
          {flashcards.length} flashcards
        </span>

        <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
          {transcriptWordCount} palavras
        </span>

        <button
          onClick={() => setIsHistoryDetailsOpen(false)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Fechar sessão
        </button>
      </div>
    </div>

    <div className="p-6 md:p-8 bg-slate-50/30 grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-bold text-slate-900">Resumo do conteúdo</h3>

            {evidenceAnalysis ? (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-md">
                Análise disponível
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-md">
                Sem análise
              </span>
            )}
          </div>

          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto">
            {transcript || 'Sem transcrição carregada.'}
          </div>
        </div>

        {currentSecondaryTopics.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold text-slate-900 mb-3">
              Tópicos secundários
            </h3>

            <div className="flex flex-wrap gap-2">
              {currentSecondaryTopics.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {currentAutoTags.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold text-slate-900 mb-3">
              Tags automáticas
            </h3>

            <div className="flex flex-wrap gap-2">
              {currentAutoTags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-bold text-slate-900 mb-3">
            Prévia dos flashcards
          </h3>

          {flashcards.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este item ainda não possui flashcards carregados.
            </p>
          ) : (
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {flashcards.slice(0, 5).map((card, index) => (
                <div
                  key={card.id || index}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                    Flashcard {index + 1}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                    {card.question}
                  </p>
                  <p className="text-sm text-slate-500 mt-2 line-clamp-2">
                    {card.answer}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            Organização
          </h3>

          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Especialidade
          </label>

          <select
            value={currentSpecialty}
            onChange={(e) => saveCurrentSpecialty(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700"
          >
            <option value="">Sem especialidade</option>
            <option value="Neurologia">Neurologia</option>
            <option value="Cardiologia">Cardiologia</option>
            <option value="Pneumologia">Pneumologia</option>
            <option value="Endocrinologia">Endocrinologia</option>
            <option value="Infectologia">Infectologia</option>
            <option value="Gastroenterologia">Gastroenterologia</option>
            <option value="Nefrologia">Nefrologia</option>
            <option value="Reumatologia">Reumatologia</option>
            <option value="Hematologia">Hematologia</option>
            <option value="Ginecologia e Obstetrícia">Ginecologia e Obstetrícia</option>
            <option value="Pediatria">Pediatria</option>
            <option value="Clínica Médica">Clínica Médica</option>
          </select>

          <p className="text-xs text-slate-400 mt-3">
            Ao salvar a especialidade, este item passa a aparecer na pasta correspondente no menu lateral.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            Ações rápidas
          </h3>

          <div className="grid grid-cols-1 gap-3">
            {historyData.find((item) => item.id === currentRunId)?.videoUrl ? (
              <button
                onClick={() =>
                  window.open(
                    historyData.find((item) => item.id === currentRunId)?.videoUrl,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
                className="px-4 py-3 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"
              >
                Ver vídeo
              </button>
            ) : null}

            <button
              onClick={() => generateFlashcardsFromSavedRun(false)}
              disabled={!currentRunId || isGeneratingSavedFlashcards}
              className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Usar salvos / gerar se faltar
            </button>

            <button
              onClick={() => generateFlashcardsFromSavedRun(true)}
              disabled={!currentRunId || isGeneratingSavedFlashcards}
              className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Regenerar flashcards
            </button>

            <button
              onClick={() => analyzeEvidenceFromCurrentRun()}
              disabled={!currentRunId || isAnalyzingEvidence}
              className="px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              Analisar evidência
            </button>

            <button
              onClick={() => generateEnrichedTranscriptFromCurrentRun()}
              disabled={!currentRunId || isGeneratingEnrichedTranscript}
              className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Gerar texto enriquecido
            </button>

            <button
              onClick={exportStudyPack}
              disabled={isExportingStudyPack}
              className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Exportar estudo
            </button>

            <button
              onClick={() => {
                const currentItem = historyData.find((item) => item.id === currentRunId);
                if (currentItem) toggleFavoriteHistoryItem(currentItem);
              }}
              className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors"
            >
              Favoritar / desfavoritar
            </button>

            <button
              onClick={() => deleteHistoryItem(currentRunId)}
              className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors"
            >
              Excluir item
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
)}


          <section
            ref={librarySectionRef}
            className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Biblioteca de Flashcards</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Organize seus cards por deck, especialidade e filtros de estudo.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveCurrentFlashcardsToLibrary}
                  disabled={!flashcards.length || !selectedDeckId || isSavingCardsToLibrary}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSavingCardsToLibrary ? 'Salvando...' : 'Salvar flashcards atuais'}
                </button>

                <button
                  onClick={() => {
                    loadLibraryDecks();
                    loadLibraryCards();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Atualizar biblioteca
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50/30 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Smart Decks</h3>

                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 'new', label: '🆕 Novos', count: smartDeckCounters.new },
                    { id: 'hard', label: '🔥 Difíceis', count: smartDeckCounters.hard },
                    { id: 'favorites', label: '⭐ Favoritos', count: smartDeckCounters.favorites },
                  ].map((deck) => (
                    <button
                      key={deck.id}
                      onClick={() =>
                        setActiveSmartDeck((prev) => (prev === deck.id ? null : deck.id))
                      }
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        activeSmartDeck === deck.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {deck.label} ({deck.count})
                    </button>
                  ))}

                  {activeSmartDeck && (
                    <button
                      onClick={() => setActiveSmartDeck(null)}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Limpar smart deck
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Decks</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{libraryDecks.length}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Cards</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{libraryCards.length}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Favoritos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">
                    {libraryCards.filter((card) => card.is_favorite).length}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Suspensos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">
                    {libraryCards.filter((card) => card.is_suspended).length}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Especialidades</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{librarySpecialties.length}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Vencidos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">
                    {libraryCards.filter((card) => card?.review_state?.dueAt && new Date(card.review_state.dueAt) <= new Date()).length}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900">Criar / selecionar deck</h3>

                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Nome do novo deck"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />

                  <select
                    value={newDeckSpecialty}
                    onChange={(e) => setNewDeckSpecialty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  >
                    <option value="">Sem especialidade</option>
                    {librarySpecialties.map((specialty) => (
                      <option key={specialty} value={specialty}>
                        {specialty}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={createLibraryDeck}
                    className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                  >
                    Criar deck
                  </button>

                  <select
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value="">Selecione um deck</option>
                    {libraryDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}{deck.specialty ? ` — ${deck.specialty}` : ''}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={newDeckSubSpecialty}
                    onChange={(e) => setNewDeckSubSpecialty(e.target.value)}
                    placeholder="Subespecialidade / tema"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900">Filtros da biblioteca</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={libraryMode}
                      onChange={(e) => setLibraryMode(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="deck">Por deck</option>
                      <option value="favorites">Favoritos</option>
                      <option value="due">Vencidos</option>
                    </select>

                    <select
                      value={librarySpecialtyFilter}
                      onChange={(e) => setLibrarySpecialtyFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="">Todas as especialidades</option>
                      {librarySpecialties.map((specialty) => (
                        <option key={specialty} value={specialty}>
                          {specialty}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Buscar no card"
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setActiveSmartDeck(null);
                      loadLibraryCards({
                        deckId: selectedDeckId,
                        specialty: librarySpecialtyFilter,
                        favorites: libraryMode === 'favorites',
                        dueOnly: libraryMode === 'due',
                        search: librarySearch,
                      });
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                  >
                    Aplicar filtros
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {[
                        {
                          id: 'due',
                          title: 'Para revisar',
                          count: smartDeckCounters.due,
                          tone: activeSmartDeck === 'due'
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white',
                        },
                        {
                          id: 'new',
                          title: 'Novos',
                          count: smartDeckCounters.new,
                          tone: activeSmartDeck === 'new'
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-white',
                        },
                        {
                          id: 'hard',
                          title: 'Difíceis',
                          count: smartDeckCounters.hard,
                          tone: activeSmartDeck === 'hard'
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-slate-200 bg-white',
                        },
                        {
                          id: 'favorites',
                          title: 'Favoritos',
                          count: smartDeckCounters.favorites,
                          tone: activeSmartDeck === 'favorites'
                            ? 'border-pink-500 bg-pink-50'
                            : 'border-slate-200 bg-white',
                        },
                      ].map((deck) => (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() =>
                            setActiveSmartDeck((prev) => (prev === deck.id ? null : deck.id))
                          }
                          className={`rounded-2xl border p-4 text-left transition-all hover:shadow-sm ${deck.tone}`}
                        >
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                            Smart deck
                          </p>
                          <h4 className="text-base font-bold text-slate-900">{deck.title}</h4>
                          <p className="text-2xl font-black text-slate-900 mt-3">{deck.count}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Cards da biblioteca</h3>
                        <span className="text-sm text-slate-500">{smartFilteredCards.length} cards</span>
                      </div>
                    </div>
                </div>

                {isLoadingLibrary ? (
                  <p className="text-sm text-slate-500">Carregando biblioteca...</p>
                ) : smartFilteredCards.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum card encontrado.</p>
                ) : libraryViewMode === 'tree' ? (
                  <div className="space-y-6">
                    {smartFilteredLibraryTree.length === 0 ? (
                      <p className="text-sm text-slate-500">Nenhuma hierarquia encontrada.</p>
                    ) : (
                      smartFilteredLibraryTree.map((specialtyGroup) => (
                        <div
                          key={specialtyGroup.name}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                                Especialidade
                              </p>
                              <h4 className="text-lg font-bold text-slate-900">{specialtyGroup.name}</h4>
                            </div>

                            <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600">
                              {specialtyGroup.count} cards
                            </span>
                          </div>

                          <div className="space-y-4">
                            {specialtyGroup.subgroups.map((subgroup) => (
                              <div
                                key={`${specialtyGroup.name}-${subgroup.name}`}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                                      Subespecialidade / Tema
                                    </p>
                                    <h5 className="text-base font-bold text-slate-900">
                                      {subgroup.name}
                                    </h5>
                                  </div>

                                  <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                    {subgroup.cards.length} cards
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {subgroup.cards.map((card, index) => (
                                    <div
                                      key={card.id || index}
                                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                      <div className="flex items-start justify-between gap-3 mb-3">
                                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                          Biblioteca
                                        </span>

                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => toggleLibraryCardFavorite(card)}
                                            className={`text-sm font-semibold ${
                                              card.is_favorite
                                                ? 'text-amber-500'
                                                : 'text-slate-300 hover:text-amber-500'
                                            }`}
                                          >
                                            ★
                                          </button>

                                          <button
                                            onClick={() => startEditingLibraryCard(card)}
                                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                          >
                                            Editar
                                          </button>
                                        </div>
                                      </div>

                                      <p className="text-sm font-semibold text-slate-900">
                                        {card.question}
                                      </p>

                                      <p className="text-sm text-slate-600 mt-2">
                                        {card.answer}
                                      </p>

                                      <div className="flex flex-wrap gap-2 mt-3">
                                        {card.difficulty ? (
                                          <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600">
                                            {card.difficulty}
                                          </span>
                                        ) : null}

                                        {card.sub_specialty ? (
                                          <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700">
                                            {card.sub_specialty}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {smartFilteredCards.map((card, index) => (
                      <div
                        key={card.id || index}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Card da biblioteca
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleLibraryCardFavorite(card)}
                              className={`text-sm font-semibold ${
                                card.is_favorite
                                  ? 'text-amber-500'
                                  : 'text-slate-300 hover:text-amber-500'
                              }`}
                            >
                              ★
                            </button>

                            <button
                              onClick={() => startEditingLibraryCard(card)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>
                          </div>
                        </div>

                        <p className="text-sm font-semibold text-slate-900">{card.question}</p>
                        <p className="text-sm text-slate-600 mt-2">{card.answer}</p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {card.specialty ? (
                            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-xs font-medium text-indigo-700">
                              {card.specialty}
                            </span>
                          ) : null}

                          {card.sub_specialty ? (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                              {card.sub_specialty}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            ref={studySessionSectionRef}
            className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Sessão de Estudo</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Estude os flashcards da biblioteca por vencimento, favoritos ou deck.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => buildLibraryStudyQueue('due')}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Estudar vencidos
                </button>

                <button
                  onClick={() => buildLibraryStudyQueue('favorites')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Estudar favoritos
                </button>

                <button
                  onClick={() => buildLibraryStudyQueue('deck')}
                  disabled={!selectedDeckId}
                  className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-50"
                >
                  Estudar deck selecionado
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50/30 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Vistos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{studySessionStats.totalSeen}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Acertos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{studySessionStats.correctCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Difíceis</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{studySessionStats.hardCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Fáceis</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{studySessionStats.easyCount}</p>
                </div>
              </div>

              {!currentLibraryStudyCard ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <Lightbulb className="mx-auto mb-4 text-slate-300" size={30} />
                  <h3 className="text-lg font-semibold text-slate-800">Nenhuma sessão iniciada</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Escolha um modo de estudo acima para carregar a fila.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="flex items-center justify-between w-full max-w-2xl mb-6">
                    <span className="text-sm font-semibold text-slate-500">
                      Card {currentLibraryStudyIndex + 1} de {studyQueue.length}
                    </span>
                  </div>

                  <div
                    className="relative w-full max-w-2xl h-[420px] cursor-pointer group [perspective:1000px]"
                    onClick={() => setIsLibraryStudyFlipped(!isLibraryStudyFlipped)}
                  >
                    <div
                      className={`w-full h-full relative transition-all duration-500 [transform-style:preserve-3d] shadow-lg rounded-3xl ${
                        isLibraryStudyFlipped ? '[transform:rotateY(180deg)]' : ''
                      }`}
                    >
                      <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center [backface-visibility:hidden]">
                        <span className="absolute top-6 left-6 text-[#6366f1] text-xs font-bold tracking-wider uppercase">
                          Biblioteca
                        </span>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                          {currentLibraryStudyCard.question}
                        </h3>
                        <p className="absolute bottom-6 text-slate-400 text-sm">Clique para virar</p>
                      </div>

                      <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-8 md:p-10 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto">
                        <p className="text-slate-700 text-lg leading-relaxed mb-8">
                          {currentLibraryStudyCard.answer}
                        </p>

                        {currentLibraryStudyCard.preceptor_note && (
                          <div className="mt-auto bg-amber-50 border border-amber-100 rounded-2xl p-5">
                            <p className="text-amber-900 text-sm leading-relaxed">
                              {currentLibraryStudyCard.preceptor_note}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                    <button
                      onClick={() => rateLibraryStudyCard(1)}
                      className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100"
                    >
                      Errei
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(2)}
                      className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100"
                    >
                      Difícil
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(3)}
                      className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
                    >
                      Bom
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(4)}
                      className="px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100"
                    >
                      Fácil
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section
            ref={historySectionRef}
            className="scroll-mt-24 min-h-screen bg-slate-50/50 flex font-sans text-slate-800 overflow-hidden rounded-3xl border border-slate-200 shadow-sm"
          >
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 bg-slate-900/50 z-20 lg:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}

            <aside
              className={`
                fixed lg:static top-0 left-0 h-full z-30 bg-white border-r border-slate-200
                transform transition-all duration-300 ease-in-out flex flex-col overflow-hidden
                ${isMobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'}
                ${isHistorySidebarExpanded ? 'lg:w-72' : 'lg:w-24'}
              `}
              onMouseEnter={() => setIsHistorySidebarExpanded(true)}
              onMouseLeave={() => setIsHistorySidebarExpanded(false)}
            >
              <div
                className={`border-b border-slate-100 transition-all duration-300 ${
                  isHistorySidebarExpanded
                    ? 'p-6 flex items-center justify-between'
                    : 'py-6 px-0 flex items-center justify-center lg:justify-center'
                }`}
              >
                <div
                  className={`flex items-center transition-all duration-300 ${
                    isHistorySidebarExpanded ? 'gap-3' : 'justify-center'
                  }`}
                >
                  <div className="bg-[#0f172a] text-white w-11 h-11 rounded-2xl flex items-center justify-center font-bold shrink-0">
                    <LayoutTemplate size={18} />
                  </div>

                  {(isHistorySidebarExpanded || isMobileMenuOpen) && (
                    <h2 className="text-xl font-bold text-slate-900 whitespace-nowrap">Workspace</h2>
                  )}
                </div>

                <button
                  className="lg:hidden text-slate-500 hover:bg-slate-100 p-2 rounded-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                <div>
                  {allFolders.map((folder) => {
                    const isActive = currentFolder === folder.id;
                    const Icon = folder.icon;

                    return (
                      <button
                        key={folder.id}
                        onClick={() => {
                          setCurrentFolder(folder.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full transition-all duration-300 ${
                          isHistorySidebarExpanded || isMobileMenuOpen
                            ? 'flex items-center justify-between p-3 rounded-xl'
                            : 'flex items-center justify-center w-14 h-14 rounded-2xl mx-auto'
                        } ${
                          isActive ? 'bg-[#0f172a] text-white' : 'text-slate-600 hover:bg-slate-100'
                        } ${folder.id !== 'all' ? 'mt-1' : ''}`}
                        title={folder.name}
                      >
                        <div
                          className={`flex items-center transition-all duration-300 ${
                            isHistorySidebarExpanded || isMobileMenuOpen ? 'gap-3 font-medium min-w-0' : 'justify-center'
                          }`}
                        >
                          <Icon
                            size={18}
                            className={isActive ? 'text-slate-300' : 'text-slate-400'}
                          />
                          {(isHistorySidebarExpanded || isMobileMenuOpen) && (
                            <span className="truncate max-w-[150px] text-left">{folder.name}</span>
                          )}
                        </div>

                        {(isHistorySidebarExpanded || isMobileMenuOpen) && (
                          <span
                            className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                              isActive ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {folder.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100">
                <div
                  className={`flex items-center justify-center text-xs text-slate-500 bg-slate-50 rounded-lg transition-all duration-300 ${
                    isHistorySidebarExpanded || isMobileMenuOpen ? 'p-2' : 'w-12 h-12 mx-auto'
                  }`}
                  title="Dados Salvos Automaticamente"
                >
                  {isHistorySidebarExpanded || isMobileMenuOpen ? 'Dados Salvos Automaticamente' : 'DB'}
                </div>
              </div>
            </aside>

            <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
              <div className="lg:hidden p-4 bg-white border-b border-slate-200 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="bg-[#0f172a] text-white w-8 h-8 rounded-xl flex items-center justify-center font-bold">
                    <LayoutTemplate size={18} />
                  </div>
                </div>
                <button
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <Menu size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 xl:p-8 min-w-0">
                <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6 min-h-full">
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div>
                      <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
                        O Seu Histórico
                      </h2>
                      <p className="text-sm md:text-base text-slate-500 mt-2">
                        Navegue pelas suas transcrições, vídeos e flashcards gerados.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5">
                        <Database size={14} />
                        {historyData.length} itens carregados
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-4 md:p-5 rounded-[26px] border border-slate-200 shadow-sm flex flex-col gap-4">
                    <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-1 relative">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={20}
                        />
                        <input
                          type="text"
                          placeholder="Procurar por tema, título ou conteúdo"
                          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-slate-50 hover:bg-white text-sm"
                          value={historySearchInput}
                          onChange={(e) => setHistorySearchInput(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-5 py-3 rounded-2xl bg-[#0f172a] text-white text-sm font-semibold hover:bg-[#1e293b] transition-colors"
                        >
                          Buscar
                        </button>
                        {(historySearch || historySearchInput) && (
                          <button
                            type="button"
                            onClick={clearSearch}
                            className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    </form>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <Filter size={16} className="text-slate-400" />
                          <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer font-medium text-slate-700"
                          >
                            <option value="all">Todos os tipos</option>
                            <option value="flashcards">Com Flashcards</option>
                            <option value="transcript">Só Transcrição</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer font-medium text-slate-700"
                          >
                            <option value="newest">Mais recentes</option>
                            <option value="oldest">Mais antigos</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setHistoryViewMode('grid')}
                          className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                            historyViewMode === 'grid'
                              ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <LayoutGrid size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryViewMode('list')}
                          className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                            historyViewMode === 'list'
                              ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <ListIcon size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    {isLoadingHistory ? (
                      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 size={36} className="mb-4 animate-spin" />
                        <p className="text-lg text-slate-500 font-medium">Carregando histórico...</p>
                      </div>
                    ) : currentHistoryItems.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
                        <FolderOpen size={48} className="mb-4 opacity-20" />
                        <p className="text-lg text-slate-500 font-medium">Nenhum arquivo encontrado.</p>
                        <p className="text-sm mt-1">
                          Tente ajustar seus filtros ou termos de busca.
                        </p>
                      </div>
                    ) : (
                      <>
                        {historyViewMode === 'grid' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 items-stretch">
                            {currentHistoryItems.map((item) => (
                              <div
                                key={item.id}
                                className="bg-white border border-slate-200 rounded-[28px] p-5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] hover:border-violet-200 transition-all flex flex-col h-full group min-w-0"
                              >
                                <div className="flex items-start justify-between gap-4 mb-4 min-w-0">
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                        {item.specialty || 'Sem especialidade'}
                                      </span>
                                    </div>

                                    <h3 className="text-xl leading-tight font-black text-slate-900 line-clamp-3 break-words min-h-[88px]">
                                      {item.title}
                                    </h3>
                                  </div>

                                  <button
                                    onClick={() => toggleFavoriteHistoryItem(item)}
                                    className={`shrink-0 w-9 h-9 rounded-full border transition-colors ${
                                      item.isFavorite
                                        ? 'border-amber-200 bg-amber-50 text-amber-500'
                                        : 'border-slate-200 bg-white text-slate-300 hover:text-amber-500'
                                    }`}
                                    title={item.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                                  >
                                    ★
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                  {item.hasAnalysis ? (
                                    <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-md">
                                      Análise disponível
                                    </span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-md">
                                      Sem análise
                                    </span>
                                  )}

                                  {item.lastAnalysisAt ? (
                                    <span className="text-xs text-slate-400">
                                      {new Date(item.lastAnalysisAt).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                      })}
                                    </span>
                                  ) : null}
                                </div>

                                <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 mb-3">
                                  {item.preview}
                                </p>

                                <div className="mt-auto flex flex-col gap-4">
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    {item.hasFlashcards ? (
                                      <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                        ✨ {item.flashcardsCount} flashcards
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                                        Só transcrição
                                      </span>
                                    )}

                                    {item.videoUrl ? (
                                      <span className="bg-violet-50 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                        Vídeo salvo
                                      </span>
                                    ) : null}

                                    {item.lastAnalysisAt ? (
                                      <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2.5 py-1 rounded-full">
                                        {new Date(item.lastAnalysisAt).toLocaleDateString('pt-BR')}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="pt-3 border-t border-slate-100 mt-auto">
                                    <div className="flex flex-col items-center gap-3">
                                      <div className="text-center">
                                        <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                          {new Date(item.date).toLocaleString('pt-BR')}
                                        </p>
                                      </div>

                                      <div className="flex flex-wrap items-center justify-center gap-2">
                                      {item.videoUrl ? (
                                        <button
                                          onClick={() => window.open(item.videoUrl, '_blank', 'noopener,noreferrer')}
                                          className="px-4 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                                        >
                                          Ver vídeo
                                        </button>
                                      ) : null}

                                      <button
                                        onClick={() => deleteHistoryItem(item.id)}
                                        className="px-4 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold"
                                      >
                                        Excluir
                                      </button>

                                      <button
                                        onClick={() => openHistoryDetails(item.id)}
                                        className="px-4 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold"
                                      >
                                        Abrir item
                                      </button>
                                        </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {historyViewMode === 'list' && (
                          <div className="flex flex-col gap-3 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            {currentHistoryItems.map((item, index) => (
                              <div
                                key={item.id}
                                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-slate-50 transition-colors gap-4 ${
                                  index !== currentHistoryItems.length - 1
                                    ? 'border-b border-slate-100'
                                    : ''
                                }`}
                              >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                  <div
                                    className={`p-2.5 rounded-xl flex-shrink-0 ${
                                      item.type === 'video'
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {item.type === 'video' ? (
                                      <PlayCircle size={20} />
                                    ) : (
                                      <FileText size={20} />
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <h3 className="font-semibold text-slate-900 truncate">{item.title}</h3>

                                      <button
                                        onClick={() => toggleFavoriteHistoryItem(item)}
                                        className={`text-sm font-semibold transition-colors flex-shrink-0 ${
                                          item.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
                                        }`}
                                        title={item.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                                      >
                                        ★
                                      </button>
                                    </div>

                                    {item.specialty ? (
                                      <p className="text-xs text-indigo-600 font-medium mt-2">
                                        {item.specialty}
                                      </p>
                                    ) : null}

                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                      {item.hasAnalysis ? (
                                        <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-md">
                                          Análise disponível
                                        </span>
                                      ) : (
                                        <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-md">
                                          Sem análise
                                        </span>
                                      )}

                                      {item.lastAnalysisAt ? (
                                        <span className="text-xs text-slate-400">
                                          {new Date(item.lastAnalysisAt).toLocaleDateString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                          })}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between w-full sm:w-auto gap-4 flex-shrink-0 ml-14 sm:ml-0">
                                  <div className="flex items-center gap-3">
                                    {item.hasFlashcards ? (
                                      <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                                        {item.flashcardsCount} flashcards
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                                        Só transcrição
                                      </span>
                                    )}

                                    {item.videoUrl ? (
                                      <button
                                        onClick={() => window.open(item.videoUrl, '_blank', 'noopener,noreferrer')}
                                        className="text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors"
                                      >
                                        Ver vídeo
                                      </button>
                                    ) : null}
                                  </div>

                                  <button
                                    onClick={() => deleteHistoryItem(item.id)}
                                    className="text-red-500 text-sm font-semibold hover:text-red-600 transition-colors"
                                  >
                                    Deletar
                                  </button>

                                  <button
                                    onClick={() => openHistoryDetails(item.id)}
                                    className="bg-white border border-slate-200 hover:border-[#0f172a] hover:bg-slate-50 text-[#0f172a] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                  >
                                    Abrir
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {historyHasMoreOnBackend && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Mostrando os {historyData.length} registros mais recentes carregados do backend.
                      Se a base crescer muito, vale mover filtros, ordenação e paginação totalmente para a query do servidor.
                    </div>
                  )}

                  {totalHistoryPages > 1 && (
                    <div className="mt-auto pt-4 sticky bottom-0 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500 font-medium hidden sm:block">
                          Página {historyPage} de {totalHistoryPages}
                        </span>

                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-full sm:w-auto justify-center">
                          <button
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            disabled={historyPage === 1}
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          >
                            <ChevronLeft size={20} />
                          </button>

                          {Array.from({ length: Math.min(5, totalHistoryPages) }).map((_, idx) => {
                            let pageNum;
                            if (totalHistoryPages <= 5) pageNum = idx + 1;
                            else if (historyPage <= 3) pageNum = idx + 1;
                            else if (historyPage >= totalHistoryPages - 2)
                              pageNum = totalHistoryPages - 4 + idx;
                            else pageNum = historyPage - 2 + idx;

                            return (
                              <button
                                key={idx}
                                onClick={() => setHistoryPage(pageNum)}
                                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                                  historyPage === pageNum
                                    ? 'bg-[#0f172a] text-white shadow-md'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}

                          <button
                            onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                            disabled={historyPage === totalHistoryPages}
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </section>
        </div>

        {error && (
        <div
          className={`fixed top-6 left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-300 ease-out ${
            isClosing
              ? 'opacity-0 -translate-y-4'
              : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="w-[min(420px,calc(100vw-32px))] pointer-events-auto">
            <div className="relative overflow-hidden rounded-[14px] border border-slate-100 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-5">

              <div className="flex items-start gap-4">
                <div className="relative flex shrink-0 items-center justify-center w-[42px] h-[42px] rounded-full bg-red-50 shadow-[0_0_12px_rgba(220,38,38,0.12)]">
                  <AlertCircle size={22} className="text-[#dc2626]" strokeWidth={2.5} />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-[15px] font-semibold text-slate-900">
                    Ocorreu um problema
                  </h3>

                  <p className="text-[14px] text-slate-500 mt-1.5 leading-relaxed pr-2 whitespace-pre-wrap">
                    {error}
                  </p>

                  <div className="mt-4 flex items-center gap-4">
                    <button
                      onClick={fecharNotificacao}
                      className="px-4 py-2 bg-[#dc2626] hover:bg-red-700 text-white text-[13px] font-medium rounded-lg"
                    >
                      Entendi
                    </button>

                    <button
                      onClick={fecharNotificacao}
                      className="text-[13px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>

                <button
                  onClick={fecharNotificacao}
                  className="shrink-0 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="absolute bottom-0 left-0 h-[3px] bg-[#dc2626] animate-[progress_5s_linear_forwards]" />
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
);
}