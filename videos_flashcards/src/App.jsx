import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  Layers,
  Star,
  Check,
  Copy,
  Download,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Pilcrow,
  Quote,
  ListOrdered,
  Highlighter,
  Link2,
  Eraser,
} from 'lucide-react';

const HISTORY_ITEMS_PER_PAGE = 6;
const HISTORY_FETCH_LIMIT = 120;
const SMART_REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30, 60, 90];

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
    enrichmentSupportFilename: run.enrichment_support_filename || '',
    enrichmentSupportTranscriptPreview: run.enrichment_support_transcript_preview || '',
    enrichmentSupportVideoUrl: run.enrichment_support_video_url || '',
    hasEnrichmentSupport: Boolean(
      run.enrichment_support_transcript_preview ||
        run.enrichment_support_video_url ||
        run.enrichment_support_filename
    ),
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

function SmartDropdown({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Selecione...',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const findSelected = () => {
    for (const option of options) {
      if (option.id === value) return { ...option, groupIcon: option.icon };
      if (option.subOptions) {
        const sub = option.subOptions.find((item) => item.id === value);
        if (sub) return { ...sub, groupIcon: option.icon };
      }
    }

    return null;
  };

  const selected = findSelected();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label ? (
        <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-400 mb-2">
          {label}
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between bg-white border px-4 py-3 rounded-xl shadow-sm transition-all ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-100'
            : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected?.groupIcon ? (
            <span className="text-indigo-500 shrink-0">{selected.groupIcon}</span>
          ) : (
            <Layers className="w-5 h-5 text-indigo-500 shrink-0" />
          )}

          <span className="font-medium text-slate-700 truncate">
            {selected?.label || placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`absolute z-50 min-w-full w-max max-w-[min(520px,calc(100vw-2rem))] mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden transition-all ${
          isOpen
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="p-1.5 max-h-[400px] overflow-y-auto">
          {options.map((option) => {
            const hasSubOptions = Array.isArray(option.subOptions);
            const isExpanded = expandedGroup === option.id;
            const isSelected = !hasSubOptions && value === option.id;

            return (
              <div key={option.id} className="mb-1 last:mb-0">
                <button
                  type="button"
                  onClick={(e) => {
                    if (hasSubOptions) {
                      e.stopPropagation();
                      setExpandedGroup((prev) => (prev === option.id ? null : option.id));
                    } else {
                      onChange(option.id);
                      setIsOpen(false);
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-4 p-3 rounded-lg transition-colors text-left ${
                    isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        isSelected || isExpanded
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {option.icon || <Layers className="w-4 h-4" />}
                    </div>

                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-700 whitespace-normal leading-snug">
                        {option.label}
                      </p>
                      {option.description ? (
                        <p className="text-xs text-slate-500 whitespace-normal leading-snug">
                          {option.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {hasSubOptions ? (
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        isExpanded ? 'rotate-180' : '-rotate-90'
                      }`}
                    />
                  ) : (
                    isSelected && <Check className="w-5 h-5 text-indigo-600" />
                  )}
                </button>

                {hasSubOptions && isExpanded ? (
                  <div className="mt-1 mb-2 ml-7 pl-4 border-l-2 border-slate-100 flex flex-col gap-1">
                    {option.subOptions.map((sub) => {
                      const isSubSelected = value === sub.id;

                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            onChange(sub.id);
                            setIsOpen(false);
                          }}
                          className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
                            isSubSelected
                              ? 'bg-indigo-50 text-indigo-700 font-medium'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <span>{sub.label}</span>
                          {isSubSelected ? <Check className="w-4 h-4 text-indigo-600" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnimatedTopicCloud({ topics = [] }) {
  const safeTopics = useMemo(() => {
    return topics
      .map((topic) => String(topic || '').trim())
      .filter(Boolean);
  }, [topics]);

  if (!safeTopics.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 xl:col-span-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Tópicos detectados
        </h3>

        <p className="text-sm text-slate-500">
          Nenhum tópico detectado.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl xl:col-span-2 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-white/90 backdrop-blur flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
          Tópicos detectados
        </h3>

        <span className="self-start sm:self-auto text-xs px-3 py-1 rounded-full font-medium bg-slate-100 text-slate-500">
          Modo Organizado
        </span>
      </div>

      <div className="bg-slate-50/50 px-6 py-10 sm:px-8">
        <div className="mx-auto grid max-w-[1480px] grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">
          {safeTopics.map((topic, index) => (
            <div
              key={`${topic}-${index}`}
              className="w-full rounded-full border border-indigo-100 bg-indigo-50 px-6 py-4 text-sm md:text-base leading-[1.55] text-indigo-700 shadow-sm"
            >
              {topic}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EvidenceApplyButton({
  added = false,
  onApply,
  disabled = false,
  label = 'Adicionar ao texto enriquecido',
  stretch = false,
  compact = false,
  className = '',
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = () => {
    if (disabled || added || isAnimating) return;

    setIsAnimating(true);
    onApply?.();

    setTimeout(() => {
      setIsAnimating(false);
    }, 850);
  };

  const showSuccess = added || isAnimating;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || added}
      className={`h-11 rounded-xl px-5 text-white font-semibold text-sm transition-all shadow-sm flex items-center gap-2 justify-center disabled:cursor-default ${
        compact ? 'min-w-[180px]' : 'min-w-[240px]'
      } ${
        stretch ? 'w-full' : ''
      } ${
        showSuccess
          ? 'bg-emerald-500'
          : 'bg-[#5C55E9] hover:bg-[#4A44C9]'
      } ${className}`}
    >
      {!showSuccess ? (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      ) : isAnimating ? (
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <Check className="w-4 h-4" />
      )}

      <span>{showSuccess ? 'Adicionado' : label}</span>
    </button>
  );
}

function SuggestionAddedPreview({ visible = false }) {
  return (
    <div className="mt-4 w-full">
      <div className="flex justify-center items-center w-full">
        <div className="relative flex items-center justify-center w-full h-44">
          <div
            className={`bg-white border-2 rounded-2xl shadow-sm w-full h-full px-8 py-7 flex flex-col relative overflow-hidden z-10 transition-all duration-500 ${
              visible
                ? 'border-indigo-100 bg-gradient-to-tr from-indigo-50/40 to-emerald-50/40'
                : 'border-slate-100 bg-slate-50/80'
            }`}
          >
            <div className="flex items-center justify-between gap-4 mb-1">
              <span
                className={`text-[11px] font-black uppercase tracking-[0.14em] ${
                  visible ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {visible ? 'Melhoria aplicada' : 'Aguardando aplicação'}
              </span>

              <span
                className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  visible
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {visible ? 'Adicionado' : 'Pendente'}
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center px-6">
              <p className="max-w-[290px] text-sm leading-6 text-center text-slate-500">
                {visible
                  ? 'Esta sugestão já foi incorporada ao texto enriquecido.'
                  : 'Clique em “Adicionar ao texto enriquecido” para aplicar esta melhoria.'}
              </p>
            </div>
          </div>

          <div
            className={`absolute -right-3 -bottom-3 border-4 border-white text-white rounded-full p-1.5 z-20 shadow-md transition-all duration-500 ${
              visible
                ? 'scale-100 bg-emerald-500'
                : 'scale-100 bg-slate-300'
            }`}
          >
            {visible ? (
              <Check className="w-5 h-5" />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center text-xs font-black">
                +
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAiTextToHtml(text = '') {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  if (!raw) return '';

  const escapeHtml = (value = '') =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const formatInline = (value = '') => {
    return escapeHtml(value)
      .replace(/\*\*([\s\S]*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
      .replace(/==([\s\S]*?)==/g, '<mark class="bg-yellow-200 text-yellow-900 px-1 py-0.5 rounded">$1</mark>')
      .replace(/~~([\s\S]*?)~~/g, '<span class="line-through">$1</span>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-indigo-600 underline underline-offset-4">$1</a>');
  };

  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      if (/^#{1,3}\s+/.test(block)) {
        return `<h4 class="text-base font-black text-slate-900 leading-7 mb-3">${formatInline(
          block.replace(/^#{1,3}\s+/, '')
        )}</h4>`;
      }

      if (/^>\s+/.test(block)) {
        return `<blockquote class="border-l-4 border-slate-200 pl-4 italic text-slate-600 my-3">${formatInline(
          block.replace(/^>\s+/, '')
        )}</blockquote>`;
      }

      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length && lines.every((line) => /^- /.test(line))) {
        return `<ul class="list-disc pl-5 space-y-1 my-3">${lines
          .map((line) => `<li>${formatInline(line.replace(/^- /, ''))}</li>`)
          .join('')}</ul>`;
      }

      if (lines.length && lines.every((line) => /^\d+\. /.test(line))) {
        return `<ol class="list-decimal pl-5 space-y-1 my-3">${lines
          .map((line) => `<li>${formatInline(line.replace(/^\d+\. /, ''))}</li>`)
          .join('')}</ol>`;
      }

      return `<p class="mb-3">${formatInline(block)}</p>`;
    })
    .join('');
}

function stripAppliedMetaText(value = '', { keepMainBody = true } = {}) {
  let text = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  if (!text) return '';

  text = text
    .replace(/^#{1,6}\s*/gim, '')
    .replace(/^✅\s*/gim, '')
    .replace(/^\s*(Melhoria aplicada|Sugestão adicionada|Lacuna corrigida) pela Análise de Evidência:\s*/gim, '')
    .replace(/^\s*Correção de lacuna:\s*/gim, '')
    .replace(/\*\*\s*Melhor forma de corrigir:\s*\*\*/gim, '')
    .replace(/\*\*\s*Como foi corrigida:\s*\*\*/gim, '')
    .replace(/\*\*\s*O que foi melhorado:\s*\*\*/gim, '')
    .replace(/\*\*\s*Como aplicar no texto:\s*\*\*/gim, '')
    .replace(/\*\*\s*Como isso melhora o estudo:\s*\*\*/gim, '')
    .replace(/\*\*\s*Aplicação prática para o aluno:\s*\*\*/gim, '')
    .replace(/^\s*Melhor forma de corrigir:\s*/gim, '')
    .replace(/^\s*Como foi corrigida:\s*/gim, '')
    .replace(/^\s*O que foi melhorado:\s*/gim, '')
    .replace(/^\s*Como aplicar no texto:\s*/gim, '')
    .replace(/^\s*Como isso melhora o estudo:\s*/gim, '')
    .replace(/^\s*Aplicação prática para o aluno:\s*/gim, '')
    .trim();

  if (keepMainBody) {
    const improvedMatch = text.match(
      /o que foi melhorado:\s*([\s\S]*?)(?=\n?\s*(como aplicar no texto:|como isso melhora o estudo:|aplicação prática para o aluno:|$))/i
    );

    if (improvedMatch?.[1]) {
      text = improvedMatch[1].trim();
    }

    text = text
      .replace(/\n?\s*como aplicar no texto:[\s\S]*$/i, '')
      .replace(/\n?\s*como isso melhora o estudo:[\s\S]*$/i, '')
      .replace(/\n?\s*aplicação prática para o aluno:[\s\S]*$/i, '')
      .replace(/\n?\s*este ponto deve ser incorporado ao texto enriquecido[\s\S]*$/i, '')
      .replace(/\n?\s*como integrar ao estudo:[\s\S]*$/i, '');
  }

  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function FormattedAiText({ text, className = '' }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: formatAiTextToHtml(text),
      }}
    />
  );
}

function ReadableTranscriptText({ text }) {
  const paragraphs = useMemo(() => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();

    if (!clean) return [];

    const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks = [];

    for (let i = 0; i < sentences.length; i += 4) {
      chunks.push(sentences.slice(i, i + 4).join(' '));
    }

    return chunks;
  }, [text]);

  if (!paragraphs.length) {
    return (
      <p className="text-sm text-slate-400">
        Nenhum conteúdo disponível.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="text-[15px] leading-8 text-slate-700"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function getMissingTopicTitle(item, index) {
  if (typeof item === 'string') return item;

  return (
    item?.title ||
    item?.topic ||
    item?.name ||
    `Lacuna ${index + 1}`
  );
}

function getMissingTopicFixText(item, index) {
  if (typeof item === 'string') {
    return `Corrigir a lacuna "${item}" adicionando uma explicação objetiva sobre definição, relevância clínica, como reconhecer, conduta prática, armadilhas de prova e relação com a aula original.`;
  }

  const raw =
    item?.how_to_fix ||
    item?.correction_strategy ||
    item?.fix ||
    item?.description ||
    item?.content ||
    `Corrigir a lacuna "${getMissingTopicTitle(item, index)}" adicionando uma explicação objetiva sobre definição, relevância clínica, como reconhecer, conduta prática, armadilhas de prova e relação com a aula original.`;

  return stripAppliedMetaText(raw, { keepMainBody: false });
}

function escapeHtmlForEditor(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInlineEditorMarkdown(value = '') {
  return escapeHtmlForEditor(value)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.*?)==/g, '<mark>$1</mark>');
}

function plainTextToPremiumEditorHtml(value = '') {
  const text = String(value || '').trim();

  if (!text) return '<p><br/></p>';

  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }

  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks
    .map((block) => {
      const escapedBlock = formatInlineEditorMarkdown(block);

      if (block.startsWith('## ')) {
        return `<h2>${formatInlineEditorMarkdown(block.replace(/^##\s*/, ''))}</h2>`;
      }

      if (block.startsWith('> ')) {
        return `<blockquote>${formatInlineEditorMarkdown(block.replace(/^>\s*/, ''))}</blockquote>`;
      }

      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length && lines.every((line) => line.startsWith('- '))) {
        return `<ul>${lines
          .map((line) => `<li>${formatInlineEditorMarkdown(line.replace(/^- /, ''))}</li>`)
          .join('')}</ul>`;
      }

      if (lines.length && lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `<ol>${lines
          .map((line) => `<li>${formatInlineEditorMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`)
          .join('')}</ol>`;
      }

      return `<p>${escapedBlock.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function premiumEditorHtmlToText(html = '') {
  const container = document.createElement('div');
  container.innerHTML = html || '';

  container.querySelectorAll('strong, b').forEach((node) => {
    node.replaceWith(`**${node.textContent}**`);
  });

  container.querySelectorAll('mark').forEach((node) => {
    node.replaceWith(`==${node.textContent}==`);
  });

  container.querySelectorAll('a').forEach((node) => {
    node.replaceWith(node.textContent || '');
  });

  container.querySelectorAll('h1, h2, h3, h4').forEach((node) => {
    node.replaceWith(`\n\n## ${node.textContent}\n\n`);
  });

  container.querySelectorAll('blockquote').forEach((node) => {
    node.replaceWith(`\n\n> ${node.textContent}\n\n`);
  });

  container.querySelectorAll('li').forEach((node) => {
    node.replaceWith(`\n- ${node.textContent}`);
  });

  container.querySelectorAll('p, div').forEach((node) => {
    node.append(document.createTextNode('\n\n'));
  });

  container.querySelectorAll('br').forEach((node) => {
    node.replaceWith('\n');
  });

  return container.textContent
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function PremiumRichTextEditor({
  value,
  onChange,
  onSave,
  autoSaveStatus = 'idle',
  saveButtonStatus = 'idle',
}) {
  const editorRef = useRef(null);
  const lastLoadedValueRef = useRef('');

  useEffect(() => {
    const safeValue = String(value || '');

    if (!editorRef.current) return;
    if (lastLoadedValueRef.current === safeValue) return;

    editorRef.current.innerHTML = plainTextToPremiumEditorHtml(safeValue);
    lastLoadedValueRef.current = safeValue;
  }, [value]);

  const syncEditor = () => {
    if (!editorRef.current) return;

    const nextValue = premiumEditorHtmlToText(editorRef.current.innerHTML);
    lastLoadedValueRef.current = nextValue;
    onChange?.(nextValue);
  };

  const runCommand = (command, commandValue = null) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    document.execCommand(command, false, commandValue);

    setTimeout(() => {
      syncEditor();
    }, 0);
  };

  const formatBlock = (tag) => {
    runCommand('formatBlock', tag);
  };

  const highlightText = () => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    document.execCommand('hiliteColor', false, '#fef08a');

    setTimeout(() => {
      syncEditor();
    }, 0);
  };

  const insertLink = () => {
    if (!editorRef.current) return;

    const url = window.prompt('Insira o link (URL):', 'https://');

    if (url) {
      editorRef.current.focus();
      document.execCommand('createLink', false, url);
      setTimeout(() => syncEditor(), 0);
    }
  };

  const handleToolbarMouseDown = (event, action) => {
    event.preventDefault();
    action();
  };

  const statusLabel =
    autoSaveStatus === 'saving'
      ? 'Salvando alterações...'
      : autoSaveStatus === 'error'
        ? 'Erro ao sincronizar'
        : 'Sincronizado';

  return (
    <div className="max-w-[900px] mx-auto">
      <style>{`
        .premium-editor-content {
          outline: none;
          min-height: 500px;
          color: #374151;
          font-size: 1.05rem;
          line-height: 1.85;
          padding-bottom: 100px;
        }

        .premium-editor-content h2 {
          font-family: Georgia, Cambria, "Times New Roman", serif;
          font-size: 1.75rem;
          font-weight: 600;
          color: #111827;
          margin-top: 3rem;
          margin-bottom: 1.25rem;
          letter-spacing: -0.015em;
        }

        .premium-editor-content p {
          margin-bottom: 1.5rem;
        }

        .premium-editor-content strong {
          color: #111827;
          font-weight: 600;
        }

        .premium-editor-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .premium-editor-content ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .premium-editor-content li {
          margin-bottom: 0.5rem;
          padding-left: 0.5rem;
        }

        .premium-editor-content a {
          color: #4f46e5;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .premium-editor-content blockquote {
          border-left: 4px solid #e2e8f0;
          padding-left: 1rem;
          font-style: italic;
          color: #64748b;
          margin-bottom: 1.5rem;
        }

        .premium-editor-content mark {
          background-color: #fef08a;
          padding: 0.15em 0.3em;
          border-radius: 0.375rem;
          color: #713f12;
          font-weight: 500;
        }

        .premium-toolbar-btn {
          transition: all 0.2s ease;
        }

        .premium-toolbar-btn:hover {
          background-color: #f1f5f9;
          color: #0f172a;
        }

        .premium-toolbar-btn:active {
          transform: scale(0.95);
        }

        [contenteditable]:focus {
          outline: 0px solid transparent !important;
          box-shadow: none !important;
        }
      `}</style>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 px-2">
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mb-2">
            Edição de Documento
          </h3>
          <h4 className="text-2xl font-semibold text-slate-800 tracking-tight">
            Texto Enriquecido
          </h4>
        </div>

        <div className="flex items-center gap-5">
          <span
            className={`text-xs font-medium flex items-center gap-1.5 transition-colors duration-300 ${
              autoSaveStatus === 'saving'
                ? 'text-indigo-500'
                : autoSaveStatus === 'error'
                  ? 'text-red-500'
                  : 'text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoSaveStatus === 'saving'
                  ? 'bg-indigo-400 animate-pulse'
                  : autoSaveStatus === 'error'
                    ? 'bg-red-400'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
              }`}
            />
            {statusLabel}
          </span>

          <button
            type="button"
            onClick={onSave}
            className={`px-6 py-2.5 text-white text-sm font-medium rounded-full shadow-lg shadow-black/10 transition-all flex items-center gap-2 ${
              saveButtonStatus === 'saved'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-[#18181b] hover:bg-[#27272a]'
            }`}
          >
            {saveButtonStatus === 'saving' ? (
              <>
                <Loader2 size={16} className="animate-spin text-white/70" />
                Finalizando...
              </>
            ) : saveButtonStatus === 'saved' ? (
              'Documento salvo'
            ) : (
              'Concluir Edição'
            )}
          </button>
        </div>
      </div>

      <div className="relative bg-white rounded-3xl shadow-sm ring-1 ring-slate-900/5 px-8 sm:px-16 md:px-24 py-12">
        <div className="sticky top-6 z-50 flex justify-center mb-10 pointer-events-none">
          <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-full px-2 py-1.5 flex flex-wrap items-center justify-center gap-1 transition-all max-w-full overflow-x-auto">
            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('undo'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500"
              title="Desfazer"
            >
              ↶
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('redo'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500"
              title="Refazer"
            >
              ↷
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('bold'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500 font-bold"
              title="Negrito"
            >
              B
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('italic'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500 italic"
              title="Itálico"
            >
              I
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('underline'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500 underline"
              title="Sublinhado"
            >
              U
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('strikeThrough'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500 line-through"
              title="Tachado"
            >
              S
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => formatBlock('H2'))}
              className="premium-toolbar-btn px-2.5 h-8 flex items-center justify-center rounded-full text-slate-500 font-serif font-semibold text-xs"
              title="Título H2"
            >
              H2
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => formatBlock('P'))}
              className="premium-toolbar-btn px-2.5 h-8 flex items-center justify-center rounded-full text-slate-500 font-medium text-xs"
              title="Parágrafo"
            >
              Parag.
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => formatBlock('BLOCKQUOTE'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500"
              title="Citação"
            >
              “
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('insertUnorderedList'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500"
              title="Lista com marcadores"
            >
              •
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('insertOrderedList'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-slate-500"
              title="Lista numerada"
            >
              1.
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, highlightText)}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
              title="Destacar"
            >
              ✦
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, insertLink)}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-blue-500 hover:text-blue-600 hover:bg-blue-50"
              title="Inserir link"
            >
              🔗
            </button>

            <button
              type="button"
              onMouseDown={(event) => handleToolbarMouseDown(event, () => runCommand('removeFormat'))}
              className="premium-toolbar-btn w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:text-red-500 hover:bg-red-50"
              title="Limpar formatação"
            >
              ⌫
            </button>
          </div>
        </div>

        <div
          ref={editorRef}
          id="base-transcript-editor"
          className="premium-editor-content"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={syncEditor}
          onBlur={syncEditor}
        />
      </div>
    </div>
  );
}

export default function AdvancedFlashcardPoC() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const GOOGLE_CALENDAR_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || '';
  const GOOGLE_CALENDAR_API_KEY = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY || '';
  const GOOGLE_CALENDAR_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
  const GOOGLE_CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
  const videoInputRef = useRef(null);
  const enrichmentVideoInputRef = useRef(null);
  const uploadSectionRef = useRef(null);
  const transcriptSectionRef = useRef(null);
  const flashcardsSectionRef = useRef(null);
  const evidenceSectionRef = useRef(null);
  const enrichedSectionRef = useRef(null);
  const metricsSectionRef = useRef(null);
  const historySectionRef = useRef(null);
  const historyDetailsSectionRef = useRef(null);
  const librarySectionRef = useRef(null);
  const studySessionSectionRef = useRef(null);
  const spacedReviewSectionRef = useRef(null);
  const [isSectionSidebarExpanded, setIsSectionSidebarExpanded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [enrichmentVideoFile, setEnrichmentVideoFile] = useState(null);
  const [enrichmentSupportTranscript, setEnrichmentSupportTranscript] = useState('');
  const [enrichmentSupportFilename, setEnrichmentSupportFilename] = useState('');
  const [enrichmentSupportVideoUrl, setEnrichmentSupportVideoUrl] = useState('');
  const [enrichmentSupportProcessedAt, setEnrichmentSupportProcessedAt] = useState(null);
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
  const [studySpecialty, setStudySpecialty] = useState('');
  const [studyTopic, setStudyTopic] = useState('');
  const [studyDeckId, setStudyDeckId] = useState('');
  const [currentStudyCardIndex, setCurrentStudyCardIndex] = useState(0);
  const [sortBy, setSortBy] = useState('newest');
  const [historySpecialtyFilter, setHistorySpecialtyFilter] = useState('');
  const [historyTopicFilter, setHistoryTopicFilter] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHistorySidebarExpanded, setIsHistorySidebarExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyHasMoreOnBackend, setHistoryHasMoreOnBackend] = useState(false);
  const [isHistoryDetailsOpen, setIsHistoryDetailsOpen] = useState(false);
  const [quickPreviewHistoryItem, setQuickPreviewHistoryItem] = useState(null);
  const [libraryDecks, setLibraryDecks] = useState([]);
  const [libraryCards, setLibraryCards] = useState([]);
  const [libraryViewMode, setLibraryViewMode] = useState('tree');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [expandedArchiveSpecialties, setExpandedArchiveSpecialties] = useState({});
  const [expandedArchiveTopics, setExpandedArchiveTopics] = useState({});
  const [expandedArchiveDecks, setExpandedArchiveDecks] = useState({});
  const [archiveSearch, setArchiveSearch] = useState('');
  const [selectedArchiveSpecialty, setSelectedArchiveSpecialty] = useState('');
  const [selectedArchiveTopic, setSelectedArchiveTopic] = useState('');
  const [selectedArchiveDeckId, setSelectedArchiveDeckId] = useState('');
  const [deckTree, setDeckTree] = useState([]);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState('');
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);

  const [moveTargetDeckId, setMoveTargetDeckId] = useState('');
  const [moveFolderDialog, setMoveFolderDialog] = useState(null);
  const [moveFolderTargetSpecialty, setMoveFolderTargetSpecialty] = useState(''); 
  const [isSchedulingFolderReview, setIsSchedulingFolderReview] = useState(false);
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
  const [previewLibraryCard, setPreviewLibraryCard] = useState(null);
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
  const [studyMode, setStudyMode] = useState('all');
  const [studyResponseFilter, setStudyResponseFilter] = useState('all');
  const [currentLibraryStudyIndex, setCurrentLibraryStudyIndex] = useState(0);
  const [isLibraryStudyFlipped, setIsLibraryStudyFlipped] = useState(false);
  const [isSavingLibraryReview, setIsSavingLibraryReview] = useState(false);
  const [spacedReviewQueue, setSpacedReviewQueue] = useState([]);
  const [spacedReviewMode, setSpacedReviewMode] = useState('today');
  const [reviewCalendarDate, setReviewCalendarDate] = useState(new Date());
  const [selectedReviewDate, setSelectedReviewDate] = useState(null);
  const [isGoogleCalendarReady, setIsGoogleCalendarReady] = useState(false);
  const [isGoogleCalendarConnected, setIsGoogleCalendarConnected] = useState(false);
  const [googleCalendarTokenClient, setGoogleCalendarTokenClient] = useState(null);
  const [googleCalendarEventsByDate, setGoogleCalendarEventsByDate] = useState({});
  const [isSyncingGoogleCalendar, setIsSyncingGoogleCalendar] = useState(false);
  const [currentSpacedReviewIndex, setCurrentSpacedReviewIndex] = useState(0);
  const [isSpacedReviewFlipped, setIsSpacedReviewFlipped] = useState(false);
  const [isBuildingSpacedReview, setIsBuildingSpacedReview] = useState(false);
  const [isSavingSpacedReview, setIsSavingSpacedReview] = useState(false);
  const [dailyReviewGoal, setDailyReviewGoal] = useState(30);
  const [spacedReviewStats, setSpacedReviewStats] = useState({
    totalSeen: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
  });
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
  const [enrichmentApprovalStatus, setEnrichmentApprovalStatus] = useState('idle');
  const [approvedEnrichedTranscript, setApprovedEnrichedTranscript] = useState('');
  const [transcriptSearchTerm, setTranscriptSearchTerm] = useState('');
  const [transcriptCopyStatus, setTranscriptCopyStatus] = useState('idle');
  const [compareInnerMode, setCompareInnerMode] = useState('original');
  const [isCompareSplitView, setIsCompareSplitView] = useState(false);
  const [expandedImprovementSuggestions, setExpandedImprovementSuggestions] = useState({});
  const [enrichedAutoSaveStatus, setEnrichedAutoSaveStatus] = useState('idle');
  const [editorSaveButtonStatus, setEditorSaveButtonStatus] = useState('idle');
  const [enrichedManualBlocks, setEnrichedManualBlocks] = useState([]);
  const [editingAppliedBlockId, setEditingAppliedBlockId] = useState(null);
  const [previewAppliedBlock, setPreviewAppliedBlock] = useState(null);
  const [editingAppliedBlockContent, setEditingAppliedBlockContent] = useState('');
  const [expandedAppliedPanels, setExpandedAppliedPanels] = useState({
    lacuna: true,
    sugestao: false,
  });
  const [isGeneratingMnemonicFlashcards, setIsGeneratingMnemonicFlashcards] = useState(false);
  const [mnemonicFlashcardsCreated, setMnemonicFlashcardsCreated] = useState(false);
  const [appliedEvidenceActionIds, setAppliedEvidenceActionIds] = useState({});
  const enrichedAutoSaveTimeoutRef = useRef(null);
  const baseTranscriptEditorRef = useRef(null);
  const baseTranscriptEditorLoadedValueRef = useRef('');
  const baseTranscriptEditorDraftRef = useRef('');
  const editorInputDebounceRef = useRef(null);
  const editorSaveButtonTimeoutRef = useRef(null);
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

  const hydrateEnrichmentSupportState = (source = {}) => {
    setEnrichmentSupportTranscript(
      source.enrichmentSupportTranscript ||
        source.enrichment_support_transcript ||
        ''
    );

    setEnrichmentSupportFilename(
      source.enrichmentSupportFilename ||
        source.enrichment_support_filename ||
        ''
    );

    setEnrichmentSupportVideoUrl(
      source.enrichmentSupportVideoUrl ||
        source.enrichment_support_video_url ||
        ''
    );

    setEnrichmentSupportProcessedAt(
      source.enrichmentSupportProcessedAt ||
        source.enrichment_support_processed_at ||
        null
    );
  };

  const resetAll = () => {
    setVideoFile(null);
    setEnrichmentVideoFile(null);
    setEnrichmentSupportTranscript('');
    setEnrichmentSupportFilename('');
    setEnrichmentSupportVideoUrl('');
    setEnrichmentSupportProcessedAt(null);
    setGenerateFlashcardsNow(true);
    setIsProcessing(false);
    setIsGeneratingSavedFlashcards(false);
    setMnemonicFlashcardsCreated(false);
    setTranscript('');
    setFlashcards([]);
    setCurrentRunId(null);
    setCurrentFilename('');
    setEditingAppliedBlockId(null);
    setEditingAppliedBlockContent('');
    setFlashcardsViewMode('grid');
    setCurrentStudyIndex(0);
    setIsFlipped(false);
    setError(null);
    setIsAnalyzingEvidence(false);
    setEvidenceAnalysis(null);
    setEvidenceSources([]);
    setReferenceVideos([]);
    setEnrichmentReferenceVideos([]);
    setEnrichmentApprovalStatus('idle');
    setApprovedEnrichedTranscript('');
    setTranscriptSearchTerm('');
    setTranscriptCopyStatus('idle');
    setCompareInnerMode('original');
    setIsCompareSplitView(false);
    setIsGeneratingEnrichedTranscript(false);
    setIsGeneratingEnrichedFlashcards(false);
    setEnrichedTranscript('');
    setEnrichedSummary(null);
    setEnrichedGeneratedAt(null);
    setEnrichedFlashcardsGeneratedAt(null);
    setPreviewAppliedBlock(null);
    setEnrichedAutoSaveStatus('idle');
    setEditorSaveButtonStatus('idle');
    setEnrichedManualBlocks([]);
    setIsGeneratingMnemonicFlashcards(false);
    setComparisonMode('enriched');

    setExpandedAppliedPanels({
      lacuna: true,
      sugestao: false,
    });

    if (enrichedAutoSaveTimeoutRef.current) {
      clearTimeout(enrichedAutoSaveTimeoutRef.current);
      enrichedAutoSaveTimeoutRef.current = null;
    }
    setReviewState({});
    setReviewStats({});
    setIsSavingReview(false);
    setCurrentSpecialty('');
    setCurrentSecondaryTopics([]);
    setCurrentAutoTags([]);
    setAppliedEvidenceActionIds({});

    baseTranscriptEditorLoadedValueRef.current = '';
    baseTranscriptEditorDraftRef.current = '';

    if (editorInputDebounceRef.current) {
      clearTimeout(editorInputDebounceRef.current);
      editorInputDebounceRef.current = null;
    }

    if (editorSaveButtonTimeoutRef.current) {
      clearTimeout(editorSaveButtonTimeoutRef.current);
      editorSaveButtonTimeoutRef.current = null;
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }

    if (enrichmentVideoInputRef.current) {
      enrichmentVideoInputRef.current.value = '';
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
    if (isGoogleCalendarConnected) {
      fetchGoogleCalendarReviewEvents();
    }
  }, [reviewCalendarDate, isGoogleCalendarConnected]);

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
    return () => {
      if (enrichedAutoSaveTimeoutRef.current) {
        clearTimeout(enrichedAutoSaveTimeoutRef.current);
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

  const enrichmentSupportWordCount = useMemo(() => {
    return enrichmentSupportTranscript.trim()
      ? enrichmentSupportTranscript.trim().split(/\s+/).length
      : 0;
  }, [enrichmentSupportTranscript]);

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

  useEffect(() => {
    checkGoogleCalendarStatus();

    const params = new URLSearchParams(window.location.search);
    const googleCalendarStatus = params.get('googleCalendar');

    if (googleCalendarStatus === 'connected') {
      setIsGoogleCalendarConnected(true);
      setIsGoogleCalendarReady(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (googleCalendarStatus === 'error') {
      const message = params.get('message') || 'Erro ao conectar Google Calendar.';
      setError(message);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

    if (historySpecialtyFilter) {
      result = result.filter((item) => item.specialty === historySpecialtyFilter);
    }

    if (historyTopicFilter) {
      result = result.filter((item) => {
        const secondaryTopics = Array.isArray(item.secondaryTopics)
          ? item.secondaryTopics
          : [];

        const autoTags = Array.isArray(item.autoTags)
          ? item.autoTags
          : [];

        return (
          secondaryTopics.includes(historyTopicFilter) ||
          autoTags.includes(historyTopicFilter)
        );
      });
    }

    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      result.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    return result;
  }, [
    historyData,
    currentFolder,
    filterType,
    sortBy,
    historySpecialtyFilter,
    historyTopicFilter,
  ]);

  const historySpecialtyOptions = useMemo(() => {
    const set = new Set();

    historyData.forEach((item) => {
      if (item.specialty) set.add(item.specialty);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [historyData]);

  const historyTopicOptions = useMemo(() => {
    const set = new Set();

    historyData.forEach((item) => {
      if (Array.isArray(item.secondaryTopics)) {
        item.secondaryTopics.forEach((topic) => {
          if (topic) set.add(topic);
        });
      }

      if (Array.isArray(item.autoTags)) {
        item.autoTags.forEach((tag) => {
          if (tag) set.add(tag);
        });
      }

      if (item.specialty && item.specialty === historySpecialtyFilter) {
        if (Array.isArray(item.secondaryTopics)) {
          item.secondaryTopics.forEach((topic) => {
            if (topic) set.add(topic);
          });
        }
      }
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [historyData, historySpecialtyFilter]);

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
  }, [
    currentFolder,
    filterType,
    sortBy,
    historySearch,
    historySpecialtyFilter,
    historyTopicFilter,
  ]);

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

  const openQuickPreviewHistoryItem = async (item) => {
    if (!item?.id) return;

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/history/${item.id}`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar prévia completa.');
      }

      const run = data.run || data;

      setQuickPreviewHistoryItem({
        ...item,
        transcript: run.transcript || item.preview || '',
        videoUrl: run.video_url || run.videoUrl || item.videoUrl || '',
        enrichedTranscript: run.enriched_transcript || run.enrichedTranscript || '',
      });
    } catch (err) {
      setError(`Falha ao abrir prévia: ${err.message}`);
    }
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
    if (!item?.id) return;

    const nextFavoriteValue = !item.isFavorite;

    setHistoryData((prev) =>
      prev.map((historyItem) =>
        historyItem.id === item.id
          ? { ...historyItem, isFavorite: nextFavoriteValue }
          : historyItem
      )
    );

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/history/${item.id}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_favorite: nextFavoriteValue,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar favorito.');
      }
    } catch (err) {
      setHistoryData((prev) =>
        prev.map((historyItem) =>
          historyItem.id === item.id
            ? { ...historyItem, isFavorite: item.isFavorite }
            : historyItem
        )
      );

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

      if (enrichmentVideoFile) {
        formData.append('enrichmentVideo', enrichmentVideoFile);
      }

      const response = await fetch(`${API_BASE}/api/process-video`, {
        method: 'POST',
        body: formData,
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar o vídeo.');
      }

      const savedRun = data.savedRun ?? null;
      hydrateEnrichmentSupportState(savedRun || data);

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
      hydrateEnrichmentSupportState(run);
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
      setEnrichedAutoSaveStatus('idle');
      setEnrichedManualBlocks([]);
      setEditingAppliedBlockId(null);
      setEditingAppliedBlockContent('');
      setAppliedEvidenceActionIds({});
      setMnemonicFlashcardsCreated(false);
      setComparisonMode('enriched');
      setExpandedAppliedPanels({
        lacuna: true,
        sugestao: false,
      });

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

      // ✅ garante scroll só até a seção de transcrição
      setTimeout(() => {
        transcriptSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 250);
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

      const loadedSummary = data.enrichedSummary || null;
      hydrateEnrichmentSupportState(data);

      setEnrichedTranscript(data.enrichedTranscript || '');
      setEnrichedSummary(loadedSummary);
      setEnrichedGeneratedAt(data.enrichedGeneratedAt || null);
      setEnrichedFlashcardsGeneratedAt(data.enrichedFlashcardsGeneratedAt || null);
      setEnrichmentReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);
      const loadedManualBlocks = Array.isArray(loadedSummary?.manual_blocks)
        ? loadedSummary.manual_blocks
        : [];

      setEnrichedManualBlocks(loadedManualBlocks);

      setAppliedEvidenceActionIds(
        loadedManualBlocks.reduce((acc, block) => {
          if (block?.actionId) {
            acc[block.actionId] = true;
          }

          return acc;
        }, {})
      );

      setEnrichedAutoSaveStatus('idle');

    } catch (err) {
      setEnrichedTranscript('');
      setEnrichedSummary(null);
      setEnrichedGeneratedAt(null);
      setEnrichedFlashcardsGeneratedAt(null);
      setEnrichmentReferenceVideos([]);
      setEnrichedManualBlocks([]);
      setEnrichedAutoSaveStatus('idle');
      console.error('Falha ao carregar enriquecimento salvo:', err.message);
    }
  };

  const normalizeEvidenceText = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;

    if (typeof value === 'string') return value.trim();

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeEvidenceText(item, ''))
        .filter(Boolean)
        .join('; ');
    }

    if (typeof value === 'object') {
      return String(
        value.topic ||
          value.title ||
          value.content ||
          value.text ||
          value.description ||
          value.addition_text ||
          value.correction_strategy ||
          JSON.stringify(value)
      ).trim();
    }

    return fallback;
  };

  const getMissingTopicTitle = (item, index) => {
    if (typeof item === 'string') return item;
    return normalizeEvidenceText(item, `Lacuna ${index + 1}`);
  };

  const getMissingTopicCorrection = (item, index) => {
    if (typeof item === 'string') {
      return `Corrigir a lacuna "${item}" adicionando uma explicação objetiva sobre definição, relevância clínica, como reconhecer, conduta prática, armadilhas de prova e relação com a aula original.`;
    }

    return (
      item?.correction_strategy ||
      item?.why_missing ||
      item?.content ||
      `Corrigir esta lacuna adicionando uma explicação prática e integrada ao texto enriquecido.`
    );
  };

  const getMissingTopicAdditionText = (item, index) => {
    const title = getMissingTopicTitle(item, index);

    if (item && typeof item === 'object' && item.addition_text) {
      return item.addition_text;
    }

    return `### Correção de lacuna: ${title}

  Este ponto deve ser incorporado ao texto enriquecido porque complementa a transcrição original e melhora a cobertura para revisão de residência médica. A correção deve explicar o conceito, sua relevância clínica, os critérios ou sinais principais, a conduta prática quando aplicável e as armadilhas comuns em prova ou na prática.

  Como integrar ao estudo:
  - Definir claramente o tema.
  - Explicar por que ele importa.
  - Relacionar com o conteúdo já dito na aula.
  - Destacar diferenças, contraindicações, exceções ou pegadinhas.
  - Transformar o ponto em flashcards objetivos depois da revisão.`;
  };

  const getSuggestionTitle = (item, index) => {
    if (typeof item === 'string') return `Sugestão ${index + 1}`;

    return normalizeEvidenceText(
      item?.title || item?.topic || item?.name,
      `Sugestão ${index + 1}`
    );
  };

  const getSuggestionContent = (item) => {
    if (typeof item === 'string') return item;

    return normalizeEvidenceText(
      item?.content || item?.suggestion || item?.description || item?.text,
      'Melhoria sugerida pela análise de evidência.'
    );
  };

  const getSuggestionWhy = (item) => {
    if (typeof item === 'string') return '';

    return normalizeEvidenceText(
      item?.why_it_matters || item?.why || item?.rationale || item?.impact,
      ''
    );
  };

  const getSourceNumbers = (item) => {
    if (!item || typeof item !== 'object') return [];

    if (Array.isArray(item.source_numbers)) return item.source_numbers;
    if (Array.isArray(item.sources)) return item.sources;

    return [];
  };

  const getSuggestionImplementation = (item, index) => {
    const title = getSuggestionTitle(item, index);
    const content = getSuggestionContent(item);
    const why = getSuggestionWhy(item);
    const finalText = buildCleanSuggestionInsertion(item, index);

    return {
      title,
      content,
      why,
      howToApply:
        'Esta sugestão será incorporada como conteúdo didático no texto enriquecido, sem inserir o relatório bruto da análise. O objetivo é melhorar a explicação do tema dentro do próprio material de estudo.',
      finalText,
    };
  };

  const toggleImprovementSuggestionDetails = (index) => {
    setExpandedImprovementSuggestions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const buildUpdatedEnrichedSummary = (nextManualBlocks) => ({
    ...(enrichedSummary || {}),
    manual_blocks: nextManualBlocks,
    manually_edited: true,
    manual_last_saved_at: new Date().toISOString(),
  });

  const saveEnrichedTranscriptDraft = async (
    nextTranscript = enrichedTranscript,
    nextSummary = enrichedSummary,
    nextManualBlocks = enrichedManualBlocks
  ) => {
    if (!currentRunId) {
      setEnrichedAutoSaveStatus('idle');
      return;
    }

    try {
      setEnrichedAutoSaveStatus('saving');

      const response = await fetch(`${API_BASE}/api/enrich-run/${currentRunId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrichedTranscript: nextTranscript,
          enrichedSummary: {
            ...(nextSummary || {}),
            manual_blocks: nextManualBlocks,
            manually_edited: true,
            manual_last_saved_at: new Date().toISOString(),
          },
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar texto enriquecido.');
      }

      const savedSummary = data.enrichedSummary || nextSummary || null;

      setEnrichedSummary(savedSummary);
      setEnrichedGeneratedAt(data.enrichedGeneratedAt || new Date().toISOString());
      setEnrichedManualBlocks(
        Array.isArray(savedSummary?.manual_blocks) ? savedSummary.manual_blocks : nextManualBlocks
      );
      setEnrichedAutoSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setEnrichedAutoSaveStatus('error');
      setError(`Falha ao salvar texto enriquecido: ${err.message}`);
    }
  };

  const scheduleEnrichedAutoSave = (
    nextTranscript,
    nextSummary = enrichedSummary,
    nextManualBlocks = enrichedManualBlocks
  ) => {
    if (enrichedAutoSaveTimeoutRef.current) {
      clearTimeout(enrichedAutoSaveTimeoutRef.current);
    }

    setEnrichedAutoSaveStatus('saving');

    enrichedAutoSaveTimeoutRef.current = setTimeout(() => {
      enrichedAutoSaveTimeoutRef.current = null;
      saveEnrichedTranscriptDraft(nextTranscript, nextSummary, nextManualBlocks);
    }, 900);
  };

  const handleEnrichedTranscriptChange = (event) => {
    const nextValue = event.target.value;
    setEnrichedTranscript(nextValue);
    scheduleEnrichedAutoSave(nextValue);
  };

  const toggleAppliedPanel = (panel) => {
    setExpandedAppliedPanels((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  };

  const getTextKeywords = (value = '') => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 5)
      .filter(
        (word) =>
          ![
            'sobre',
            'forma',
            'texto',
            'lacuna',
            'melhoria',
            'adicionada',
            'corrigida',
            'analise',
            'evidencia',
            'clinica',
          ].includes(word)
      )
      .slice(0, 12);
  };

  const insertEvidenceBlockIntelligently = (baseText, blockText, title = '') => {
    const cleanBase = String(baseText || '').trim();
    const cleanBlock = String(blockText || '').trim();

    if (!cleanBase) return cleanBlock;
    if (!cleanBlock) return cleanBase;

    const paragraphs = cleanBase
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (!paragraphs.length) {
      return `${cleanBase}\n\n${cleanBlock}`.trim();
    }

    const keywords = getTextKeywords(title);

    if (!keywords.length) {
      return `${cleanBase}\n\n${cleanBlock}`.trim();
    }

    let bestIndex = -1;
    let bestScore = 0;

    paragraphs.forEach((paragraph, index) => {
      const normalizedParagraph = paragraph
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      const score = keywords.reduce((sum, keyword) => {
        return normalizedParagraph.includes(keyword) ? sum + 1 : sum;
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex === -1 || bestScore === 0) {
      return `${cleanBase}\n\n${cleanBlock}`.trim();
    }

    const nextParagraphs = [...paragraphs];
    nextParagraphs.splice(bestIndex + 1, 0, cleanBlock);

    return nextParagraphs.join('\n\n').trim();
  };

  const appendEvidenceBlockToEnrichedText = ({ type, title, blockText, actionId = null }) => {
    const safeBlock = String(blockText || '').trim();

    if (!safeBlock) return;

    const nextBlock = {
      id: `${type}-${Date.now()}`,
      actionId,
      type,
      title,
      content: safeBlock,
      created_at: new Date().toISOString(),
    };

    const nextManualBlocks = [...enrichedManualBlocks, nextBlock];
    const nextSummary = buildUpdatedEnrichedSummary(nextManualBlocks);

    const baseTextForInsertion = enrichedTranscript.trim() || transcript.trim();

    const nextTranscript = insertEvidenceBlockIntelligently(
      baseTextForInsertion,
      safeBlock,
      title
    );

    setEnrichedTranscript(nextTranscript);
    setEnrichedManualBlocks(nextManualBlocks);
    setEnrichedSummary(nextSummary);
    setComparisonMode('enriched');

    if (actionId) {
      setAppliedEvidenceActionIds((prev) => ({
        ...prev,
        [actionId]: true,
      }));
    }

    scheduleEnrichedAutoSave(nextTranscript, nextSummary, nextManualBlocks);
  };

  const removeAppliedEnrichmentBlock = (blockId) => {
    const blockToRemove = enrichedManualBlocks.find((block) => block.id === blockId);
    if (!blockToRemove) return;

    const nextManualBlocks = enrichedManualBlocks.filter((block) => block.id !== blockId);

    const nextTranscript = String(enrichedTranscript || '')
      .replace(blockToRemove.content, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const nextSummary = buildUpdatedEnrichedSummary(nextManualBlocks);

    setEnrichedTranscript(nextTranscript);
    setEnrichedManualBlocks(nextManualBlocks);
    setEnrichedSummary(nextSummary);

    if (blockToRemove.actionId) {
      setAppliedEvidenceActionIds((prev) => {
        const next = { ...prev };
        delete next[blockToRemove.actionId];
        return next;
      });
    }

    scheduleEnrichedAutoSave(nextTranscript, nextSummary, nextManualBlocks);
  };

  const startEditingAppliedBlock = (block) => {
    setEditingAppliedBlockId(block.id);
    setEditingAppliedBlockContent(block.content || '');
  };

  const cancelEditingAppliedBlock = () => {
    setEditingAppliedBlockId(null);
    setEditingAppliedBlockContent('');
  };

  const saveEditingAppliedBlock = (blockId) => {
    const oldBlock = enrichedManualBlocks.find((block) => block.id === blockId);
    if (!oldBlock) return;

    const nextContent = editingAppliedBlockContent.trim();
    if (!nextContent) return;

    const nextManualBlocks = enrichedManualBlocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            content: nextContent,
            updated_at: new Date().toISOString(),
          }
        : block
    );

    const nextTranscript = String(enrichedTranscript || '').includes(oldBlock.content)
      ? String(enrichedTranscript || '').replace(oldBlock.content, nextContent)
      : insertEvidenceBlockIntelligently(enrichedTranscript, nextContent, oldBlock.title);

      const nextSummary = buildUpdatedEnrichedSummary(nextManualBlocks);

      setEnrichedTranscript(nextTranscript);
      setEnrichedManualBlocks(nextManualBlocks);
      setEnrichedSummary(nextSummary);
      setEditingAppliedBlockId(null);
      setEditingAppliedBlockContent('');

      scheduleEnrichedAutoSave(nextTranscript, nextSummary, nextManualBlocks);
    };

    const buildCleanMissingTopicInsertion = (item, index) => {
      const title = getMissingTopicTitle(item, index);

      const raw =
        stripAppliedMetaText(item?.addition_text || '', { keepMainBody: true }) ||
        stripAppliedMetaText(getMissingTopicCorrection(item, index), { keepMainBody: true });

      const body = String(raw || '')
        .replace(/^corrigir (a|esta) lacuna\s*/i, '')
        .replace(/^["“”]/, '')
        .replace(/["”]\s*$/, '')
        .replace(/adicionando uma explicação objetiva sobre\s*/i, 'Explique de forma objetiva ')
        .replace(/\s+/g, ' ')
        .trim();

      return [
        `## ${title}`,
        '',
        body ||
          `Explique ${title} de forma estruturada, destacando definição, relevância clínica, reconhecimento, conduta prática e armadilhas de prova.`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
    };

    const buildCleanSuggestionInsertion = (item, index) => {
      const title = getSuggestionTitle(item, index);
      const body = stripAppliedMetaText(getSuggestionContent(item), { keepMainBody: true });

      return [`## ${title}`, '', body]
        .filter(Boolean)
        .join('\n')
        .trim();
    };

  const applyMissingTopicToEnrichedText = (item, index) => {
    const title = getMissingTopicTitle(item, index);
    const cleanInsertion = buildCleanMissingTopicInsertion(item, index);

    appendEvidenceBlockToEnrichedText({
      type: 'lacuna',
      title,
      actionId: `lacuna-${index}`,
      blockText: cleanInsertion,
    });
  };

  const applySuggestionToEnrichedText = (item, index) => {
    const title = getSuggestionTitle(item, index);
    const finalText = buildCleanSuggestionInsertion(item, index);

    appendEvidenceBlockToEnrichedText({
      type: 'sugestao',
      title,
      actionId: `sugestao-${index}`,
      blockText: finalText,
    });
  };

  const insertEditorPattern = (pattern) => {
    const nextTranscript = `${enrichedTranscript.trim() ? `${enrichedTranscript.trim()}\n\n` : ''}${pattern}`.trim();
    setEnrichedTranscript(nextTranscript);
    scheduleEnrichedAutoSave(nextTranscript);
  };

  const cleanEnrichedTextSpacing = () => {
    const nextTranscript = enrichedTranscript
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    setEnrichedTranscript(nextTranscript);
    scheduleEnrichedAutoSave(nextTranscript);
  };

  const generateMnemonicFlashcardsFromCurrentRun = async () => {
    if (!currentRunId) {
      setError('Nenhuma transcrição salva está aberta.');
      return;
    }

    setIsGeneratingMnemonicFlashcards(true);
    setError(null);
    setMnemonicFlashcardsCreated(false);

    try {
      const response = await fetch(
        `${API_BASE}/api/generate-mnemonic-flashcards-from-run/${currentRunId}`,
        { method: 'POST' }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar flashcards dos mnemônicos.');
      }

      setFlashcards(normalizeFlashcards(data.flashcards || data.mnemonicFlashcards || []));
      setEnrichedFlashcardsGeneratedAt(data.enrichedFlashcardsGeneratedAt || null);
      setFlashcardsViewMode('grid');
      setMnemonicFlashcardsCreated(true);

      loadHistoryDebounced(historySearch);
    } catch (err) {
      setError(`Falha ao gerar flashcards dos mnemônicos: ${err.message}`);
    } finally {
      setIsGeneratingMnemonicFlashcards(false);
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

      const generatedSummary = data.enrichedSummary || null;

      setEnrichedTranscript(data.enrichedTranscript || '');
      setEnrichedSummary(generatedSummary);
      setEnrichedGeneratedAt(data.enrichedGeneratedAt || null);
      setEnrichmentReferenceVideos(Array.isArray(data.referenceVideos) ? data.referenceVideos : []);
      setEnrichedManualBlocks(
        Array.isArray(generatedSummary?.manual_blocks) ? generatedSummary.manual_blocks : []
      );
      setEnrichedAutoSaveStatus('saved');

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

      params.set('limit', '500');

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
          sub_specialty: newDeckSubSpecialty.trim() || null,
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

  const createArchiveFolder = async ({ level, specialtyName = '', topicName = '', parentDeckId = null }) => {
    const folderName = window.prompt('Nome da nova pasta:');

    if (!folderName || !folderName.trim()) return;

    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/flashcard-decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName.trim(),
          specialty: level === 'specialty' ? folderName.trim() : specialtyName,
          sub_specialty: level === 'topic' ? folderName.trim() : topicName || '',
          parent_deck_id: parentDeckId || null,
          deck_type:
            level === 'specialty'
              ? 'specialty-root'
              : level === 'topic'
                ? 'sub-specialty'
                : 'leaf-deck',
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar pasta.');
      }

      await refreshLibraryData();

      if (level === 'specialty') {
        setExpandedArchiveSpecialties((prev) => ({
          ...prev,
          [`specialty:${folderName.trim()}`]: true,
        }));
      }

      if (level === 'topic') {
        setExpandedArchiveSpecialties((prev) => ({
          ...prev,
          [`specialty:${specialtyName}`]: true,
        }));

        setExpandedArchiveTopics((prev) => ({
          ...prev,
          [`specialty:${specialtyName}:${folderName.trim()}`]: true,
        }));
      }
    } catch (err) {
      setError(`Falha ao criar pasta: ${err.message}`);
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

  const getLibraryCardReviewStats = (card) => {
    return card?.review_stats || {};
  };

  const getLibraryCardReviewState = (card) => {
    return card?.review_state || {};
  };

  const hasLibraryCardBeenStudied = (card) => {
    const stats = getLibraryCardReviewStats(card);
    const state = getLibraryCardReviewState(card);

    return (
      Number(stats.totalReviewed || 0) > 0 ||
      Boolean(stats.lastReviewedAt) ||
      Boolean(state.lastReviewedAt)
    );
  };

  const isLibraryCardDueForStudy = (card) => {
    const state = getLibraryCardReviewState(card);
    if (!state.dueAt) return false;

    return new Date(state.dueAt) <= new Date();
  };

  const isLibraryCardNewForStudy = (card) => {
    return !hasLibraryCardBeenStudied(card);
  };

  const getLibraryStudyLastGrade = (card) => {
    const state = getLibraryCardReviewState(card);
    return Number(state?.lastGrade || 0);
  };

  const getLibraryStudyResponseMeta = (input) => {
    const grade = typeof input === 'number' ? Number(input) : getLibraryStudyLastGrade(input);

    if (grade === 1) {
      return {
        grade,
        label: 'Errei',
        longLabel: 'Respondido como: Errei',
        chipClass: 'border border-red-200 bg-red-50 text-red-700',
        panelClass: 'border-red-200 bg-gradient-to-b from-red-50/80 to-white',
        accentClass: 'text-red-600',
      };
    }

    if (grade === 2) {
      return {
        grade,
        label: 'Difícil',
        longLabel: 'Respondido como: Difícil',
        chipClass: 'border border-amber-200 bg-amber-50 text-amber-700',
        panelClass: 'border-amber-200 bg-gradient-to-b from-amber-50/80 to-white',
        accentClass: 'text-amber-600',
      };
    }

    if (grade === 3) {
      return {
        grade,
        label: 'Bom',
        longLabel: 'Respondido como: Bom',
        chipClass: 'border border-blue-200 bg-blue-50 text-blue-700',
        panelClass: 'border-blue-200 bg-gradient-to-b from-blue-50/80 to-white',
        accentClass: 'text-blue-600',
      };
    }

    if (grade === 4) {
      return {
        grade,
        label: 'Fácil',
        longLabel: 'Respondido como: Fácil',
        chipClass: 'border border-green-200 bg-green-50 text-green-700',
        panelClass: 'border-green-200 bg-gradient-to-b from-green-50/80 to-white',
        accentClass: 'text-green-600',
      };
    }

    return {
      grade: 0,
      label: 'Não respondido',
      longLabel: 'Ainda não respondido',
      chipClass: 'border border-slate-200 bg-slate-100 text-slate-600',
      panelClass: 'border-slate-200 bg-white',
      accentClass: 'text-slate-500',
    };
  };

  const cardMatchesStudyResponseFilter = (card, filterValue) => {
    const grade = getLibraryStudyLastGrade(card);

    if (filterValue === 'all') return true;
    if (filterValue === 'unanswered') return grade === 0;
    if (filterValue === 'again') return grade === 1;
    if (filterValue === 'hard') return grade === 2;
    if (filterValue === 'good') return grade === 3;
    if (filterValue === 'easy') return grade === 4;

    return true;
  };

  const sortStudyQueueByUnansweredFirst = (cards = []) => {
    return [...cards].sort((a, b) => {
      const gradeA = getLibraryStudyLastGrade(a);
      const gradeB = getLibraryStudyLastGrade(b);

      const answeredA = gradeA > 0 ? 1 : 0;
      const answeredB = gradeB > 0 ? 1 : 0;

      if (answeredA !== answeredB) {
        return answeredA - answeredB; // não respondidos primeiro
      }

      const lastReviewedA = new Date(getLibraryCardReviewState(a)?.lastReviewedAt || 0).getTime();
      const lastReviewedB = new Date(getLibraryCardReviewState(b)?.lastReviewedAt || 0).getTime();

      return lastReviewedA - lastReviewedB;
    });
  };

  const cardMatchesStudyTopic = (card, topic) => {
    const normalizedTopic = String(topic || '').trim().toLowerCase();

    if (!normalizedTopic) return true;

    const tags = Array.isArray(card?.tags) ? card.tags : [];

    const values = [
      card?.sub_specialty,
      card?.study_tag,
      card?.specialty,
      ...(tags || []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return values.some(
      (value) =>
        value === normalizedTopic ||
        value.includes(normalizedTopic)
    );
  };

  const fetchLibraryCardsDirectly = async ({
    deckId = '',
    specialty = '',
    favorites = false,
    dueOnly = false,
    search = '',
    limit = 500,
  } = {}) => {
    const params = new URLSearchParams();

    if (String(deckId || '').trim()) params.set('deckId', String(deckId).trim());
    if (String(specialty || '').trim()) params.set('specialty', String(specialty).trim());
    if (favorites) params.set('favorites', 'true');
    if (dueOnly) params.set('dueOnly', 'true');
    if (String(search || '').trim()) params.set('search', String(search).trim());
    if (Number(limit)) params.set('limit', String(limit));

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
      setError(null);

      const normalizedMode = mode || 'all';

      const baseCards = await fetchLibraryCardsDirectly({
        deckId: normalizedMode === 'deck' ? selectedDeckId : '',
        specialty: studySpecialty,
        favorites: normalizedMode === 'favorites',
        dueOnly: false,
        search: '',
        limit: 500,
      });

      let queue = [...baseCards];

      if (normalizedMode === 'due') {
        queue = queue.filter(isLibraryCardDueForStudy);
      }

      if (normalizedMode === 'new') {
        queue = queue.filter(isLibraryCardNewForStudy);
      }

      if (studyTopic) {
        queue = queue.filter((card) => cardMatchesStudyTopic(card, studyTopic));
      }

      if (normalizedMode === 'deck' && selectedDeckId) {
        queue = queue.filter((card) => String(card.deck_id) === String(selectedDeckId));
      }

      queue = queue.filter((card) => cardMatchesStudyResponseFilter(card, studyResponseFilter));

      if (studyResponseFilter === 'all') {
        queue = sortStudyQueueByUnansweredFirst(queue);
      }

      setStudyMode(normalizedMode);
      setLibraryCards(baseCards);
      setStudyQueue(queue);
      setCurrentLibraryStudyIndex(0);
      setCurrentStudyCardIndex(0);
      setIsLibraryStudyFlipped(false);

      if (!queue.length) {
        const modeLabel =
          normalizedMode === 'due'
            ? 'vencidos'
            : normalizedMode === 'favorites'
              ? 'favoritos'
              : normalizedMode === 'new'
                ? 'novos'
                : normalizedMode === 'deck'
                  ? 'do deck selecionado'
                  : 'disponíveis';

        setError(`Nenhum flashcard ${modeLabel} foi encontrado com os filtros atuais.`);
      }
    } catch (err) {
      setStudyQueue([]);
      setCurrentLibraryStudyIndex(0);
      setError(`Falha ao montar sessão de estudo: ${err.message}`);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const calculatePersistedStudyStats = (cards = []) => {
    return cards.reduce(
      (acc, card) => {
        const stats = card?.review_stats || {};

        acc.totalSeen += Number(stats.totalReviewed || 0);
        acc.correctCount += Number(stats.correctCount || 0);
        acc.hardCount += Number(stats.hardCount || 0);
        acc.easyCount += Number(stats.easyCount || 0);

        return acc;
      },
      {
        totalSeen: 0,
        correctCount: 0,
        hardCount: 0,
        easyCount: 0,
      }
    );
  };

  const buildNextLibraryReviewState = (card, grade) => {
    return calculateNextSpacedReviewState(card, grade);
  };

  const rateLibraryStudyCard = async (grade) => {
    if (!currentLibraryStudyCard || isSavingLibraryReview) return;

    const nextReviewState = buildNextLibraryReviewState(currentLibraryStudyCard, grade);

    const previousStats = currentLibraryStudyCard.review_stats || {};
    const nextReviewStats = {
      ...previousStats,
      totalReviewed: Number(previousStats.totalReviewed || 0) + 1,
      correctCount: Number(previousStats.correctCount || 0) + (grade >= 3 ? 1 : 0),
      wrongCount: Number(previousStats.wrongCount || 0) + (grade === 1 ? 1 : 0),
      hardCount: Number(previousStats.hardCount || 0) + (grade === 2 ? 1 : 0),
      goodCount: Number(previousStats.goodCount || 0) + (grade === 3 ? 1 : 0),
      easyCount: Number(previousStats.easyCount || 0) + (grade === 4 ? 1 : 0),
      lastReviewedAt: new Date().toISOString(),
    };

    const updatedCard = {
      ...currentLibraryStudyCard,
      review_state: nextReviewState,
      review_stats: nextReviewStats,
    };

    try {
      setIsSavingLibraryReview(true);
      setError(null);

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
            session_source: 'library-study',
          }),
        }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar revisão.');
      }

      setStudyQueue((prev) =>
        prev.map((card) =>
          card.id === currentLibraryStudyCard.id ? updatedCard : card
        )
      );

      setLibraryCards((prev) =>
        prev.map((card) =>
          card.id === currentLibraryStudyCard.id ? updatedCard : card
        )
      );

      setStudySessionStats((prev) => ({
        totalSeen: prev.totalSeen + 1,
        correctCount: prev.correctCount + (grade >= 3 ? 1 : 0),
        hardCount: prev.hardCount + (grade === 2 ? 1 : 0),
        easyCount: prev.easyCount + (grade === 4 ? 1 : 0),
      }));

      setIsLibraryStudyFlipped(false);

      setTimeout(() => {
        setCurrentLibraryStudyIndex((prev) => prev + 1);
      }, 150);

      if (isGoogleCalendarConnected) {
        scheduleSmartReviews(updatedCard).catch((err) => {
          console.warn('⚠️ Falha ao agendar revisão inteligente:', err.message);
        });

        fetchGoogleCalendarReviewEvents().catch((err) => {
          console.warn('⚠️ Falha ao atualizar eventos do Google Calendar:', err.message);
        });
      }
    } catch (err) {
      setError(`Falha ao registrar revisão da biblioteca: ${err.message}`);
    } finally {
      setIsSavingLibraryReview(false);
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

  const archiveTree = useMemo(() => {
    const specialtyMap = new Map();

    const ensureSpecialty = (specialtyName) => {
      const safeSpecialty = specialtyName || 'Sem especialidade';

      if (!specialtyMap.has(safeSpecialty)) {
        specialtyMap.set(safeSpecialty, {
          id: `specialty:${safeSpecialty}`,
          name: safeSpecialty,
          cardCount: 0,
          topics: new Map(),
        });
      }

      return specialtyMap.get(safeSpecialty);
    };

    const ensureTopic = (specialty, specialtyName, topicName) => {
      const safeTopic = topicName || '';

      if (!safeTopic) return null;

      if (!specialty.topics.has(safeTopic)) {
        specialty.topics.set(safeTopic, {
          id: `topic:${specialtyName}:${safeTopic}`,
          name: safeTopic,
          cardCount: 0,
          decks: new Map(),
        });
      }

      return specialty.topics.get(safeTopic);
    };

    const ensureDeck = (topic, deckId, deckName) => {
      if (!topic) return null;

      const safeDeckId = deckId || 'sem-deck';

      if (!topic.decks.has(safeDeckId)) {
        topic.decks.set(safeDeckId, {
          id: safeDeckId,
          name: deckName || 'Sem deck',
          cards: [],
        });
      }

      return topic.decks.get(safeDeckId);
    };

    libraryDecks.forEach((deck) => {
      const specialtyName = deck.specialty || 'Sem especialidade';
      const specialty = ensureSpecialty(specialtyName);

      if (deck.deck_type === 'specialty-root') return;

      const topicName = deck.sub_specialty || '';

      if (!topicName) return;

      const topic = ensureTopic(specialty, specialtyName, topicName);

      if (deck.deck_type === 'sub-specialty' || deck.deck_type === 'theme') return;

      ensureDeck(topic, deck.id, deck.name);
    });

    const deckMap = new Map();
    libraryDecks.forEach((deck) => {
      deckMap.set(deck.id, deck);
    });

    smartFilteredCards.forEach((card) => {
      const deck = deckMap.get(card.deck_id);
      const specialtyName = card.specialty || deck?.specialty || 'Sem especialidade';
      const topicName = card.sub_specialty || deck?.sub_specialty || '';

      const specialty = ensureSpecialty(specialtyName);
      specialty.cardCount += 1;

      const topic = ensureTopic(specialty, specialtyName, topicName || 'Sem tema');
      if (!topic) return;

      topic.cardCount += 1;

      const deckNode = ensureDeck(topic, card.deck_id || 'sem-deck', deck?.name || 'Sem deck');
      if (deckNode) deckNode.cards.push(card);
    });

    return Array.from(specialtyMap.values())
      .filter((specialty) => {
        if (specialty.name !== 'Sem especialidade') return true;
        return specialty.cardCount > 0 || specialty.topics.size > 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((specialty) => ({
        ...specialty,
        topics: Array.from(specialty.topics.values())
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((topic) => ({
            ...topic,
            decks: Array.from(topic.decks.values()).sort((a, b) =>
              a.name.localeCompare(b.name, 'pt-BR')
            ),
          })),
      }));
  }, [libraryDecks, smartFilteredCards]);

  const openLibraryCardPreview = (card) => {
    if (!card) return;
    setPreviewLibraryCard(card);
  };

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

  const refreshLibraryData = async () => {
    await loadLibraryDecks();
    await loadDeckTree();
    await loadLibraryCards({
      deckId: selectedDeckId,
      specialty: librarySpecialtyFilter,
      favorites: libraryMode === 'favorites',
      dueOnly: libraryMode === 'due',
      search: librarySearch,
    });
    await loadLibraryAnalytics();
  };

  const getDueDateNowState = (card) => ({
    ...normalizeReviewStateForSpacedReview(card),
    status: 'due',
    dueAt: new Date().toISOString(),
  });

  const patchLibraryCardsBulk = async (cards = [], buildPayload) => {
    const validCards = cards.filter((card) => card?.id);

    await Promise.all(
      validCards.map((card) =>
        fetch(`${API_BASE}/api/flashcards-library/${card.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(card)),
        }).then(async (response) => {
          const data = await parseResponseSafely(response);
          if (!response.ok) {
            throw new Error(data.error || 'Erro ao atualizar flashcards da pasta.');
          }
          return data;
        })
      )
    );
  };

  const viewArchiveFolder = async ({ cards = [], deckId = '', specialty = '' }) => {
    const safeCards = Array.isArray(cards) ? cards.filter((card) => card?.id) : [];

    if (!safeCards.length) {
      setError('Essa pasta não possui flashcards para estudar.');
      return;
    }

    setActiveSmartDeck(null);
    setLibraryMode('deck');
    setStudyMode('deck');

    if (deckId && deckId !== 'sem-deck') {
      setSelectedDeckId(deckId);
    } else {
      setSelectedDeckId('');
      setLibrarySpecialtyFilter(specialty || '');
    }

    setLibraryCards(safeCards);
    setStudyQueue(safeCards);
    setCurrentLibraryStudyIndex(0);
    setIsLibraryStudyFlipped(false);

    setTimeout(() => {
      studySessionSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  };

  const scheduleArchiveFolderForReview = async (cards = []) => {
    if (!cards.length) {
      setError('Essa pasta não possui flashcards para agendar.');
      return;
    }

    const confirmed = window.confirm(
      `Agendar ${cards.length} flashcards desta pasta para revisão hoje?`
    );

    if (!confirmed) return;

    try {
      setIsSchedulingFolderReview(true);
      setError(null);

      await patchLibraryCardsBulk(cards, (card) => ({
        review_state: getDueDateNowState(card),
      }));

      await refreshLibraryData();
    } catch (err) {
      setError(`Falha ao agendar pasta para revisão: ${err.message}`);
    } finally {
      setIsSchedulingFolderReview(false);
    }
  };

  const renameArchiveFolder = async ({
    type,
    id,
    currentName,
    specialtyName = '',
    cards = [],
  }) => {
    const nextName = window.prompt('Novo nome da pasta:', currentName || '');

    if (!nextName || !nextName.trim()) return;

    const cleanName = nextName.trim();

    try {
      setError(null);

      if (type === 'deck' && id && id !== 'sem-deck') {
        const response = await fetch(`${API_BASE}/api/flashcard-decks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName }),
        });

        const data = await parseResponseSafely(response);
        if (!response.ok) throw new Error(data.error || 'Erro ao renomear deck.');
      }

      if (type === 'topic') {
        if (cards.length) {
          await patchLibraryCardsBulk(cards, () => ({
            sub_specialty: cleanName,
          }));
        }

        await Promise.all(
          libraryDecks
            .filter(
              (deck) =>
                (deck.specialty || 'Sem especialidade') === specialtyName &&
                (deck.sub_specialty || '') === currentName
            )
            .map((deck) =>
              fetch(`${API_BASE}/api/flashcard-decks/${deck.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sub_specialty: cleanName,
                  name: deck.deck_type === 'sub-specialty' ? cleanName : deck.name,
                }),
              }).then(async (response) => {
                const data = await parseResponseSafely(response);
                if (!response.ok) throw new Error(data.error || 'Erro ao renomear subpasta.');
                return data;
              })
            )
        );
      }

      if (type === 'specialty') {
        if (cards.length) {
          await patchLibraryCardsBulk(cards, () => ({
            specialty: cleanName,
          }));
        }

        await Promise.all(
          libraryDecks
            .filter((deck) => (deck.specialty || 'Sem especialidade') === currentName)
            .map((deck) =>
              fetch(`${API_BASE}/api/flashcard-decks/${deck.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  specialty: cleanName === 'Sem especialidade' ? null : cleanName,
                  name: deck.deck_type === 'specialty-root' ? cleanName : deck.name,
                }),
              }).then(async (response) => {
                const data = await parseResponseSafely(response);
                if (!response.ok) throw new Error(data.error || 'Erro ao renomear pasta.');
                return data;
              })
            )
        );
      }

      await refreshLibraryData();
    } catch (err) {
      setError(`Falha ao renomear pasta: ${err.message}`);
    }
  };

  const openMoveFolderDialog = ({ type, id = '', name, cards = [], specialtyName = '' }) => {
    setMoveFolderDialog({
      type,
      id,
      name,
      cards,
      specialtyName,
    });
    setMoveFolderTargetSpecialty('');
  };

  const confirmMoveFolder = async () => {
    if (!moveFolderDialog) return;

    const target = String(moveFolderTargetSpecialty || '').trim();

    if (!target) {
      setError('Selecione uma pasta de destino.');
      return;
    }

    try {
      setError(null);

      const { type, name, cards = [], specialtyName = '' } = moveFolderDialog;
      const sourceSpecialty = specialtyName || name;

      if (cards.length) {
        await patchLibraryCardsBulk(cards, () => ({
          specialty: target === 'Sem especialidade' ? null : target,
        }));
      }

      if (type === 'specialty') {
        const decksToMove = libraryDecks.filter((deck) => {
          const deckSpecialty = String(deck.specialty || '').trim();
          return name === 'Sem especialidade'
            ? !deckSpecialty
            : deckSpecialty === name;
        });

        await Promise.all(
          decksToMove.map((deck) =>
              fetch(`${API_BASE}/api/flashcard-decks/${deck.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  specialty: target === 'Sem especialidade' ? null : target,
                }),
              }).then(async (response) => {
                const data = await parseResponseSafely(response);
                if (!response.ok) throw new Error(data.error || 'Erro ao mover pasta.');
                return data;
              })
            )
        );
      }

      if (type === 'topic') {
        await Promise.all(
          libraryDecks
            .filter(
              (deck) =>
                (deck.specialty || 'Sem especialidade') === sourceSpecialty &&
                (deck.sub_specialty || '') === name
            )
            .map((deck) =>
              fetch(`${API_BASE}/api/flashcard-decks/${deck.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  specialty: target === 'Sem especialidade' ? null : target,
                }),
              }).then(async (response) => {
                const data = await parseResponseSafely(response);
                if (!response.ok) throw new Error(data.error || 'Erro ao mover subpasta.');
                return data;
              })
            )
        );
      }

      setMoveFolderDialog(null);
      setMoveFolderTargetSpecialty('');
      await refreshLibraryData();
    } catch (err) {
      setError(`Falha ao mover pasta: ${err.message}`);
    }
  };

  const deleteArchiveFolder = async ({ type, id, name, specialtyName = '', cards = [] }) => {
    const confirmed = window.confirm(
      `Excluir "${name}"? Os flashcards dessa pasta serão arquivados e a pasta sairá do acervo.`
    );

    if (!confirmed) return;

    try {
      setError(null);

      const deleteDeckById = async (deckId) => {
        if (!deckId || deckId === 'sem-deck') return;

        const response = await fetch(`${API_BASE}/api/flashcard-decks/${deckId}`, {
          method: 'DELETE',
        });

        const data = await parseResponseSafely(response);
        if (!response.ok) {
          throw new Error(data.error || 'Erro ao excluir deck.');
        }
      };

      if (cards.length) {
        await patchLibraryCardsBulk(cards, () => ({
          is_archived: true,
        }));
      }

      if (type === 'deck') {
        await deleteDeckById(id);
      }

      if (type === 'specialty') {
        const decksToDelete = libraryDecks.filter((deck) => {
          const deckSpecialty = String(deck.specialty || '').trim();
          return name === 'Sem especialidade'
            ? !deckSpecialty
            : deckSpecialty === name;
        });
        await Promise.all(decksToDelete.map((deck) => deleteDeckById(deck.id)));

        setExpandedArchiveSpecialties((prev) => {
          const next = { ...prev };
          delete next[`specialty:${name}`];
          return next;
        });
      }

      if (type === 'topic') {
        const decksToDelete = libraryDecks.filter(
          (deck) =>
            deck.specialty === specialtyName &&
            (deck.sub_specialty || 'Geral') === name
        );

        await Promise.all(decksToDelete.map((deck) => deleteDeckById(deck.id)));

        setExpandedArchiveTopics((prev) => {
          const next = { ...prev };
          delete next[`specialty:${specialtyName}:${name}`];
          return next;
        });
      }

      await refreshLibraryData();
    } catch (err) {
      setError(`Falha ao excluir pasta: ${err.message}`);
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
      id: 'spaced-review',
      label: 'Revisão Espaçada',
      icon: RefreshCw,
      ref: spacedReviewSectionRef,
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

  const formatDateKeyLocal = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const getReviewMonthMatrix = (baseDate) => {
    const d = new Date(baseDate);
    const year = d.getFullYear();
    const month = d.getMonth();

    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    const weeks = [];

    for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
      const week = [];

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + weekIndex * 7 + dayIndex);
        week.push(day);
      }

      weeks.push(week);
    }

    return weeks;
  };

  const getReviewCardsByDate = (cards = []) => {
    const grouped = {};

    cards.forEach((card) => {
      const dueAt = card?.review_state?.dueAt;
      if (!dueAt) return;

      const dateKey = formatDateKeyLocal(dueAt);

      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(card);
    });

    return grouped;
  };

  const normalizeReviewStateForSpacedReview = (card) => {
    const state = card?.review_state || {};

    return {
      status: state.status || 'new',
      dueAt: state.dueAt || null,
      lastReviewedAt: state.lastReviewedAt || null,
      intervalDays: Number(state.intervalDays || 0),
      easeFactor: Number(state.easeFactor || 2.5),
      repetitions: Number(state.repetitions || 0),
      lapses: Number(state.lapses || 0),
      lastGrade: state.lastGrade ?? null,
    };
  };

  const isDueForSpacedReview = (card) => {
    const state = normalizeReviewStateForSpacedReview(card);

    if (state.status === 'new') return true;
    if (!state.dueAt) return true;

    return new Date(state.dueAt) <= new Date();
  };

  const getSpacedReviewPriority = (card) => {
    const state = normalizeReviewStateForSpacedReview(card);
    const stats = card?.review_stats || {};

    if (state.status === 'new') return 10;
    if (Number(stats.hardCount || 0) >= 2) return 9;
    if (Number(state.lapses || 0) >= 1) return 8;
    if (state.dueAt && new Date(state.dueAt) < new Date()) return 7;

    return 1;
  };

  const checkGoogleCalendarStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/google-calendar/status`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao verificar Google Calendar.');
      }

      setIsGoogleCalendarConnected(Boolean(data.connected));
      setIsGoogleCalendarReady(Boolean(data.connected));

      return Boolean(data.connected);
    } catch (err) {
      setIsGoogleCalendarConnected(false);
      setIsGoogleCalendarReady(false);
      return false;
    }
  };

  const connectGoogleCalendar = async () => {
    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/google-calendar/auth-url`);
      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao gerar URL de conexão Google.');
      }

      if (!data.url) {
        throw new Error('URL de conexão Google não retornada.');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(`Falha ao conectar Google Calendar: ${err.message}`);
    }
  };

  const disconnectGoogleCalendar = async () => {
    try {
      setError(null);

      const response = await fetch(`${API_BASE}/api/google-calendar/disconnect`, {
        method: 'DELETE',
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao desconectar Google Calendar.');
      }

      setIsGoogleCalendarConnected(false);
      setIsGoogleCalendarReady(false);
      setGoogleCalendarEventsByDate({});
    } catch (err) {
      setError(`Falha ao desconectar Google Calendar: ${err.message}`);
    }
  };

  const fetchGoogleCalendarReviewEvents = async () => {
    try {
      const month = `${reviewCalendarDate.getFullYear()}-${String(
        reviewCalendarDate.getMonth() + 1
      ).padStart(2, '0')}`;

      const response = await fetch(
        `${API_BASE}/api/google-calendar/review-events?month=${month}`
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao buscar eventos do Google Calendar.');
      }

      const grouped = {};

      (data.events || []).forEach((event) => {
        const dateKey = event?.start?.date || event?.start?.dateTime?.slice(0, 10);
        if (!dateKey) return;

        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(event);
      });

      setGoogleCalendarEventsByDate(grouped);
    } catch (err) {
      setError(`Falha ao buscar eventos do Google Calendar: ${err.message}`);
    }
  };

  const syncDueCardsWithGoogleCalendar = async () => {
    const dueCards = libraryCards.filter((card) => {
      const state = normalizeReviewStateForSpacedReview(card);
      return state.dueAt || state.status === 'new';
    });

    try {
      setIsSyncingGoogleCalendar(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/google-calendar/sync-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: dueCards.slice(0, 80) }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao sincronizar revisões.');
      }

      await fetchGoogleCalendarReviewEvents();
    } catch (err) {
      setError(`Falha ao sincronizar revisões com Google Calendar: ${err.message}`);
    } finally {
      setIsSyncingGoogleCalendar(false);
    }
  };

  const spacedReviewBuckets = useMemo(() => {
    const now = new Date();

    const newCards = [];
    const dueCards = [];
    const hardCards = [];
    const overdueCards = [];

    libraryCards.forEach((card) => {
      const state = normalizeReviewStateForSpacedReview(card);
      const stats = card?.review_stats || {};

      if (state.status === 'new' || !state.lastReviewedAt) {
        newCards.push(card);
      }

      if (isDueForSpacedReview(card)) {
        dueCards.push(card);
      }

      if (Number(stats.hardCount || 0) >= 2 || Number(state.lapses || 0) >= 1) {
        hardCards.push(card);
      }

      if (state.dueAt && new Date(state.dueAt) < now) {
        overdueCards.push(card);
      }
    });

    return {
      newCards,
      dueCards,
      hardCards,
      overdueCards,
      todayCount: dueCards.length,
      newCount: newCards.length,
      hardCount: hardCards.length,
      overdueCount: overdueCards.length,
    };
  }, [libraryCards]);

  const reviewCardsByDate = useMemo(() => {
    return getReviewCardsByDate(libraryCards);
  }, [libraryCards]);

  const reviewCalendarWeeks = useMemo(() => {
    return getReviewMonthMatrix(reviewCalendarDate);
  }, [reviewCalendarDate]);

  const selectedReviewDateCards = useMemo(() => {
    if (!selectedReviewDate) return [];
    return reviewCardsByDate[selectedReviewDate] || [];
  }, [selectedReviewDate, reviewCardsByDate]);

  const selectedGoogleCalendarEvents = useMemo(() => {
    if (!selectedReviewDate) return [];
    return googleCalendarEventsByDate[selectedReviewDate] || [];
  }, [selectedReviewDate, googleCalendarEventsByDate]);

  const reviewCalendarMonthLabel = useMemo(() => {
    return reviewCalendarDate.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }, [reviewCalendarDate]);

  const currentSpacedReviewCard =
    spacedReviewQueue.length > 0 &&
    currentSpacedReviewIndex >= 0 &&
    currentSpacedReviewIndex < spacedReviewQueue.length
      ? spacedReviewQueue[currentSpacedReviewIndex]
      : null;

  const buildSpacedReviewQueue = async (mode = spacedReviewMode) => {
    try {
      setIsBuildingSpacedReview(true);
      setError(null);

      const normalizedMode = mode || 'today';

      const cards = await fetchLibraryCardsDirectly({
        deckId: normalizedMode === 'deck' ? selectedDeckId || '' : '',
        specialty: studySpecialty || librarySpecialtyFilter,
        favorites: false,
        dueOnly: false,
        search: '',
        limit: 500,
      });

      let queue = [];

      if (normalizedMode === 'today') {
        queue = cards.filter((card) => {
          return hasLibraryCardBeenStudied(card) && isDueForSpacedReview(card);
        });
      }

      if (normalizedMode === 'new') {
        queue = cards.filter(isLibraryCardNewForStudy);
      }

      if (normalizedMode === 'hard') {
        queue = cards.filter((card) => {
          if (!hasLibraryCardBeenStudied(card)) return false;

          const state = normalizeReviewStateForSpacedReview(card);
          const stats = card?.review_stats || {};

          return (
            Number(stats.hardCount || 0) >= 1 ||
            Number(state.lapses || 0) >= 1 ||
            Number(state.lastGrade || 0) === 1 ||
            Number(state.lastGrade || 0) === 2
          );
        });
      }

      if (normalizedMode === 'deck') {
        queue = selectedDeckId
          ? cards.filter((card) => String(card.deck_id) === String(selectedDeckId))
          : [];
      }

      queue = queue
        .sort((a, b) => getSpacedReviewPriority(b) - getSpacedReviewPriority(a))
        .slice(0, dailyReviewGoal);

      setSpacedReviewMode(normalizedMode);
      setSpacedReviewQueue(queue);
      setLibraryCards(cards);
      setCurrentSpacedReviewIndex(0);
      setIsSpacedReviewFlipped(false);
      setSpacedReviewStats({
        totalSeen: 0,
        againCount: 0,
        hardCount: 0,
        goodCount: 0,
        easyCount: 0,
      });

      if (!queue.length) {
        const message =
          normalizedMode === 'today'
            ? 'Nenhum flashcard já estudado está vencido para revisão hoje.'
            : normalizedMode === 'hard'
              ? 'Nenhum flashcard difícil já estudado foi encontrado.'
              : normalizedMode === 'new'
                ? 'Nenhum flashcard novo foi encontrado.'
                : 'Nenhum flashcard encontrado para o deck selecionado.';

        setError(message);
      }
    } catch (err) {
      setError(`Falha ao montar revisão espaçada: ${err.message}`);
    } finally {
      setIsBuildingSpacedReview(false);
    }
  };

  const calculateNextSpacedReviewState = (card, grade) => {
    const now = new Date();
    const state = normalizeReviewStateForSpacedReview(card);

    let {
      status,
      intervalDays,
      easeFactor,
      repetitions,
      lapses,
    } = state;

    if (grade === 1) {
      status = 'relearning';
      repetitions = 0;
      lapses += 1;
      intervalDays = 0;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    if (grade === 2) {
      status = repetitions <= 1 ? 'learning' : 'review';
      intervalDays = Math.max(1, Math.round(Math.max(intervalDays, 1) * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    }

    if (grade === 3) {
      status = 'review';
      repetitions += 1;

      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 3;
      else intervalDays = Math.max(2, Math.round(intervalDays * easeFactor));
    }

    if (grade === 4) {
      status = 'review';
      repetitions += 1;
      easeFactor = Math.min(3.2, easeFactor + 0.15);

      if (repetitions === 1) intervalDays = 3;
      else if (repetitions === 2) intervalDays = 7;
      else intervalDays = Math.max(4, Math.round(intervalDays * easeFactor * 1.25));
    }

    const dueAt = new Date(now);

    if (grade === 1) {
      dueAt.setMinutes(dueAt.getMinutes() + 20);
    } else {
      dueAt.setDate(dueAt.getDate() + intervalDays);
    }

    return {
      ...state,
      status,
      dueAt: dueAt.toISOString(),
      lastReviewedAt: now.toISOString(),
      intervalDays,
      easeFactor: Number(easeFactor.toFixed(2)),
      repetitions,
      lapses,
      lastGrade: grade,
    };
  };

  const calculateNextSpacedReviewStats = (card, grade) => {
    const previousStats = card?.review_stats || {};
    const currentStreak = Number(previousStats.streak || 0);
    const nextStreak = grade >= 3 ? currentStreak + 1 : 0;

    return {
      ...previousStats,
      totalReviewed: Number(previousStats.totalReviewed || 0) + 1,
      correctCount: Number(previousStats.correctCount || 0) + (grade >= 3 ? 1 : 0),
      wrongCount: Number(previousStats.wrongCount || 0) + (grade === 1 ? 1 : 0),
      hardCount: Number(previousStats.hardCount || 0) + (grade === 2 ? 1 : 0),
      goodCount: Number(previousStats.goodCount || 0) + (grade === 3 ? 1 : 0),
      easyCount: Number(previousStats.easyCount || 0) + (grade === 4 ? 1 : 0),
      streak: nextStreak,
      bestStreak: Math.max(Number(previousStats.bestStreak || 0), nextStreak),
      lastReviewedAt: new Date().toISOString(),
    };
  };

  const rateSpacedReviewCard = async (grade) => {
    if (!currentSpacedReviewCard || isSavingSpacedReview) return;

    const nextReviewState = calculateNextSpacedReviewState(currentSpacedReviewCard, grade);
    const nextReviewStats = calculateNextSpacedReviewStats(currentSpacedReviewCard, grade);

    try {
      setIsSavingSpacedReview(true);
      setError(null);

      const response = await fetch(
        `${API_BASE}/api/flashcards-library/${currentSpacedReviewCard.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade,
            review_state: nextReviewState,
            review_stats: nextReviewStats,
            session_mode: spacedReviewMode,
            session_source: 'spaced-review',
          }),
        }
      );

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar revisão espaçada.');
      }

      setSpacedReviewStats((prev) => ({
        totalSeen: prev.totalSeen + 1,
        againCount: prev.againCount + (grade === 1 ? 1 : 0),
        hardCount: prev.hardCount + (grade === 2 ? 1 : 0),
        goodCount: prev.goodCount + (grade === 3 ? 1 : 0),
        easyCount: prev.easyCount + (grade === 4 ? 1 : 0),
      }));

      setSpacedReviewQueue((prev) =>
        prev.map((card) =>
          card.id === currentSpacedReviewCard.id
            ? {
                ...card,
                review_state: nextReviewState,
                review_stats: nextReviewStats,
              }
            : card
        )
      );

      setIsSpacedReviewFlipped(false);

      setTimeout(() => {
        setCurrentSpacedReviewIndex((prev) => prev + 1);
      }, 150);
    } catch (err) {
      setError(`Falha ao salvar revisão espaçada: ${err.message}`);
    } finally {
      setIsSavingSpacedReview(false);
    }
  };

  const buildStudyQueue = () => {
    buildLibraryStudyQueue(studyMode);
  };

  const scheduleSmartReviews = async (card) => {
    const now = new Date();

    for (let i = 0; i < SMART_REVIEW_INTERVALS.length; i++) {
      const days = SMART_REVIEW_INTERVALS[i];

      const reviewDate = new Date(now);
      reviewDate.setDate(now.getDate() + days);

      await fetch(`${API_BASE}/api/google-calendar/create-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `🧠 Revisão D${days}`,
          description: `Flashcard: ${card.question}`,
          date: reviewDate.toISOString(),
        }),
      });
    }
  };

  const currentLibraryStudyCard =
    studyQueue.length > 0 &&
    currentLibraryStudyIndex >= 0 &&
    currentLibraryStudyIndex < studyQueue.length
      ? studyQueue[currentLibraryStudyIndex]
      : null;

  const currentLibraryStudyLastGrade = currentLibraryStudyCard
    ? getLibraryStudyLastGrade(currentLibraryStudyCard)
    : 0;

  const currentLibraryStudyResponseMeta = getLibraryStudyResponseMeta(
    currentLibraryStudyLastGrade
  );
  
  const visibleStudyStats = useMemo(() => {
    const sourceCards = studyQueue.length > 0 ? studyQueue : libraryCards;

    return calculatePersistedStudyStats(sourceCards);
  }, [studyQueue, libraryCards]);

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

  const libraryStudyTopicOptions = useMemo(() => {
    const topics = new Set();

    libraryCards.forEach((card) => {
      if (card?.sub_specialty) topics.add(card.sub_specialty);
      if (card?.study_tag) topics.add(card.study_tag);

      if (Array.isArray(card?.tags)) {
        card.tags.forEach((tag) => {
          if (tag) topics.add(tag);
        });
      }
    });

    return Array.from(topics).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [libraryCards]);

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

  const getDeckById = (deckId) => {
    return libraryDecks.find((deck) => deck.id === deckId) || null;
  };

  const getArchiveCardSpecialty = (card) => {
    const deck = getDeckById(card.deck_id);

    return (
      card.specialty ||
      deck?.specialty ||
      'Sem especialidade'
    );
  };

  const getArchiveCardTopic = (card) => {
    const deck = getDeckById(card.deck_id);

    return (
      card.sub_specialty ||
      deck?.sub_specialty ||
      card.study_tag ||
      'Geral'
    );
  };

  const getArchiveDeckTopic = (deck) => {
    return deck.sub_specialty || 'Geral';
  };

  const selectedArchiveCards = useMemo(() => {
    let cards = [...libraryCards];

    if (selectedArchiveSpecialty) {
      cards = cards.filter(
        (card) => getArchiveCardSpecialty(card) === selectedArchiveSpecialty
      );
    }

    if (selectedArchiveTopic) {
      cards = cards.filter(
        (card) => getArchiveCardTopic(card) === selectedArchiveTopic
      );
    }

    if (selectedArchiveDeckId) {
      cards = cards.filter((card) => card.deck_id === selectedArchiveDeckId);
    }

    if (archiveSearch.trim()) {
      const term = archiveSearch.trim().toLowerCase();

      cards = cards.filter((card) => {
        const haystack = `
          ${card.question || ''}
          ${card.answer || ''}
          ${card.preceptor_note || ''}
          ${card.specialty || ''}
          ${card.sub_specialty || ''}
        `.toLowerCase();

        return haystack.includes(term);
      });
    }

    return cards;
  }, [
    libraryCards,
    archiveSearch,
    selectedArchiveSpecialty,
    selectedArchiveTopic,
    selectedArchiveDeckId,
    libraryDecks,
  ]);

  const clearArchiveSelection = () => {
    setSelectedArchiveSpecialty('');
    setSelectedArchiveTopic('');
    setSelectedArchiveDeckId('');
  };

  const selectArchiveSpecialty = (specialty) => {
    setSelectedArchiveSpecialty(specialty);
    setSelectedArchiveTopic('');
    setSelectedArchiveDeckId('');
  };

  const selectArchiveTopic = (specialty, topic) => {
    setSelectedArchiveSpecialty(specialty);
    setSelectedArchiveTopic(topic);
    setSelectedArchiveDeckId('');
  };

  const selectArchiveDeck = (specialty, topic, deckId) => {
    setSelectedArchiveSpecialty(specialty);
    setSelectedArchiveTopic(topic);
    setSelectedArchiveDeckId(deckId);
    setSelectedDeckId(deckId === 'sem-deck' ? '' : deckId);
  };

  const startStudyFromArchiveCards = (cards) => {
    if (!Array.isArray(cards) || cards.length === 0) {
      setError('Nenhum flashcard disponível nesta pasta do acervo.');
      return;
    }

    setStudyQueue(cards);
    setCurrentLibraryStudyIndex(0);
    setIsLibraryStudyFlipped(false);
    setStudySessionStats({
      totalSeen: 0,
      correctCount: 0,
      hardCount: 0,
      easyCount: 0,
    });

    setTimeout(() => {
      studySessionSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 150);
  };

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

  const handlePremiumEditorChange = (nextText) => {
    setEnrichedTranscript(nextText);
    scheduleEnrichedAutoSave(nextText);
  };

  const finishPremiumEditorSave = async () => {
    try {
      setEditorSaveButtonStatus('saving');
      await saveEnrichedTranscriptDraft();
      setEditorSaveButtonStatus('saved');

      setTimeout(() => {
        setEditorSaveButtonStatus('idle');
      }, 2500);
    } catch (err) {
      setEditorSaveButtonStatus('idle');
      setError(`Falha ao salvar edição: ${err.message}`);
    }
  };

  const getActiveEnrichedEditor = () => {
    return document.getElementById('base-transcript-editor');
  };

  const escapeEditorHtml = (value = '') => {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const convertPlainTextToEditorHtml = (value = '') => {
    let raw = String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .trim();

    if (!raw) return '<p><br /></p>';

    // Se vier HTML antigo salvo, converte primeiro para texto limpo.
    if (/<(p|div|h1|h2|h3|ul|ol|li|blockquote|strong|b|em|i|mark|br)[\s>]/i.test(raw)) {
      const container = document.createElement('div');
      container.innerHTML = raw;
      raw = container.textContent
        .replace(/\u00A0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const formatInline = (text = '') => {
      return escapeEditorHtml(text)
        .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
        .replace(/==([\s\S]*?)==/g, '<mark>$1</mark>')
        .replace(/~~([\s\S]*?)~~/g, '<span style="text-decoration: line-through;">$1</span>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    };

    const blocks = raw
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks
      .map((block) => {
        if (/^#{1,3}\s+/.test(block)) {
          return `<h2>${formatInline(block.replace(/^#{1,3}\s+/, ''))}</h2>`;
        }

        if (/^>\s+/.test(block)) {
          return `<blockquote>${formatInline(block.replace(/^>\s+/, ''))}</blockquote>`;
        }

        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length && lines.every((line) => /^- /.test(line))) {
          return `<ul>${lines
            .map((line) => `<li>${formatInline(line.replace(/^- /, ''))}</li>`)
            .join('')}</ul>`;
        }

        if (lines.length && lines.every((line) => /^\d+\. /.test(line))) {
          return `<ol>${lines
            .map((line) => `<li>${formatInline(line.replace(/^\d+\. /, ''))}</li>`)
            .join('')}</ol>`;
        }

        return `<p>${formatInline(lines.join('<br />'))}</p>`;
      })
      .join('');
  };

  const convertEditorHtmlToPlainText = (html = '') => {
    const container = document.createElement('div');
    container.innerHTML = html || '';

    container.querySelectorAll('script, style').forEach((node) => node.remove());

    container.querySelectorAll('br').forEach((node) => {
      node.replaceWith('\n');
    });

    container.querySelectorAll('h1, h2, h3, h4').forEach((node) => {
      node.replaceWith(`\n\n## ${node.textContent.trim()}\n\n`);
    });

    container.querySelectorAll('blockquote').forEach((node) => {
      node.replaceWith(`\n\n> ${node.textContent.trim()}\n\n`);
    });

    container.querySelectorAll('ul').forEach((node) => {
      const lines = [...node.querySelectorAll('li')]
        .map((li) => `- ${li.textContent.trim()}`)
        .join('\n');

      node.replaceWith(`\n\n${lines}\n\n`);
    });

    container.querySelectorAll('ol').forEach((node) => {
      const lines = [...node.querySelectorAll('li')]
        .map((li, index) => `${index + 1}. ${li.textContent.trim()}`)
        .join('\n');

      node.replaceWith(`\n\n${lines}\n\n`);
    });

    container.querySelectorAll('p, div').forEach((node) => {
      node.append(document.createTextNode('\n\n'));
    });

    return container.textContent
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const syncRichEditorToState = () => {
    const editor = baseTranscriptEditorRef.current;
    if (!editor) return;

    const nextTranscript = convertEditorHtmlToPlainText(editor.innerHTML);

    baseTranscriptEditorDraftRef.current = nextTranscript;
    setEnrichedAutoSaveStatus('saving');

    if (editorInputDebounceRef.current) {
      clearTimeout(editorInputDebounceRef.current);
    }

    editorInputDebounceRef.current = setTimeout(() => {
      setEnrichedTranscript(nextTranscript);
      scheduleEnrichedAutoSave(nextTranscript);
    }, 700);
  };

  const runToolbarAction = (event, action) => {
    event.preventDefault();
    action();
  };

  const runEditorCommand = (command, value = null) => {
    const editor = baseTranscriptEditorRef.current;
    if (!editor) return;

    editor.focus();

    document.execCommand('styleWithCSS', false, false);
    document.execCommand(command, false, value);

    window.requestAnimationFrame(() => {
      syncRichEditorToState();
    });
  };

  const formatEditorBlock = (tag) => {
    runEditorCommand('formatBlock', tag);
  };

  const applyEditorUndo = () => runEditorCommand('undo');

  const applyEditorRedo = () => runEditorCommand('redo');

  const applyEditorBold = () => runEditorCommand('bold');

  const applyEditorItalic = () => runEditorCommand('italic');

  const applyEditorUnderline = () => runEditorCommand('underline');

  const applyEditorStrike = () => runEditorCommand('strikeThrough');

  const applyEditorHeading = () => formatEditorBlock('h2');

  const applyEditorParagraph = () => formatEditorBlock('p');

  const applyEditorQuote = () => formatEditorBlock('blockquote');

  const applyEditorList = () => runEditorCommand('insertUnorderedList');

  const applyEditorOrderedList = () => runEditorCommand('insertOrderedList');

  const applyEditorHighlight = () => {
    runEditorCommand('hiliteColor', '#fef08a');
  };

  const applyEditorLink = () => {
    const url = window.prompt('Insira o link (URL):', 'https://');

    if (url) {
      runEditorCommand('createLink', url);
    }
  };

  const applyEditorRemoveFormat = () => runEditorCommand('removeFormat');

  const cleanOldEvidenceMarkup = (text = '') => {
    return stripAppliedMetaText(text, { keepMainBody: false });
  };

  const renderStructuredStudyText = (text, highlightAdditions = false) => {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) {
      return (
        <p className="text-sm text-slate-400">
          Nenhum conteúdo disponível.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {blocks.map((block, index) => {
          const displayBlock = cleanOldEvidenceMarkup(block);

          if (!displayBlock) return null;

          const normalizedBlock = displayBlock.trim();

          const isEvidenceAddition =
            highlightAdditions &&
            enrichedManualBlocks.some((manualBlock) => {
              const manualContent = cleanOldEvidenceMarkup(manualBlock.content).trim();

              return (
                manualContent &&
                (
                  normalizedBlock === manualContent ||
                  normalizedBlock.includes(manualContent) ||
                  manualContent.includes(normalizedBlock)
                )
              );
            });

          const isHeading = displayBlock.startsWith('##');

          return (
            <div
              key={index}
              className={
                isEvidenceAddition
                  ? 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950'
                  : isHeading
                    ? 'rounded-2xl border border-slate-200 bg-slate-50 p-4'
                    : ''
              }
            >
              {isEvidenceAddition ? (
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 mb-3">
                  Adicionado a partir da Análise de Evidência
                </p>
              ) : null}

              <FormattedAiText
                text={displayBlock}
                className={
                  isEvidenceAddition
                    ? 'text-sm text-amber-950 leading-7'
                    : 'text-sm text-slate-700 leading-7'
                }
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderSmartCompareText = (text, highlightAdditions = false) => {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) {
      return (
        <p className="text-sm text-slate-400">
          Nenhum conteúdo disponível.
        </p>
      );
    }

    const readingClassName = `
      [&_p]:mb-6 [&_p]:leading-[1.85] [&_p]:text-[1.05rem] [&_p]:text-slate-700
      [&_h2]:font-serif [&_h2]:text-[1.55rem] [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-4
      [&_h3]:font-serif [&_h3]:text-[1.4rem] [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mt-8 [&_h3]:mb-4
      [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6 [&_ul]:text-slate-700
      [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6 [&_ol]:text-slate-700
      [&_li]:mb-2
      [&_strong]:font-semibold [&_strong]:text-slate-900
      [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_blockquote]:mb-6
      [&_mark]:bg-yellow-200 [&_mark]:text-yellow-900 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:rounded
    `;

    return (
      <div className="texto-leitura">
        {blocks.map((block, index) => {
          const displayBlock = cleanOldEvidenceMarkup(block);

          if (!displayBlock) return null;

          const normalizedBlock = displayBlock.trim();

          const isEvidenceAddition =
            highlightAdditions &&
            enrichedManualBlocks.some((manualBlock) => {
              const manualContent = cleanOldEvidenceMarkup(manualBlock.content).trim();

              return (
                manualContent &&
                (
                  normalizedBlock === manualContent ||
                  normalizedBlock.includes(manualContent) ||
                  manualContent.includes(normalizedBlock)
                )
              );
            });

          if (isEvidenceAddition) {
            return (
              <div
                key={index}
                className="relative group mb-6 rounded-lg bg-emerald-50/80 border-b-2 border-emerald-300 px-3 py-2 text-emerald-950 cursor-help transition-all hover:bg-emerald-100"
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[260px] px-3 py-2 bg-slate-800 text-white text-xs leading-tight rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal text-center shadow-xl">
                  <span className="block font-bold text-emerald-400 mb-1">
                    Adição da Análise de Evidência
                  </span>
                  Trecho incorporado ao texto enriquecido a partir de lacunas ou sugestões aplicadas.
                  <svg
                    className="absolute text-slate-800 h-2 w-full left-0 top-full"
                    x="0px"
                    y="0px"
                    viewBox="0 0 255 255"
                  >
                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0" />
                  </svg>
                </div>

                <FormattedAiText
                  text={displayBlock}
                  className={`${readingClassName} [&_p]:text-emerald-950 [&_strong]:text-emerald-950`}
                />
              </div>
            );
          }

          return (
            <FormattedAiText
              key={index}
              text={displayBlock}
              className={readingClassName}
            />
          );
        })}
      </div>
    );
  };

  const buildAppliedBlockPreviewText = (text = '') => {
    const clean = stripAppliedMetaText(text, { keepMainBody: true })
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return 'Sem conteúdo disponível.';

    return clean.length > 220 ? `${clean.slice(0, 220).trim()}...` : clean;
  };

  const transcriptParagraphs = useMemo(() => {
    const cleanText = String(transcript || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return [];

    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const paragraphs = [];

    for (let index = 0; index < sentences.length; index += 2) {
      paragraphs.push(sentences.slice(index, index + 2).join(' ').trim());
    }

    return paragraphs.filter(Boolean);
  }, [transcript]);

  const transcriptDetectedTopics = useMemo(() => {
    const evidenceTopics = Array.isArray(evidenceAnalysis?.topics_detected)
      ? evidenceAnalysis.topics_detected
      : [];

    return [
      ...currentSecondaryTopics,
      ...evidenceTopics,
    ]
      .map((topic) => String(topic || '').trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [currentSecondaryTopics, evidenceAnalysis]);

  const transcriptTags = useMemo(() => {
    const baseTags = currentAutoTags.length
      ? currentAutoTags
      : currentSpecialty
        ? [currentSpecialty, 'Estudo médico', 'Transcrição']
        : ['Estudo médico', 'Transcrição'];

    return baseTags
      .map((tag) => String(tag || '').replace(/^#/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [currentAutoTags, currentSpecialty]);

  const transcriptSummaryText = useMemo(() => {
    const topics = transcriptDetectedTopics.slice(0, 3).join(', ');

    if (topics) {
      return `Esta transcrição aborda principalmente ${topics}. O conteúdo foi processado e pode ser usado como base para análise de evidência, texto enriquecido e geração de flashcards.`;
    }

    const cleanText = String(transcript || '').replace(/\s+/g, ' ').trim();

    if (!cleanText) return 'Nenhum resumo disponível ainda.';

    return cleanText.length > 360 ? `${cleanText.slice(0, 360).trim()}...` : cleanText;
  }, [transcript, transcriptDetectedTopics]);

  const renderTranscriptSearchHighlight = (text = '') => {
    const query = transcriptSearchTerm.trim();

    if (!query) return text;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    return String(text || '')
      .split(regex)
      .map((part, index) =>
        regex.test(part) ? (
          <span
            key={index}
            className="bg-indigo-100 text-indigo-700 px-1 rounded"
          >
            {part}
          </span>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        )
      );
  };

  const copyTranscriptToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript || '');
      setTranscriptCopyStatus('copied');

      setTimeout(() => {
        setTranscriptCopyStatus('idle');
      }, 2000);
    } catch (err) {
      setError(`Falha ao copiar transcrição: ${err.message}`);
    }
  };

  const approveEnrichmentChanges = async () => {
    const finalText = enrichedTranscript || transcript || '';

    if (!finalText.trim()) {
      setError('Não há texto enriquecido disponível para aprovar.');
      return;
    }

    try {
      setEnrichmentApprovalStatus('saving');
      setApprovedEnrichedTranscript(finalText);

      if (currentRunId) {
        await saveEnrichedTranscriptDraft();
      }

      setEnrichmentApprovalStatus('saved');
      setIsHistoryDetailsOpen(true);

      setTimeout(() => {
        historyDetailsSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 180);

      setTimeout(() => {
        setEnrichmentApprovalStatus('idle');
      }, 2400);
    } catch (err) {
      setEnrichmentApprovalStatus('idle');
      setError(`Falha ao aprovar melhorias: ${err.message}`);
    }
  };

  useEffect(() => {
    if (comparisonMode !== 'original') return;

    const editor = baseTranscriptEditorRef.current;
    if (!editor) return;

    const sourceText = enrichedTranscript || transcript || '';

    if (!sourceText) {
      editor.innerHTML = '<p><br /></p>';
      baseTranscriptEditorLoadedValueRef.current = '';
      baseTranscriptEditorDraftRef.current = '';
      return;
    }

    if (
      document.activeElement === editor &&
      baseTranscriptEditorLoadedValueRef.current
    ) {
      return;
    }

    if (baseTranscriptEditorLoadedValueRef.current === sourceText) {
      return;
    }

    editor.innerHTML = convertPlainTextToEditorHtml(sourceText);
    baseTranscriptEditorLoadedValueRef.current = sourceText;
    baseTranscriptEditorDraftRef.current = sourceText;
  }, [comparisonMode, currentRunId, enrichedTranscript, transcript]);

  const concludeEnrichedTextEditing = async () => {
    try {
      const editor = baseTranscriptEditorRef.current;
      const nextTranscript = editor
        ? convertEditorHtmlToPlainText(editor.innerHTML)
        : enrichedTranscript;

      baseTranscriptEditorDraftRef.current = nextTranscript;
      setEnrichedTranscript(nextTranscript);

      setEditorSaveButtonStatus('saving');
      await saveEnrichedTranscriptDraft(nextTranscript);

      setEditorSaveButtonStatus('saved');
      setEnrichedAutoSaveStatus('saved');

      if (editorSaveButtonTimeoutRef.current) {
        clearTimeout(editorSaveButtonTimeoutRef.current);
      }

      editorSaveButtonTimeoutRef.current = setTimeout(() => {
        setEditorSaveButtonStatus('idle');
      }, 2200);
    } catch (err) {
      setEditorSaveButtonStatus('idle');
      setEnrichedAutoSaveStatus('error');
      setError(`Falha ao concluir edição: ${err.message}`);
    }
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
                  
                  <div
                    onClick={() => enrichmentVideoInputRef.current?.click()}
                    className="mt-5 border border-dashed border-violet-200 rounded-[24px] bg-violet-50/40 hover:bg-violet-50 transition-all cursor-pointer p-5"
                  >
                    <input
                      type="file"
                      ref={enrichmentVideoInputRef}
                      hidden
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setEnrichmentVideoFile(file);
                        setError(null);
                      }}
                    />

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500 mb-2">
                          Vídeo complementar opcional
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {enrichmentVideoFile ? enrichmentVideoFile.name : 'Adicionar segunda aula como base de enriquecimento'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Esse vídeo não substitui a mídia principal. Ele será transcrito e usado apenas para enriquecer a geração dos flashcards.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (enrichmentVideoFile) {
                            setEnrichmentVideoFile(null);
                            if (enrichmentVideoInputRef.current) enrichmentVideoInputRef.current.value = '';
                          } else {
                            enrichmentVideoInputRef.current?.click();
                          }
                        }}
                        className="px-4 py-2 rounded-xl border border-violet-200 bg-white text-violet-700 text-xs font-bold hover:bg-violet-50"
                      >
                        {enrichmentVideoFile ? 'Remover vídeo' : 'Selecionar vídeo'}
                      </button>
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
                    ) : null}
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
                      <SmartDropdown
                        value={automationPreset}
                        onChange={applyAutomationPreset}
                        placeholder="Manual"
                        options={[
                          {
                            id: 'automation_group',
                            label: 'Preset de Automação',
                            icon: <Sparkles className="w-4 h-4" />,
                            description: 'Como a IA deve trabalhar',
                            subOptions: [
                              { id: 'manual', label: 'Manual' },
                              { id: 'standard', label: 'Padrão (Flashcards Automáticos)' },
                              { id: 'deep', label: 'Profundo' },
                              { id: 'reopen-smart', label: 'Profundo + reabrir histórico' },
                            ],
                          },
                        ]}
                      />
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
              className="scroll-mt-24 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23e2e8f0\\' fill-opacity=\\'0.35\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] rounded-[32px] border border-slate-200 bg-slate-50/80 p-4 md:p-8 shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-200 shrink-0">
                    2
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                      Transcrição Salva
                    </h2>

                    <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Processamento concluído
                    </p>
                  </div>
                </div>

                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200/60 flex items-center gap-3 text-sm">
                  <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500">
                    <Video className="w-4 h-4" />
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700 truncate max-w-[240px]">
                      {currentFilename || 'Aula processada'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {transcriptWordCount.toLocaleString('pt-BR')} palavras
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start lg:h-[700px]">
                <div className="lg:col-span-4 lg:h-full min-h-0 overflow-y-auto pr-1 space-y-6 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                  <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-1 shadow-lg shadow-indigo-200">
                    <div className="bg-white/95 backdrop-blur-xl rounded-[1.4rem] p-6 h-full">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-indigo-500" />

                        <h3 className="font-bold text-slate-800 text-sm tracking-wide">
                          Resumo da IA
                        </h3>
                      </div>

                      <p className="text-sm text-slate-600 leading-relaxed">
                        {transcriptSummaryText}
                      </p>
                    </div>
                  </div>

                  {(enrichmentSupportTranscript || enrichmentSupportVideoUrl) && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-indigo-100 space-y-4 shrink-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">
                            Base complementar
                          </p>

                          <h3 className="font-bold text-slate-800 text-sm tracking-wide">
                            Segundo vídeo salvo
                          </h3>

                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {enrichmentSupportFilename || 'Vídeo complementar usado para enriquecer o estudo'}
                          </p>
                        </div>

                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Video size={18} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Palavras
                          </p>

                          <p className="text-2xl font-black text-slate-900 mt-1">
                            {enrichmentSupportWordCount}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Status
                          </p>

                          <p className="text-sm font-black text-emerald-600 mt-2">
                            Salvo
                          </p>
                        </div>
                      </div>

                      {enrichmentSupportVideoUrl ? (
                        <button
                          type="button"
                          onClick={() => window.open(enrichmentSupportVideoUrl, '_blank', 'noopener,noreferrer')}
                          className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                        >
                          Ver vídeo complementar
                        </button>
                      ) : null}

                      {enrichmentSupportTranscript ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">
                            Transcrição complementar
                          </p>

                          <div className="max-h-[220px] overflow-y-auto pr-2 whitespace-pre-wrap text-sm text-slate-600 leading-7 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                            {enrichmentSupportTranscript}
                          </div>
                        </div>
                      ) : null}

                      {enrichmentSupportProcessedAt ? (
                        <p className="text-[11px] text-slate-400">
                          Processado em {new Date(enrichmentSupportProcessedAt).toLocaleString('pt-BR')}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Especialidade
                        </label>

                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                          <select
                            value={currentSpecialty}
                            onChange={(e) => saveCurrentSpecialty(e.target.value)}
                            className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
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
                      </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        Tópicos Detectados
                      </label>

                      <div className="flex flex-col gap-2">
                        {transcriptDetectedTopics.length > 0 ? (
                          transcriptDetectedTopics.map((topic, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-100 shadow-sm px-3 py-2 rounded-lg"
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                  index < 2 ? 'bg-indigo-400' : 'bg-slate-300'
                                }`}
                              />

                              <span className="line-clamp-1">{topic}</span>

                              {index === 2 && transcriptDetectedTopics.length > 3 ? (
                                <span className="ml-auto text-[10px] text-slate-400">
                                  +{transcriptDetectedTopics.length - 3}
                                </span>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-400">
                            Nenhum tópico detectado ainda.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        Tags
                      </label>

                      <div className="flex flex-wrap gap-1.5">
                        {transcriptTags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[11px] font-medium hover:text-slate-800 transition-colors"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 overflow-hidden flex flex-col lg:h-full min-h-[520px]">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4 z-10">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        type="text"
                        value={transcriptSearchTerm}
                        onChange={(e) => setTranscriptSearchTerm(e.target.value)}
                        placeholder="Pesquisar na transcrição..."
                        className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => exportStudyPack()}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Exportar"
                      >
                        <Download className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={copyTranscriptToClipboard}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
                          transcriptCopyStatus === 'copied'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        {transcriptCopyStatus === 'copied' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-100" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}

                        <span>{transcriptCopyStatus === 'copied' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                    <div className="max-w-3xl mx-auto space-y-6">
                      {transcriptParagraphs.map((paragraph, index) => (
                        <p
                          key={index}
                          className="text-[1.05rem] leading-[1.85] text-slate-700"
                        >
                          {renderTranscriptSearchHighlight(paragraph)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
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
                              <FormattedAiText
                                text={card.answer}
                                className="text-slate-600 text-sm leading-relaxed mb-6 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900"
                              />

                              {card.preceptorNote && (
                                <div className="mt-auto bg-amber-50/80 border border-amber-100 rounded-xl p-4 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                                  <span className="block text-amber-600 text-[10px] font-bold tracking-widest mb-1.5 uppercase">
                                    Nota do Preceptor
                                  </span>
                                  <FormattedAiText
                                    text={card.preceptorNote}
                                    className="text-amber-900/80 text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-amber-950"
                                  />
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

                              <FormattedAiText
                                text={currentStudyCard.answer}
                                className="text-slate-700 text-lg leading-relaxed mb-8 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900"
                              />

                              {currentStudyCard.preceptorNote && (
                                <div className="mt-auto bg-amber-50 border border-amber-100 rounded-2xl p-5 relative">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={16} className="text-amber-500" />
                                    <span className="text-amber-700 text-xs font-bold tracking-widest uppercase">
                                      Nota do Preceptor
                                    </span>
                                  </div>
                                  <FormattedAiText
                                    text={currentStudyCard.preceptorNote}
                                    className="text-amber-900 text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-amber-950"
                                  />
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
          <AnimatedTopicCloud topics={evidenceAnalysis.topics_detected || []} />

          <div className="bg-white border border-amber-200 rounded-2xl p-5 xl:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-700 mb-4">
              Lacunas identificadas
            </h3>

            {(evidenceAnalysis.missing_topics || []).length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma lacuna importante identificada.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-fr">
                {(evidenceAnalysis.missing_topics || []).map((item, index) => {
                  const title = getMissingTopicTitle(item, index);
                  const fixText = getMissingTopicFixText(item, index);

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-amber-200 bg-amber-50 p-5 min-h-[520px] h-full flex flex-col overflow-hidden"
                    >
                     <div className="flex-1 min-h-0 flex flex-col gap-4">
                      <div className="rounded-2xl border border-amber-100 bg-white/80 p-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700 mb-2">
                          Lacuna identificada
                        </p>

                        <h4 className="text-base font-bold text-amber-950 leading-7">
                          {title}
                        </h4>
                      </div>

                      <div className="flex-1 min-h-0 rounded-2xl border border-amber-100 bg-white/80 p-4 overflow-y-auto">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700 mb-3">
                          Como corrigir no texto enriquecido
                        </p>

                        <FormattedAiText
                          text={fixText}
                          className="text-sm text-amber-900/90 leading-7"
                        />
                      </div>
                    </div>

                    {typeof applyMissingTopicToEnrichedText === 'function' && (
                      <div className="mt-4 pt-4 border-t border-amber-100 flex justify-center">
                        <EvidenceApplyButton
                          added={Boolean(appliedEvidenceActionIds[`lacuna-${index}`])}
                          disabled={!currentRunId}
                          label="Adicionar correção ao texto enriquecido"
                          onApply={() => applyMissingTopicToEnrichedText(item, index)}
                        />
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
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
                {(evidenceAnalysis.improvement_suggestions || []).map((item, index) => {
                  const suggestion = getSuggestionImplementation(item, index);
                  const isExpanded = Boolean(expandedImprovementSuggestions[index]);

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-hidden"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900">
                            {suggestion.title}
                          </h4>

                          <FormattedAiText
                            text={suggestion.content}
                            className="text-sm text-slate-700 mt-2 leading-7"
                          />

                          {suggestion.why ? (
                            <div className="text-xs text-slate-500 mt-3 leading-6">
                              <span className="font-semibold">Como isso melhora: </span>
                              <FormattedAiText
                                text={suggestion.why}
                                className="inline"
                              />
                            </div>
                          ) : null}

                          {getSourceNumbers(item).length > 0 && (
                            <p className="text-xs text-slate-400 mt-2">
                              Fontes relacionadas: {getSourceNumbers(item).join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="w-full lg:w-[520px] shrink-0 flex flex-col items-center">
                          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => toggleImprovementSuggestionDetails(index)}
                              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-sm flex items-center justify-center"
                            >
                              {isExpanded ? 'Ocultar detalhe' : 'Detalhar melhoria'}
                            </button>

                            <EvidenceApplyButton
                              added={Boolean(appliedEvidenceActionIds[`sugestao-${index}`])}
                              disabled={!currentRunId}
                              compact
                              stretch
                              label="Adicionar melhoria"
                              onApply={() => applySuggestionToEnrichedText(item, index)}
                            />
                          </div>

                          <div className="w-full">
                            <SuggestionAddedPreview
                              visible={Boolean(appliedEvidenceActionIds[`sugestao-${index}`])}
                            />
                          </div>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wider text-indigo-700 mb-2">
                            Como aplicar essa melhoria
                          </p>

                          <FormattedAiText
                            text={suggestion.howToApply}
                            className="text-sm text-indigo-950 leading-6"
                          />

                          <div className="mt-4 rounded-xl bg-white border border-indigo-100 p-5 text-center">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                              Texto que será adicionado
                            </p>

                            <FormattedAiText
                              text={suggestion.finalText}
                              className="text-sm text-slate-700 leading-7 font-normal [&_p]:mb-0 [&_strong]:font-normal [&_strong]:text-slate-700"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-amber-200 rounded-2xl p-5 min-w-0 max-h-[640px] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-700">
                Mnemônicos sugeridos
              </h3>

              <button
                type="button"
                onClick={generateMnemonicFlashcardsFromCurrentRun}
                disabled={
                  !currentRunId ||
                  !(evidenceAnalysis.mnemonics || []).length ||
                  isGeneratingMnemonicFlashcards ||
                  mnemonicFlashcardsCreated
                }
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold transition-all disabled:cursor-default ${
                  mnemonicFlashcardsCreated
                    ? 'bg-emerald-500'
                    : 'bg-amber-600 hover:bg-amber-700 disabled:opacity-50'
                }`}
              >
                {isGeneratingMnemonicFlashcards ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : mnemonicFlashcardsCreated ? (
                  <Check size={14} />
                ) : (
                  <Wand2 size={14} />
                )}

                {isGeneratingMnemonicFlashcards
                  ? 'Criando flashcards...'
                  : mnemonicFlashcardsCreated
                    ? 'Flashcards criados'
                    : 'Criar flashcards dos mnemônicos'}
              </button>
            </div>

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

                    <FormattedAiText
                      text={`**Mnemônico:** ${item.mnemonic || ''}`}
                      className="text-sm text-amber-800 mt-2 leading-6 [&_p]:mb-0 [&_strong]:font-bold [&_strong]:text-amber-900"
                    />

                    <FormattedAiText
                      text={item.explanation || ''}
                      className="text-sm text-amber-900/90 mt-2 leading-6 [&_p]:mb-0 [&_strong]:font-semibold [&_strong]:text-amber-950"
                    />

                    <FormattedAiText
                      text={`**Uso:** ${item.use_case || ''}`}
                      className="text-xs text-amber-700 mt-3 leading-6 [&_p]:mb-0 [&_strong]:font-semibold [&_strong]:text-amber-800"
                    />

                    <p className="text-[11px] text-amber-700 mt-3">
                      Ao clicar no botão acima, o sistema cria flashcards exclusivos a partir dos
                      mnemônicos desta seção.
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

      <div className="flex flex-col items-end gap-1">
        {enrichedGeneratedAt ? (
          <span className="text-xs text-slate-400">
            Atualizado em {new Date(enrichedGeneratedAt).toLocaleString('pt-BR')}
          </span>
        ) : null}

        {enrichedTranscript ? (
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
              enrichedAutoSaveStatus === 'saving'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : enrichedAutoSaveStatus === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : enrichedAutoSaveStatus === 'saved'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {enrichedAutoSaveStatus === 'saving'
              ? 'Salvando automaticamente...'
              : enrichedAutoSaveStatus === 'error'
                ? 'Erro ao salvar'
                : enrichedAutoSaveStatus === 'saved'
                  ? 'Salvo automaticamente'
                  : 'Editor pronto'}
          </span>
        ) : null}
      </div>
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
          {comparisonMode === 'original' && enrichedManualBlocks.length > 0 && (
            <div className="bg-white border border-indigo-200 rounded-2xl p-5">
              <div className="text-center space-y-1 mb-5">
                <h3 className="text-[15px] font-bold text-indigo-800 uppercase tracking-widest">
                  Adições aplicadas ao texto enriquecido
                </h3>
                <p className="text-sm text-slate-500">
                  Edite ou remova qualquer bloco aplicado pela Análise de Evidência.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    id: 'lacuna',
                    title: 'Correções de Lacuna',
                    count: enrichedManualBlocks.filter((block) => block.type === 'lacuna').length,
                    blocks: enrichedManualBlocks.filter((block) => block.type === 'lacuna'),
                    border: 'border-yellow-200',
                    headerBg: 'bg-yellow-50/70 hover:bg-yellow-50',
                    iconBg: 'bg-yellow-100 text-yellow-700',
                    titleColor: 'text-yellow-900',
                    cardBg: 'bg-yellow-50',
                    cardBorder: 'border-yellow-200',
                    textBorder: 'border-yellow-200',
                    label: 'Correção de Lacuna',
                    Icon: AlertCircle,
                  },
                  {
                    id: 'sugestao',
                    title: 'Sugestões Aplicadas',
                    count: enrichedManualBlocks.filter((block) => block.type === 'sugestao').length,
                    blocks: enrichedManualBlocks.filter((block) => block.type === 'sugestao'),
                    border: 'border-indigo-100',
                    headerBg: 'bg-indigo-50/70 hover:bg-indigo-50',
                    iconBg: 'bg-indigo-100 text-indigo-600',
                    titleColor: 'text-indigo-900',
                    cardBg: 'bg-indigo-50',
                    cardBorder: 'border-indigo-200',
                    textBorder: 'border-indigo-100',
                    label: 'Sugestão Aplicada',
                    Icon: Lightbulb,
                  },
                ].map((panel) => {
                  const isOpen = Boolean(expandedAppliedPanels[panel.id]);
                  const Icon = panel.Icon;

                  if (panel.count === 0) return null;

                  return (
                    <div
                      key={panel.id}
                      className={`bg-white border ${panel.border} rounded-xl shadow-sm overflow-hidden`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAppliedPanel(panel.id)}
                        className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${panel.headerBg}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`${panel.iconBg} p-1.5 rounded-lg`}>
                            <Icon size={20} />
                          </div>

                          <div className="text-left">
                            <h4 className={`text-sm font-bold uppercase tracking-wide ${panel.titleColor}`}>
                              {panel.title} ({panel.count})
                            </h4>
                          </div>
                        </div>

                        <ChevronDown
                          className={`w-5 h-5 transition-transform duration-300 ${
                            isOpen ? 'rotate-180' : ''
                          } ${panel.id === 'lacuna' ? 'text-yellow-500' : 'text-indigo-400'}`}
                        />
                      </button>

                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="p-6 bg-slate-50/30 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {panel.blocks.map((block) => {
                              const isEditing = editingAppliedBlockId === block.id;

                              return (
                                <div
                                  key={block.id}
                                  className={`${panel.cardBg} border ${panel.cardBorder} rounded-xl p-5 flex flex-col shadow-sm h-full`}
                                >
                                  <div className="flex flex-col flex-1 mb-3">
                                    <div className="flex justify-between items-start gap-3 mb-2">
                                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                        {panel.label}
                                      </span>

                                      <span className="text-[11px] text-slate-400 font-medium text-right">
                                        {block.created_at
                                          ? `Adicionado em ${new Date(block.created_at).toLocaleString('pt-BR')}`
                                          : ''}
                                      </span>
                                    </div>

                                    <h5 className="text-sm font-bold text-slate-800 leading-snug">
                                      {block.title}
                                    </h5>
                                  </div>

                                  {isEditing ? (
                                    <div className="space-y-3">
                                      <textarea
                                        value={editingAppliedBlockContent}
                                        onChange={(e) => setEditingAppliedBlockContent(e.target.value)}
                                        className="w-full h-[180px] rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 leading-7 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                      />

                                      <div className="flex gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => saveEditingAppliedBlock(block.id)}
                                          className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm"
                                        >
                                          Salvar edição
                                        </button>

                                        <button
                                          type="button"
                                          onClick={cancelEditingAppliedBlock}
                                          className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div
                                        className={`bg-white border ${panel.textBorder} rounded-2xl p-4 shadow-inner`}
                                      >
                                        <p className="text-sm text-slate-700 leading-7">
                                          {buildAppliedBlockPreviewText(block.content)}
                                        </p>
                                      </div>

                                      <div className="flex flex-wrap gap-2 pt-4 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewAppliedBlock({
                                              ...block,
                                              panelTitle: panel.title,
                                              panelLabel: panel.label,
                                              panelTone: panel.id,
                                            })
                                          }
                                          className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold rounded-lg transition"
                                        >
                                          Visualizar
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => startEditingAppliedBlock(block)}
                                          className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition"
                                        >
                                          Editar
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => removeAppliedEnrichmentBlock(block.id)}
                                          className="px-4 py-1.5 bg-white border border-slate-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition"
                                        >
                                          Remover
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {enrichedSummary?.applied_topics?.length > 0 && comparisonMode === 'original' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
                Pontos adicionados
              </h3>

              <div className="flex flex-wrap justify-center gap-2">
                {(enrichedSummary?.applied_topics || []).map((topic, index) => (
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

          {enrichedSummary?.applied_mnemonics?.length > 0 && comparisonMode === 'original' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
                Mnemônicos incorporados
              </h3>

              <div className="flex flex-wrap justify-center gap-2">
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

          {enrichmentReferenceVideos.length > 0 && comparisonMode === 'original' && (
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
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 md:px-10 pt-6 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                    Edição de documento
                  </p>
                  <h3 className="text-2xl font-semibold text-slate-800 tracking-tight">
                    Texto Enriquecido
                  </h3>
                </div>

                <div className="flex items-center gap-5">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 transition-colors duration-300">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        enrichedAutoSaveStatus === 'saving'
                          ? 'bg-indigo-400 animate-pulse'
                          : enrichedAutoSaveStatus === 'error'
                            ? 'bg-red-400'
                            : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      }`}
                    />
                    {enrichedAutoSaveStatus === 'saving'
                      ? 'Salvando alterações...'
                      : enrichedAutoSaveStatus === 'error'
                        ? 'Erro ao salvar'
                        : 'Sincronizado'}
                  </span>

                  <button
                    type="button"
                    onClick={concludeEnrichedTextEditing}
                    disabled={!currentRunId || enrichedAutoSaveStatus === 'saving' || editorSaveButtonStatus === 'saving'}
                    className={`px-6 py-2.5 text-white text-sm font-medium rounded-full shadow-lg shadow-black/10 transition-all flex items-center gap-2 disabled:opacity-50 ${
                      editorSaveButtonStatus === 'saved'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-[#18181b] hover:bg-[#27272a]'
                    }`}
                  >
                    {editorSaveButtonStatus === 'saving' ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-white/80" />
                        Finalizando...
                      </>
                    ) : editorSaveButtonStatus === 'saved' ? (
                      <>
                        <Check size={16} />
                        Edição concluída
                      </>
                    ) : (
                      'Concluir Edição'
                    )}
                  </button>
                </div>
              </div>

              <div className="px-4 sm:px-8 md:px-10 lg:px-12 py-8 bg-[#fcfcfd]">
                <div className="relative bg-white rounded-[30px] shadow-sm ring-1 ring-slate-900/5 px-4 sm:px-10 md:px-16 lg:px-20 py-10">
                  <div className="sticky top-6 z-20 flex justify-center mb-10 pointer-events-none">
                    <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-full px-2 py-1.5 flex flex-wrap items-center justify-center gap-1 transition-all max-w-full overflow-x-auto">
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorUndo();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Desfazer"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorRedo();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Refazer"
                      >
                        <Redo2 className="w-4 h-4" />
                      </button>

                      <div className="w-px h-5 bg-slate-200 mx-1" />

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorBold();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Negrito"
                      >
                        <Bold className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorItalic();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Itálico"
                      >
                        <Italic className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorUnderline();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Sublinhado"
                      >
                        <Underline className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorStrike();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Tachado"
                      >
                        <Strikethrough className="w-4 h-4" />
                      </button>

                      <div className="w-px h-5 bg-slate-200 mx-1" />

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorHeading();
                        }}
                        className="px-2.5 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Título H2"
                      >
                        <Heading2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorParagraph();
                        }}
                        className="px-2.5 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Parágrafo"
                      >
                        <Pilcrow className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorQuote();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Citação"
                      >
                        <Quote className="w-4 h-4" />
                      </button>

                      <div className="w-px h-5 bg-slate-200 mx-1" />

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorList();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Lista com marcadores"
                      >
                        <ListIcon className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorOrderedList();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        title="Lista numerada"
                      >
                        <ListOrdered className="w-4 h-4" />
                      </button>

                      <div className="w-px h-5 bg-slate-200 mx-1" />

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorHighlight();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                        title="Destacar"
                      >
                        <Highlighter className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorLink();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                        title="Inserir link"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyEditorRemoveFormat();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:text-red-500 hover:bg-red-50"
                        title="Limpar formatação"
                      >
                        <Eraser className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    ref={baseTranscriptEditorRef}
                    id="base-transcript-editor"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncRichEditorToState}
                    onBlur={syncRichEditorToState}
                    className="w-full min-h-[680px] text-[17px] leading-[1.85] text-slate-700 focus:outline-none max-w-none
                      [&_h2]:font-serif [&_h2]:text-[1.75rem] [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-12 [&_h2]:mb-5
                      [&_p]:mb-6
                      [&_strong]:font-semibold [&_strong]:text-slate-900
                      [&_b]:font-semibold [&_b]:text-slate-900
                      [&_em]:italic
                      [&_i]:italic
                      [&_u]:underline
                      [&_s]:line-through
                      [&_strike]:line-through
                      [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6
                      [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6
                      [&_li]:mb-2
                      [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_blockquote]:mb-6
                      [&_mark]:bg-yellow-200 [&_mark]:text-yellow-900 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:rounded
                      [&_a]:text-indigo-600 [&_a]:underline [&_a]:underline-offset-4"
                  />
                </div>
              </div>
            </div>
          )}

          {comparisonMode === 'enriched' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Prévia com adições destacadas
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Texto enriquecido renderizado com formatação e blocos vindos da Análise de Evidência destacados.
                </p>
              </div>

              <div className="p-6 max-h-[760px] overflow-y-auto">
                {renderStructuredStudyText(enrichedTranscript || transcript, true)}
              </div>
            </div>
          )}

          {comparisonMode === 'split' && (
            <div className="w-full max-w-6xl mx-auto">
              <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06)] ring-1 ring-slate-900/5 overflow-hidden flex flex-col">
                <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-white z-20 relative">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
                      <Sparkles className="w-5 h-5" />
                    </div>

                    <div>
                      <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                        Análise de Diferenças
                      </h2>
                      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Passe o mouse sobre os destaques verdes
                      </p>
                    </div>
                  </div>

                  <div
                    className={`relative flex p-1.5 bg-slate-100/80 rounded-full w-full md:w-[340px] shadow-inner transition-all ${
                      isCompareSplitView ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <div
                      className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-200/50 transition-transform duration-300 ${
                        compareInnerMode === 'enriched'
                          ? 'translate-x-[calc(100%+0.375rem)]'
                          : 'translate-x-0'
                      }`}
                    />

                    <button
                      type="button"
                      className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors duration-300 rounded-full ${
                        compareInnerMode === 'original'
                          ? 'text-slate-800'
                          : 'text-slate-500'
                      }`}
                      onClick={() => {
                        if (isCompareSplitView) return;
                        setCompareInnerMode('original');
                      }}
                    >
                      Texto Original
                    </button>

                    <button
                      type="button"
                      className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors duration-300 flex items-center justify-center gap-1.5 rounded-full ${
                        compareInnerMode === 'enriched'
                          ? 'text-indigo-700'
                          : 'text-slate-500'
                      }`}
                      onClick={() => {
                        if (isCompareSplitView) return;
                        setCompareInnerMode('enriched');
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Enriquecido
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCompareSplitView((prev) => !prev)}
                    className={`hidden lg:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border ${
                      isCompareSplitView
                        ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {isCompareSplitView ? (
                      <>
                        <X className="w-4 h-4" />
                        <span>Fechar Comparação</span>
                      </>
                    ) : (
                      <>
                        <LayoutTemplate className="w-4 h-4" />
                        <span>Lado a Lado</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-white/50 px-8 py-10 md:px-14 md:py-16">
                  <div
                    className={`grid items-start transition-all duration-500 ${
                      isCompareSplitView
                        ? 'grid-cols-1 lg:grid-cols-2 gap-12'
                        : 'grid-cols-1'
                    }`}
                  >
                    <div
                      id="panel-original"
                      className={`panel-item texto-leitura ${
                        isCompareSplitView
                          ? 'opacity-100 pointer-events-auto translate-y-0 scale-100 z-10'
                          : compareInnerMode === 'original'
                            ? '[grid-area:1/1] opacity-100 pointer-events-auto translate-y-0 scale-100 z-10'
                            : '[grid-area:1/1] opacity-0 pointer-events-none translate-y-2 scale-[0.98] z-0'
                      } transition-all duration-500`}
                    >
                      <div
                        className={`mb-6 pb-4 border-b border-slate-100 ${
                          isCompareSplitView ? 'block' : 'hidden'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Versão Original
                        </span>
                      </div>

                      <div className="max-h-[760px] overflow-y-auto pr-2">
                        {renderSmartCompareText(transcript, false)}
                      </div>
                    </div>

                    <div
                      id="panel-enriquecido"
                      className={`panel-item texto-leitura ${
                        isCompareSplitView
                          ? 'opacity-100 pointer-events-auto translate-y-0 scale-100 z-10'
                          : compareInnerMode === 'enriched'
                            ? '[grid-area:1/1] opacity-100 pointer-events-auto translate-y-0 scale-100 z-10'
                            : '[grid-area:1/1] opacity-0 pointer-events-none translate-y-2 scale-[0.98] z-0'
                      } transition-all duration-500`}
                    >
                      <div
                        className={`mb-6 pb-4 border-b border-emerald-100 justify-between items-center ${
                          isCompareSplitView ? 'flex' : 'hidden'
                        }`}
                      >
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                          <Check className="w-4 h-4" />
                          Versão Enriquecida
                        </span>
                      </div>

                      <div className="max-h-[760px] overflow-y-auto pr-2">
                        {renderSmartCompareText(enrichedTranscript || transcript, true)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-t border-slate-100 p-4 flex justify-end gap-3 z-20 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                  <button
                    type="button"
                    onClick={() => {
                      setCompareInnerMode('original');
                      setIsCompareSplitView(false);
                    }}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={() => setComparisonMode('enriched')}
                    className="px-6 py-2.5 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-white font-medium text-sm transition-colors shadow-md flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Aprovar Melhorias
                  </button>
                </div>
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
  <section
    ref={historyDetailsSectionRef}
    className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
  >
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

    <div className="p-6 md:p-8 bg-slate-50/30 grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6 items-stretch">
      <div className="flex flex-col gap-6 h-full min-h-0">
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

          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto">
            {approvedEnrichedTranscript || enrichedTranscript || transcript || 'Sem transcrição carregada.'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex-1 min-h-0 flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-3 shrink-0">
            Prévia dos flashcards
          </h3>

          {flashcards.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este item ainda não possui flashcards carregados.
            </p>
          ) : (
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2">
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
                  <FormattedAiText
                    text={card.answer}
                    className="text-sm text-slate-500 mt-2 line-clamp-2 [&_p]:inline [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-slate-700"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0">
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

            {enrichmentSupportVideoUrl ? (
              <button
                type="button"
                onClick={() => window.open(enrichmentSupportVideoUrl, '_blank', 'noopener,noreferrer')}
                className="px-4 py-3 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
              >
                Ver vídeo complementar
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

        <div className="bg-[#F4F7FB] w-full rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-white/60 flex-1 flex flex-col gap-6 relative overflow-hidden">
  <style>
    {`
      @keyframes fillBar {
        from { width: 0%; }
        to { width: 92%; }
      }

      .animate-progress {
        animation: fillBar 1.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes fillClinical {
        from { width: 0%; }
        to { width: 85%; }
      }

      .animate-clinical {
        animation: fillClinical 1.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards;
      }

      @keyframes fillTheory {
        from { width: 0%; }
        to { width: 60%; }
      }

      .animate-theory {
        animation: fillTheory 1.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s forwards;
      }
    `}
  </style>

  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

  <div className="flex justify-between items-start">
    <div>
      <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">
        Métricas rápidas
      </h3>

      <p className="text-xs text-slate-500 font-medium mt-0.5">
        Visão geral resumida deste material.
      </p>
    </div>

    <div className="p-2 bg-indigo-100/70 text-indigo-600 rounded-xl">
      <Database size={20} />
    </div>
  </div>

  <div className="grid grid-cols-2 gap-3">
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/80 hover:shadow-md transition-shadow group">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
        Flashcards
      </span>

      <div className="text-2xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
        {flashcards.length}
      </div>

      <span className="text-[10px] text-slate-400 font-medium">
        cards neste item
      </span>
    </div>

    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/80 hover:shadow-md transition-shadow group">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
        Palavras
      </span>

      <div className="text-2xl font-black text-slate-800">
        {transcriptWordCount}
      </div>

      <span className="text-[10px] text-slate-400 font-medium">
        no conteúdo atual
      </span>
    </div>

    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/80 hover:shadow-md transition-shadow group">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
        Leitura
      </span>

      <div className="text-2xl font-black text-slate-800 flex items-baseline gap-1">
        {Math.max(1, Math.ceil(transcriptWordCount / 180))}
        <span className="text-sm font-bold">min</span>
      </div>

      <span className="text-[10px] text-slate-400 font-medium">
        tempo estimado
      </span>
    </div>

    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/80 hover:shadow-md transition-shadow group">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
        Enriquecimento
      </span>

      <div
        className={`text-lg font-black mt-1 mb-0.5 ${
          enrichedTranscript ? 'text-emerald-600' : 'text-slate-700'
        }`}
      >
        {enrichedTranscript ? 'Disponível' : 'Base'}
      </div>

      <span className="text-[10px] text-slate-400 font-medium">
        status do texto
      </span>
    </div>
  </div>

  <div className="space-y-3 pt-1">
    <div className="bg-white/60 rounded-2xl p-4 border border-white">
      <div className="flex justify-between items-end mb-2">
        <span className="text-xs font-bold text-slate-700">
          Índice de Otimização
        </span>

        <span className="text-sm font-black text-indigo-600">
          {evidenceAnalysis ? '92%' : enrichedTranscript ? '78%' : '45%'}
        </span>
      </div>

      <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-progress"
          style={{ width: '0%' }}
        />
      </div>
    </div>

    <div className="bg-white/60 rounded-2xl p-4 border border-white space-y-4">
      <div className="flex items-center gap-1.5 mb-1">
        <svg
          className="w-3.5 h-3.5 text-indigo-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>

        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Perfil de Estudo do Texto
        </span>
      </div>

      <div>
        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1.5">
          <span>Densidade Prática / Clínica</span>
          <span className="text-emerald-600">
            {evidenceAnalysis ? '85%' : '60%'}
          </span>
        </div>

        <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full animate-clinical"
            style={{ width: '0%' }}
          />
        </div>

        <p className="text-[9px] text-slate-500 font-medium mt-1.5 leading-tight">
          Texto focado em condutas, diagnósticos diferenciais e tomadas de decisão.
        </p>
      </div>

      <div>
        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1.5">
          <span>Carga Teórica & Fisiopatologia</span>
          <span className="text-amber-500">60%</span>
        </div>

        <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full animate-theory"
            style={{ width: '0%' }}
          />
        </div>

        <p className="text-[9px] text-slate-500 font-medium mt-1.5 leading-tight">
          Base teórica essencial para fundamentar a prática clínica apresentada.
        </p>
      </div>

      <div className="pt-3 border-t border-slate-200/60">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
          Destaques deste material
        </span>

        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-1 bg-white text-slate-600 border border-slate-200 rounded text-[9px] font-bold shadow-sm">
            Rico em Mnemônicos
          </span>

          <span className="px-2 py-1 bg-white text-slate-600 border border-slate-200 rounded text-[9px] font-bold shadow-sm">
            Fluxos de Investigação
          </span>

          <span className="px-2 py-1 bg-white text-slate-600 border border-slate-200 rounded text-[9px] font-bold shadow-sm">
            Foco em Residência
          </span>
        </div>
      </div>
    </div>
  </div>

  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex justify-between items-center mt-2">
    <div>
      <span className="text-[10px] text-slate-400 font-medium block">
        Situação do material
      </span>

      <span className="text-sm font-bold text-slate-800 block mt-0.5">
        {currentSpecialty || 'Sem especialidade'}
      </span>
    </div>

    <div
      className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide ${
        evidenceAnalysis
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {evidenceAnalysis ? 'Com análise' : 'Sem análise'}
    </div>
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
                <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500 mb-2">
                  Acervo inteligente
                </p>
                <h2 className="text-2xl font-bold text-slate-900">Biblioteca de Flashcards</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Organize seus cards por especialidade, tema, deck, revisão e dificuldade.
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
                    loadDeckTree();
                    loadLibraryCards();
                    loadLibraryAnalytics();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Atualizar biblioteca
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50/30 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Decks', value: libraryDecks.length },
                  { label: 'Cards', value: libraryCards.length },
                  { label: 'Favoritos', value: libraryCards.filter((card) => card.is_favorite).length },
                  { label: 'Suspensos', value: libraryCards.filter((card) => card.is_suspended).length },
                  { label: 'Especialidades', value: librarySpecialties.length },
                  {
                    label: 'Vencidos',
                    value: libraryCards.filter(
                      (card) => card?.review_state?.dueAt && new Date(card.review_state.dueAt) <= new Date()
                    ).length,
                  },
                ].map((metric) => (
                  <div key={metric.label} className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 uppercase font-bold">{metric.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Filtros rápidos</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Use filtros clínicos em vez de nomes longos tipo “pai-filho”.
                    </p>
                  </div>

                  {activeSmartDeck && (
                    <button
                      onClick={() => setActiveSmartDeck(null)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Limpar smart deck
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: 'new', label: 'Novos', count: smartDeckCounters.new },
                    { id: 'hard', label: 'Difíceis', count: smartDeckCounters.hard },
                    { id: 'favorites', label: 'Favoritos', count: smartDeckCounters.favorites },
                  ].map((deck) => (
                    <button
                      key={deck.id}
                      onClick={() => setActiveSmartDeck((prev) => (prev === deck.id ? null : deck.id))}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        activeSmartDeck === deck.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <p className="text-sm font-black">{deck.label}</p>
                      <p className="text-2xl font-black mt-2">{deck.count}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <SmartDropdown
                    value={libraryMode}
                    onChange={setLibraryMode}
                    placeholder="Todos os cards"
                    options={[
                      {
                        id: 'status_group',
                        label: 'Por Status',
                        icon: <Layers className="w-4 h-4" />,
                        description: 'Estado dos flashcards',
                        subOptions: [
                          { id: 'deck', label: 'Todos os cards' },
                          { id: 'favorites', label: 'Favoritos' },
                          { id: 'due', label: 'Vencidos' },
                        ],
                      },
                    ]}
                  />

                  <SmartDropdown
                    value={librarySpecialtyFilter}
                    onChange={setLibrarySpecialtyFilter}
                    placeholder="Todas as especialidades"
                    options={[
                      {
                        id: 'specialties_group',
                        label: 'Especialidades',
                        icon: <Folder className="w-4 h-4" />,
                        description: 'Filtrar por área médica',
                        subOptions: [
                          { id: '', label: 'Todas as especialidades' },
                          ...librarySpecialties.map((specialty) => ({
                            id: specialty,
                            label: specialty,
                          })),
                        ],
                      },
                    ]}
                  />

                  <SmartDropdown
                    value={selectedDeckId}
                    onChange={setSelectedDeckId}
                    placeholder="Todos os decks"
                    options={[
                      {
                        id: 'all_decks_group',
                        label: 'Biblioteca',
                        icon: <Folder className="w-4 h-4" />,
                        description: 'Escolha um deck',
                        subOptions: [
                          { id: '', label: 'Todos os decks' },
                          ...libraryDecks.map((deck) => ({
                            id: deck.id,
                            label: deck.specialty
                              ? `${deck.name} · ${deck.specialty}`
                              : deck.name,
                          })),
                        ],
                      },
                    ]}
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Buscar card..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />

                    <button
                      onClick={() =>
                        loadLibraryCards({
                          deckId: selectedDeckId,
                          specialty: librarySpecialtyFilter,
                          favorites: libraryMode === 'favorites',
                          dueOnly: libraryMode === 'due',
                          search: librarySearch,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
                    >
                      Buscar
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900">Criar / selecionar deck</h3>

                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Nome do novo deck"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />

                  <SmartDropdown
                    value={newDeckSpecialty}
                    onChange={setNewDeckSpecialty}
                    placeholder="Sem especialidade"
                    options={[
                      {
                        id: 'new_deck_specialty_group',
                        label: 'Especialidade do deck',
                        icon: <Folder className="w-4 h-4" />,
                        description: 'Área médica do novo deck',
                        subOptions: [
                          { id: '', label: 'Sem especialidade' },
                          ...librarySpecialties.map((specialty) => ({
                            id: specialty,
                            label: specialty,
                          })),
                        ],
                      },
                    ]}
                  />

                  <input
                    type="text"
                    value={newDeckSubSpecialty}
                    onChange={(e) => setNewDeckSubSpecialty(e.target.value)}
                    placeholder="Tema / subespecialidade"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />

                  <button
                    onClick={createLibraryDeck}
                    className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                  >
                    Criar deck
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
  <h3 className="text-lg font-bold text-slate-900">Resumo da biblioteca</h3>

  <div className="grid grid-cols-2 gap-3">
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase">Decks</p>
      <p className="text-2xl font-black text-slate-900 mt-1">{libraryDecks.length}</p>
    </div>

    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase">Cards</p>
      <p className="text-2xl font-black text-slate-900 mt-1">{libraryCards.length}</p>
    </div>

    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase">Favoritos</p>
      <p className="text-2xl font-black text-slate-900 mt-1">
        {libraryCards.filter((card) => Boolean(card.is_favorite)).length}
      </p>
    </div>

    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase">Vencidos</p>
      <p className="text-2xl font-black text-slate-900 mt-1">
        {libraryCards.filter((card) => {
          const dueAt = card?.review_state?.dueAt;
          return dueAt ? new Date(dueAt) <= new Date() : false;
        }).length}
      </p>
    </div>
  </div>

  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
    <p className="text-sm font-bold text-indigo-900">Dica de organização</p>
    <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
      Use o acervo principal abaixo para abrir pastas, visualizar temas, estudar uma pasta inteira
      ou agendar revisão por assunto.
    </p>
  </div>
</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Acervo por pastas</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Especialidades aparecem como pastas principais. Temas aparecem como subpastas.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        createArchiveFolder({
                          level: 'specialty',
                        })
                      }
                      className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100"
                    >
                      Nova pasta
                    </button>

                    <button
                      onClick={clearArchiveSelection}
                      className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-bold hover:bg-white"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  placeholder="Buscar no acervo..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm"
                />

                <div className="space-y-4">
                  {archiveTree.map((specialty) => {
                    const specialtyOpen = Boolean(expandedArchiveSpecialties[specialty.id]);
                    const specialtyCards = specialty.topics.flatMap((topic) =>
                      topic.decks.flatMap((deck) => deck.cards)
                    );

                    return (
                      <div key={specialty.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div
                          onClick={() =>
                            setExpandedArchiveSpecialties((prev) => ({
                              ...prev,
                              [specialty.id]: !prev[specialty.id],
                            }))
                          }
                          className="flex items-center justify-between gap-4 cursor-pointer"
                        >
                          <div className="flex items-center gap-4 text-left">
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                              {specialtyOpen ? <FolderOpen size={28} /> : <Folder size={28} />}
                            </div>

                            <div>
                              <p className="text-lg font-black text-slate-900">{specialty.name}</p>
                              <p className="text-xs font-black text-slate-400 uppercase">
                                {specialtyCards.length} cards · {specialty.topics.length} temas
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">


                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                renameArchiveFolder({
                                  type: 'specialty',
                                  currentName: specialty.name,
                                  cards: specialtyCards,
                                });
                              }}
                              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                            >
                              Editar nome
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                createArchiveFolder({
                                  level: 'topic',
                                  specialtyName: specialty.name,
                                });
                              }}
                              className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700"
                            >
                              Nova subpasta
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openMoveFolderDialog({
                                  type: 'specialty',
                                  name: specialty.name,
                                  cards: specialtyCards,
                                });
                              }}
                              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                            >
                              Mover
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteArchiveFolder({
                                  type: 'specialty',
                                  name: specialty.name,
                                  cards: specialtyCards,
                                });
                              }}
                              className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>

                        {specialtyOpen ? (
                          <div className="mt-5 space-y-3">
                            {specialty.topics.map((topic) => {
                              const topicKey = `${specialty.id}:${topic.name}`;
                              const topicOpen = Boolean(expandedArchiveTopics[topicKey]);
                              const topicCards = topic.decks.flatMap((deck) => deck.cards);

                              return (
                                <div
                                  key={topicKey}
                                  className="rounded-3xl border border-slate-200 bg-white p-5"
                                >
                                  <div
                                    onClick={() => {
                                      setExpandedArchiveTopics((prev) => ({
                                        ...prev,
                                        [topicKey]: !prev[topicKey],
                                      }));
                                      selectArchiveTopic(specialty.name, topic.name);
                                    }}
                                    className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 cursor-pointer hover:bg-slate-50 -m-5 p-5 rounded-3xl transition-colors"
                                  >
                                    <div className="flex items-center gap-4 text-left">
                                      <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                                        {topicOpen ? <FolderOpen size={22} /> : <Folder size={22} />}
                                      </div>

                                      <div>
                                        <p className="text-base font-black text-slate-900">
                                          {topic.name}
                                        </p>
                                        <p className="text-xs font-black text-slate-400 uppercase">
                                          {topicCards.length} cards · {topic.decks.length} decks
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          createArchiveFolder({
                                            level: 'deck',
                                            specialtyName: specialty.name,
                                            topicName: topic.name,
                                          });
                                        }}
                                        className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                      >
                                        Novo deck
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          renameArchiveFolder({
                                            type: 'topic',
                                            currentName: topic.name,
                                            specialtyName: specialty.name,
                                            cards: topicCards,
                                          });
                                        }}
                                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                                      >
                                        Editar nome
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          viewArchiveFolder({
                                            cards: topicCards,
                                            specialty: specialty.name,
                                          });
                                        }}
                                        className="
                                          px-3 py-1.5
                                          rounded-xl
                                          border border-indigo-200
                                          bg-indigo-50
                                          text-indigo-700
                                          text-xs font-bold
                                          hover:bg-indigo-100
                                          transition-colors
                                        "
                                      >
                                        Visualizar / estudar
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          scheduleArchiveFolderForReview(topicCards);
                                        }}
                                        disabled={!topicCards.length}
                                        className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 disabled:opacity-50"
                                      >
                                        Agendar revisão
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveFolderDialog({
                                            type: 'topic',
                                            name: topic.name,
                                            specialtyName: specialty.name,
                                            cards: topicCards,
                                          });
                                        }}
                                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                                      >
                                        Mover
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteArchiveFolder({
                                            type: 'topic',
                                            name: topic.name,
                                            specialtyName: specialty.name,
                                            cards: topicCards,
                                          });
                                        }}
                                        className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600"
                                      >
                                        Excluir
                                      </button>
                                    </div>
                                  </div>

                                  {topicOpen ? (
                                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                                    {topic.decks.map((deck) => {
                                      const deckKey = `${topicKey}:${deck.id}`;
                                      const deckOpen = Boolean(expandedArchiveDecks[deckKey]);

                                      return (
                                        <div
                                          key={deckKey}
                                          className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"
                                        >
                                          <button
                                            onClick={() => {
                                              setExpandedArchiveDecks((prev) => ({
                                                ...prev,
                                                [deckKey]: !prev[deckKey],
                                              }));
                                              selectArchiveDeck(specialty.name, topic.name, deck.id);
                                            }}
                                            className="w-full p-4 flex items-center justify-between gap-3 text-left"
                                          >
                                            <div className="flex items-center gap-3">
                                              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                                                {deckOpen ? <FolderOpen size={20} /> : <Folder size={20} />}
                                              </div>

                                              <div>
                                                <p className="text-sm font-black text-slate-900">
                                                  {String(deck.name || '').replace(/\s*—\s*Deck Principal$/i, '')}
                                                </p>
                                                <p className="text-xs font-black text-slate-400 uppercase">
                                                  {deck.cards.length} cards
                                                </p>
                                              </div>
                                            </div>


                                            <span className="text-xs font-bold text-slate-400">
                                              {deckOpen ? 'Fechar' : 'Abrir'}
                                            </span>
                                          </button>

                                          {deckOpen ? (
                                            <div className="border-t border-slate-200 p-4 space-y-2">
                                              {deck.cards.map((card) => (
                                                <div
                                                  key={card.id}
                                                  className="rounded-xl border border-slate-200 bg-white p-3"
                                                >
                                                  <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                      <p className="text-sm font-bold text-slate-900">
                                                        {card.question}
                                                      </p>
                                                      <FormattedAiText
                                                        text={card.answer}
                                                        className="text-xs text-slate-500 mt-1 line-clamp-2 [&_p]:inline [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-slate-700"
                                                      />
                                                    </div>

                                                    <div className="flex flex-col gap-2 shrink-0">
                                                      <button
                                                        onClick={() => openLibraryCardPreview(card)}
                                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                                                      >
                                                        Prévia
                                                      </button>

                                                      <button
                                                        onClick={() => startEditingLibraryCard(card)}
                                                        className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                                      >
                                                        Editar
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {moveFolderDialog ? (
          <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">
                  Mover pasta
                </p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {moveFolderDialog.name}
                </h3>
                <p className="text-sm text-slate-500 mt-2">
                  Escolha para qual pasta principal deseja mover este conteúdo.
                </p>
              </div>

              <div className="p-4 max-h-[360px] overflow-y-auto space-y-2">
                {archiveTree
                  .filter((item) => item.name !== moveFolderDialog.name)
                  .map((specialty) => {
                    const selected = moveFolderTargetSpecialty === specialty.name;

                    return (
                      <button
                        key={specialty.id}
                        type="button"
                        onClick={() => setMoveFolderTargetSpecialty(specialty.name)}
                        className={[
                          'w-full flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all',
                          selected
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                            : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                              selected ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-500'
                            }`}
                          >
                            <FolderOpen size={20} />
                          </div>

                          <div>
                            <p className="text-sm font-black">{specialty.name}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase">
                              {specialty.cardCount} cards · {specialty.topics.length} temas
                            </p>
                          </div>
                        </div>

                        {selected ? <Check className="w-5 h-5 text-indigo-600" /> : null}
                      </button>
                    );
                  })}
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMoveFolderDialog(null);
                    setMoveFolderTargetSpecialty('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmMoveFolder}
                  disabled={!moveFolderTargetSpecialty}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Mover para pasta
                </button>
              </div>
            </div>
          </div>
        ) : null}

          {previewLibraryCard ? (
          <div className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">
                    Prévia do flashcard
                  </p>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    {previewLibraryCard.question}
                  </h3>
                </div>

                <button
                  onClick={() => setPreviewLibraryCard(null)}
                  className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-white"
                >
                  ×
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs font-black uppercase text-slate-400 mb-2">
                    Resposta
                  </p>
                  <FormattedAiText
                    text={previewLibraryCard.answer}
                    className="text-sm text-slate-700 leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900"
                  />
                </div>

                {previewLibraryCard.preceptor_note ? (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                    <p className="text-xs font-black uppercase text-amber-600 mb-2">
                      Nota do preceptor
                    </p>
                    <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                      {previewLibraryCard.preceptor_note}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {previewLibraryCard.specialty ? (
                    <span className="px-3 py-1 rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                      {previewLibraryCard.specialty}
                    </span>
                  ) : null}

                  {previewLibraryCard.sub_specialty ? (
                    <span className="px-3 py-1 rounded-full bg-violet-50 text-xs font-bold text-violet-700">
                      {previewLibraryCard.sub_specialty}
                    </span>
                  ) : null}

                  {previewLibraryCard.difficulty ? (
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {previewLibraryCard.difficulty}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => setPreviewLibraryCard(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                >
                  Fechar
                </button>

                <button
                  onClick={() => {
                    startEditingLibraryCard(previewLibraryCard);
                    setPreviewLibraryCard(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
                >
                  Editar flashcard
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
              <div className="flex flex-wrap gap-3 mb-4">
                <SmartDropdown
                  value={studyMode}
                  onChange={setStudyMode}
                  placeholder="Todos"
                  className="w-full sm:w-[155px]"
                  options={[
                    {
                      id: 'study_mode_group',
                      label: 'Modo de estudo',
                      icon: <Layers className="w-4 h-4" />,
                      description: 'Tipo de fila',
                      subOptions: [
                        { id: 'all', label: 'Todos' },
                        { id: 'favorites', label: 'Favoritos' },
                        { id: 'due', label: 'Vencidos' },
                        { id: 'new', label: 'Novos' },
                      ],
                    },
                  ]}
                />

                <SmartDropdown
                  value={studySpecialty}
                  onChange={setStudySpecialty}
                  placeholder="Especialidade"
                  className="w-full sm:w-[260px]"
                  options={[
                    {
                      id: 'study_specialty_group',
                      label: 'Especialidade',
                      icon: <Folder className="w-4 h-4" />,
                      description: 'Área médica',
                      subOptions: [
                        { id: '', label: 'Todas as especialidades' },
                        ...librarySpecialties.map((specialty) => ({
                          id: specialty,
                          label: specialty,
                        }))
                      ],
                    },
                  ]}
                />

                <SmartDropdown
                  value={studyTopic}
                  onChange={setStudyTopic}
                  placeholder="Tema"
                  className="w-full sm:w-[200px]"
                  options={[
                    {
                      id: 'study_topic_group',
                      label: 'Tema / tag',
                      icon: <Filter className="w-4 h-4" />,
                      description: 'Filtrar por assunto',
                      subOptions: [
                        { id: '', label: 'Todos os temas' },
                        ...libraryStudyTopicOptions.map((topic) => ({
                          id: topic,
                          label: topic,
                        }))
                      ],
                    },
                  ]}
                />

                <SmartDropdown
                  value={studyResponseFilter}
                  onChange={setStudyResponseFilter}
                  placeholder="Resposta anterior"
                  className="w-full sm:w-[220px]"
                  options={[
                    {
                      id: 'study_response_group',
                      label: 'Resposta anterior',
                      icon: <CheckCircle2 className="w-4 h-4" />,
                      description: 'Filtrar pelo feedback já dado',
                      subOptions: [
                        { id: 'all', label: 'Todas' },
                        { id: 'unanswered', label: 'Não respondidos' },
                        { id: 'again', label: 'Errei' },
                        { id: 'hard', label: 'Difícil' },
                        { id: 'good', label: 'Bom' },
                        { id: 'easy', label: 'Fácil' },
                      ],
                    },
                  ]}
                />

                <button
                  onClick={buildStudyQueue}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white"
                >
                  Iniciar estudo
                </button>

              </div>

              <p className="text-xs text-slate-400 font-medium">
                Dados salvos a partir do histórico de revisão dos flashcards.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Vistos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{visibleStudyStats.totalSeen}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Acertos</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{visibleStudyStats.correctCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Difíceis</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{visibleStudyStats.hardCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 uppercase font-bold">Fáceis</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{visibleStudyStats.easyCount}</p>
                </div>
              </div>

              {!currentLibraryStudyCard ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <Lightbulb className="mx-auto mb-4 text-slate-300" size={30} />
                  <h3 className="text-lg font-semibold text-slate-800">Nenhuma sessão iniciada</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Escolha os filtros desejados e clique em “Iniciar estudo” para carregar a fila.
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
                      <div
                        className={`absolute inset-0 w-full h-full rounded-3xl p-10 flex flex-col items-center justify-center text-center [backface-visibility:hidden] ${
                          currentLibraryStudyResponseMeta.panelClass
                        }`}
                      >
                        <div className="absolute top-6 left-6 right-6 flex items-center justify-between gap-3">
                          <span className="text-[#6366f1] text-xs font-bold tracking-wider uppercase">
                            Biblioteca
                          </span>

                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold ${currentLibraryStudyResponseMeta.chipClass}`}
                          >
                            {currentLibraryStudyResponseMeta.label}
                          </span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                          {currentLibraryStudyCard.question}
                        </h3>
                        <p className="absolute bottom-6 text-slate-400 text-sm">Clique para virar</p>
                      </div>

                      <div
                        className={`absolute inset-0 w-full h-full rounded-3xl p-8 md:p-10 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                          currentLibraryStudyResponseMeta.panelClass
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-6">
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Resposta
                          </span>

                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold ${currentLibraryStudyResponseMeta.chipClass}`}
                          >
                            {currentLibraryStudyResponseMeta.longLabel}
                          </span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center">
                          <div className="w-full max-w-xl mx-auto text-center">
                            <FormattedAiText
                              text={currentLibraryStudyCard.answer}
                              className="text-slate-700 text-lg leading-relaxed [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:text-left [&_ol]:text-left"
                            />

                            {currentLibraryStudyCard.preceptor_note && (
                              <div className="mt-8 bg-amber-50 border border-amber-100 rounded-2xl p-5 text-left">
                                <p className="text-amber-900 text-sm leading-relaxed">
                                  {currentLibraryStudyCard.preceptor_note}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                    <button
                      onClick={() => rateLibraryStudyCard(1)}
                      disabled={isSavingLibraryReview}
                      className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Errei
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(2)}
                      disabled={isSavingLibraryReview}
                      className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Difícil
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(3)}
                      disabled={isSavingLibraryReview}
                      className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Bom
                    </button>

                    <button
                      onClick={() => rateLibraryStudyCard(4)}
                      disabled={isSavingLibraryReview}
                      className="px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Fácil
                    </button>
                  </div>

                  <p className="mt-4 text-xs text-slate-500 text-center max-w-xl">
                    Cards ainda não respondidos são priorizados automaticamente. Use o filtro de
                    “Resposta anterior” para ver apenas os marcados como Errei, Difícil, Bom ou Fácil.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section
            ref={spacedReviewSectionRef}
            className="scroll-mt-24 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500 mb-2">
                  Revisão espaçada
                </p>
                <h2 className="text-2xl font-bold text-slate-900">Revisão Inteligente</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Revise os flashcards no momento certo, priorizando vencidos, novos e difíceis.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => buildSpacedReviewQueue('today')}
                  disabled={isBuildingSpacedReview}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  Revisar hoje
                </button>

                <button
                  onClick={() => buildSpacedReviewQueue('new')}
                  disabled={isBuildingSpacedReview}
                  className="px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-50"
                >
                  Novos
                </button>

                <button
                  onClick={() => buildSpacedReviewQueue('hard')}
                  disabled={isBuildingSpacedReview}
                  className="px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50"
                >
                  Difíceis
                </button>

                <button
                  onClick={() => buildSpacedReviewQueue('deck')}
                  disabled={!selectedDeckId || isBuildingSpacedReview}
                  className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-50"
                >
                  Deck selecionado
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50/30 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Hoje</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{spacedReviewBuckets.todayCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Novos</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{spacedReviewBuckets.newCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Difíceis</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{spacedReviewBuckets.hardCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Atrasados</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{spacedReviewBuckets.overdueCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Vistos</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{spacedReviewStats.totalSeen}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Errei</p>
                  <p className="text-2xl font-black text-red-600 mt-1">{spacedReviewStats.againCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Bom</p>
                  <p className="text-2xl font-black text-blue-600 mt-1">{spacedReviewStats.goodCount}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 h-[94px] flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Meta</p>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={dailyReviewGoal}
                    onChange={(e) => setDailyReviewGoal(Number(e.target.value || 30))}
                    className="w-20 text-center text-2xl font-black text-slate-900 bg-transparent outline-none mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
                <div className="bg-white border border-slate-200 rounded-3xl p-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Calendário inteligente</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Visualize quando os cards vencem e planeje revisões futuras.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewCalendarDate((prev) => {
                            const next = new Date(prev);
                            next.setMonth(next.getMonth() - 1);
                            return next;
                          });
                          setSelectedReviewDate(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"
                      >
                        ◀
                      </button>

                      <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-black text-slate-800 min-w-[180px] text-center capitalize">
                        {reviewCalendarMonthLabel}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setReviewCalendarDate((prev) => {
                            const next = new Date(prev);
                            next.setMonth(next.getMonth() + 1);
                            return next;
                          });
                          setSelectedReviewDate(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                      <div
                        key={day}
                        className="text-center text-[11px] font-black uppercase tracking-wider text-slate-400"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {reviewCalendarWeeks.flat().map((day) => {
                      const dateKey = formatDateKeyLocal(day);
                      const isCurrentMonth = day.getMonth() === reviewCalendarDate.getMonth();
                      const isToday = dateKey === formatDateKeyLocal(new Date());
                      const isSelected = selectedReviewDate === dateKey;
                      const localCount = reviewCardsByDate[dateKey]?.length || 0;
                      const googleCount = googleCalendarEventsByDate[dateKey]?.length || 0;
                      const totalCount = localCount + googleCount;

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedReviewDate(dateKey)}
                          className={`min-h-[88px] rounded-2xl border p-2 text-left transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                              : isToday
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                          } ${isCurrentMonth ? 'opacity-100' : 'opacity-35'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-slate-800">
                              {day.getDate()}
                            </span>

                            {totalCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black">
                                {totalCount}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 space-y-1">
                            {localCount > 0 ? (
                              <div className="h-1.5 rounded-full bg-indigo-500" />
                            ) : null}

                            {googleCount > 0 ? (
                              <div className="h-1.5 rounded-full bg-emerald-500" />
                            ) : null}
                          </div>

                          {totalCount > 0 ? (
                            <p className="text-[10px] text-slate-500 mt-2">
                              {localCount} local · {googleCount} calendar
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Google Calendar</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Envie suas próximas revisões para sua agenda.
                      </p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        isGoogleCalendarConnected
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isGoogleCalendarConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {!isGoogleCalendarConnected ? (
                      <button
                        type="button"
                        onClick={connectGoogleCalendar}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"
                      >
                        Conectar Google Calendar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={syncDueCardsWithGoogleCalendar}
                          disabled={isSyncingGoogleCalendar}
                          className="w-full px-4 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isSyncingGoogleCalendar
                            ? 'Sincronizando...'
                            : 'Sincronizar próximas revisões'}
                        </button>

                        <button
                          type="button"
                          onClick={fetchGoogleCalendarReviewEvents}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50"
                        >
                          Atualizar eventos do mês
                        </button>

                        <button
                          type="button"
                          onClick={disconnectGoogleCalendar}
                          className="w-full px-4 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100"
                        >
                          Desconectar
                        </button>
                      </>
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                      Dia selecionado
                    </p>

                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {selectedReviewDate
                        ? new Date(`${selectedReviewDate}T00:00:00`).toLocaleDateString('pt-BR')
                        : 'Nenhum dia selecionado'}
                    </p>

                    <div className="mt-4 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                      {selectedReviewDateCards.length === 0 && selectedGoogleCalendarEvents.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Nenhuma revisão encontrada neste dia.
                        </p>
                      ) : null}

                      {selectedReviewDateCards.map((card) => (
                        <div
                          key={`local-${card.id}`}
                          className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"
                        >
                          <p className="text-[11px] font-black uppercase tracking-wider text-indigo-500">
                            Local
                          </p>
                          <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-2">
                            {card.question}
                          </p>
                        </div>
                      ))}

                      {selectedGoogleCalendarEvents.map((event) => (
                        <div
                          key={`gcal-${event.id}`}
                          className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"
                        >
                          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600">
                            Google Calendar
                          </p>
                          <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-2">
                            {event.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {isBuildingSpacedReview ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                  <Loader2 className="mx-auto mb-4 text-indigo-500 animate-spin" size={30} />
                  <h3 className="text-lg font-semibold text-slate-800">Montando fila inteligente...</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Priorizando cards vencidos, novos e difíceis.
                  </p>
                </div>
              ) : !currentSpacedReviewCard ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <RefreshCw className="mx-auto mb-4 text-slate-300" size={30} />
                  <h3 className="text-lg font-semibold text-slate-800">
                    Nenhuma revisão iniciada
                  </h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Escolha “Revisar hoje”, “Novos”, “Difíceis” ou “Deck selecionado”.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full max-w-3xl mb-6">
                    <div>
                      <span className="text-sm font-semibold text-slate-500">
                        Card {currentSpacedReviewIndex + 1} de {spacedReviewQueue.length}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">
                        Modo atual: {spacedReviewMode === 'today'
                          ? 'Revisão de hoje'
                          : spacedReviewMode === 'new'
                            ? 'Cards novos'
                            : spacedReviewMode === 'hard'
                              ? 'Cards difíceis'
                              : 'Deck selecionado'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {currentSpacedReviewCard.specialty ? (
                        <span className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {currentSpacedReviewCard.specialty}
                        </span>
                      ) : null}

                      {currentSpacedReviewCard.sub_specialty ? (
                        <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                          {currentSpacedReviewCard.sub_specialty}
                        </span>
                      ) : null}

                      {normalizeReviewStateForSpacedReview(currentSpacedReviewCard).status ? (
                        <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-semibold">
                          {normalizeReviewStateForSpacedReview(currentSpacedReviewCard).status}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className="relative w-full max-w-3xl h-[440px] cursor-pointer group [perspective:1000px]"
                    onClick={() => setIsSpacedReviewFlipped(!isSpacedReviewFlipped)}
                  >
                    <div
                      className={`w-full h-full relative transition-all duration-500 [transform-style:preserve-3d] shadow-lg rounded-3xl ${
                        isSpacedReviewFlipped ? '[transform:rotateY(180deg)]' : ''
                      }`}
                    >
                      <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center [backface-visibility:hidden]">
                        <span className="absolute top-6 left-6 text-indigo-600 text-xs font-bold tracking-wider uppercase">
                          Pergunta
                        </span>

                        <h3 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                          {currentSpacedReviewCard.question}
                        </h3>

                        <p className="absolute bottom-6 text-slate-400 text-sm">
                          Clique para virar
                        </p>
                      </div>

                      <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-3xl p-8 md:p-10 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto">
                        <span className="text-slate-400 text-xs font-bold tracking-widest mb-3 uppercase">
                          Resposta
                        </span>

                        <FormattedAiText
                          text={currentSpacedReviewCard.answer}
                          className="text-slate-700 text-lg leading-relaxed mb-8 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900"
                        />

                        {currentSpacedReviewCard.preceptor_note && (
                          <div className="mt-auto bg-amber-50 border border-amber-100 rounded-2xl p-5">
                            <p className="text-amber-900 text-sm leading-relaxed">
                              {currentSpacedReviewCard.preceptor_note}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 w-full max-w-3xl">
                    <button
                      onClick={() => rateSpacedReviewCard(1)}
                      disabled={isSavingSpacedReview}
                      className="px-4 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 disabled:opacity-50"
                    >
                      Errei
                      <span className="block text-xs font-medium mt-1">20 min</span>
                    </button>

                    <button
                      onClick={() => rateSpacedReviewCard(2)}
                      disabled={isSavingSpacedReview}
                      className="px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100 disabled:opacity-50"
                    >
                      Difícil
                      <span className="block text-xs font-medium mt-1">curto</span>
                    </button>

                    <button
                      onClick={() => rateSpacedReviewCard(3)}
                      disabled={isSavingSpacedReview}
                      className="px-4 py-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-100 disabled:opacity-50"
                    >
                      Bom
                      <span className="block text-xs font-medium mt-1">normal</span>
                    </button>

                    <button
                      onClick={() => rateSpacedReviewCard(4)}
                      disabled={isSavingSpacedReview}
                      className="px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Fácil
                      <span className="block text-xs font-medium mt-1">longo</span>
                    </button>
                  </div>

                  {isSavingSpacedReview ? (
                    <p className="text-xs text-slate-400 text-center mt-3">
                      Salvando revisão espaçada...
                    </p>
                  ) : null}
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
                        <SmartDropdown
                          value={filterType}
                          onChange={setFilterType}
                          placeholder="Todos os tipos"
                          className="w-auto min-w-[180px]"
                          options={[
                            {
                              id: 'history_type_group',
                              label: 'Tipo de conteúdo',
                              icon: <Layers className="w-4 h-4" />,
                              description: 'Filtrar tipo de execução',
                              subOptions: [
                                { id: 'all', label: 'Todos os tipos' },
                                { id: 'flashcards', label: 'Com Flashcards' },
                                { id: 'transcript', label: 'Só Transcrição' },
                              ],
                            },
                          ]}
                        />

                        <SmartDropdown
                          value={sortBy}
                          onChange={setSortBy}
                          placeholder="Mais recentes"
                          className="w-auto min-w-[180px]"
                          options={[
                            {
                              id: 'history_sort_group',
                              label: 'Ordenação',
                              icon: <Filter className="w-4 h-4" />,
                              description: 'Organizar histórico',
                              subOptions: [
                                { id: 'newest', label: 'Mais recentes' },
                                { id: 'oldest', label: 'Mais antigos' },
                              ],
                            },
                          ]}
                        />

                        <SmartDropdown
                          value={historySpecialtyFilter}
                          onChange={(value) => {
                            setHistorySpecialtyFilter(value);
                            setHistoryTopicFilter('');
                            setHistoryPage(1);
                          }}
                          placeholder="Todas as especialidades"
                          className="w-full sm:w-[240px]"
                          options={[
                            {
                              id: 'history_specialty_group',
                              label: 'Especialidade',
                              icon: <Folder className="w-4 h-4" />,
                              description: 'Filtrar histórico por área',
                              subOptions: [
                                { id: '', label: 'Todas as especialidades' },
                                ...historySpecialtyOptions.map((specialty) => ({
                                  id: specialty,
                                  label: specialty,
                                })),
                              ],
                            },
                          ]}
                        />

                        <SmartDropdown
                          value={historyTopicFilter}
                          onChange={(value) => {
                            setHistoryTopicFilter(value);
                            setHistoryPage(1);
                          }}
                          placeholder="Todos os temas/tags"
                          className="w-full sm:w-[220px]"
                          options={[
                            {
                              id: 'history_topic_group',
                              label: 'Temas / tags',
                              icon: <Filter className="w-4 h-4" />,
                              description: 'Filtrar histórico por assunto',
                              subOptions: [
                                { id: '', label: 'Todos os temas/tags' },
                                ...historyTopicOptions.map((topic) => ({
                                  id: topic,
                                  label: topic,
                                })),
                              ],
                            },
                          ]}
                        />

                        {(historySpecialtyFilter || historyTopicFilter) && (
                          <button
                            type="button"
                            onClick={() => {
                              setHistorySpecialtyFilter('');
                              setHistoryTopicFilter('');
                              setHistoryPage(1);
                            }}
                            className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100"
                          >
                            Limpar filtros avançados
                          </button>
                        )}
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
                                onDoubleClick={() => setQuickPreviewHistoryItem(item)}
                                className="bg-white border border-slate-200 rounded-[28px] p-5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] hover:border-violet-200 transition-all flex flex-col h-full group min-w-0 cursor-default"
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

                                    {item.hasEnrichmentSupport ? (
                                      <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                        Vídeo complementar
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
                                        onClick={() => openQuickPreviewHistoryItem(item)}
                                        className="px-4 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold"
                                      >
                                        Prévia
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
                                    onClick={() => setQuickPreviewHistoryItem(item)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                  >
                                    Prévia
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

        {previewAppliedBlock && (
          <div className="fixed inset-0 z-[95] bg-slate-900/55 flex items-center justify-center px-4 py-12 md:py-16 overflow-y-auto">
            <div className="w-full max-w-5xl max-h-[calc(100vh-7rem)] rounded-[30px] border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col">
              <div className="px-6 md:px-8 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Prévia da adição aplicada
                  </p>

                  <h3 className="text-2xl font-black text-slate-900 mt-2 leading-tight">
                    {previewAppliedBlock.title}
                  </h3>

                  <p className="text-sm text-slate-500 mt-3">
                    {previewAppliedBlock.created_at
                      ? `Adicionado em ${new Date(previewAppliedBlock.created_at).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewAppliedBlock(null)}
                  className="w-12 h-12 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0"
                  aria-label="Fechar prévia"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="px-6 md:px-8 py-6 bg-slate-50/40 overflow-y-auto">
                <div
                  className={`rounded-[24px] border p-6 ${
                    previewAppliedBlock.panelTone === 'lacuna'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-indigo-200 bg-indigo-50'
                  }`}
                >
                  <FormattedAiText
                    text={stripAppliedMetaText(previewAppliedBlock.content, { keepMainBody: false })}
                    className="text-base text-slate-800 leading-8"
                  />
                </div>
              </div>

              <div className="px-6 md:px-8 py-4 border-t border-slate-100 bg-white flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    startEditingAppliedBlock(previewAppliedBlock);
                    setPreviewAppliedBlock(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const id = previewAppliedBlock.id;
                    setPreviewAppliedBlock(null);
                    removeAppliedEnrichmentBlock(id);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100"
                >
                  Remover
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewAppliedBlock(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {quickPreviewHistoryItem && (
        <div className="fixed inset-0 z-[90] bg-slate-900/50 flex items-start justify-center px-4 py-10 overflow-y-auto">
          <div className="w-full max-w-3xl max-h-[calc(100vh-5rem)] rounded-[28px] border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Prévia do histórico
                </p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {quickPreviewHistoryItem.title}
                </h3>
                <p className="text-sm text-slate-500 mt-2">
                  {new Date(quickPreviewHistoryItem.date).toLocaleString('pt-BR')}
                </p>
              </div>

              <button
                onClick={() => setQuickPreviewHistoryItem(null)}
                className="w-12 h-12 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0"
                aria-label="Fechar prévia"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 bg-slate-50/40 space-y-5 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {quickPreviewHistoryItem.specialty ? (
                  <span className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                    {quickPreviewHistoryItem.specialty}
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                    Sem especialidade
                  </span>
                )}

                {quickPreviewHistoryItem.hasAnalysis ? (
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    Análise disponível
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                    Sem análise
                  </span>
                )}

                {quickPreviewHistoryItem.hasFlashcards ? (
                  <span className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold">
                    {quickPreviewHistoryItem.flashcardsCount} flashcards
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                    Só transcrição
                  </span>
                )}

                {quickPreviewHistoryItem.videoUrl ? (
                  <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                    Vídeo salvo
                  </span>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Prévia da transcrição
                </h4>
                <div className="text-sm text-slate-600 leading-relaxed max-h-[360px] overflow-y-auto whitespace-pre-wrap pr-2">
                  {quickPreviewHistoryItem.transcript || quickPreviewHistoryItem.preview || 'Sem transcrição disponível.'}
                </div>
              </div>

              {quickPreviewHistoryItem.enrichedTranscript ? (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-500 mb-3">
                    Texto enriquecido disponível
                  </h4>
                  <p className="text-sm text-indigo-900 leading-relaxed">
                    Este item possui texto enriquecido salvo. Abra o item completo para comparar com a transcrição original.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                {quickPreviewHistoryItem.videoUrl ? (
                  <button
                    onClick={() =>
                      window.open(
                        quickPreviewHistoryItem.videoUrl,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                    className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100"
                  >
                    Ver vídeo
                  </button>
                ) : null}

                <button
                  onClick={() => {
                    const id = quickPreviewHistoryItem.id;
                    setQuickPreviewHistoryItem(null);
                    openHistoryDetails(id);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Abrir item completo
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

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