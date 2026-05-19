const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  ImageRun,
  UnderlineType,
  PageOrientation,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  ShadingType,
  HeightRule,
  TableLayoutType,
  TabStopType,
} = require('docx');
const ffmpegStatic = require('ffmpeg-static');
const { createClient } = require('@supabase/supabase-js');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { google } = require('googleapis');
require('dotenv').config();

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

function parseCommaList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function uniqueList(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

const GEMINI_API_KEYS = uniqueList([
  ...parseCommaList(process.env.GEMINI_API_KEYS),
  process.env.GEMINI_API_KEY || '',
]);

const GEMINI_API_KEY = GEMINI_API_KEYS[0] || '';

const GEMINI_TEXT_MODELS = uniqueList([
  ...parseCommaList(process.env.GEMINI_TEXT_MODELS),
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]);

const GEMINI_METADATA_MODELS = uniqueList([
  ...parseCommaList(process.env.GEMINI_METADATA_MODELS),
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
]);

const GEMINI_FLASHCARD_MODELS = uniqueList([
  ...parseCommaList(process.env.GEMINI_FLASHCARD_MODELS),
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-pro',
]);

const GEMINI_KEY_COOLDOWN_MS = Number(process.env.GEMINI_KEY_COOLDOWN_MS || 70_000);
const geminiKeyCooldowns = new Map();
const GEMINI_IMAGE_MODELS = uniqueList([
  ...parseCommaList(process.env.GEMINI_IMAGE_MODELS),
  process.env.GEMINI_IMAGE_MODEL || '',
  'imagen-4.0-fast-generate-001',
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
]);
const FLASHCARD_IMAGE_WIDTH = Number(process.env.FLASHCARD_IMAGE_WIDTH || 1080);
const FLASHCARD_IMAGE_HEIGHT = Number(process.env.FLASHCARD_IMAGE_HEIGHT || 1920);

const EXPORT_SVG_FONT_FAMILY =
  process.env.EXPORT_SVG_FONT_FAMILY ||
  'Noto Sans, DejaVu Sans, Arial, Helvetica, sans-serif';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const TEMP_AUDIO_DIR = path.join(ROOT_DIR, 'temp-audio');
const REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_ARTICLES_PER_SOURCE = 6;
const DEFAULT_REFERENCE_VIDEOS_LIMIT = 3;
const MULTIPART_PART_SIZE_BYTES = 64 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_AUDIO_DIR)) {
  fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

const r2 =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

const VIDEO_REFERENCE_LIBRARY = [
  {
    id: 'ref-neuro-01',
    title: 'Vídeo de referência - Neurologia clínica',
    specialty: 'Neurologia',
    topics: ['avc', 'cefaleia', 'convulsão', 'epilepsia', 'déficit focal'],
    tags: ['neurologia', 'conduta', 'diagnóstico', 'emergência'],
    summary:
      'Aula de referência com foco em raciocínio clínico, diferenciais e conduta inicial em neurologia.',
    transcript_reference: `
Discussão estruturada de neurologia clínica com foco em síndrome neurológica focal aguda,
diferenciação entre AVC isquêmico e hemorrágico, investigação inicial, interpretação de sinais
de alarme, priorização de tomografia, conduta nas primeiras horas, avaliação de contraindicações
para terapias de reperfusão e revisão de causas frequentes de cefaleia secundária.
    `.trim(),
    key_points: [
      'Reconhecimento rápido de déficit focal agudo',
      'Diferença prática entre AVC isquêmico e hemorrágico',
      'Importância do tempo de início dos sintomas',
      'Conduta inicial e estabilização',
      'Critérios clínicos que mudam conduta imediata',
    ],
    clinical_focus: [
      'diagnóstico sindrômico',
      'conduta inicial',
      'priorização de exames',
      'armadilhas de emergência',
    ],
    common_pitfalls: [
      'Atrasar imagem em paciente com déficit focal',
      'Subvalorizar cefaleia com sinais neurológicos',
      'Confundir crise epiléptica pós-ictal com AVC',
    ],
    flashcard_angles: [
      'definições práticas',
      'diferenças entre diagnósticos',
      'conduta inicial',
      'pegadinhas de prova',
    ],
  },
  {
    id: 'ref-cardio-01',
    title: 'Vídeo de referência - Cardiologia prática',
    specialty: 'Cardiologia',
    topics: ['sindrome coronariana aguda', 'insuficiência cardíaca', 'arritmia', 'ecg'],
    tags: ['cardiologia', 'ecg', 'conduta', 'emergência'],
    summary:
      'Vídeo voltado para revisão prática de cardiologia com interpretação e tomada de decisão.',
    transcript_reference: `
Revisão prática de cardiologia com abordagem de dor torácica, síndrome coronariana aguda,
interpretação inicial de ECG, reconhecimento de arritmias comuns, estratificação de risco,
avaliação de sinais de insuficiência cardíaca e decisões terapêuticas iniciais.
    `.trim(),
    key_points: [
      'Leitura inicial de ECG com foco em urgência',
      'Diferença entre síndromes coronarianas',
      'Sinais clínicos de insuficiência cardíaca descompensada',
      'Reconhecimento de arritmias frequentes',
      'Tomada de decisão inicial',
    ],
    clinical_focus: [
      'interpretação prática',
      'estratificação de risco',
      'conduta inicial',
      'emergência cardiovascular',
    ],
    common_pitfalls: [
      'Subestimar dor torácica atípica',
      'Interpretar ECG fora do contexto clínico',
      'Atrasar reconhecimento de instabilidade hemodinâmica',
    ],
    flashcard_angles: [
      'critérios diagnósticos',
      'interpretação de ECG',
      'conduta imediata',
      'diferenças entre quadros semelhantes',
    ],
  },
  {
    id: 'ref-clinmed-01',
    title: 'Vídeo de referência - Clínica Médica',
    specialty: 'Clínica Médica',
    topics: ['diagnóstico diferencial', 'conduta', 'semiologia', 'tratamento'],
    tags: ['clínica médica', 'residência', 'revisão', 'prova'],
    summary:
      'Aula de apoio geral para organizar raciocínio clínico, revisão de temas amplos e integração do conteúdo.',
    transcript_reference: `
Discussão integrada de clínica médica com foco em raciocínio diagnóstico, organização de hipóteses,
priorização de diagnósticos diferenciais, interpretação de sinais e sintomas, integração entre
semiologia, exames complementares e conduta baseada em gravidade e probabilidade clínica.
    `.trim(),
    key_points: [
      'Organização do raciocínio clínico',
      'Construção de diagnóstico diferencial',
      'Priorização por gravidade',
      'Interpretação integrada de dados clínicos',
      'Tomada de decisão em cenário de prova e prática',
    ],
    clinical_focus: [
      'raciocínio clínico',
      'diagnóstico diferencial',
      'semiologia aplicada',
      'integração teórico-prática',
    ],
    common_pitfalls: [
      'Listar diagnósticos sem hierarquizar',
      'Pedir exames sem hipótese clínica clara',
      'Confundir achado inespecífico com diagnóstico fechado',
    ],
    flashcard_angles: [
      'algoritmos mentais',
      'diferenças conceituais',
      'erros comuns',
      'aplicação prática',
    ],
  },
];

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
});

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Falha ao remover arquivo temporário:', error.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida em JSON: ${String(text).slice(0, 300)}`);
  }
}

function getGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function stripMarkdownJsonFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractTranscriptFromDeepgram(data) {
  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
}

function isRetryableGeminiError(statusCode, message) {
  const msg = String(message || '').toLowerCase();

  return (
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 503 ||
    msg.includes('high demand') ||
    msg.includes('resource exhausted') ||
    msg.includes('model capacity exhausted') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('timeout')
  );
}

function isGeminiQuotaError(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.statusCode === 429 ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('resource exhausted') ||
    message.includes('free_tier')
  );
}

function maskGeminiKey(key = '') {
  if (!key) return 'sem-chave';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function getRetryDelayMsFromGeminiError(error) {
  const message = String(error?.message || '');
  const retryMatch = message.match(/retry in\s+([\d.]+)s/i);

  if (!retryMatch) return GEMINI_KEY_COOLDOWN_MS;

  const retryMs = Math.ceil(Number(retryMatch[1]) * 1000);

  return Number.isFinite(retryMs)
    ? Math.max(retryMs, GEMINI_KEY_COOLDOWN_MS)
    : GEMINI_KEY_COOLDOWN_MS;
}

function putGeminiKeyOnCooldown(apiKey, error) {
  if (!apiKey) return;

  const cooldownMs = getRetryDelayMsFromGeminiError(error);
  geminiKeyCooldowns.set(apiKey, Date.now() + cooldownMs);

  console.warn(
    `⚠️ Chave Gemini em cooldown: ${maskGeminiKey(apiKey)} por ${Math.round(cooldownMs / 1000)}s.`
  );
}

function getGeminiKeysToTry() {
  if (!GEMINI_API_KEYS.length) {
    throw new Error('Nenhuma chave Gemini configurada. Defina GEMINI_API_KEY ou GEMINI_API_KEYS.');
  }

  const now = Date.now();

  const availableKeys = GEMINI_API_KEYS.filter((key) => {
    const cooldownUntil = geminiKeyCooldowns.get(key) || 0;
    return cooldownUntil <= now;
  });

  return availableKeys.length ? availableKeys : GEMINI_API_KEYS;
}

function normalizeUtf8Filename(filename) {
  if (!filename) return 'arquivo';
  try {
    return Buffer.from(filename, 'latin1').toString('utf8');
  } catch {
    return filename;
  }
}

function sanitizeFilename(filename) {
  return String(filename || 'arquivo')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function buildTranscriptPreview(text, maxLength = 180) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToSimpleParagraphsHtml(value = '', className = '') {
  const paragraphs = String(value || '')
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!paragraphs.length) return '';

  const classAttr = className ? ` class="${className}"` : '';

  return paragraphs
    .map((paragraph) => `<p${classAttr}>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function buildBilingualFieldHtml({
  pt = '',
  en = '',
  ptClass = '',
  enClass = 'text-blue-600',
}) {
  const ptHtml = textToSimpleParagraphsHtml(pt, ptClass);
  const enHtml = textToSimpleParagraphsHtml(en, enClass);

  return [ptHtml, enHtml].filter(Boolean).join('');
}

function normalizeGeneratedBilingualFlashcards(cards = []) {
  if (!Array.isArray(cards)) return [];

  return cards
    .map((card, index) => {
      const question = String(card.question || card.pergunta || '').trim();
      const answer = String(card.answer || card.resposta || '').trim();
      const preceptorNote = String(
        card.preceptorNote ||
          card.preceptor_note ||
          card.nota_preceptor ||
          ''
      ).trim();

      const questionEn = String(card.question_en || card.questionEn || '').trim();
      const answerEn = String(card.answer_en || card.answerEn || '').trim();
      const preceptorNoteEn = String(
        card.preceptor_note_en ||
          card.preceptorNoteEn ||
          card.nota_preceptor_en ||
          ''
      ).trim();

      if (!question || !answer) return null;

      return {
        ...card,
        id: card.id || `generated-${Date.now()}-${index}`,

        question,
        pergunta: question,
        answer,
        resposta: answer,
        preceptorNote,
        preceptor_note: preceptorNote,
        nota_preceptor: preceptorNote,

        question_en: questionEn,
        questionEn,
        answer_en: answerEn,
        answerEn,
        preceptor_note_en: preceptorNoteEn,
        preceptorNoteEn,

        questionHtml:
          card.questionHtml ||
          card.question_html ||
          buildBilingualFieldHtml({
            pt: question,
            en: questionEn,
          }),
        question_html:
          card.question_html ||
          card.questionHtml ||
          buildBilingualFieldHtml({
            pt: question,
            en: questionEn,
          }),

        answerHtml:
          card.answerHtml ||
          card.answer_html ||
          buildBilingualFieldHtml({
            pt: answer,
            en: answerEn,
          }),
        answer_html:
          card.answer_html ||
          card.answerHtml ||
          buildBilingualFieldHtml({
            pt: answer,
            en: answerEn,
          }),

        preceptorNoteHtml:
          card.preceptorNoteHtml ||
          card.preceptor_note_html ||
          buildBilingualFieldHtml({
            pt: preceptorNote,
            en: preceptorNoteEn,
          }),
        preceptor_note_html:
          card.preceptor_note_html ||
          card.preceptorNoteHtml ||
          buildBilingualFieldHtml({
            pt: preceptorNote,
            en: preceptorNoteEn,
          }),

        difficulty: card.difficulty || 'medium',
        tags: Array.isArray(card.tags) ? card.tags : [],
        reviewed: true,
      };
    })
    .filter(Boolean);
}

function isBilingualEnglishTag(rawTag = '') {
  const className = extractHtmlAttribute(rawTag, 'class');
  const dataLang = extractHtmlAttribute(rawTag, 'data-lang');
  const style = extractHtmlAttribute(rawTag, 'style');
  const color = normalizeExportColor(extractStyleValue(style, 'color'));

  return (
    /\btext-blue-600\b/i.test(className || '') ||
    /\benglish-text\b/i.test(className || '') ||
    String(dataLang || '').toLowerCase() === 'en' ||
    color === '2563EB' ||
    color === '1D4ED8' ||
    color === '0000FF'
  );
}

function extractEnglishFromBilingualHtml(html = '') {
  const source = String(html || '');

  if (!source.trim()) return '';

  const matches = Array.from(
    source.matchAll(/(<p\b[^>]*>)([\s\S]*?)<\/p>/gi)
  );

  if (!matches.length) return '';

  return matches
    .filter((match) => isBilingualEnglishTag(match[1]))
    .map((match) => stripHtmlToPlainText(match[2]))
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n\n');
}

function removeEnglishParagraphsFromBilingualHtml(html = '') {
  return String(html || '').replace(
    /(<p\b[^>]*>)([\s\S]*?)<\/p>/gi,
    (fullMatch, rawTag) => {
      return isBilingualEnglishTag(rawTag) ? '' : fullMatch;
    }
  );
}

function getBilingualPortugueseText(card = {}, field = 'question') {
  if (field === 'answer') {
    return (
      stripHtmlToPlainText(
        removeEnglishParagraphsFromBilingualHtml(card.answerHtml || card.answer_html)
      ) ||
      card.answer ||
      card.resposta ||
      ''
    );
  }

  if (field === 'preceptor') {
    return (
      stripHtmlToPlainText(
        removeEnglishParagraphsFromBilingualHtml(
          card.preceptorNoteHtml || card.preceptor_note_html
        )
      ) ||
      card.preceptorNote ||
      card.preceptor_note ||
      card.nota_preceptor ||
      ''
    );
  }

  return (
    stripHtmlToPlainText(
      removeEnglishParagraphsFromBilingualHtml(card.questionHtml || card.question_html)
    ) ||
    card.question ||
    card.pergunta ||
    ''
  );
}

function getBilingualEnglishText(card = {}, field = 'question') {
  if (field === 'answer') {
    return (
      extractEnglishFromBilingualHtml(card.answerHtml || card.answer_html) ||
      card.answer_en ||
      card.answerEn ||
      ''
    );
  }

  if (field === 'preceptor') {
    return (
      extractEnglishFromBilingualHtml(
        card.preceptorNoteHtml || card.preceptor_note_html
      ) ||
      card.preceptor_note_en ||
      card.preceptorNoteEn ||
      ''
    );
  }

  return (
    extractEnglishFromBilingualHtml(card.questionHtml || card.question_html) ||
    card.question_en ||
    card.questionEn ||
    ''
  );
}

function normalizeLibraryFlashcard(card = {}, index = 0) {
  return {
    question: card.question ?? card.pergunta ?? '',
    answer: card.answer ?? card.resposta ?? '',
    question_html: card.questionHtml ?? card.question_html ?? null,
    answer_html: card.answerHtml ?? card.answer_html ?? null,
    preceptor_note_html:
      card.preceptorNoteHtml ??
      card.preceptor_note_html ??
      null,
    preceptor_note:
      card.preceptorNote ??
      card.nota_preceptor ??
      card.preceptor_note ??
      null,
    difficulty: card.difficulty || 'medium',
    specialty: card.specialty || null,
    sub_specialty: card.subSpecialty ?? card.sub_specialty ?? null,
    theme: card.theme ?? card.tema ?? null,
    notes: card.notes ?? null,
    tags: Array.isArray(card.tags) ? card.tags : [],

    image_url: card.imageUrl ?? card.image_url ?? null,
    image_object_key: card.imageObjectKey ?? card.image_object_key ?? null,
    question_image_url:
      card.questionImageUrl ??
      card.question_image_url ??
      card.frontImageUrl ??
      card.front_image_url ??
      null,

    question_image_object_key:
      card.questionImageObjectKey ??
      card.question_image_object_key ??
      card.frontImageObjectKey ??
      card.front_image_object_key ??
      null,

    answer_image_url:
      card.answerImageUrl ??
      card.answer_image_url ??
      card.backImageUrl ??
      card.back_image_url ??
      null,

    answer_image_object_key:
      card.answerImageObjectKey ??
      card.answer_image_object_key ??
      card.backImageObjectKey ??
      card.back_image_object_key ??
      null,
    image_source: card.imageSource ?? card.image_source ?? null,
    image_prompt: card.imagePrompt ?? card.image_prompt ?? null,
    image_generated_at: card.imageGeneratedAt ?? card.image_generated_at ?? null,
    card_insights: card.cardInsights ?? card.card_insights ?? {},
    card_insights_generated_at:
      card.cardInsightsGeneratedAt ?? card.card_insights_generated_at ?? null,

    review_state: card.review_state || {},
    review_stats: card.review_stats || {},
    sort_order: Number.isFinite(Number(card.sort_order ?? card.sortOrder ?? card.position))
      ? Number(card.sort_order ?? card.sortOrder ?? card.position)
      : index,
  };
}

function buildDeckSlug(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .trim();
}

function normalizeDeckComparableKey(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function sameDeckText(a = '', b = '') {
  return normalizeDeckComparableKey(a) === normalizeDeckComparableKey(b);
}

async function touchDeck(deckId) {
  if (!supabase || !deckId) return;

  await supabase
    .from('flashcard_decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId);
}

async function resolveOrCreateDeck({
  name,
  specialty = '',
  subSpecialty = '',
  parentDeckId = null,
  description = null,
  deckType = 'manual',
}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const safeName = String(name || '').replace(/\s+/g, ' ').trim();
  const safeSpecialty = String(specialty || '').replace(/\s+/g, ' ').trim() || null;
  const safeSubSpecialty = String(subSpecialty || '').replace(/\s+/g, ' ').trim() || null;

  if (!safeName) {
    throw new Error('Nome do deck é obrigatório.');
  }

  let candidatesQuery = supabase
    .from('flashcard_decks')
    .select('*');

  if (parentDeckId) {
    candidatesQuery = candidatesQuery.eq('parent_deck_id', parentDeckId);
  } else {
    candidatesQuery = candidatesQuery.is('parent_deck_id', null);
  }

  const { data: candidates, error: candidatesError } = await candidatesQuery;

  if (candidatesError) {
    throw new Error(`Falha ao buscar decks existentes: ${candidatesError.message}`);
  }

  const safeNameKey = normalizeDeckComparableKey(safeName);
  const safeSpecialtyKey = normalizeDeckComparableKey(safeSpecialty || '');
  const safeSubSpecialtyKey = normalizeDeckComparableKey(safeSubSpecialty || '');

  const existingDeck = (candidates || []).find((deck) => {
    const deckNameKey = normalizeDeckComparableKey(deck.name || '');
    const deckSpecialtyKey = normalizeDeckComparableKey(deck.specialty || '');
    const deckSubSpecialtyKey = normalizeDeckComparableKey(deck.sub_specialty || '');

    const nameMatches = deckNameKey === safeNameKey;
    const specialtyMatches =
      !safeSpecialtyKey ||
      !deckSpecialtyKey ||
      deckSpecialtyKey === safeSpecialtyKey;

    const subSpecialtyMatches =
      !safeSubSpecialtyKey ||
      !deckSubSpecialtyKey ||
      deckSubSpecialtyKey === safeSubSpecialtyKey;

    return nameMatches && specialtyMatches && subSpecialtyMatches;
  });

  if (existingDeck) {
    const patch = {};

    if (!existingDeck.specialty && safeSpecialty) {
      patch.specialty = safeSpecialty;
    }

    if (!existingDeck.sub_specialty && safeSubSpecialty) {
      patch.sub_specialty = safeSubSpecialty;
    }

    if (!existingDeck.deck_type && deckType) {
      patch.deck_type = deckType;
    }

    if (Object.keys(patch).length > 0) {
      const { data: updatedDeck, error: updateError } = await supabase
        .from('flashcard_decks')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeck.id)
        .select('*')
        .single();

      if (!updateError && updatedDeck) {
        return updatedDeck;
      }
    }

    return existingDeck;
  }

  const slug = buildDeckSlug(
    [safeSpecialty, safeSubSpecialty, safeName].filter(Boolean).join(' ')
  );

  const { data: createdDeck, error: createdDeckError } = await supabase
    .from('flashcard_decks')
    .insert({
      name: safeName,
      slug: slug || `deck-${Date.now()}`,
      description: description || null,
      specialty: safeSpecialty,
      sub_specialty: safeSubSpecialty,
      parent_deck_id: parentDeckId,
      deck_type: deckType,
    })
    .select('*')
    .single();

  if (createdDeckError) {
    throw new Error(`Falha ao criar deck: ${createdDeckError.message}`);
  }

  return createdDeck;
}

async function ensureDeckHierarchy({
  specialty = '',
  subSpecialty = '',
  theme = '',
  createLeafDeck = true,
}) {
  const safeSpecialty = String(specialty || '').trim() || 'Clínica Médica';
  const safeSubSpecialty = String(subSpecialty || '').trim();
  const safeTheme = String(theme || '').trim();

  const specialtyDeck = await resolveOrCreateDeck({
    name: safeSpecialty,
    specialty: safeSpecialty,
    subSpecialty: '',
    parentDeckId: null,
    deckType: 'specialty-root',
  });

  let parent = specialtyDeck;
  let subSpecialtyDeck = null;
  let themeDeck = null;
  let finalDeck = specialtyDeck;

  if (safeSubSpecialty) {
    subSpecialtyDeck = await resolveOrCreateDeck({
      name: safeSubSpecialty,
      specialty: safeSpecialty,
      subSpecialty: safeSubSpecialty,
      parentDeckId: specialtyDeck.id,
      deckType: 'sub-specialty',
    });

    parent = subSpecialtyDeck;
    finalDeck = subSpecialtyDeck;
  }

  if (safeTheme) {
    themeDeck = await resolveOrCreateDeck({
      name: safeTheme,
      specialty: safeSpecialty,
      subSpecialty: safeSubSpecialty || null,
      parentDeckId: parent.id,
      deckType: 'theme',
    });

    parent = themeDeck;
    finalDeck = themeDeck;
  }

  if (createLeafDeck) {
    const leafName = safeTheme || safeSubSpecialty || safeSpecialty;

    if (sameDeckText(leafName, parent.name)) {
      finalDeck = parent;
    } else {
      finalDeck = await resolveOrCreateDeck({
        name: leafName,
        specialty: safeSpecialty,
        subSpecialty: safeSubSpecialty || null,
        parentDeckId: parent.id,
        deckType: 'leaf-deck',
      });
    }
  }

  return {
    specialtyDeck,
    subSpecialtyDeck,
    themeDeck,
    finalDeck,
  };
}

function buildDeckTree(decks = []) {
  const map = new Map();

  for (const deck of decks) {
    map.set(deck.id, {
      ...deck,
      children: [],
    });
  }

  const roots = [];

  for (const deck of map.values()) {
    if (deck.parent_deck_id && map.has(deck.parent_deck_id)) {
      map.get(deck.parent_deck_id).children.push(deck);
    } else {
      roots.push(deck);
    }
  }

  const sortRecursive = (nodes) => {
    nodes.sort((a, b) => {
      const levelCompare = String(a.deck_level || '').localeCompare(String(b.deck_level || ''));
      if (levelCompare !== 0) return levelCompare;

      const specialtyCompare = String(a.specialty || '').localeCompare(String(b.specialty || ''), 'pt-BR');
      if (specialtyCompare !== 0) return specialtyCompare;

      const sortCompare = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortCompare !== 0) return sortCompare;

      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });

    nodes.forEach((node) => sortRecursive(node.children));
  };

  sortRecursive(roots);

  return roots;
}

async function listDeckTree({ specialty = '' } = {}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  let query = supabase
    .from('flashcard_decks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (String(specialty || '').trim()) {
    query = query.eq('specialty', String(specialty).trim());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha ao listar árvore de decks: ${error.message}`);
  }

  return buildDeckTree(data || []);
}

async function moveLibraryCardToDeck(cardId, targetDeckId) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('flashcards_library')
    .update({
      deck_id: targetDeckId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao mover card: ${error.message}`);
  }

  await touchDeck(targetDeckId);

  return data;
}

async function updateLibraryCard(cardId, updates = {}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (updates.question !== undefined) payload.question = updates.question;
  if (updates.answer !== undefined) payload.answer = updates.answer;
  if (updates.preceptor_note !== undefined) payload.preceptor_note = updates.preceptor_note;
  if (updates.question_html !== undefined) payload.question_html = updates.question_html || null;
  if (updates.questionHtml !== undefined) payload.question_html = updates.questionHtml || null;

  if (updates.answer_html !== undefined) payload.answer_html = updates.answer_html || null;
  if (updates.answerHtml !== undefined) payload.answer_html = updates.answerHtml || null;

  if (updates.preceptor_note_html !== undefined) {
    payload.preceptor_note_html = updates.preceptor_note_html || null;
  }

  if (updates.preceptorNoteHtml !== undefined) {
    payload.preceptor_note_html = updates.preceptorNoteHtml || null;
  }
  if (updates.difficulty !== undefined) payload.difficulty = updates.difficulty;
  if (updates.specialty !== undefined) payload.specialty = updates.specialty || null;
  if (updates.sub_specialty !== undefined) payload.sub_specialty = updates.sub_specialty || null;
  if (updates.theme !== undefined) payload.theme = updates.theme || null;
  if (updates.notes !== undefined) payload.notes = updates.notes || null;
  if (updates.tags !== undefined) payload.tags = Array.isArray(updates.tags) ? updates.tags : [];
  if (updates.image_url !== undefined) payload.image_url = updates.image_url || null;
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl || null;
  if (updates.question_image_url !== undefined) {
    payload.question_image_url = updates.question_image_url || null;
  }

  if (updates.questionImageUrl !== undefined) {
    payload.question_image_url = updates.questionImageUrl || null;
  }

  if (updates.question_image_object_key !== undefined) {
    payload.question_image_object_key = updates.question_image_object_key || null;
  }

  if (updates.questionImageObjectKey !== undefined) {
    payload.question_image_object_key = updates.questionImageObjectKey || null;
  }

  if (updates.answer_image_url !== undefined) {
    payload.answer_image_url = updates.answer_image_url || null;
  }

  if (updates.answerImageUrl !== undefined) {
    payload.answer_image_url = updates.answerImageUrl || null;
  }

  if (updates.answer_image_object_key !== undefined) {
    payload.answer_image_object_key = updates.answer_image_object_key || null;
  }

  if (updates.answerImageObjectKey !== undefined) {
    payload.answer_image_object_key = updates.answerImageObjectKey || null;
  }
  if (updates.image_object_key !== undefined) {
    payload.image_object_key = updates.image_object_key || null;
  }
  if (updates.imageObjectKey !== undefined) {
    payload.image_object_key = updates.imageObjectKey || null;
  }

  if (updates.image_source !== undefined) payload.image_source = updates.image_source || null;
  if (updates.imageSource !== undefined) payload.image_source = updates.imageSource || null;

  if (updates.image_prompt !== undefined) payload.image_prompt = updates.image_prompt || null;
  if (updates.imagePrompt !== undefined) payload.image_prompt = updates.imagePrompt || null;

  if (updates.image_generated_at !== undefined) {
    payload.image_generated_at = updates.image_generated_at || null;
  }
  if (updates.imageGeneratedAt !== undefined) {
    payload.image_generated_at = updates.imageGeneratedAt || null;
  }

  if (updates.card_insights !== undefined) payload.card_insights = updates.card_insights || {};
  if (updates.cardInsights !== undefined) payload.card_insights = updates.cardInsights || {};

  if (updates.card_insights_generated_at !== undefined) {
    payload.card_insights_generated_at = updates.card_insights_generated_at || null;
  }
  if (updates.cardInsightsGeneratedAt !== undefined) {
    payload.card_insights_generated_at = updates.cardInsightsGeneratedAt || null;
  }

  const { data, error } = await supabase
    .from('flashcards_library')
    .update(payload)
    .eq('id', cardId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao editar card da biblioteca: ${error.message}`);
  }

  return data;
}

async function getLibraryAnalytics({ specialty = '', deckId = '' } = {}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  let query = supabase
    .from('flashcards_library')
    .select('*')
    .eq('is_archived', false);

  if (String(specialty || '').trim()) {
    query = query.eq('specialty', String(specialty).trim());
  }

  if (String(deckId || '').trim()) {
    query = query.eq('deck_id', String(deckId).trim());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha ao carregar analytics da biblioteca: ${error.message}`);
  }

  const cards = Array.isArray(data) ? data : [];
  const now = new Date();

  const dueCount = cards.filter((card) => {
    const dueAt = card?.review_state?.dueAt;
    return dueAt ? new Date(dueAt) <= now : false;
  }).length;

  const neverReviewedCount = cards.filter((card) => {
    return !card?.review_stats?.lastReviewedAt;
  }).length;

  const favoriteCount = cards.filter((card) => Boolean(card.is_favorite)).length;

  const reviewedCards = cards.filter((card) => Number(card?.review_stats?.totalReviewed || 0) > 0);

  const totalReviewed = reviewedCards.reduce(
    (sum, card) => sum + Number(card?.review_stats?.totalReviewed || 0),
    0
  );

  const totalCorrect = reviewedCards.reduce(
    (sum, card) => sum + Number(card?.review_stats?.correctCount || 0),
    0
  );

  const accuracy = totalReviewed > 0
    ? Math.round((totalCorrect / totalReviewed) * 100)
    : 0;

  const bySpecialtyMap = {};
  const byDeckMap = {};

  for (const card of cards) {
    const specialtyKey = String(card.specialty || 'Sem especialidade');
    const deckKey = String(card.deck_id || 'Sem deck');

    bySpecialtyMap[specialtyKey] = (bySpecialtyMap[specialtyKey] || 0) + 1;
    byDeckMap[deckKey] = (byDeckMap[deckKey] || 0) + 1;
  }

  return {
    totalCards: cards.length,
    dueCount,
    neverReviewedCount,
    favoriteCount,
    accuracy,
    bySpecialty: Object.entries(bySpecialtyMap).map(([name, count]) => ({ name, count })),
    byDeck: Object.entries(byDeckMap).map(([id, count]) => ({ id, count })),
  };
}

async function saveFlashcardsToLibrary({
  runId = null,
  flashcards = [],
  specialty = '',
  subSpecialty = '',
  theme = '',
  deckId = null,
}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    return [];
  }

  let finalDeckId = deckId;

  if (!finalDeckId) {
    const hierarchy = await ensureDeckHierarchy({
      specialty: specialty || 'Clínica Médica',
      subSpecialty: subSpecialty || '',
      theme: theme || '',
      createLeafDeck: true,
    });

    finalDeckId = hierarchy.finalDeck.id;
  }

  const payload = flashcards
    .map(normalizeLibraryFlashcard)
    .filter((card) => card.question && card.answer)
    .map((card, index) => ({
      source_run_id: runId || null,
      deck_id: finalDeckId,
      question: card.question,
      answer: card.answer,
      preceptor_note: card.preceptor_note,

      question_html: card.question_html || null,
      answer_html: card.answer_html || null,
      preceptor_note_html: card.preceptor_note_html || null,

      difficulty: card.difficulty,
      specialty: card.specialty || specialty || null,
      sub_specialty: card.sub_specialty || subSpecialty || null,
      theme: card.theme || theme || null,
      tags: Array.isArray(card.tags) ? card.tags : [],
      notes: card.notes || null,

      image_url: card.image_url || null,
      image_object_key: card.image_object_key || null,

      question_image_url: card.question_image_url || null,
      question_image_object_key: card.question_image_object_key || null,

      answer_image_url: card.answer_image_url || null,
      answer_image_object_key: card.answer_image_object_key || null,

      image_source: card.image_source || null,
      image_prompt: card.image_prompt || null,
      image_generated_at: card.image_generated_at || null,
      card_insights: card.card_insights || {},
      card_insights_generated_at: card.card_insights_generated_at || null,

      review_state: card.review_state || {},
      review_stats: card.review_stats || {},
      sort_order: Number.isFinite(Number(card.sort_order))
        ? Number(card.sort_order)
        : index,
    }));

  if (!payload.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('flashcards_library')
    .insert(payload)
    .select('*');

  if (error) {
    throw new Error(`Falha ao salvar flashcards na biblioteca: ${error.message}`);
  }

  await touchDeck(finalDeckId);

  return data || [];
}

function buildLibraryFlashcardIdentityKey(card = {}) {
  const question = String(card.question || card.pergunta || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const answer = String(card.answer || card.resposta || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!question && !answer) return '';

  return `${question}::${answer}`;
}

async function syncRunFlashcardsToLibrarySet({ run = {}, flashcards = [] }) {
  if (!supabase || !run?.id) {
    return {
      insertedCount: 0,
      archivedCount: 0,
    };
  }

  const currentCards = (Array.isArray(flashcards) ? flashcards : [])
    .filter((card) => card && (card.question || card.pergunta) && (card.answer || card.resposta));

  if (!currentCards.length) {
    return {
      insertedCount: 0,
      archivedCount: 0,
    };
  }

  const { data: existingCards, error: existingError } = await supabase
    .from('flashcards_library')
    .select('id, question, answer, is_archived')
    .eq('source_run_id', run.id);

  if (existingError) {
    console.warn('⚠️ Falha ao buscar cards da biblioteca para sincronização:', existingError.message);
    return {
      insertedCount: 0,
      archivedCount: 0,
    };
  }

  const activeExistingCards = (existingCards || []).filter((card) => !card.is_archived);

  const existingKeys = new Set(
    activeExistingCards
      .map(buildLibraryFlashcardIdentityKey)
      .filter(Boolean)
  );

  const currentKeys = new Set(
    currentCards
      .map(buildLibraryFlashcardIdentityKey)
      .filter(Boolean)
  );

  const missingCards = currentCards.filter((card) => {
    const key = buildLibraryFlashcardIdentityKey(card);
    return key && !existingKeys.has(key);
  });

  const staleIds = activeExistingCards
    .filter((card) => {
      const key = buildLibraryFlashcardIdentityKey(card);
      return key && !currentKeys.has(key);
    })
    .map((card) => card.id)
    .filter(Boolean);

  let insertedCount = 0;
  let archivedCount = 0;

  if (missingCards.length > 0) {
    const inserted = await saveFlashcardsToLibrary({
      runId: run.id,
      flashcards: missingCards,
      specialty: run.specialty || 'Clínica Médica',
      subSpecialty:
        Array.isArray(run.secondary_topics) && run.secondary_topics.length > 0
          ? run.secondary_topics[0]
          : '',
      theme:
        Array.isArray(run.secondary_topics) && run.secondary_topics.length > 1
          ? run.secondary_topics[1]
          : '',
    });

    insertedCount = inserted?.length || 0;
  }

  if (staleIds.length > 0) {
    const { data: archived, error: archiveError } = await supabase
      .from('flashcards_library')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', staleIds)
      .select('id');

    if (archiveError) {
      console.warn('⚠️ Falha ao arquivar cards obsoletos da biblioteca:', archiveError.message);
    } else {
      archivedCount = archived?.length || 0;
    }
  }

  return {
    insertedCount,
    archivedCount,
  };
}

async function convertVideoToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

async function transcribeAudioWithDeepgram(audioPath) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY não definida no .env.');
  }

  const audioBuffer = fs.readFileSync(audioPath);

  const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
  deepgramUrl.searchParams.set('model', 'nova-3');
  deepgramUrl.searchParams.set('smart_format', 'true');
  deepgramUrl.searchParams.set('punctuate', 'true');
  deepgramUrl.searchParams.set('paragraphs', 'true');
  deepgramUrl.searchParams.set('language', 'pt-BR');

  const response = await fetchWithTimeout(deepgramUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/mpeg',
    },
    body: audioBuffer,
  });

  const rawText = await response.text();
  const data = parseJsonSafe(rawText);

  if (!response.ok) {
    throw new Error(data?.err_msg || data?.error || 'Falha ao transcrever com Deepgram.');
  }

  const transcript = extractTranscriptFromDeepgram(data);

  if (!transcript || !transcript.trim()) {
    throw new Error('O Deepgram não retornou uma transcrição válida.');
  }

  return transcript;
}

async function callGeminiWithModel(modelName, payload, apiKey = GEMINI_API_KEY) {
  if (!apiKey) {
    throw new Error('Nenhuma chave Gemini disponível.');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(
    apiUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    120000
  );

  const rawText = await response.text();
  const data = parseJsonSafe(rawText);

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Falha na chamada ao Gemini.');
    error.statusCode = response.status;
    error.responseData = data;
    throw error;
  }

  return data;
}

async function callGeminiWithFallback(payload, modelsToTry = GEMINI_TEXT_MODELS) {
  const errors = [];

  for (const modelName of modelsToTry) {
    for (const apiKey of getGeminiKeysToTry()) {
      try {
        return await callGeminiWithModel(modelName, payload, apiKey);
      } catch (error) {
        const message = error.message || 'Erro desconhecido';
        errors.push(`${modelName} | ${maskGeminiKey(apiKey)} [${error.statusCode || 'sem-status'}]: ${message}`);

        if (!isRetryableGeminiError(error.statusCode, message)) {
          throw error;
        }

        if (isGeminiQuotaError(error)) {
          putGeminiKeyOnCooldown(apiKey, error);
        }

        console.warn(
          `⚠️ Gemini indisponível no modelo ${modelName} com chave ${maskGeminiKey(apiKey)}. Tentando próximo fallback:`,
          message
        );
      }
    }
  }

  throw new Error(`Falha ao chamar Gemini com todos os fallbacks. Detalhes: ${errors.join(' | ')}`);
}

async function generateFlashcardsWithGemini(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não definida no .env.');
  }

  const payload = {
    systemInstruction: {
      parts: [
        {
          text: `Você é um preceptor médico experiente, especializado em ensino para residência e revisão clínica de alto rendimento.

Sua única fonte de informação é o texto transcrito fornecido.
Nunca invente fatos fora da transcrição.

Objetivo:
Transformar a transcrição em flashcards de alta utilidade para estudo médico, cobrindo o máximo possível dos assuntos relevantes presentes no texto.

Regras obrigatórias:
- Antes de responder, identifique mentalmente todos os temas e subtemas clínicos relevantes da transcrição.
- Garanta cobertura ampla do conteúdo. Não foque só no início ou só no tema mais óbvio.
- Gere flashcards suficientes para cobrir os principais tópicos, subtemas, critérios, condutas, contraindicações, complicações, interpretações clínicas e armadilhas de prova/prática.
Use quantidade proporcional à riqueza do texto:
- até 1200 palavras: 10 a 22 cards;
- 1200 a 3000 palavras: 20 a 35 cards;
- 3000 a 6000 palavras: 32 a 55 cards;
- 6000 a 9000 palavras: 50 a 85 cards;
- acima de 9000 palavras: 70 a 110 cards.
Para textos longos, não compacte demais. Cubra todos os blocos temáticos relevantes.
- Evite cards triviais, vagos ou repetitivos.
- Cada card deve cobrar uma ideia central, objetiva e útil.
- A pergunta deve ser clara, específica e com cara de revisão de residência.
- A resposta deve ser curta, correta e de alta retenção.
- Para cada pergunta, resposta e nota do preceptor, gere também uma versão em inglês médico natural.
- O conteúdo em português deve ser o principal.
- O conteúdo em inglês deve ser uma tradução fiel, clara e natural, sem acrescentar informações novas.
- Use os campos:
  - pergunta: português
  - resposta: português
  - nota_preceptor: português
  - question_en: inglês
  - answer_en: inglês
  - preceptor_note_en: inglês
- Quando houver nuance importante, use "nota_preceptor" para destacar pegadinha, exceção, correlação clínica ou dica de prova.
- Se a transcrição tiver poucos conteúdos clínicos, gere menos cards, mas mantenha qualidade.
- Não inclua texto fora do JSON.
- Classifique cada flashcard com dificuldade: easy, medium ou hard.

Formato:
Retorne apenas JSON válido no schema solicitado.`,
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `[TEXTO TRANSCRITO]\n${text}`,
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_json_schema: {
        type: 'object',
        properties: {
          flashcards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pergunta: { type: 'string' },
                resposta: { type: 'string' },
                difficulty: { type: 'string' },
                nota_preceptor: { type: 'string' },
                question_en: { type: 'string' },
                answer_en: { type: 'string' },
                preceptor_note_en: { type: 'string' },
              },
              required: [
                'pergunta',
                'resposta',
                'nota_preceptor',
                'question_en',
                'answer_en',
                'preceptor_note_en',
                'difficulty',
              ],
            },
          },
        },
        required: ['flashcards'],
      },
    },
  };

  const errors = [];

  for (const modelName of GEMINI_FLASHCARD_MODELS) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        console.log(`🧠 Gemini: tentando modelo ${modelName} (${attempt}/${maxAttempts})...`);

        const data = await callGeminiWithFallback(payload, [modelName]);
        const jsonText = stripMarkdownJsonFence(getGeminiText(data));
        const parsed = parseJsonSafe(jsonText);

        if (!parsed?.flashcards || !Array.isArray(parsed.flashcards)) {
          throw new Error('O Gemini não retornou flashcards válidos.');
        }

        return {
          flashcards: normalizeGeneratedBilingualFlashcards(parsed.flashcards),
          modelUsed: modelName,
        };
      } catch (error) {
        const statusCode = error.statusCode || 0;
        const message = error.message || 'Erro desconhecido';

        errors.push(`${modelName} [${statusCode || 'sem-status'}]: ${message}`);

        const retryable = isRetryableGeminiError(statusCode, message);

        if (!retryable) {
          console.warn(`❌ Erro não recuperável no modelo ${modelName}: ${message}`);
          break;
        }

        if (attempt === maxAttempts) {
          console.warn(`⚠️ Modelo ${modelName} continuou indisponível após ${maxAttempts} tentativas.`);
          break;
        }

        const waitMs = attempt * 2000;
        console.warn(`⏳ Alta demanda no ${modelName}. Nova tentativa em ${waitMs} ms...`);
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `Os modelos do Gemini estão indisponíveis no momento. Tente novamente em instantes. Detalhes: ${errors.join(' | ')}`
  );
}

async function uploadVideoToR2(localPath, originalFilename, mimeType, folder = 'videos') {
  if (!r2) {
    return {
      videoStorageProvider: null,
      videoObjectKey: null,
      videoUrl: null,
    };
  }

  const normalizedName = normalizeUtf8Filename(originalFilename);
  const sanitizedName = sanitizeFilename(normalizedName);
  const safeFolder = String(folder || 'videos')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '-');

  const key = `${safeFolder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${sanitizedName}`;

  const contentType = mimeType && mimeType.startsWith('video/')
    ? mimeType
    : 'video/mp4';

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fs.readFileSync(localPath),
      ContentType: contentType,
    })
  );

  const publicUrl = R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : null;

  return {
    videoStorageProvider: 'cloudflare-r2',
    videoObjectKey: key,
    videoUrl: publicUrl,
  };
}

function buildR2PublicUrl(key) {
  return R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : null;
}

function buildTempVideoKey(originalFilename = '') {
  const normalizedName = normalizeUtf8Filename(originalFilename);
  const sanitizedName = sanitizeFilename(normalizedName);

  return `temp-videos/${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitizedName}`;
}

function buildPermanentAudioKey(originalFilename = '') {
  const normalizedName = normalizeUtf8Filename(originalFilename);
  const sanitizedName = sanitizeFilename(normalizedName).replace(/\.[^.]+$/, '');

  return `audio/${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitizedName}.mp3`;
}

async function createR2PresignedUploadUrl({
  key,
  contentType = 'application/octet-stream',
  expiresIn = 60 * 30,
}) {
  if (!r2) {
    throw new Error('Cloudflare R2 não configurado.');
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn });

  return {
    key,
    uploadUrl,
    publicUrl: buildR2PublicUrl(key),
    expiresIn,
  };
}

function sanitizeObjectKeyPart(value = 'item') {
  const safe = String(value || 'item')
    .normalize('NFD')
    .replace(/[\/:*?"<>|]+/g, '-')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
    .trim();

  return safe || 'item';
}

function getImageExtensionFromContentType(contentType = '') {
  const safeType = String(contentType || '').toLowerCase();

  if (safeType.includes('jpeg') || safeType.includes('jpg')) return 'jpg';
  if (safeType.includes('webp')) return 'webp';
  if (safeType.includes('gif')) return 'gif';
  return 'png';
}

function buildFlashcardImageKey({
  runId,
  cardIndex,
  filename = '',
  contentType = 'image/png',
}) {
  const extension =
    filename && filename.includes('.')
      ? sanitizeObjectKeyPart(filename.split('.').pop())
      : getImageExtensionFromContentType(contentType);

  return `flashcard-images/run-${sanitizeObjectKeyPart(runId)}/card-${
    Number(cardIndex) + 1
  }-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension || 'png'}`;
}

function buildFlashcardPreviewImageKey({
  runId,
  field = 'question',
  filename = '',
  contentType = 'image/png',
}) {
  const extension =
    filename && filename.includes('.')
      ? sanitizeObjectKeyPart(filename.split('.').pop())
      : getImageExtensionFromContentType(contentType);

  return `flashcard-images/run-${sanitizeObjectKeyPart(runId)}/new-card-${sanitizeObjectKeyPart(
    field
  )}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension || 'png'}`;
}

function getFlashcardsColumnForRun(run = {}, origin = 'current') {
  const normalizedOrigin = String(origin || 'current').toLowerCase();

  if (normalizedOrigin === 'original' || normalizedOrigin === 'flashcards') {
    return 'flashcards';
  }

  if (
    normalizedOrigin === 'enriched' ||
    normalizedOrigin === 'mnemonic' ||
    normalizedOrigin === 'enriched_flashcards'
  ) {
    return 'enriched_flashcards';
  }

  if (Array.isArray(run.enriched_flashcards) && run.enriched_flashcards.length > 0) {
    return 'enriched_flashcards';
  }

  return 'flashcards';
}

function buildFlashcardIdentityKey(card = {}) {
  const question = String(card.question || card.pergunta || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const answer = String(card.answer || card.resposta || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!question && !answer) return '';

  return `${question}::${answer}`;
}

function normalizeRunFlashcardForDisplay(card = {}, index = 0, sourceOrigin = 'original') {
  const safeSourceOrigin =
    card.sourceOrigin ||
    card.source_origin ||
    sourceOrigin;

  return {
    ...card,
    id: card.id || `${safeSourceOrigin}-${index + 1}`,
    sourceOrigin: safeSourceOrigin,
    source_origin: safeSourceOrigin,
    position: index + 1,
    sort_order: index,
  };
}

function hasCanonicalCurrentMarkers(cards = []) {
  return cards.some((card) => {
    const source = String(card.sourceOrigin || card.source_origin || '').toLowerCase();
    return source === 'current' || source === 'original';
  });
}

function enrichedAlreadyContainsOriginals(original = [], enriched = []) {
  if (!original.length || !enriched.length) return false;

  const enrichedKeys = new Set(
    enriched
      .map(buildFlashcardIdentityKey)
      .filter(Boolean)
  );

  const overlapCount = original.filter((card) =>
    enrichedKeys.has(buildFlashcardIdentityKey(card))
  ).length;

  return overlapCount >= Math.min(2, original.length);
}

function mergeFlashcardGroupsForDisplay(groups = []) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    const cards = Array.isArray(group.cards) ? group.cards : [];
    const origin = group.origin || 'original';

    for (const rawCard of cards) {
      const key = buildFlashcardIdentityKey(rawCard);

      if (!key || seen.has(key)) continue;

      seen.add(key);

      merged.push(
        normalizeRunFlashcardForDisplay(rawCard, merged.length, origin)
      );
    }
  }

  return merged;
}

function buildRunEditableFlashcards(run = {}) {
  const original = Array.isArray(run.flashcards) ? run.flashcards : [];
  const enriched = Array.isArray(run.enriched_flashcards) ? run.enriched_flashcards : [];

  if (!enriched.length) {
    return mergeFlashcardGroupsForDisplay([
      { cards: original, origin: 'original' },
    ]);
  }

  const enrichedIsCurrentList =
    hasCanonicalCurrentMarkers(enriched) ||
    enrichedAlreadyContainsOriginals(original, enriched);

  if (enrichedIsCurrentList) {
    return mergeFlashcardGroupsForDisplay([
      { cards: enriched, origin: 'current' },
    ]);
  }

  return mergeFlashcardGroupsForDisplay([
    { cards: original, origin: 'original' },
    { cards: enriched, origin: 'enriched' },
  ]);
}

function buildStudyRunFlashcardView(run = {}) {
  const displayFlashcards = buildRunEditableFlashcards(run);

  return {
    ...run,
    display_flashcards: displayFlashcards,
    display_flashcards_count: displayFlashcards.length,
  };
}

function resolveFlashcardListForWrite(run = {}, origin = 'current') {
  const normalizedOrigin = String(origin || 'current').toLowerCase();

  if (normalizedOrigin === 'original' || normalizedOrigin === 'flashcards') {
    return {
      column: 'flashcards',
      origin: 'original',
      cards: Array.isArray(run.flashcards) ? [...run.flashcards] : [],
    };
  }

  return {
    column: 'enriched_flashcards',
    origin: 'current',
    cards: buildRunEditableFlashcards(run),
  };
}

function normalizeFlashcardPatch(updates = {}) {
  const payload = {};

  if (updates.question !== undefined) payload.question = String(updates.question || '').trim();
  if (updates.answer !== undefined) payload.answer = String(updates.answer || '').trim();
  if (updates.questionHtml !== undefined || updates.question_html !== undefined) {
    const value = updates.questionHtml ?? updates.question_html ?? '';
    payload.questionHtml = value || '';
    payload.question_html = value || '';
  }

  if (updates.answerHtml !== undefined || updates.answer_html !== undefined) {
    const value = updates.answerHtml ?? updates.answer_html ?? '';
    payload.answerHtml = value || '';
    payload.answer_html = value || '';
  }

  if (
    updates.preceptorNoteHtml !== undefined ||
    updates.preceptor_note_html !== undefined
  ) {
    const value = updates.preceptorNoteHtml ?? updates.preceptor_note_html ?? '';
    payload.preceptorNoteHtml = value || '';
    payload.preceptor_note_html = value || '';
  }

  if (updates.preceptorNote !== undefined || updates.preceptor_note !== undefined) {
    const value = updates.preceptorNote ?? updates.preceptor_note ?? '';
    payload.preceptorNote = value || '';
    payload.preceptor_note = value || '';
  }

  if (updates.difficulty !== undefined) payload.difficulty = updates.difficulty || 'medium';
  if (updates.tags !== undefined) payload.tags = Array.isArray(updates.tags) ? updates.tags : [];

  if (updates.imageUrl !== undefined || updates.image_url !== undefined) {
    const value = updates.imageUrl ?? updates.image_url ?? '';
    payload.imageUrl = value || '';
    payload.image_url = value || '';
  }

  if (updates.imageObjectKey !== undefined || updates.image_object_key !== undefined) {
    const value = updates.imageObjectKey ?? updates.image_object_key ?? '';
    payload.imageObjectKey = value || '';
    payload.image_object_key = value || '';
  }

  if (updates.questionImageUrl !== undefined || updates.question_image_url !== undefined) {
    const value = updates.questionImageUrl ?? updates.question_image_url ?? '';
    payload.questionImageUrl = value || '';
    payload.question_image_url = value || '';
  }

  if (
    updates.questionImageObjectKey !== undefined ||
    updates.question_image_object_key !== undefined
  ) {
    const value =
      updates.questionImageObjectKey ?? updates.question_image_object_key ?? '';
    payload.questionImageObjectKey = value || '';
    payload.question_image_object_key = value || '';
  }

  if (updates.answerImageUrl !== undefined || updates.answer_image_url !== undefined) {
    const value = updates.answerImageUrl ?? updates.answer_image_url ?? '';
    payload.answerImageUrl = value || '';
    payload.answer_image_url = value || '';
  }

  if (
    updates.answerImageObjectKey !== undefined ||
    updates.answer_image_object_key !== undefined
  ) {
    const value = updates.answerImageObjectKey ?? updates.answer_image_object_key ?? '';
    payload.answerImageObjectKey = value || '';
    payload.answer_image_object_key = value || '';
  }

  if (updates.imageSource !== undefined || updates.image_source !== undefined) {
    const value = updates.imageSource ?? updates.image_source ?? '';
    payload.imageSource = value || '';
    payload.image_source = value || '';
  }

  if (updates.imagePrompt !== undefined || updates.image_prompt !== undefined) {
    const value = updates.imagePrompt ?? updates.image_prompt ?? '';
    payload.imagePrompt = value || '';
    payload.image_prompt = value || '';
  }

  if (updates.imageGeneratedAt !== undefined || updates.image_generated_at !== undefined) {
    const value = updates.imageGeneratedAt ?? updates.image_generated_at ?? null;
    payload.imageGeneratedAt = value;
    payload.image_generated_at = value;
  }

  if (updates.cardInsights !== undefined || updates.card_insights !== undefined) {
    const value = updates.cardInsights ?? updates.card_insights ?? {};
    payload.cardInsights = value || {};
    payload.card_insights = value || {};
  }

  if (
    updates.cardInsightsGeneratedAt !== undefined ||
    updates.card_insights_generated_at !== undefined
  ) {
    const value = updates.cardInsightsGeneratedAt ?? updates.card_insights_generated_at ?? null;
    payload.cardInsightsGeneratedAt = value;
    payload.card_insights_generated_at = value;
  }

  return payload;
}

function buildLibraryUpdateFromFlashcardPatch(patch = {}) {
  const payload = {};

  if (patch.question !== undefined) payload.question = patch.question;
  if (patch.answer !== undefined) payload.answer = patch.answer;
  if (patch.question_html !== undefined) {
    payload.question_html = patch.question_html || null;
  }

  if (patch.answer_html !== undefined) {
    payload.answer_html = patch.answer_html || null;
  }

  if (patch.preceptor_note_html !== undefined) {
    payload.preceptor_note_html = patch.preceptor_note_html || null;
  }
  if (patch.preceptor_note !== undefined) payload.preceptor_note = patch.preceptor_note;
  if (patch.difficulty !== undefined) payload.difficulty = patch.difficulty;
  if (patch.tags !== undefined) payload.tags = Array.isArray(patch.tags) ? patch.tags : [];

  if (patch.image_url !== undefined) payload.image_url = patch.image_url || null;
  if (patch.image_object_key !== undefined) payload.image_object_key = patch.image_object_key || null;
  if (patch.question_image_url !== undefined) {
    payload.question_image_url = patch.question_image_url || null;
  }

  if (patch.question_image_object_key !== undefined) {
    payload.question_image_object_key = patch.question_image_object_key || null;
  }

  if (patch.answer_image_url !== undefined) {
    payload.answer_image_url = patch.answer_image_url || null;
  }

  if (patch.answer_image_object_key !== undefined) {
    payload.answer_image_object_key = patch.answer_image_object_key || null;
  }
  if (patch.image_source !== undefined) payload.image_source = patch.image_source || null;
  if (patch.image_prompt !== undefined) payload.image_prompt = patch.image_prompt || null;
  if (patch.image_generated_at !== undefined) payload.image_generated_at = patch.image_generated_at || null;
  if (patch.card_insights !== undefined) payload.card_insights = patch.card_insights || {};

  if (patch.card_insights_generated_at !== undefined) {
    payload.card_insights_generated_at = patch.card_insights_generated_at || null;
  }

  return payload;
}

async function syncLibraryFlashcardFromRun({ runId, cardIndex, patch = {} }) {
  if (!supabase || !runId) return [];

  const payload = buildLibraryUpdateFromFlashcardPatch(patch);
  if (!Object.keys(payload).length) return [];

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('flashcards_library')
    .update(payload)
    .eq('source_run_id', runId)
    .eq('sort_order', Number(cardIndex))
    .select('*');

  if (error) {
    console.warn('⚠️ Não foi possível sincronizar card na biblioteca:', error.message);
    return [];
  }

  return data || [];
}

async function updateRunFlashcardAtIndex({
  runId,
  cardIndex,
  origin = 'current',
  updates = {},
}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const run = await getStudyRunById(runId);
  const resolvedList = resolveFlashcardListForWrite(run, origin);
  const column = resolvedList.column;
  const cards = Array.isArray(resolvedList.cards) ? [...resolvedList.cards] : [];
  const normalizedIndex = Number(cardIndex);

  if (
    !Number.isInteger(normalizedIndex) ||
    normalizedIndex < 0 ||
    normalizedIndex >= cards.length
  ) {
    throw new Error('Índice do flashcard inválido.');
  }

  const patch = normalizeFlashcardPatch(updates);
  const currentCard = cards[normalizedIndex] || {};
  const updatedCard = {
    ...currentCard,
    ...patch,
  };

  cards[normalizedIndex] = updatedCard;

  const { data: updatedRun, error } = await supabase
    .from('study_runs')
    .update({
      [column]: cards,
    })
    .eq('id', runId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar flashcard do histórico: ${error.message}`);
  }

  const syncedLibraryCards = await syncLibraryFlashcardFromRun({
    runId,
    cardIndex: normalizedIndex,
    patch,
  });

  const runView = buildStudyRunFlashcardView(updatedRun);

  const librarySetSync = await syncRunFlashcardsToLibrarySet({
    run: runView,
    flashcards: runView.display_flashcards || cards,
  });

  return {
    run: runView,
    flashcards: runView.display_flashcards || cards,
    flashcard: updatedCard,
    column,
    origin: resolvedList.origin,
    syncedLibraryCards,
    librarySetSync,
  };
}

function escapeSvgText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapTextForSvg(value = '', maxChars = 36, maxLines = 4) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (words.join(' ').length > lines.join(' ').length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.{3}$/, '')}...`;
  }

  return lines.length ? lines : ['Flashcard médico'];
}

function pickFlashcardImageKeyword(card = {}) {
  const insights = card.cardInsights || card.card_insights || {};
  const insightKeyword = insights.image_keyword || insights.imageKeyword;

  if (insightKeyword) return String(insightKeyword).trim();

  const firstTag = Array.isArray(card.tags) ? card.tags.find(Boolean) : '';
  if (firstTag) return String(firstTag).replace(/^origem:/i, '').trim();

  const question = String(card.question || card.pergunta || '').replace(/[?.!:;]+/g, ' ').trim();
  return question.split(/\s+/).slice(0, 4).join(' ') || 'medical learning concept';
}

function cleanImagePromptConcept(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function extractIllustrationSubject(value = '') {
  let text = cleanImagePromptConcept(value);

  if (!text) return '';

  text = text
    .replace(/\bde acordo com o texto\b/gi, '')
    .replace(/\bde acordo com a definição apresentada\b/gi, '')
    .replace(/\bsegundo o texto\b/gi, '')
    .replace(/\bsegundo a definição apresentada\b/gi, '')
    .replace(/\bcom base no texto\b/gi, '')
    .replace(/\bapresentada\b/gi, '')
    .replace(/\bo que é\b/gi, '')
    .replace(/\bqual(?:is)?\s+(?:é|são)\b/gi, '')
    .replace(/\bqual\s+a\s+definição\s+de\b/gi, '')
    .replace(/\bqual\s+é\s+a\s+definição\s+de\b/gi, '')
    .replace(/\bqual\s+o\s+conceito\s+de\b/gi, '')
    .replace(/\bqual\s+é\s+o\s+conceito\s+de\b/gi, '')
    .replace(/\bqual\s+é\s+a\s+função\s+de\b/gi, '')
    .replace(/\bqual\s+a\s+função\s+de\b/gi, '')
    .replace(/\bquais\s+são\b/gi, '')
    .replace(/\?+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '');

  return text.slice(0, 160);
}

function buildVisualSubjectFromConcept(value = '') {
  const extracted = extractIllustrationSubject(value);
  const cleaned = cleanImagePromptConcept(value);

  return (
    extracted ||
    cleaned ||
    'a single central medical illustration directly representing the concept'
  );
}

function buildSubjectSpecificIllustrationHint(subject = '') {
  return [
    'Create one single central hero illustration only.',
    'The illustration must represent the medical concept in one unified scene or one unified object.',
    'Use one dominant primary subject.',
    'If a secondary element is needed, it must be directly integrated into the same scene.',
    'Do not scatter multiple unrelated medical objects across the image.',
    'Do not create a collection, lineup, sheet, board, collage, or infographic panel of separate elements.',
    'Do not create several isolated icons.',
    'Avoid decorative extra objects.',
    'Keep the image highly relevant to the concept and visually focused.',
    `The central subject should represent: ${subject || 'the medical concept'}.`,
  ].join(' ');
}

function buildKawaiiMedicalFlashcardImagePrompt({
  field = 'answer',
  concept = '',
}) {
  const cleanConcept = cleanImagePromptConcept(concept);
  const subject = buildVisualSubjectFromConcept(cleanConcept);

  return [
    'Create ONE single isolated medical visual asset.',
    `Central medical concept to represent visually: ${subject}.`,
    'The image must contain exactly ONE main subject or ONE unified scene.',
    'The main subject must occupy most of the image.',
    'Represent the concept as a single coherent medical illustration, not as a panel.',
    'If the idea requires more than one element, merge the elements into one connected object or one connected scene.',
    'Example of acceptable structure: one DNA helix integrated with a laboratory interface; one cell interacting with a drug molecule; one organ showing one pathological process.',
    'ABSOLUTE RULE: no written text anywhere in the image.',
    'No words.',
    'No titles.',
    'No labels.',
    'No captions.',
    'No legends.',
    'No letters.',
    'No numbers.',
    'No typography.',
    'No readable marks.',
    'No banners.',
    'No cards.',
    'No panels.',
    'No posters.',
    'No slides.',
    'No UI.',
    'No headers.',
    'No footers.',
    'No text boxes.',
    'Do not create an infographic board.',
    'Do not create a collection of separate objects.',
    'Do not create a lineup of medical objects.',
    'Do not create a grid.',
    'Do not scatter multiple isolated icons.',
    'Do not place separate lab equipment around the subject unless it is physically integrated into the same central scene.',
    'Do not include decorative extra objects.',
    'Use a clean polished vector-style medical illustration.',
    'Use a plain neutral solid background or transparent background.',
    'Output only the illustration asset.',
  ].join(' ');
}

function buildFlashcardImagePrompt(card = {}, field = 'answer') {
  const insights = card.cardInsights || card.card_insights || {};

  const concept = String(
    field === 'question'
      ? card.question || card.pergunta || insights.image_keyword || ''
      : insights.corrected_answer ||
          card.answer ||
          card.resposta ||
          insights.image_keyword ||
          card.question ||
          card.pergunta ||
          ''
  )
    .replace(/\s+/g, ' ')
    .trim();

  return buildKawaiiMedicalFlashcardImagePrompt({
    field,
    concept,
  }).slice(0, 2600);
}

function looksLikeBase64Image(value = '') {
  const text = String(value || '').trim();

  if (!text || text.length < 500) return false;

  return /^[A-Za-z0-9+/=\s]+$/.test(text);
}

function findImageBytesInObject(value, depth = 0) {
  if (!value || depth > 6) return '';

  if (typeof value === 'string') {
    return '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageBytesInObject(item, depth + 1);
      if (found) return found;
    }

    return '';
  }

  if (typeof value !== 'object') return '';

  const preferredKeys = [
    'imageBytes',
    'bytesBase64Encoded',
    'bytesBase64',
    'base64Data',
    'data',
  ];

  for (const key of preferredKeys) {
    if (looksLikeBase64Image(value[key])) {
      return String(value[key]).replace(/\s+/g, '');
    }
  }

  for (const item of Object.values(value)) {
    const found = findImageBytesInObject(item, depth + 1);
    if (found) return found;
  }

  return '';
}

function summarizeImagenResponse(response = {}) {
  try {
    const generatedImages = Array.isArray(response?.generatedImages)
      ? response.generatedImages
      : [];

    const firstGenerated = generatedImages[0] || {};
    const firstImage = firstGenerated.image || {};

    return JSON.stringify({
      topLevelKeys: Object.keys(response || {}),
      generatedImagesCount: generatedImages.length,
      firstGeneratedKeys: Object.keys(firstGenerated || {}),
      firstImageKeys: Object.keys(firstImage || {}),
      safetyAttributes:
        firstGenerated.safetyAttributes ||
        firstGenerated.safety_attributes ||
        response.safetyAttributes ||
        response.safety_attributes ||
        null,
      finishReason:
        firstGenerated.finishReason ||
        firstGenerated.finish_reason ||
        response.finishReason ||
        response.finish_reason ||
        null,
      filteredReason:
        firstGenerated.filteredReason ||
        firstGenerated.filtered_reason ||
        response.filteredReason ||
        response.filtered_reason ||
        null,
    }).slice(0, 900);
  } catch {
    return 'Não foi possível resumir a resposta do modelo de imagem.';
  }
}

function buildImageValidationPrompt() {
  return `
You are validating a generated medical illustration for a flashcard system.

Return only valid JSON.

The image is approved ONLY if all conditions are true:
1. It contains no readable text of any kind.
2. It contains no title, label, caption, letter, number, logo, watermark, or typography.
3. It is not a poster, card, slide, UI, infographic board, or text panel.
4. It does not show a collection/grid/lineup of many disconnected objects.
5. It has one dominant central subject or one unified connected scene.

Reject the image if:
- any readable word appears;
- a medical topic title appears, such as "Biotecnologia";
- there are many separate objects scattered around the canvas;
- it looks like a board, poster, panel, or infographic sheet;
- it has multiple independent icons instead of one central illustration.

JSON schema:
{
  "approved": boolean,
  "has_text": boolean,
  "has_multiple_disconnected_objects": boolean,
  "looks_like_poster_or_panel": boolean,
  "reason": string
}
`.trim();
}

function parseImageValidationJson(text = '') {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');

    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }

    return {
      approved: false,
      has_text: true,
      has_multiple_disconnected_objects: true,
      looks_like_poster_or_panel: true,
      reason: 'Não foi possível validar a imagem em JSON.',
    };
  }
}

async function validateGeneratedIllustrationBuffer(buffer) {
  if (!buffer) {
    return {
      approved: false,
      reason: 'Buffer vazio.',
    };
  }

  const imageBase64 = buffer.toString('base64');
  const prompt = buildImageValidationPrompt();

  const errors = [];

  for (const apiKey of getGeminiKeysToTry()) {
    for (const modelName of GEMINI_METADATA_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: 'image/png',
                        data: imageBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
              },
            }),
          },
          REQUEST_TIMEOUT_MS
        );

        const responseText = await response.text();
        const data = parseJsonSafe(responseText);

        if (!response.ok) {
          throw new Error(
            data?.error?.message || `Falha na validação da imagem: HTTP ${response.status}`
          );
        }

        const text = getGeminiText(data);
        const parsed = parseImageValidationJson(text);

        return {
          approved: Boolean(parsed.approved),
          has_text: Boolean(parsed.has_text),
          has_multiple_disconnected_objects: Boolean(parsed.has_multiple_disconnected_objects),
          looks_like_poster_or_panel: Boolean(parsed.looks_like_poster_or_panel),
          reason: parsed.reason || '',
          modelUsed: modelName,
        };
      } catch (error) {
        errors.push(`${modelName} | ${maskGeminiKey(apiKey)}: ${error.message}`);

        if (isGeminiQuotaError(error)) {
          putGeminiKeyOnCooldown(apiKey, error);
        }
      }
    }
  }

  return {
    approved: false,
    has_text: true,
    has_multiple_disconnected_objects: true,
    looks_like_poster_or_panel: true,
    reason: `Falha ao validar imagem: ${errors.slice(0, 3).join(' | ')}`,
  };
}

async function sanitizeGeneratedIllustrationBuffer(buffer) {
  if (!buffer) return buffer;

  const image = sharp(buffer);
  const metadata = await image.metadata();

  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // O Imagen às vezes cria "card/poster" com título no topo.
  // Este corte remove a faixa superior onde o texto costuma aparecer
  // e mantém a área central da ilustração.
  const cropTop = Math.round(height * 0.18);
  const cropHeight = Math.round(height * 0.72);

  const safeCropHeight = Math.min(cropHeight, height - cropTop);

  return await sharp(buffer)
    .extract({
      left: 0,
      top: cropTop,
      width,
      height: safeCropHeight,
    })
    .trim({ threshold: 10 })
    .resize({
      width: 900,
      height: 640,
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 248, g: 251, b: 253, alpha: 0 },
    })
    .extend({
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
      background: { r: 248, g: 251, b: 253, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function normalizeGeneratedIllustrationBuffer(buffer) {
  if (!buffer) return buffer;

  return await sharp(buffer)
    .trim({ threshold: 8 })
    .resize({
      width: 900,
      height: 900,
      fit: 'inside',
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .extend({
      top: 28,
      right: 28,
      bottom: 28,
      left: 28,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

async function generateImagenIllustrationBuffer(prompt) {
  if (!GEMINI_API_KEYS.length) {
    throw new Error('GEMINI_API_KEY não definida no .env.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const errors = [];

  const imageModelsToTry = GEMINI_IMAGE_MODELS
    .map((model) => String(model || '').trim())
    .filter(Boolean);

  if (!imageModelsToTry.length) {
    throw new Error('Nenhum modelo de imagem configurado. Defina GEMINI_IMAGE_MODELS ou GEMINI_IMAGE_MODEL.');
  }

  const attemptsPerModel = 3;

  for (const modelName of imageModelsToTry) {
    for (const apiKey of getGeminiKeysToTry()) {
      for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
        try {
          const ai = new GoogleGenAI({ apiKey });

          const attemptPrompt = [
            prompt,
            attempt > 1
              ? `Previous attempt was rejected. Generate again following the rules strictly. Attempt ${attempt}/${attemptsPerModel}. The image must have no text and must show only one central unified medical illustration.`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          const response = await ai.models.generateImages({
            model: modelName,
            prompt: attemptPrompt,
            config: {
              numberOfImages: 1,
              aspectRatio: '1:1',
              personGeneration: 'dont_allow',
            },
          });

          const imageBytes =
            response?.generatedImages?.[0]?.image?.imageBytes ||
            findImageBytesInObject(response);

          if (!imageBytes) {
            const responseSummary = summarizeImagenResponse(response);

            errors.push(
              `${modelName} | ${maskGeminiKey(apiKey)} tentativa ${attempt} [sem-bytes]: ${responseSummary}`
            );

            continue;
          }

          const rawBuffer = Buffer.from(imageBytes, 'base64');
          const normalizedBuffer = await normalizeGeneratedIllustrationBuffer(rawBuffer);
          const validation = await validateGeneratedIllustrationBuffer(normalizedBuffer);

          if (validation.approved) {
            return normalizedBuffer;
          }

          errors.push(
            `${modelName} | ${maskGeminiKey(apiKey)} tentativa ${attempt} [rejeitada]: ${validation.reason || 'Imagem rejeitada.'}`
          );

          console.warn(
            '⚠️ Imagem IA rejeitada pela validação:',
            validation
          );
        } catch (error) {
          const message = error.message || 'Erro desconhecido';

          errors.push(
            `${modelName} | ${maskGeminiKey(apiKey)} tentativa ${attempt} [${error.statusCode || 'sem-status'}]: ${message}`
          );

          if (isGeminiQuotaError(error)) {
            putGeminiKeyOnCooldown(apiKey, error);
          }

          console.warn(
            `⚠️ Falha ao gerar imagem no modelo ${modelName} com chave ${maskGeminiKey(apiKey)}. Tentando próximo fallback:`,
            message
          );
        }
      }
    }
  }

  throw new Error(
    `Nenhum modelo de imagem retornou uma imagem aprovada. Últimos erros: ${errors.slice(-6).join(' | ')}`
  );
}

async function composeFlashcardPosterImage({ illustrationBuffer, card = {}, keyword = '' }) {
  const sharp = require('sharp');

  const titleLines = wrapTextForSvg(
    card.question || card.pergunta || 'Flashcard médico',
    33,
    5
  );

  const keywordText = String(keyword || pickFlashcardImageKeyword(card) || 'MEDICINA')
    .toUpperCase()
    .slice(0, 48);

  const illustration = await sharp(illustrationBuffer)
    .resize(FLASHCARD_IMAGE_WIDTH, 1040, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  const titleTspans = titleLines
    .map(
      (line, index) =>
        `<tspan x="70" dy="${index === 0 ? 0 : 62}">${escapeSvgText(line)}</tspan>`
    )
    .join('');

  const overlaySvg = Buffer.from(`
    <svg width="${FLASHCARD_IMAGE_WIDTH}" height="${FLASHCARD_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#020617"/>
      <rect x="54" y="54" width="${FLASHCARD_IMAGE_WIDTH - 108}" height="${
        FLASHCARD_IMAGE_HEIGHT - 108
      }" rx="44" fill="none" stroke="#1e293b" stroke-width="3"/>
      <text x="70" y="118" fill="#facc15" font-size="28" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="800" letter-spacing="4">FLASHCARD MÉDICO</text>
      <text x="70" y="205" fill="#f8fafc" font-size="48" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="800">${titleTspans}</text>
      <rect x="70" y="500" width="${FLASHCARD_IMAGE_WIDTH - 140}" height="56" rx="28" fill="#facc15"/>
      <text x="100" y="538" fill="#111827" font-size="24" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" letter-spacing="2">${escapeSvgText(keywordText)}</text>
      <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#020617" stop-opacity="0"/>
        <stop offset="100%" stop-color="#020617" stop-opacity="0.94"/>
      </linearGradient>
      <rect x="0" y="1330" width="${FLASHCARD_IMAGE_WIDTH}" height="430" fill="url(#fade)"/>
      <text x="70" y="1740" fill="#94a3b8" font-size="25" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="700">Gerado para revisão ativa</text>
      <text x="70" y="1790" fill="#64748b" font-size="22" font-family="${EXPORT_SVG_FONT_FAMILY}">Use junto da pergunta e resposta do card.</text>
    </svg>
  `);

  return await sharp({
    create: {
      width: FLASHCARD_IMAGE_WIDTH,
      height: FLASHCARD_IMAGE_HEIGHT,
      channels: 4,
      background: '#020617',
    },
  })
    .composite([
      { input: illustration, top: 620, left: 0 },
      { input: overlaySvg, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function uploadBufferToR2({ buffer, key, contentType = 'image/png' }) {
  if (!r2) {
    throw new Error('Cloudflare R2 não configurado.');
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return {
    key,
    publicUrl: buildR2PublicUrl(key),
  };
}

async function generateFlashcardInsights({ run = {}, card = {}, cardIndex = 0 }) {
  const responseSchema = {
    type: 'object',
    properties: {
      gap: { type: 'string' },
      gap_en: { type: 'string' },

      improvement: { type: 'string' },
      improvement_en: { type: 'string' },

      corrected_answer: { type: 'string' },
      corrected_answer_en: { type: 'string' },

      preceptor_note_suggestion: { type: 'string' },
      preceptor_note_suggestion_en: { type: 'string' },
      image_keyword: { type: 'string' },
      image_prompt: { type: 'string' },
      mnemonic_detected: { type: 'boolean' },
      mnemonic_value: { type: 'string' },
      mnemonic_application: { type: 'string' },
      suggested_tags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'gap',
      'improvement',
      'corrected_answer',
      'preceptor_note_suggestion',
      'image_keyword',
      'image_prompt',
      'suggested_tags',
      'mnemonic_detected',
      'mnemonic_value',
      'mnemonic_application',
      'gap_en',
      'improvement_en',
      'corrected_answer_en',
      'preceptor_note_suggestion_en',
    ],
  };

  const evidenceText = [
    run.evidence_analysis ? JSON.stringify(run.evidence_analysis).slice(0, 4000) : '',
    run.enriched_summary ? JSON.stringify(run.enriched_summary).slice(0, 3000) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await generateStructuredObjectWithGemini({
    systemInstructionText:
      'Você é um preceptor médico sênior. Analise um único flashcard com foco em residência médica, precisão conceitual, lacunas e melhoria pedagógica. Responda apenas no JSON solicitado.',
    userText: `
FLASHCARD ${Number(cardIndex) + 1}
Pergunta: ${card.question || card.pergunta || ''}
Resposta atual: ${card.answer || card.resposta || ''}
Nota do preceptor atual: ${card.preceptorNote || card.preceptor_note || card.nota_preceptor || ''}
Tags: ${Array.isArray(card.tags) ? card.tags.join(', ') : ''}

TRANSCRIÇÃO DA AULA, para contexto:
${String(run.transcript || '').slice(0, 12000)}

ANÁLISE MACRO / TEXTO ENRIQUECIDO, se existir:
${evidenceText || 'Não disponível.'}

Tarefa:
1. Aponte a principal lacuna do flashcard.
2. Verifique se existe algum mnemônico aplicável a este flashcard, usando:
   - a pergunta;
   - a resposta;
   - a nota do preceptor;
   - a análise macro;
   - a transcrição.
3. Se houver mnemônico clinicamente correto e útil, retorne:
   - mnemonic_detected = true;
   - mnemonic_value com o mnemônico;
   - mnemonic_application explicando exatamente como o aluno deve usar esse mnemônico neste card.
4. Se não houver mnemônico útil, retorne mnemonic_detected = false e strings vazias nos campos de mnemônico.
5. Sugira melhoria objetiva em português. Se houver mnemônico útil, a melhoria deve incorporar o mnemônico de forma ponderada, sem transformar todo card em mnemônico.
6. Escreva uma resposta corrigida em português, mais completa e didática, mas sem ficar prolixa. Se o mnemônico for útil, inclua uma frase curta ensinando como aplicá-lo.
7. Sugira nota de preceptor em português. Se houver mnemônico útil, inclua uma orientação específica de uso.
8. Gere também versões em inglês médico natural para:
   - gap_en;
   - improvement_en;
   - corrected_answer_en;
   - preceptor_note_suggestion_en.
9. O inglês deve ser tradução fiel do português, sem acrescentar fatos novos.
10. Sugira uma palavra-chave visual curta para imagem.
11. Sugira tags curtas.
`,
    responseSchema,
  });

  return {
    gap: result.gap || '',
    gap_en: result.gap_en || '',

    improvement: result.improvement || '',
    improvement_en: result.improvement_en || '',

    corrected_answer: result.corrected_answer || '',
    corrected_answer_en: result.corrected_answer_en || '',

    preceptor_note_suggestion: result.preceptor_note_suggestion || '',
    preceptor_note_suggestion_en: result.preceptor_note_suggestion_en || '',
    image_keyword: result.image_keyword || '',
    image_prompt: result.image_prompt || '',
    suggested_tags: Array.isArray(result.suggested_tags) ? result.suggested_tags : [],
    mnemonic_detected: Boolean(result.mnemonic_detected),
    mnemonic_value: result.mnemonic_value || '',
    mnemonic_application: result.mnemonic_application || '',
  };
}

async function createR2MultipartUploadSession({
  key,
  contentType = 'application/octet-stream',
}) {
  if (!r2) {
    throw new Error('Cloudflare R2 não configurado.');
  }

  const response = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })
  );

  if (!response.UploadId) {
    throw new Error('R2 não retornou UploadId para multipart upload.');
  }

  return {
    key,
    uploadId: response.UploadId,
  };
}

async function createR2MultipartPartUrl({
  key,
  uploadId,
  partNumber,
  expiresIn = 60 * 60 * 2,
}) {
  if (!r2) {
    throw new Error('Cloudflare R2 não configurado.');
  }

  const command = new UploadPartCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: Number(partNumber),
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn });

  return {
    key,
    uploadId,
    partNumber: Number(partNumber),
    uploadUrl,
    expiresIn,
  };
}

async function completeR2MultipartUpload({
  key,
  uploadId,
  parts = [],
}) {
  if (!r2) {
    throw new Error('Cloudflare R2 não configurado.');
  }

  const normalizedParts = parts
    .map((part) => ({
      ETag: part.ETag || part.etag,
      PartNumber: Number(part.PartNumber || part.partNumber),
    }))
    .filter((part) => part.ETag && Number.isFinite(part.PartNumber))
    .sort((a, b) => a.PartNumber - b.PartNumber);

  if (!normalizedParts.length) {
    throw new Error('Nenhuma parte válida foi enviada para completar o multipart upload.');
  }

  await r2.send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: normalizedParts,
      },
    })
  );

  return {
    key,
    publicUrl: buildR2PublicUrl(key),
    parts: normalizedParts.length,
  };
}

async function abortR2MultipartUpload({
  key,
  uploadId,
}) {
  if (!r2 || !key || !uploadId) return;

  await r2.send(
    new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    })
  );
}

async function uploadAudioToR2(localPath, originalFilename) {
  if (!r2) {
    return {
      audioStorageProvider: null,
      audioObjectKey: null,
      audioUrl: null,
      audioSizeBytes: null,
    };
  }

  const key = buildPermanentAudioKey(originalFilename);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: 'audio/mpeg',
    })
  );

  const stats = fs.statSync(localPath);

  return {
    audioStorageProvider: 'cloudflare-r2',
    audioObjectKey: key,
    audioUrl: buildR2PublicUrl(key),
    audioSizeBytes: stats.size,
  };
}

async function deleteR2Object(key) {
  if (!r2 || !key) return;

  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

function getRunEnrichmentSupportTranscript(run = {}) {
  return String(run.enrichment_support_transcript || '').trim();
}

function buildTextWithEnrichmentSupport({
  transcript = '',
  enrichmentSupportTranscript = '',
}) {
  const mainTranscript = String(transcript || '').trim();
  const supportTranscript = String(enrichmentSupportTranscript || '').trim();

  if (!supportTranscript) {
    return mainTranscript;
  }

  return `
[TEXTO PRINCIPAL — BASE OBRIGATÓRIA]
${mainTranscript}

[SEGUNDO VÍDEO — BASE COMPLEMENTAR PARA ENRIQUECIMENTO]
${supportTranscript}

Instruções:
- Use o segundo vídeo para enriquecer, esclarecer, organizar e ampliar o estudo.
- Não substitua o tema central do vídeo principal.
- Não trate o segundo vídeo como evidência científica superior às fontes médicas.
- Quando houver divergência, preserve a transcrição principal e use fontes científicas como critério.
`.trim();
}

async function saveStudyRun({
  originalFilename,
  transcript,
  flashcards,
  transcriptionProvider,
  flashcardsProvider,
  flashcardsModel,
  videoStorageProvider,
  videoObjectKey,
  videoUrl,
  enrichmentSupportFilename,
  enrichmentSupportTranscript,
  enrichmentSupportVideoStorageProvider,
  enrichmentSupportVideoObjectKey,
  enrichmentSupportVideoUrl,
  enrichmentSupportTranscriptionProvider,
  specialty,
  secondaryTopics,
  autoTags,
}) {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado. Persistência ignorada.');
    return null;
  }

  const { data, error } = await supabase
    .from('study_runs')
    .insert({
      original_filename: originalFilename,
      transcript,
      transcript_preview: buildTranscriptPreview(transcript),
      flashcards: flashcards ?? null,
      transcription_provider: transcriptionProvider,
      flashcards_provider: flashcardsProvider ?? null,
      flashcards_model: flashcardsModel ?? null,
      video_storage_provider: videoStorageProvider ?? null,
      video_object_key: videoObjectKey ?? null,
      video_url: videoUrl ?? null,
      enrichment_support_filename: enrichmentSupportFilename || null,
      enrichment_support_transcript: enrichmentSupportTranscript || null,
      enrichment_support_transcript_preview: enrichmentSupportTranscript
        ? buildTranscriptPreview(enrichmentSupportTranscript)
        : null,
      enrichment_support_video_storage_provider: enrichmentSupportVideoStorageProvider || null,
      enrichment_support_video_object_key: enrichmentSupportVideoObjectKey || null,
      enrichment_support_video_url: enrichmentSupportVideoUrl || null,
      enrichment_support_transcription_provider: enrichmentSupportTranscriptionProvider || null,
      enrichment_support_processed_at: enrichmentSupportTranscript
        ? new Date().toISOString()
        : null,
      specialty: specialty || null,
      secondary_topics: secondaryTopics ?? [],
      auto_tags: autoTags ?? [],
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao salvar no Supabase: ${error.message}`);
  }

  return data;
}

async function createProcessingJob({
  originalFilename,
  originalFileSize,
  originalMimeType,
  tempVideoObjectKey,
  shouldGenerateFlashcards = true,
}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('processing_jobs')
    .insert({
      status: 'uploaded',
      current_step: 'Upload concluído. Aguardando processamento.',
      progress: 5,
      original_filename: originalFilename,
      original_file_size: originalFileSize || null,
      original_mime_type: originalMimeType || null,
      temp_video_object_key: tempVideoObjectKey,
      temp_video_storage_provider: 'cloudflare-r2',
      flashcards_provider: shouldGenerateFlashcards ? 'gemini' : null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao criar job de processamento: ${error.message}`);
  }

  return data;
}

async function getProcessingJobById(id) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Falha ao carregar job: ${error.message}`);
  }

  return data;
}

async function updateProcessingJob(id, updates = {}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('processing_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar job: ${error.message}`);
  }

  return data;
}

async function updateStudyRunFlashcards(id, flashcards, modelUsed) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update({
      flashcards,
      flashcards_provider: 'gemini',
      flashcards_model: modelUsed,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar flashcards no Supabase: ${error.message}`);
  }

  return buildStudyRunFlashcardView(data);
}

async function updateStudyRunEnrichment(id, enrichedTranscript, enrichedSummary) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update({
      enriched_transcript: enrichedTranscript,
      enriched_summary: enrichedSummary,
      enriched_generated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao salvar texto enriquecido no Supabase: ${error.message}`);
  }

  return data;
}

async function updateStudyRunEnrichedFlashcards(id, flashcards, modelUsed) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update({
      enriched_flashcards: flashcards,
      enriched_flashcards_generated_at: new Date().toISOString(),
      flashcards_provider: 'gemini',
      flashcards_model: `${modelUsed} (enriched)`,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao salvar flashcards enriquecidos no Supabase: ${error.message}`);
  }

  return buildStudyRunFlashcardView(data);
}

async function updateStudyRunMeta(id, updates) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar metadados do estudo: ${error.message}`);
  }

  return data;
}

async function updateStudyRunReview(id, reviewState, reviewStats) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update({
      review_state: reviewState,
      review_stats: reviewStats,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar revisão do estudo: ${error.message}`);
  }

  return data;
}

async function updateStudyRunClassification(id, classification) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .update({
      specialty: classification.specialty || null,
      secondary_topics: Array.isArray(classification.secondary_topics)
        ? classification.secondary_topics
        : [],
      auto_tags: Array.isArray(classification.auto_tags)
        ? classification.auto_tags
        : [],
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar classificação do estudo: ${error.message}`);
  }

  return data;
}

async function getStudyRunById(id) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('study_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Falha ao carregar registro no Supabase: ${error.message}`);
  }

  return buildStudyRunFlashcardView(data);
}

async function deleteStudyRunById(id) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const run = await getStudyRunById(id);

  const { error: analysisDeleteError } = await supabase
    .from('evidence_analyses')
    .delete()
    .eq('study_run_id', id);

  if (analysisDeleteError) {
    throw new Error(`Falha ao apagar evidence_analyses: ${analysisDeleteError.message}`);
  }

  const { error: runDeleteError } = await supabase
    .from('study_runs')
    .delete()
    .eq('id', id);

  if (runDeleteError) {
    throw new Error(`Falha ao apagar study_runs: ${runDeleteError.message}`);
  }

  return run;
}

async function generateStructuredObjectWithGemini({
  systemInstructionText,
  userText,
  responseSchema,
  models = GEMINI_TEXT_MODELS,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não definida no .env.');
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_json_schema: responseSchema,
    },
  };

  const errors = [];

  for (const modelName of models) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await callGeminiWithFallback(payload, [modelName]);
        const jsonText = stripMarkdownJsonFence(getGeminiText(data));
        return parseJsonSafe(jsonText);
      } catch (error) {
        const statusCode = error.statusCode || 0;
        const message = error.message || 'Erro desconhecido';
        errors.push(`${modelName} [${statusCode || 'sem-status'}]: ${message}`);

        const retryable = isRetryableGeminiError(statusCode, message);
        if (!retryable || attempt === maxAttempts) {
          break;
        }

        await sleep(attempt * 2000);
      }
    }
  }

  throw new Error(
    `Falha ao gerar JSON estruturado com Gemini. Detalhes: ${errors.join(' | ')}`
  );
}

async function classifyTranscriptMetadata(transcript, filename = '') {
  const responseSchema = {
    type: 'object',
    properties: {
      specialty: { type: 'string' },
      confidence: { type: 'string' },
      secondary_topics: {
        type: 'array',
        items: { type: 'string' },
      },
      auto_tags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['specialty', 'confidence', 'secondary_topics', 'auto_tags'],
  };

  const systemInstructionText = `
Você é um classificador de conteúdo médico.

Sua tarefa é analisar uma transcrição de aula e retornar:
1) a especialidade médica principal;
2) tópicos secundários relevantes;
3) tags automáticas curtas e úteis para busca.

Regras:
- Escolha apenas UMA especialidade principal.
- Se o conteúdo for geral ou misto demais, use "Clínica Médica".
- Produza entre 2 e 6 secondary_topics.
- Produza entre 3 e 10 auto_tags.
- Use tags curtas, úteis e padronizadas.
- Não invente conteúdo fora da transcrição.
- Responda apenas no JSON solicitado.

Especialidades permitidas:
- Neurologia
- Cardiologia
- Pneumologia
- Endocrinologia
- Infectologia
- Gastroenterologia
- Nefrologia
- Reumatologia
- Hematologia
- Ginecologia e Obstetrícia
- Pediatria
- Clínica Médica
`;

  const userText = `
Nome do arquivo: ${filename || 'Sem nome'}

[TRANSCRIÇÃO]
${transcript}
`;

  const result = await generateStructuredObjectWithGemini({
    systemInstructionText,
    userText,
    responseSchema,
    models: GEMINI_METADATA_MODELS,
  });

  const allowed = new Set([
    'Neurologia',
    'Cardiologia',
    'Pneumologia',
    'Endocrinologia',
    'Infectologia',
    'Gastroenterologia',
    'Nefrologia',
    'Reumatologia',
    'Hematologia',
    'Ginecologia e Obstetrícia',
    'Pediatria',
    'Clínica Médica',
  ]);

  const specialty = allowed.has(result?.specialty)
    ? result.specialty
    : 'Clínica Médica';

  const secondaryTopics = Array.isArray(result?.secondary_topics)
    ? result.secondary_topics
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const autoTags = Array.isArray(result?.auto_tags)
    ? result.auto_tags
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  return {
    specialty,
    confidence: result?.confidence || 'medium',
    secondary_topics: secondaryTopics,
    auto_tags: autoTags,
  };
}

async function buildEvidencePlanFromTranscript(run, themeHint, lessonHint, goalHint) {
  const responseSchema = {
    type: 'object',
    properties: {
      theme: { type: 'string' },
      lesson: { type: 'string' },
      analysis_goal: { type: 'string' },
      topics_detected: {
        type: 'array',
        items: { type: 'string' },
      },
      search_queries: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['theme', 'lesson', 'analysis_goal', 'topics_detected', 'search_queries'],
  };

  const systemInstructionText = `
Você é um assistente médico que prepara uma análise de evidência para revisão de aula.

Objetivo:
1) identificar o tema e os subtemas clínicos principais da transcrição;
2) propor queries curtas e úteis para busca em bases médicas;
3) manter foco em conteúdo de residência médica.

Regras:
- Não invente informações fora da transcrição.
- Se houver segundo vídeo complementar, use-o para ampliar a detecção de tópicos, mas mantenha o vídeo principal como eixo central da análise.
- Produza entre 4 e 8 tópicos detectados.
- Produza entre 3 e 6 queries de busca.
- As queries devem ser boas para PubMed.
- Responda apenas no JSON solicitado.
`;

  const userText = `
Nome do arquivo: ${run.original_filename || 'Sem nome'}
Tema sugerido pelo usuário: ${themeHint || 'Não informado'}
Aula sugerida pelo usuário: ${lessonHint || 'Não informado'}
Objetivo da análise: ${goalHint || 'Identificar lacunas, melhorias e possíveis mnemônicos'}

[TRANSCRIÇÃO PRINCIPAL]
${run.transcript}

[TRANSCRIÇÃO DO SEGUNDO VÍDEO COMPLEMENTAR]
${getRunEnrichmentSupportTranscript(run) || 'Nenhum segundo vídeo complementar foi enviado.'}
`;

  return generateStructuredObjectWithGemini({
    systemInstructionText,
    userText,
    responseSchema,
  });
}

function buildMedicalQuery(query) {
  return `
  (${query})
  AND (
    randomized controlled trial[pt] OR
    systematic review[pt] OR
    meta-analysis[pt] OR
    guideline[pt]
  )
  `;
}

async function searchPubMed(query, retmax = 10) {
  const esearchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  esearchUrl.searchParams.set('db', 'pubmed');
  esearchUrl.searchParams.set('retmode', 'json');
  esearchUrl.searchParams.set('retmax', String(retmax));
  esearchUrl.searchParams.set('term', buildMedicalQuery(query));

  if (process.env.NCBI_TOOL) {
    esearchUrl.searchParams.set('tool', process.env.NCBI_TOOL);
  }
  if (process.env.NCBI_EMAIL) {
    esearchUrl.searchParams.set('email', process.env.NCBI_EMAIL);
  }

  const esearchResponse = await fetchWithTimeout(esearchUrl.toString());
  const esearchText = await esearchResponse.text();
  const esearchData = parseJsonSafe(esearchText);

  if (!esearchResponse.ok) {
    throw new Error('Falha ao buscar IDs no PubMed.');
  }

  const ids = esearchData?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const esummaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  esummaryUrl.searchParams.set('db', 'pubmed');
  esummaryUrl.searchParams.set('retmode', 'json');
  esummaryUrl.searchParams.set('id', ids.join(','));

  if (process.env.NCBI_TOOL) {
    esummaryUrl.searchParams.set('tool', process.env.NCBI_TOOL);
  }
  if (process.env.NCBI_EMAIL) {
    esummaryUrl.searchParams.set('email', process.env.NCBI_EMAIL);
  }

  const esummaryResponse = await fetchWithTimeout(esummaryUrl.toString());
  const esummaryText = await esummaryResponse.text();
  const esummaryData = parseJsonSafe(esummaryText);

  if (!esummaryResponse.ok) {
    throw new Error('Falha ao buscar resumos no PubMed.');
  }

  const uids = esummaryData?.result?.uids || [];

  const articles = uids.map((uid) => {
    const item = esummaryData.result[uid];
    return {
      source_name: 'PubMed',
      source_type: 'article',
      external_id: uid,
      title: item?.title || 'Sem título',
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      snippet: item?.title || '',
      metadata: {
        pubdate: item?.pubdate || null,
        fulljournalname: item?.fulljournalname || null,
        authors: Array.isArray(item?.authors) ? item.authors.map((a) => a.name) : [],
        query_used: query,
      },
    };
  });

  return filterHighQualityArticles(articles);
}

function filterHighQualityArticles(articles) {
  const preferredTerms = [
    'guideline',
    'consensus',
    'systematic review',
    'meta-analysis',
    'randomized',
    'trial',
    'practice guideline',
    'recommendation',
  ];

  const filtered = articles.filter((article) => {
    const title = String(article?.title || '').toLowerCase();
    const journal = String(article?.metadata?.fulljournalname || '').toLowerCase();

    return preferredTerms.some(
      (term) => title.includes(term) || journal.includes(term)
    );
  });

  return filtered.length > 0 ? filtered : articles;
}

function normalizeSourceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAbstract(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeEvidenceItem(item = {}) {
  return {
    title: String(item.title || 'Sem título').trim(),
    abstract: normalizeAbstract(item.abstract || item.snippet || ''),
    source: String(item.source || item.source_name || 'unknown').trim(),
    year: extractYear(item.year || item.pubdate || item.published || ''),
    link: String(item.link || item.url || '').trim(),
    source_type: String(item.source_type || 'article').trim(),
    external_id: String(item.external_id || '').trim(),
    metadata: item.metadata || {},
  };
}

function dedupeEvidenceItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const rawItem of items) {
    const item = normalizeEvidenceItem(rawItem);
    const titleKey = normalizeSourceTitle(item.title);
    const linkKey = item.link.toLowerCase();
    const extKey = `${item.source}:${item.external_id}`;

    const dedupeKey = linkKey || extKey || titleKey;
    if (!dedupeKey || seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    result.push(item);
  }

  return result;
}

function scoreEvidenceItem(item) {
  const title = String(item.title || '').toLowerCase();
  const abstract = String(item.abstract || '').toLowerCase();
  const year = Number(item.year || 0);
  const currentYear = new Date().getFullYear();

  let score = 0;

  if (title.includes('guideline') || abstract.includes('guideline')) score += 10;
  if (title.includes('practice guideline')) score += 10;
  if (title.includes('consensus')) score += 7;
  if (title.includes('systematic review')) score += 8;
  if (title.includes('meta-analysis')) score += 8;
  if (title.includes('review')) score += 4;
  if (title.includes('randomized')) score += 4;
  if (title.includes('trial')) score += 3;

  if (year) {
    if (year >= currentYear - 3) score += 4;
    else if (year >= currentYear - 6) score += 2;
    else if (year >= currentYear - 10) score += 1;
  }

  if (String(item.source || '').toLowerCase().includes('pubmed')) score += 2;
  if (String(item.source || '').toLowerCase().includes('pmc')) score += 2;
  if (String(item.source || '').toLowerCase().includes('europe pmc')) score += 2;

  return score;
}

function rankCombinedEvidence(items = []) {
  return [...items].sort((a, b) => scoreEvidenceItem(b) - scoreEvidenceItem(a));
}

async function searchEuropePMC(query, pageSize = DEFAULT_ARTICLES_PER_SOURCE) {
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('resultType', 'core');

  const response = await fetchWithTimeout(url.toString());
  const text = await response.text();
  const data = parseJsonSafe(text);

  if (!response.ok) {
    throw new Error('Falha ao buscar Europe PMC.');
  }

  const results = data?.resultList?.result || [];

  return results.map((item) => ({
    source_name: 'Europe PMC',
    source_type: 'article',
    external_id: item.id || '',
    title: item.title || 'Sem título',
    url: item.id ? `https://europepmc.org/article/${item.source}/${item.id}` : '',
    snippet: item.abstractText || '',
    metadata: {
      pubdate: item.firstPublicationDate || item.pubYear || null,
      fulljournalname: item.journalTitle || null,
      authors: item.authorString ? [item.authorString] : [],
      query_used: query,
      pmcid: item.pmcid || null,
      doi: item.doi || null,
      has_full_text: Boolean(item.hasBook || item.isOpenAccess === 'Y' || item.pmcid),
    },
  }));
}

async function fetchPubMedCentralFullTextByPmcid(pmcid) {
  if (!pmcid) return null;

  const cleanId = String(pmcid).replace(/^PMC/i, '').trim();
  if (!cleanId) return null;

  const url = `https://pmc.ncbi.nlm.nih.gov/articles/PMC${cleanId}/?page=1`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!textOnly) return null;

  return textOnly.slice(0, 8000);
}

async function enrichSourcesWithPMCFullText(sources = []) {
  const enriched = [];

  for (const source of sources) {
    const pmcid = source?.metadata?.pmcid || null;

    if (!pmcid) {
      enriched.push(source);
      continue;
    }

    const fullText = await fetchPubMedCentralFullTextByPmcid(pmcid);

    enriched.push({
      ...source,
      metadata: {
        ...(source.metadata || {}),
        full_text_preview: fullText || null,
      },
    });
  }

  return enriched;
}

async function searchDOAJ(query, pageSize = DEFAULT_ARTICLES_PER_SOURCE) {
  const url = new URL('https://doaj.org/api/search/articles/' + encodeURIComponent(query));
  url.searchParams.set('pageSize', String(pageSize));

  const response = await fetchWithTimeout(url.toString());
  const text = await response.text();
  const data = parseJsonSafe(text);

  if (!response.ok) {
    throw new Error('Falha ao buscar DOAJ.');
  }

  const results = data?.results || [];

  return results.map((item) => {
    const bibjson = item?.bibjson || {};
    const link = Array.isArray(bibjson.link) && bibjson.link.length > 0
      ? bibjson.link[0]?.url || ''
      : '';

    const abstract = bibjson.abstract || '';
    const year = bibjson.year || null;

    return {
      source_name: 'DOAJ',
      source_type: 'article',
      external_id: item?.id || '',
      title: bibjson.title || 'Sem título',
      url: link,
      snippet: abstract,
      metadata: {
        pubdate: year,
        fulljournalname: bibjson.journal?.title || null,
        authors: Array.isArray(bibjson.author)
          ? bibjson.author.map((a) => a.name).filter(Boolean)
          : [],
        query_used: query,
        open_access: true,
      },
    };
  });
}

async function searchBioMedCentral(query, pageSize = DEFAULT_ARTICLES_PER_SOURCE) {
  const url = new URL('https://www.biomedcentral.com/search');
  url.searchParams.set('query', query);
  url.searchParams.set('tab', 'research');

  const response = await fetchWithTimeout(url.toString());
  const html = await response.text();

  if (!response.ok) {
    throw new Error('Falha ao buscar BioMed Central.');
  }

  const blocks = html.split('<article').slice(0, pageSize);
  const items = [];

  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<p[^>]*class="[^"]*c-listing__text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const yearMatch = block.match(/\b(19|20)\d{2}\b/);

    if (!titleMatch) continue;

    const rawLink = titleMatch[1] || '';
    const rawTitle = titleMatch[2] || '';

    const cleanTitle = rawTitle
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanSnippet = (snippetMatch?.[1] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const fullLink = rawLink.startsWith('http')
      ? rawLink
      : `https://www.biomedcentral.com${rawLink}`;

    items.push({
      source_name: 'BioMed Central',
      source_type: 'article',
      external_id: fullLink,
      title: cleanTitle || 'Sem título',
      url: fullLink,
      snippet: cleanSnippet,
      metadata: {
        pubdate: yearMatch ? yearMatch[0] : null,
        fulljournalname: 'BioMed Central',
        authors: [],
        query_used: query,
      },
    });
  }

  return items;
}

async function searchPubMedEnhanced(query, pageSize = DEFAULT_ARTICLES_PER_SOURCE) {
  const results = await searchPubMed(query, pageSize);
  return enrichSourcesWithPMCFullText(results);
}

async function searchAllEvidenceSources(queries = []) {
  const validQueries = (queries || []).filter(Boolean).slice(0, 4);

  const pubmed = [];
  const europePmc = [];
  const doaj = [];
  const bmc = [];

  for (const query of validQueries) {
    const [pubmedResult, europeResult, doajResult, bmcResult] = await Promise.allSettled([
      searchPubMedEnhanced(query, DEFAULT_ARTICLES_PER_SOURCE),
      searchEuropePMC(query, DEFAULT_ARTICLES_PER_SOURCE),
      searchDOAJ(query, Math.max(3, Math.floor(DEFAULT_ARTICLES_PER_SOURCE / 2))),
      searchBioMedCentral(query, Math.max(3, Math.floor(DEFAULT_ARTICLES_PER_SOURCE / 2))),
    ]);

    if (pubmedResult.status === 'fulfilled') pubmed.push(...pubmedResult.value);
    if (europeResult.status === 'fulfilled') europePmc.push(...europeResult.value);
    if (doajResult.status === 'fulfilled') doaj.push(...doajResult.value);
    if (bmcResult.status === 'fulfilled') bmc.push(...bmcResult.value);
  }

  const combined = rankCombinedEvidence(
    dedupeEvidenceItems([
      ...pubmed.map((x) => ({ ...x, source: 'PubMed' })),
      ...europePmc.map((x) => ({ ...x, source: 'Europe PMC' })),
      ...doaj.map((x) => ({ ...x, source: 'DOAJ' })),
      ...bmc.map((x) => ({ ...x, source: 'BioMed Central' })),
    ])
  ).slice(0, 12);

  return {
    pubmed: dedupeEvidenceItems(pubmed),
    europePmc: dedupeEvidenceItems(europePmc),
    doaj: dedupeEvidenceItems(doaj),
    bmc: dedupeEvidenceItems(bmc),
    combined,
  };
}

function findRelevantReferenceVideos(run, library = VIDEO_REFERENCE_LIBRARY) {
  const transcript = String(run?.transcript || '').toLowerCase();
  const specialty = String(run?.specialty || '').trim();

  return (library || [])
    .map((video) => {
      let score = 0;

      if (specialty && video.specialty === specialty) {
        score += 5;
      }

      for (const topic of video.topics || []) {
        if (transcript.includes(String(topic).toLowerCase())) {
          score += 3;
        }
      }

      for (const tag of video.tags || []) {
        if (transcript.includes(String(tag).toLowerCase())) {
          score += 2;
        }
      }

      for (const point of video.key_points || []) {
        if (transcript.includes(String(point).toLowerCase())) {
          score += 2;
        }
      }

      for (const focus of video.clinical_focus || []) {
        if (transcript.includes(String(focus).toLowerCase())) {
          score += 1;
        }
      }

      for (const pitfall of video.common_pitfalls || []) {
        const pitfallTerms = String(pitfall).toLowerCase().split(/\s+/).filter(Boolean);
        const matchedTerms = pitfallTerms.filter((term) => term.length > 3 && transcript.includes(term));
        if (matchedTerms.length >= 2) {
          score += 2;
        }
      }

      for (const angle of video.flashcard_angles || []) {
        if (transcript.includes(String(angle).toLowerCase())) {
          score += 1;
        }
      }

      return { ...video, score };
    })
    .filter((video) => video.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, DEFAULT_REFERENCE_VIDEOS_LIMIT);
}

function serializeReferenceVideosForPrompt(referenceVideos = []) {
  return (referenceVideos || [])
    .map((video, index) => {
      return `
[VIDEO ${index + 1}]
ID: ${video.id}
Título: ${video.title}
Especialidade: ${video.specialty}
Resumo: ${video.summary || 'Sem resumo'}
Tópicos: ${(video.topics || []).join(', ') || 'Nenhum'}
Tags: ${(video.tags || []).join(', ') || 'Nenhuma'}
Pontos-chave:
${(video.key_points || []).map((x) => `- ${x}`).join('\n') || '- Nenhum'}
Foco clínico:
${(video.clinical_focus || []).map((x) => `- ${x}`).join('\n') || '- Nenhum'}
Armadilhas comuns:
${(video.common_pitfalls || []).map((x) => `- ${x}`).join('\n') || '- Nenhuma'}
Ângulos para flashcards:
${(video.flashcard_angles || []).map((x) => `- ${x}`).join('\n') || '- Nenhum'}
Transcrição de referência:
${video.transcript_reference || 'Sem transcrição de referência'}
      `.trim();
    })
    .join('\n\n');
}

async function analyzeTranscriptAgainstSources(run, plan, sources, referenceVideos = []) {
  const responseSchema = {
    type: 'object',
    properties: {
      strengths: {
        type: 'array',
        items: { type: 'string' },
      },
      missing_topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            why_missing: { type: 'string' },
            correction_strategy: { type: 'string' },
            addition_text: { type: 'string' },
            source_numbers: {
              type: 'array',
              items: { type: 'integer' },
            },
          },
          required: [
            'topic',
            'why_missing',
            'correction_strategy',
            'addition_text',
            'source_numbers',
          ],
        },
      },
      improvement_suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            why_it_matters: { type: 'string' },
            source_numbers: {
              type: 'array',
              items: { type: 'integer' },
            },
          },
          required: ['title', 'content', 'why_it_matters', 'source_numbers'],
        },
      },
      mnemonics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            mnemonic: { type: 'string' },
            explanation: { type: 'string' },
            use_case: { type: 'string' },
          },
          required: ['title', 'mnemonic', 'explanation', 'use_case'],
        },
      },
      recommended_flashcard_focus: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'strengths',
      'missing_topics',
      'improvement_suggestions',
      'mnemonics',
      'recommended_flashcard_focus',
    ],
  };

  const numberedSources = (sources || [])
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title} | ${source.link || source.url || ''} | ${JSON.stringify(source.metadata || {})}`
    )
    .join('\n');

  const numberedReferenceVideos = serializeReferenceVideosForPrompt(referenceVideos);

    const systemInstructionText = `
Você é um preceptor médico e revisor científico de alto nível.

Sua função é validar criticamente a cobertura de uma aula médica comparando:
1) a transcrição da aula principal;
2) fontes científicas externas;
3) vídeos de referência usados como apoio didático.
4) uma transcrição complementar enviada pelo usuário, quando existir.

Objetivos:
- identificar pontos fortes reais da transcrição;
- detectar lacunas com impacto clínico ou pedagógico;
- para cada lacuna, explique a melhor forma de corrigi-la no texto enriquecido;
- para cada lacuna, gere um campo addition_text com um bloco pronto para ser inserido diretamente no texto enriquecido;
- sugerir melhorias concretas de nível residência médica;
- sugerir mnemônicos úteis, quando fizer sentido;
- indicar focos prioritários para novos flashcards;
- aproveitar vídeos de referência apenas como reforço educacional, nunca como evidência científica superior às fontes médicas.

Regras:
- Baseie-se apenas na transcrição, nas fontes e nos vídeos fornecidos.
- Não invente referências.
- Quando citar apoio de fonte científica, use os números das fontes fornecidas.
- Vídeos de referência servem para reforço didático e organização pedagógica.
- A transcrição complementar enviada pelo usuário deve ser usada como fonte pedagógica adicional para corrigir lacunas, ampliar exemplos, melhorar organização e sugerir flashcards.
- Não substitua o conteúdo principal pela transcrição complementar; use-a como reforço.
- Priorize utilidade prática, prova de residência, raciocínio clínico e conduta.
- Evite sugestões superficiais ou redundantes.
- Se a transcrição já estiver forte em um tópico, reconheça isso.
- Responda apenas no JSON solicitado.
`;

  const userText = `
Tema: ${plan.theme}
Aula: ${plan.lesson}
Objetivo: ${plan.analysis_goal}

Tópicos detectados:
${(plan.topics_detected || []).map((t) => `- ${t}`).join('\n')}

Transcrição principal:
${run.transcript}

Transcrição complementar enviada pelo usuário:
${getRunEnrichmentSupportTranscript(run) || 'Nenhuma transcrição complementar enviada.'}

Fontes científicas encontradas:
${numberedSources || 'Nenhuma fonte científica encontrada.'}

Vídeos de referência:
${numberedReferenceVideos || 'Nenhum vídeo de referência encontrado.'}
`;

  return generateStructuredObjectWithGemini({
    systemInstructionText,
    userText,
    responseSchema,
  });
}

async function buildEnrichedTranscriptFromAnalysis(run, analysis, sources, referenceVideos = []) {
  const responseSchema = {
    type: 'object',
    properties: {
      enriched_transcript: { type: 'string' },
      enriched_summary: {
        type: 'object',
        properties: {
          applied_topics: {
            type: 'array',
            items: { type: 'string' },
          },
          applied_mnemonics: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['applied_topics', 'applied_mnemonics'],
      },
    },
    required: ['enriched_transcript', 'enriched_summary'],
  };

  const numberedSources = (sources || [])
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title} | ${source.url} | ${JSON.stringify(source.metadata || {})}`
    )
    .join('\n');

  const numberedReferenceVideos = serializeReferenceVideosForPrompt(referenceVideos);

  const systemInstructionText = `
Você é um editor médico de conteúdo para residência.

Seu trabalho é enriquecer uma transcrição de aula médica original sem descaracterizar o conteúdo-base.

Objetivos:
- preservar o texto original como núcleo;
- usar a transcrição complementar do usuário como apoio para enriquecer pontos fracos, adicionar exemplos, organizar raciocínio e melhorar didática;
- adicionar informações faltantes de alto valor;
- incorporar sugestões práticas e mnemônicos úteis;
- melhorar a utilidade para revisão médica e prova;
- usar vídeos de referência como apoio pedagógico para melhorar explicação, organização e retenção.

Regras:
- Não contradiga a transcrição original.
- Não substitua a aula principal pelo segundo vídeo. A transcrição complementar deve entrar como reforço integrado.
- Não invente fatos sem apoio nas sugestões/fontes fornecidas.
- O texto final deve parecer uma versão enriquecida da aula, e não uma lista solta.
- Mantenha português médico claro e objetivo.
- Use fontes científicas como base principal de reforço factual.
- Utilize vídeos de referência como apoio pedagógico para enriquecer explicações, exemplos, comparações, organização didática e cobertura de pontos que ficaram fracos.
- Não trate vídeos como evidência científica superior às fontes médicas.
- Responda apenas no JSON solicitado.
`;

  const userText = `
[TRANSCRIÇÃO ORIGINAL — VÍDEO PRINCIPAL]
${run.transcript}

[TRANSCRIÇÃO COMPLEMENTAR — SEGUNDO VÍDEO ENVIADO PELO USUÁRIO]
${getRunEnrichmentSupportTranscript(run) || 'Nenhuma transcrição complementar enviada.'}

[ANÁLISE DE EVIDÊNCIA]
Pontos fortes:
${(analysis.strengths || []).map((x) => `- ${x}`).join('\n')}

Lacunas:
${(analysis.missing_topics || [])
  .map((x) => {
    if (typeof x === 'string') return `- ${x}`;

    return `- ${x.topic || x.title || 'Lacuna'}: ${x.why_missing || ''}
Como corrigir: ${x.correction_strategy || ''}
Texto sugerido: ${x.addition_text || ''}
Fontes: ${(x.source_numbers || []).join(', ')}`;
  })
  .join('\n')}

Sugestões:
${(analysis.improvement_suggestions || [])
  .map((x) => `- ${x.title}: ${x.content} | Por que importa: ${x.why_it_matters}`)
  .join('\n')}

Mnemônicos:
${(analysis.mnemonics || [])
  .map((x) => `- ${x.title}: ${x.mnemonic} | ${x.explanation} | Uso: ${x.use_case}`)
  .join('\n')}

[FONTES CIENTÍFICAS]
${numberedSources || 'Nenhuma fonte científica disponível.'}

[VÍDEOS DE REFERÊNCIA]
${numberedReferenceVideos || 'Nenhum vídeo de referência disponível.'}
`;

  return generateStructuredObjectWithGemini({
    systemInstructionText,
    userText,
    responseSchema,
  });
}

async function saveEvidenceAnalysis({
  studyRunId,
  plan,
  analysis,
}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data, error } = await supabase
    .from('evidence_analyses')
    .insert({
      study_run_id: studyRunId,
      theme: plan.theme,
      lesson: plan.lesson,
      analysis_goal: plan.analysis_goal,
      topics_detected: plan.topics_detected,
      search_queries: plan.search_queries,
      strengths: analysis.strengths,
      missing_topics: analysis.missing_topics,
      improvement_suggestions: analysis.improvement_suggestions,
      mnemonics: analysis.mnemonics,
      recommended_flashcard_focus: analysis.recommended_flashcard_focus,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao salvar evidence_analyses: ${error.message}`);
  }

  return data;
}

async function saveEvidenceSources(analysisId, sources) {
  if (!supabase || !sources.length) return [];

  const payload = sources.map((source) => ({
    analysis_id: analysisId,
    source_name: source.source_name || source.source || 'unknown',
    source_type: source.source_type || 'article',
    external_id: source.external_id || null,
    title: source.title || 'Sem título',
    url: source.url || source.link || null,
    snippet: source.snippet || source.abstract || '',
    metadata: source.metadata || {
      year: source.year || null,
    },
  }));

  const { data, error } = await supabase
    .from('evidence_sources')
    .insert(payload)
    .select('*');

  if (error) {
    throw new Error(`Falha ao salvar evidence_sources: ${error.message}`);
  }

  return data || [];
}

async function getLatestEvidenceAnalysisByStudyRunId(studyRunId) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  const { data: analysis, error: analysisError } = await supabase
    .from('evidence_analyses')
    .select('*')
    .eq('study_run_id', studyRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysisError) {
    throw new Error(`Falha ao buscar evidence_analyses: ${analysisError.message}`);
  }

  if (!analysis) {
    return { analysis: null, sources: [] };
  }

  const { data: sources, error: sourcesError } = await supabase
    .from('evidence_sources')
    .select('*')
    .eq('analysis_id', analysis.id)
    .order('id', { ascending: true });

  if (sourcesError) {
    throw new Error(`Falha ao buscar evidence_sources: ${sourcesError.message}`);
  }

  return {
    analysis,
    sources: sources || [],
  };
}

async function listStudyRuns({ page = 1, limit = 12, search = '' }) {
  if (!supabase) {
    return {
      runs: [],
      hasMore: false,
    };
  }

  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 12), 1), 24);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit;

  let query = supabase
    .from('study_runs')
    .select(
      `
      id,
      created_at,
      original_filename,
      transcript_preview,
      transcript,
      flashcards,
      enriched_flashcards,
      enriched_transcript,
      flashcards_model,
      video_url,
      video_object_key,
      video_storage_provider,
      audio_url,
      audio_object_key,
      audio_storage_provider,
      audio_mime_type,
      audio_size_bytes,
      audio_duration_seconds,
      source_video_discarded,
      source_video_discarded_at,
      enrichment_support_filename,
      enrichment_support_transcript_preview,
      enrichment_support_video_url,
      enrichment_support_processed_at,
      is_favorite,
      study_tag,
      review_state,
      review_stats,
      specialty,
      secondary_topics,
      auto_tags,
      evidence_analyses (
        id,
        created_at
      )
      `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to - 1);

  if (search && search.trim()) {
    query = query.or(
      `original_filename.ilike.%${search.trim()}%,transcript.ilike.%${search.trim()}%,enrichment_support_transcript.ilike.%${search.trim()}%,enrichment_support_filename.ilike.%${search.trim()}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Falha ao buscar histórico no Supabase: ${error.message}`);
  }

  const runs = (data || []).map((item) => ({
    ...item,
    has_flashcards:
      Array.isArray(item.enriched_flashcards) && item.enriched_flashcards.length > 0
        ? true
        : Array.isArray(item.flashcards) && item.flashcards.length > 0,
    flashcards_count:
      Array.isArray(item.enriched_flashcards) && item.enriched_flashcards.length > 0
        ? item.enriched_flashcards.length
        : Array.isArray(item.flashcards)
          ? item.flashcards.length
          : 0,
    has_analysis: Array.isArray(item.evidence_analyses) && item.evidence_analyses.length > 0,
    last_analysis_at: item.evidence_analyses?.[0]?.created_at || null,
  }));

  return {
    runs,
    hasMore: typeof count === 'number' ? to < count : false,
  };
}

async function getLibraryAnalytics({ specialty = '' } = {}) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  let query = supabase
    .from('flashcards_library')
    .select(`
      id,
      specialty,
      sub_specialty,
      deck_id,
      is_favorite,
      is_archived,
      review_state,
      review_stats
    `)
    .eq('is_archived', false);

  if (String(specialty || '').trim()) {
    query = query.eq('specialty', String(specialty).trim());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha ao buscar analytics da biblioteca: ${error.message}`);
  }

  const cards = Array.isArray(data) ? data : [];
  const now = new Date();

  const totalCards = cards.length;
  const favoriteCards = cards.filter((card) => Boolean(card.is_favorite)).length;
  const dueCards = cards.filter((card) => {
    const dueAt = card?.review_state?.dueAt;
    if (!dueAt) return false;
    return new Date(dueAt) <= now;
  }).length;

  const specialtyMap = {};
  const subSpecialtyMap = {};
  const deckMap = {};

  for (const card of cards) {
    const specialtyName = String(card.specialty || 'Sem especialidade').trim();
    const subSpecialtyName = String(card.sub_specialty || 'Sem subespecialidade').trim();
    const deckKey = String(card.deck_id || 'Sem deck');

    specialtyMap[specialtyName] = (specialtyMap[specialtyName] || 0) + 1;
    subSpecialtyMap[subSpecialtyName] = (subSpecialtyMap[subSpecialtyName] || 0) + 1;
    deckMap[deckKey] = (deckMap[deckKey] || 0) + 1;
  }

  const bySpecialty = Object.entries(specialtyMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const bySubSpecialty = Object.entries(subSpecialtyMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const byDeck = Object.entries(deckMap)
    .map(([deck_id, count]) => ({ deck_id, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCards,
    favoriteCards,
    dueCards,
    bySpecialty,
    bySubSpecialty,
    byDeck,
  };
}

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

async function saveGoogleCalendarTokens(tokens) {
  if (!supabase) {
    throw new Error('Supabase não configurado no backend.');
  }

  if (!tokens.refresh_token) {
    const existing = await getGoogleCalendarTokens();

    if (!existing?.refresh_token) {
      throw new Error('Google não retornou refresh_token. Revogue o acesso e conecte novamente.');
    }

    tokens.refresh_token = existing.refresh_token;
  }

  const payload = {
    provider: 'google_calendar',
    user_key: 'default_user',
    access_token: tokens.access_token || null,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope || null,
    token_type: tokens.token_type || null,
    expiry_date: tokens.expiry_date || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .upsert(payload, { onConflict: 'provider,user_key' })
    .select()
    .single();

  if (error) {
    throw new Error(`Falha ao salvar tokens Google: ${error.message}`);
  }

  return data;
}

async function getGoogleCalendarTokens() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('provider', 'google_calendar')
    .eq('user_key', 'default_user')
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao buscar tokens Google: ${error.message}`);
  }

  return data;
}

async function getAuthorizedGoogleCalendarClient() {
  const stored = await getGoogleCalendarTokens();

  if (!stored?.refresh_token) {
    throw new Error('Google Calendar ainda não conectado.');
  }

  const oauth2Client = getGoogleOAuthClient();

  oauth2Client.setCredentials({
    access_token: stored.access_token || undefined,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date || undefined,
  });

  oauth2Client.on('tokens', async (tokens) => {
    await saveGoogleCalendarTokens(tokens);
  });

  return google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });
}

function buildGoogleCalendarReviewEventFromCard(card) {
  const dueAt = card?.review_state?.dueAt
    ? new Date(card.review_state.dueAt)
    : new Date();

  const dateKey = dueAt.toISOString().slice(0, 10);

  const intervalLabel = card.smartReviewLabel || card.reviewLabel || 'D0';

  return {
    summary: `🧠 ${intervalLabel} - Revisar flashcard: ${String(card.question || 'Card').slice(0, 80)}`,
    description: [
      'Revisão espaçada - Flashcards IA',
      `CARD_ID: ${card.id}`,
      `DUE: ${dateKey}`,
      '',
      `Pergunta: ${card.question || ''}`,
      '',
      `Resposta: ${card.answer || ''}`,
      '',
      card.preceptor_note ? `Nota do preceptor: ${card.preceptor_note}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: dateKey },
    end: { date: dateKey },
    transparency: 'transparent',
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 540 }],
    },
    extendedProperties: {
      private: {
        flashcardsIaCardId: String(card.id),
        flashcardsIaReviewLabel: intervalLabel,
      },
    },
  };
}

function normalizeExportFlashcards(cards = []) {
  return (Array.isArray(cards) ? cards : [])
    .map((card, index) => ({
      index: Number(card.position || card.sort_order || index + 1),

      question: String(card.question || card.pergunta || '').trim(),
      question_en: String(card.question_en || card.questionEn || '').trim(),
      questionEn: String(card.questionEn || card.question_en || '').trim(),

      answer: String(card.answer || card.resposta || '').trim(),
      answer_en: String(card.answer_en || card.answerEn || '').trim(),
      answerEn: String(card.answerEn || card.answer_en || '').trim(),

      questionHtml: String(card.questionHtml || card.question_html || '').trim(),
      question_html: String(card.question_html || card.questionHtml || '').trim(),

      answerHtml: String(card.answerHtml || card.answer_html || '').trim(),
      answer_html: String(card.answer_html || card.answerHtml || '').trim(),

      preceptorNote: String(
        card.preceptorNote ||
          card.preceptor_note ||
          card.nota_preceptor ||
          ''
      ).trim(),
      preceptor_note: String(
        card.preceptor_note ||
          card.preceptorNote ||
          card.nota_preceptor ||
          ''
      ).trim(),
      preceptor_note_en: String(
        card.preceptor_note_en ||
          card.preceptorNoteEn ||
          card.nota_preceptor_en ||
          ''
      ).trim(),
      preceptorNoteEn: String(
        card.preceptorNoteEn ||
          card.preceptor_note_en ||
          card.nota_preceptor_en ||
          ''
      ).trim(),
      preceptorNoteHtml: String(card.preceptorNoteHtml || card.preceptor_note_html || '').trim(),
      preceptor_note_html: String(card.preceptor_note_html || card.preceptorNoteHtml || '').trim(),

      specialty: String(card.specialty || '').trim(),
      topic: String(card.sub_specialty || card.subSpecialty || card.theme || card.topic || '').trim(),

      imageUrl: String(card.imageUrl || card.image_url || '').trim(),
      image_url: String(card.image_url || card.imageUrl || '').trim(),

      questionImageUrl: String(card.questionImageUrl || card.question_image_url || '').trim(),
      question_image_url: String(card.question_image_url || card.questionImageUrl || '').trim(),

      answerImageUrl: String(card.answerImageUrl || card.answer_image_url || '').trim(),
      answer_image_url: String(card.answer_image_url || card.answerImageUrl || '').trim(),
    }))
    .filter((card) => card.question && card.answer)
    .sort((a, b) => a.index - b.index);
}

function safeExportFilename(value = 'flashcards') {
  return String(value || 'flashcards')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

function stripHtmlToPlainText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchImageBuffer(url = '') {
  if (!url) return null;

  try {
    const response = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();

    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn('⚠️ Falha ao baixar imagem para exportação:', error.message);
    return null;
  }
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeExportColor(value = '') {
  const raw = String(value || '').trim().replace(/["']/g, '');

  if (!raw) return '';

  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.replace('#', '').toUpperCase();
  }

  const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);

  if (rgbMatch) {
    return rgbMatch
      .slice(1)
      .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  const namedColors = {
    black: '000000',
    white: 'FFFFFF',
    red: 'DC2626',
    blue: '2563EB',
    green: '16A34A',
    yellow: 'CA8A04',
    orange: 'EA580C',
    purple: '9333EA',
    pink: 'DB2777',
    gray: '64748B',
    grey: '64748B',
  };

  return namedColors[raw.toLowerCase()] || '';
}

function extractStyleValue(style = '', property = '') {
  const parts = String(style || '').split(';');

  for (const part of parts) {
    const [key, ...valueParts] = part.split(':');

    if (String(key || '').trim().toLowerCase() === property.toLowerCase()) {
      return valueParts.join(':').trim();
    }
  }

  return '';
}

function extractHtmlAttribute(rawTag = '', attribute = '') {
  const pattern = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(rawTag || '').match(pattern);

  return match?.[2] || match?.[3] || match?.[4] || '';
}

function cleanExportHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function parseFlashcardHtmlToRichParagraphs(html = '', fallback = '') {
  const sourceHtml = cleanExportHtml(html || '');

  if (!sourceHtml.trim()) {
    const text = String(fallback || '').trim();

    if (!text) return [];

    return text.split(/\n{2,}|\n/g).map((line) => [
      {
        text: line,
        bold: false,
        italics: false,
        underline: false,
        strike: false,
        color: '',
        highlight: false,
      },
    ]);
  }

  const paragraphs = [[]];
  const styleStack = [
    {
      bold: false,
      italics: false,
      underline: false,
      strike: false,
      color: '',
      highlight: false,
    },
  ];

  const currentStyle = () => styleStack[styleStack.length - 1] || styleStack[0];

  const startNewParagraph = () => {
    const last = paragraphs[paragraphs.length - 1];

    if (last && last.length === 0) return;

    paragraphs.push([]);
  };

  const pushText = (text) => {
    const decoded = decodeHtmlEntities(text).replace(/\s+/g, ' ');

    if (!decoded.trim()) {
      const last = paragraphs[paragraphs.length - 1];
      const previous = last[last.length - 1];

      if (previous && !previous.text.endsWith(' ')) {
        previous.text += ' ';
      }

      return;
    }

    paragraphs[paragraphs.length - 1].push({
      ...currentStyle(),
      text: decoded,
    });
  };

  const tokens = sourceHtml.match(/<[^>]+>|[^<]+/g) || [];

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      pushText(token);
      continue;
    }

    const rawTag = token;
    const tagMatch = rawTag.match(/^<\/?\s*([a-z0-9]+)/i);
    const tagName = String(tagMatch?.[1] || '').toLowerCase();
    const isClosing = /^<\//.test(rawTag);
    const isSelfClosing = /\/>$/.test(rawTag) || ['br', 'hr', 'img'].includes(tagName);

    if (!tagName) continue;

    if (tagName === 'br') {
      startNewParagraph();
      continue;
    }

    if (isClosing) {
      if (['p', 'div', 'li'].includes(tagName)) {
        startNewParagraph();
      }

      if (styleStack.length > 1) {
        styleStack.pop();
      }

      continue;
    }

    if (['p', 'div', 'li'].includes(tagName)) {
      startNewParagraph();
    }

    const nextStyle = { ...currentStyle() };

    if (tagName === 'strong' || tagName === 'b') {
      nextStyle.bold = true;
    }

    if (tagName === 'em' || tagName === 'i') {
      nextStyle.italics = true;
    }

    if (tagName === 'u') {
      nextStyle.underline = true;
    }

    if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
      nextStyle.strike = true;
    }

    if (tagName === 'mark') {
      nextStyle.highlight = true;
    }

    const className = extractHtmlAttribute(rawTag, 'class');
    const dataLang = extractHtmlAttribute(rawTag, 'data-lang');

    if (
      /\btext-blue-600\b/i.test(className || '') ||
      String(dataLang || '').toLowerCase() === 'en'
    ) {
      nextStyle.color = '2563EB';
    }

    const style = extractHtmlAttribute(rawTag, 'style');

    if (style) {
      const color = normalizeExportColor(extractStyleValue(style, 'color'));
      const background =
        normalizeExportColor(extractStyleValue(style, 'background-color')) ||
        normalizeExportColor(extractStyleValue(style, 'background'));

      if (color) {
        nextStyle.color = color;
      }

      if (background) {
        nextStyle.highlight = true;
      }
    }

    if (!isSelfClosing) {
      styleStack.push(nextStyle);
    }
  }

  return paragraphs
    .map((paragraph) =>
      paragraph
        .map((segment) => ({
          ...segment,
          text: String(segment.text || '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((segment) => segment.text)
    )
    .filter((paragraph) => paragraph.length > 0);
}

function getPdfFontForRichSegment(segment = {}, forceBold = false) {
  const bold = forceBold || Boolean(segment.bold);
  const italics = Boolean(segment.italics);

  if (bold && italics) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italics) return 'Helvetica-Oblique';

  return 'Helvetica';
}

function splitRichSegmentsIntoTokens(segments = []) {
  const tokens = [];

  for (const segment of segments) {
    const parts = String(segment.text || '').split(/(\s+)/).filter(Boolean);

    for (const part of parts) {
      tokens.push({
        ...segment,
        text: part,
      });
    }
  }

  return tokens;
}

function drawRichPdfText(doc, {
  paragraphs = [],
  fallbackText = '',
  x = 72,
  y = 150,
  width = 576,
  height = 300,
  fontSize = 30,
  baseColor = '#243447',
  forceBold = false,
  align = 'center',
  lineGap = 10,
}) {
  const safeParagraphs =
    paragraphs && paragraphs.length
      ? paragraphs
      : parseFlashcardHtmlToRichParagraphs('', fallbackText);

  let cursorY = y;
  const maxY = y + height;
  const lineHeight = fontSize + lineGap;

  const drawLine = (lineTokens) => {
    if (!lineTokens.length || cursorY + lineHeight > maxY) return;

    let totalWidth = 0;

    for (const token of lineTokens) {
      doc.font(getPdfFontForRichSegment(token, forceBold)).fontSize(fontSize);
      totalWidth += doc.widthOfString(token.text);
    }

    let cursorX = align === 'center'
      ? x + Math.max(0, (width - totalWidth) / 2)
      : x;

    for (const token of lineTokens) {
      const pdfColor = token.color ? `#${token.color}` : baseColor;

      doc.font(getPdfFontForRichSegment(token, forceBold)).fontSize(fontSize);

      const tokenWidth = doc.widthOfString(token.text);

      if (token.highlight) {
        doc.save();
        doc.rect(cursorX, cursorY - 2, tokenWidth, fontSize + 6).fill('#FEF08A');
        doc.restore();
      }

      doc.fillColor(pdfColor).text(token.text, cursorX, cursorY, {
        lineBreak: false,
        underline: Boolean(token.underline),
        strike: Boolean(token.strike),
      });

      cursorX += tokenWidth;
    }

    cursorY += lineHeight;
  };

  for (const paragraph of safeParagraphs) {
    const tokens = splitRichSegmentsIntoTokens(paragraph);
    let line = [];
    let lineWidth = 0;

    for (const token of tokens) {
      doc.font(getPdfFontForRichSegment(token, forceBold)).fontSize(fontSize);
      const tokenWidth = doc.widthOfString(token.text);

      if (line.length && lineWidth + tokenWidth > width) {
        drawLine(line);
        line = [];
        lineWidth = 0;
      }

      line.push(token);
      lineWidth += tokenWidth;
    }

    drawLine(line);
    cursorY += lineGap;

    if (cursorY > maxY) break;
  }
}

function richSegmentToDocxTextRun(segment = {}) {
  const options = {
    text: segment.text,
    bold: Boolean(segment.bold),
    italics: Boolean(segment.italics),
    strike: Boolean(segment.strike),
  };

  if (segment.color) {
    options.color = segment.color;
  }

  if (segment.underline) {
    options.underline = {
      type: UnderlineType.SINGLE,
    };
  }

  if (segment.highlight) {
    options.highlight = 'yellow';
  }

  return new TextRun(options);
}

function buildDocxParagraphsFromRichHtml(html = '', fallback = '', paragraphOptions = {}) {
  const paragraphs = parseFlashcardHtmlToRichParagraphs(html, fallback);

  if (!paragraphs.length) {
    return [
      new Paragraph({
        text: fallback || '',
        ...paragraphOptions,
      }),
    ];
  }

  return paragraphs.map((segments) =>
    new Paragraph({
      children: segments.map(richSegmentToDocxTextRun),
      ...paragraphOptions,
    })
  );
}

async function normalizeImageAssetForEditableDocx(imageAsset, maxWidth = 620, maxHeight = 280) {
  if (!imageAsset?.buffer) return null;

  try {
    const buffer = await sharp(imageAsset.buffer)
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const metadata = await sharp(buffer).metadata();

    return {
      buffer,
      width: Math.max(1, Math.round(metadata.width || maxWidth)),
      height: Math.max(1, Math.round(metadata.height || maxHeight)),
    };
  } catch (error) {
    console.warn('⚠️ Falha ao preparar imagem para DOCX editável:', error.message);
    return null;
  }
}

function buildEditableDocxFieldHtml({ html = '', pt = '', en = '' }) {
  if (String(html || '').trim()) {
    return html;
  }

  return buildBilingualFieldHtml({
    pt,
    en,
  });
}

function buildEditableDocxHeaderParagraph({
  type = 'Pergunta',
  cardNumber = 1,
  totalCards = 1,
}) {
  const isQuestion = type === 'Pergunta';

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      after: 280,
    },
    children: [
      new TextRun({
        text: type,
        bold: true,
        size: 34,
        color: isQuestion ? '0F766E' : '2563EB',
      }),
      new TextRun({
        text: `  •  Card ${cardNumber} / ${totalCards}`,
        bold: true,
        size: 20,
        color: '94A3B8',
      }),
    ],
  });
}

function buildEditableDocxMetaParagraph(card = {}) {
  const metadata = [
    card.specialty,
    card.topic || card.theme || card.subSpecialty || card.sub_specialty,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' · ');

  if (!metadata) return null;

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      after: 240,
    },
    children: [
      new TextRun({
        text: metadata,
        bold: true,
        size: 18,
        color: '64748B',
      }),
    ],
  });
}

function splitStudyModeDocxText(value = '') {
  return String(value || '')
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function getStudyModeDocxFontSize(text = '', type = 'question', lang = 'pt') {
  const length = String(text || '').length;

  if (type === 'answer') {
    if (length > 700) return lang === 'en' ? 21 : 24;
    if (length > 420) return lang === 'en' ? 23 : 27;
    if (length > 220) return lang === 'en' ? 25 : 30;
    return lang === 'en' ? 28 : 34;
  }

  if (length > 260) return lang === 'en' ? 25 : 32;
  if (length > 170) return lang === 'en' ? 28 : 38;
  if (length > 90) return lang === 'en' ? 31 : 46;
  return lang === 'en' ? 34 : 54;
}

function buildStudyModeDocxTextParagraphs({
  text = '',
  color = '111827',
  size = 36,
  bold = true,
  alignment = AlignmentType.CENTER,
  before = 0,
  after = 90,
  line = 420,
}) {
  const paragraphs = splitStudyModeDocxText(text);

  if (!paragraphs.length) {
    return [];
  }

  return paragraphs.map((paragraph, index) =>
    new Paragraph({
      alignment,
      spacing: {
        before: index === 0 ? before : 40,
        after,
        line,
      },
      children: [
        new TextRun({
          text: paragraph,
          bold,
          size,
          color,
        }),
      ],
    })
  );
}

function buildStudyModeDocxEmptyParagraph(after = 120) {
  return new Paragraph({
    spacing: {
      before: 0,
      after,
    },
    children: [new TextRun({ text: '' })],
  });
}

function buildStudyModeDocxCell({
  children = [],
  fill = 'FFFFFF',
  verticalAlign = VerticalAlign.TOP,
  margins = {
    top: 220,
    bottom: 220,
    left: 520,
    right: 520,
  },
} = {}) {
  return new TableCell({
    width: {
      size: STUDY_MODE_DOCX_CARD_WIDTH_DXA,
      type: WidthType.DXA,
    },
    verticalAlign,
    shading: {
      type: ShadingType.CLEAR,
      color: 'auto',
      fill,
    },
    margins,
    borders: {
      top: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      bottom: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      left: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      right: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    children: children.length
      ? children
      : [
          new Paragraph({
            children: [new TextRun({ text: '' })],
          }),
        ],
  });
}

const STUDY_MODE_DOCX_CARD_WIDTH_DXA = 15000;

function buildStudyModeDocxCard({
  type = 'Pergunta',
  card = {},
  cardNumber = 1,
  totalCards = 1,
}) {
  const isQuestion = type === 'Pergunta';
  const accent = isQuestion ? '3B82F6' : '2563EB';

  const ptText = isQuestion
    ? getBilingualPortugueseText(card, 'question')
    : getBilingualPortugueseText(card, 'answer');

  const enText = isQuestion
    ? getBilingualEnglishText(card, 'question')
    : getBilingualEnglishText(card, 'answer');

  const footerLabel =
    String(card.specialty || card.topic || card.theme || 'Flashcard').trim();

  const ptSize = getStudyModeDocxFontSize(
    ptText,
    isQuestion ? 'question' : 'answer',
    'pt'
  );

  const enSize = getStudyModeDocxFontSize(
    enText,
    isQuestion ? 'question' : 'answer',
    'en'
  );

  const headerChildren = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: {
        before: 0,
        after: 0,
      },
      children: [
        new TextRun({
          text: `FLASHCARD ${String(cardNumber).padStart(2, '0')}`,
          bold: true,
          size: 18,
          color: accent,
        }),
        new TextRun({
          text: `     ${type.toUpperCase()}     CARD ${cardNumber} / ${totalCards}`,
          bold: true,
          size: 14,
          color: '94A3B8',
        }),
      ],
    }),
  ];

  const bodyChildren = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 0,
        after: 180,
      },
      children: [
        new TextRun({
          text: isQuestion ? '?' : '✓',
          bold: true,
          size: 38,
          color: accent,
        }),
      ],
    }),

    ...buildStudyModeDocxTextParagraphs({
      text: ptText,
      color: '111827',
      size: ptSize,
      bold: isQuestion,
      alignment: AlignmentType.CENTER,
      before: 0,
      after: 90,
      line: isQuestion ? 460 : 380,
    }),

    enText
      ? buildStudyModeDocxEmptyParagraph(80)
      : null,

    ...buildStudyModeDocxTextParagraphs({
      text: enText,
      color: '2563EB',
      size: enSize,
      bold: true,
      alignment: AlignmentType.CENTER,
      before: 0,
      after: 80,
      line: isQuestion ? 420 : 350,
    }),
  ].filter(Boolean);

  const footerChildren = [
    footerLabel
      ? new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: {
            before: 0,
            after: 0,
          },
          children: [
            new TextRun({
              text: footerLabel,
              bold: true,
              size: 28,
              color: accent,
            }),
          ],
        })
      : buildStudyModeDocxEmptyParagraph(0),
  ];

  return new Table({
    width: {
      size: STUDY_MODE_DOCX_CARD_WIDTH_DXA,
      type: WidthType.DXA,
    },
    borders: {
      top: {
        style: BorderStyle.SINGLE,
        size: 10,
        color: 'E2E8F0',
      },
      bottom: {
        style: BorderStyle.SINGLE,
        size: 10,
        color: 'E2E8F0',
      },
      left: {
        style: BorderStyle.SINGLE,
        size: 10,
        color: 'E2E8F0',
      },
      right: {
        style: BorderStyle.SINGLE,
        size: 10,
        color: 'E2E8F0',
      },
      insideHorizontal: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      insideVertical: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    rows: [
      new TableRow({
        height: {
          value: 900,
          rule: HeightRule.EXACT,
        },
        children: [
          buildStudyModeDocxCell({
            children: headerChildren,
            fill: 'FFFFFF',
            verticalAlign: VerticalAlign.TOP,
            margins: {
              top: 260,
              bottom: 120,
              left: 520,
              right: 520,
            },
          }),
        ],
      }),

      new TableRow({
        height: {
          value: 7200,
          rule: HeightRule.ATLEAST,
        },
        children: [
          buildStudyModeDocxCell({
            children: bodyChildren,
            fill: 'FFFFFF',
            verticalAlign: VerticalAlign.CENTER,
            margins: {
              top: 260,
              bottom: 260,
              left: 900,
              right: 900,
            },
          }),
        ],
      }),

      new TableRow({
        height: {
          value: 900,
          rule: HeightRule.EXACT,
        },
        children: [
          buildStudyModeDocxCell({
            children: footerChildren,
            fill: 'FFFFFF',
            verticalAlign: VerticalAlign.BOTTOM,
            margins: {
              top: 100,
              bottom: 220,
              left: 520,
              right: 520,
            },
          }),
        ],
      }),
    ],
  });
}

function buildStudyModeDocxFaceSection({
  type = 'Pergunta',
  card = {},
  cardNumber = 1,
  totalCards = 1,
}) {
  return {
    properties: {
      page: {
        size: {
          orientation: PageOrientation.LANDSCAPE,
          width: 16838,
          height: 11906,
        },
        margin: {
          top: 560,
          right: 700,
          bottom: 560,
          left: 700,
        },
      },
    },
    children: [
      buildStudyModeDocxCard({
        type,
        card,
        cardNumber,
        totalCards,
      }),
    ],
  };
}

function buildEditableDocxBorder(color = '10A8B5', size = 16) {
  return {
    style: BorderStyle.SINGLE,
    size,
    color,
  };
}

function isEditableDocxEnglishSegment(segment = {}) {
  const color = String(segment.color || '').toUpperCase();
  return ['2563EB', '1D4ED8', '0000FF'].includes(color);
}

function buildEditableDocxDivider({
  alignment = AlignmentType.LEFT,
  before = 120,
  after = 140,
  color = 'BFC7CE',
} = {}) {
  return new Paragraph({
    alignment,
    spacing: {
      before,
      after,
    },
    children: [
      new TextRun({
        text: '━━━━',
        bold: true,
        size: 16,
        color,
      }),
    ],
  });
}

function richSegmentToEditableDocxTextRun(
  segment = {},
  {
    ptSize = 34,
    enSize = 26,
    defaultColor = '111827',
    forceBold = false,
  } = {}
) {
  const isEnglish = isEditableDocxEnglishSegment(segment);

  const options = {
    text: segment.text,
    bold: forceBold || Boolean(segment.bold),
    italics: Boolean(segment.italics),
    strike: Boolean(segment.strike),
    size: isEnglish ? enSize : ptSize,
    color: segment.color || defaultColor,
  };

  if (segment.underline) {
    options.underline = {
      type: UnderlineType.SINGLE,
    };
  }

  if (segment.highlight) {
    options.highlight = 'yellow';
  }

  return new TextRun(options);
}

function buildEditableDocxContentParagraphs(
  html = '',
  fallback = '',
  {
    alignment = AlignmentType.LEFT,
    dividerAlignment = AlignmentType.LEFT,
    ptSize = 38,
    enSize = 28,
    forceBold = false,
    line = 380,
    before = 80,
    after = 120,
  } = {}
) {
  const paragraphs = parseFlashcardHtmlToRichParagraphs(html, fallback);

  if (!paragraphs.length) {
    return [
      new Paragraph({
        alignment,
        spacing: {
          before,
          after,
          line,
        },
        children: [
          new TextRun({
            text: fallback || '',
            size: ptSize,
            bold: forceBold,
            color: '111827',
          }),
        ],
      }),
    ];
  }

  const result = [];
  let insertedEnglishDivider = false;

  paragraphs.forEach((segments, paragraphIndex) => {
    const isEnglishParagraph = segments.some(isEditableDocxEnglishSegment);

    if (isEnglishParagraph && !insertedEnglishDivider) {
      result.push(
        buildEditableDocxDivider({
          alignment: dividerAlignment,
          before: 80,
          after: 120,
        })
      );

      insertedEnglishDivider = true;
    }

    result.push(
      new Paragraph({
        alignment,
        spacing: {
          before: paragraphIndex === 0 ? before : 30,
          after,
          line: isEnglishParagraph ? Math.max(300, line - 60) : line,
        },
        children: segments.map((segment) =>
          richSegmentToEditableDocxTextRun(segment, {
            ptSize,
            enSize,
            forceBold,
          })
        ),
      })
    );
  });

  return result;
}

function buildEditableDocxHeader({
  type = 'Pergunta',
  cardNumber = 1,
  totalCards = 1,
  accent = '10A8B5',
} = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      after: 180,
    },
    children: [
      new TextRun({
        text: type,
        bold: true,
        size: 34,
        color: '213A5B',
      }),
      new TextRun({
        text: '     ',
      }),
      new TextRun({
        text: 'Flashcard',
        bold: true,
        size: 26,
        color: accent,
      }),
      new TextRun({
        text: `   CARD ${cardNumber} / ${totalCards}`,
        bold: true,
        size: 16,
        color: '94A3B8',
      }),
    ],
  });
}

function buildEditableDocxMeta(card = {}) {
  const metadata = [
    card.specialty,
    card.topic || card.theme || card.subSpecialty || card.sub_specialty,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' · ');

  if (!metadata) return null;

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      after: 160,
    },
    children: [
      new TextRun({
        text: metadata,
        bold: true,
        size: 17,
        color: '64748B',
      }),
    ],
  });
}

function buildEditableDocxFooter(card = {}, accent = '10A8B5') {
  const label = String(card.specialty || card.topic || '').trim();

  if (!label) return null;

  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: {
      before: 240,
      after: 0,
    },
    children: [
      new TextRun({
        text: label,
        bold: true,
        size: 30,
        color: accent,
      }),
    ],
  });
}

function buildEditableDocxCardShell({
  headerChildren = [],
  bodyChildren = [],
  footerChildren = [],
  accent = '10A8B5',
} = {}) {
  const safeHeaderChildren = headerChildren.filter(Boolean);
  const safeBodyChildren = bodyChildren.filter(Boolean);
  const safeFooterChildren = footerChildren.filter(Boolean);

  const emptyParagraph = () =>
    new Paragraph({
      spacing: {
        before: 0,
        after: 0,
      },
      children: [new TextRun({ text: '' })],
    });

  const buildCell = ({
    children = [],
    verticalAlign = VerticalAlign.TOP,
    margins = {
      top: 260,
      bottom: 260,
      left: 520,
      right: 520,
    },
  } = {}) =>
    new TableCell({
      verticalAlign,
      shading: {
        type: ShadingType.CLEAR,
        color: 'auto',
        fill: 'FBFDFE',
      },
      margins,
      borders: {
        top: {
          style: BorderStyle.NONE,
          size: 0,
          color: 'FFFFFF',
        },
        bottom: {
          style: BorderStyle.NONE,
          size: 0,
          color: 'FFFFFF',
        },
        left: {
          style: BorderStyle.NONE,
          size: 0,
          color: 'FFFFFF',
        },
        right: {
          style: BorderStyle.NONE,
          size: 0,
          color: 'FFFFFF',
        },
      },
      children: children.length ? children : [emptyParagraph()],
    });

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: buildEditableDocxBorder(accent, 18),
      bottom: buildEditableDocxBorder(accent, 18),
      left: buildEditableDocxBorder(accent, 18),
      right: buildEditableDocxBorder(accent, 18),
      insideHorizontal: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      insideVertical: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    rows: [
      new TableRow({
        height: {
          value: 1500,
          rule: HeightRule.EXACT,
        },
        children: [
          buildCell({
            children: safeHeaderChildren,
            verticalAlign: VerticalAlign.TOP,
            margins: {
              top: 260,
              bottom: 120,
              left: 520,
              right: 520,
            },
          }),
        ],
      }),

      new TableRow({
        height: {
          value: 6800,
          rule: HeightRule.ATLEAST,
        },
        children: [
          buildCell({
            children: safeBodyChildren,
            verticalAlign: VerticalAlign.CENTER,
            margins: {
              top: 160,
              bottom: 160,
              left: 620,
              right: 620,
            },
          }),
        ],
      }),

      new TableRow({
        height: {
          value: 1800,
          rule: HeightRule.EXACT,
        },
        children: [
          buildCell({
            children: safeFooterChildren,
            verticalAlign: VerticalAlign.BOTTOM,
            margins: {
              top: 120,
              bottom: 260,
              left: 520,
              right: 520,
            },
          }),
        ],
      }),
    ],
  });
}

function getDocxFaceAccent(isQuestion = true) {
  return isQuestion ? '10A8B5' : '5BA7E5';
}

function getDocxFaceAccentDark(isQuestion = true) {
  return isQuestion ? '0C8C97' : '428FD2';
}

function buildDocxCardBorder(color = '10A8B5', size = 14) {
  return {
    style: BorderStyle.SINGLE,
    size,
    color,
  };
}

function buildDocxCardShell(children = [], accent = '10A8B5') {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: buildDocxCardBorder(accent, 18),
      bottom: buildDocxCardBorder(accent, 18),
      left: buildDocxCardBorder(accent, 18),
      right: buildDocxCardBorder(accent, 18),
      insideHorizontal: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      insideVertical: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            verticalAlign: VerticalAlign.TOP,
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: 'FBFDFE',
            },
            margins: {
              top: 420,
              bottom: 420,
              left: 620,
              right: 620,
            },
            children: children.filter(Boolean),
          }),
        ],
      }),
    ],
  });
}

function isEnglishDocxSegment(segment = {}) {
  const color = String(segment.color || '').toUpperCase();

  return ['2563EB', '1D4ED8', '0000FF'].includes(color);
}

function richSegmentToPremiumDocxTextRun(
  segment = {},
  {
    size = 34,
    englishSize = 28,
    color = '111827',
    forceBold = false,
  } = {}
) {
  const isEnglish = isEnglishDocxSegment(segment);

  const options = {
    text: segment.text,
    bold: forceBold || Boolean(segment.bold),
    italics: Boolean(segment.italics),
    strike: Boolean(segment.strike),
    size: isEnglish ? englishSize : size,
    color: segment.color || color,
  };

  if (segment.underline) {
    options.underline = {
      type: UnderlineType.SINGLE,
    };
  }

  if (segment.highlight) {
    options.highlight = 'yellow';
  }

  return new TextRun(options);
}

function buildDocxMiniDividerParagraph({
  alignment = AlignmentType.LEFT,
  before = 120,
  after = 120,
} = {}) {
  return new Paragraph({
    alignment,
    spacing: {
      before,
      after,
    },
    children: [
      new TextRun({
        text: '━━━━',
        bold: true,
        size: 18,
        color: 'BFC7CE',
      }),
    ],
  });
}

function buildPremiumDocxParagraphsFromRichHtml(
  html = '',
  fallback = '',
  {
    alignment = AlignmentType.LEFT,
    size = 36,
    englishSize = 28,
    color = '111827',
    forceBold = false,
    line = 360,
    before = 0,
    after = 120,
    dividerAlignment = AlignmentType.LEFT,
  } = {}
) {
  const paragraphs = parseFlashcardHtmlToRichParagraphs(html, fallback);

  if (!paragraphs.length) {
    return [
      new Paragraph({
        alignment,
        spacing: {
          before,
          after,
          line,
        },
        children: [
          new TextRun({
            text: fallback || '',
            size,
            color,
            bold: forceBold,
          }),
        ],
      }),
    ];
  }

  const result = [];
  let insertedEnglishDivider = false;

  paragraphs.forEach((segments, paragraphIndex) => {
    const isEnglishParagraph = segments.some(isEnglishDocxSegment);

    if (isEnglishParagraph && !insertedEnglishDivider) {
      result.push(
        buildDocxMiniDividerParagraph({
          alignment: dividerAlignment,
          before: 80,
          after: 80,
        })
      );

      insertedEnglishDivider = true;
    }

    result.push(
      new Paragraph({
        alignment,
        spacing: {
          before: paragraphIndex === 0 ? before : 40,
          after,
          line: isEnglishParagraph ? Math.max(300, line - 60) : line,
        },
        children: segments.map((segment) =>
          richSegmentToPremiumDocxTextRun(segment, {
            size,
            englishSize,
            color,
            forceBold,
          })
        ),
      })
    );
  });

  return result;
}

function buildDocxPremiumHeaderParagraph({
  type = 'Pergunta',
  cardNumber = 1,
  totalCards = 1,
  accent = '10A8B5',
} = {}) {
  const isQuestion = type === 'Pergunta';

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      after: 260,
    },
    children: [
      new TextRun({
        text: type,
        bold: true,
        size: isQuestion ? 42 : 38,
        color: '213A5B',
      }),
      new TextRun({
        text: '    ',
      }),
      new TextRun({
        text: 'Flashcard',
        bold: true,
        size: 30,
        color: accent,
      }),
      new TextRun({
        text: `   CARD ${cardNumber} / ${totalCards}`,
        bold: true,
        size: 16,
        color: '94A3B8',
      }),
    ],
  });
}

function buildDocxPremiumMetaParagraph(card = {}) {
  const metadata = [
    card.specialty,
    card.topic || card.theme || card.subSpecialty || card.sub_specialty,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' · ');

  if (!metadata) return null;

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      after: 240,
    },
    children: [
      new TextRun({
        text: metadata,
        bold: true,
        size: 18,
        color: '64748B',
      }),
    ],
  });
}

function buildDocxPremiumFooterParagraph(card = {}, accent = '10A8B5') {
  const label = String(card.specialty || card.topic || 'Flashcard').trim();

  if (!label) return null;

  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: {
      before: 280,
      after: 0,
    },
    children: [
      new TextRun({
        text: label,
        bold: true,
        size: 34,
        color: accent,
      }),
    ],
  });
}

async function buildEditableFlashcardFaceSection({
  type = 'Pergunta',
  card = {},
  cardNumber = 1,
  totalCards = 1,
  imageAsset = null,
}) {
  const isQuestion = type === 'Pergunta';
  const accent = getEditableDocxAccent(type);

  const contentHtml = isQuestion
    ? buildEditableDocxFieldHtml({
        html: card.questionHtml || card.question_html,
        pt: getBilingualPortugueseText(card, 'question'),
        en: getBilingualEnglishText(card, 'question'),
      })
    : buildEditableDocxFieldHtml({
        html: card.answerHtml || card.answer_html,
        pt: getBilingualPortugueseText(card, 'answer'),
        en: getBilingualEnglishText(card, 'answer'),
      });

  const fallbackText = isQuestion
    ? getBilingualPortugueseText(card, 'question')
    : getBilingualPortugueseText(card, 'answer');

  const imageParagraph = await buildEditableDocxImageParagraph(imageAsset);

  const contentParagraphs = buildEditableDocxContentParagraphs(
    contentHtml,
    fallbackText,
    {
      alignment: isQuestion ? AlignmentType.LEFT : AlignmentType.CENTER,
      dividerAlignment: isQuestion ? AlignmentType.LEFT : AlignmentType.CENTER,
      ptSize: isQuestion ? 46 : 34,
      enSize: isQuestion ? 28 : 25,
      forceBold: isQuestion,
      line: isQuestion ? 460 : 360,
      before: 0,
      after: isQuestion ? 120 : 100,
    }
  );

  const headerChildren = [
    buildEditableDocxHeader({
      type,
      cardNumber,
      totalCards,
      accent,
    }),
    buildEditableDocxMeta(card),
  ].filter(Boolean);

  const bodyChildren = [
    buildEditableDocxDivider({
      alignment: isQuestion ? AlignmentType.LEFT : AlignmentType.CENTER,
      before: 0,
      after: 220,
    }),

    ...contentParagraphs,

    imageParagraph,
  ].filter(Boolean);

  const footerChildren = [
    buildEditableDocxFooter(card, accent),
  ].filter(Boolean);

  return {
    properties: {
      page: {
        size: {
          orientation: PageOrientation.LANDSCAPE,
          width: 11906,
          height: 16838,
        },
        margin: {
          top: 240,
          right: 300,
          bottom: 240,
          left: 300,
        },
      },
    },
    children: [
      buildEditableDocxCardShell({
        headerChildren,
        bodyChildren,
        footerChildren,
        accent,
      }),
    ],
  };
}

function escapeSvg(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapSvgText(value = '', maxChars = 28, maxLines = 7) {
  const words = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

async function fetchImageAsset(url = '') {
  if (!url) return null;

  try {
    const response = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'image/png',
    };
  } catch (error) {
    console.warn('⚠️ Falha ao baixar imagem para exportação:', error.message);
    return null;
  }
}

async function buildEmbeddedImageDataUrl(imageAsset) {
  if (!imageAsset?.buffer) return '';

  const normalized = await sharp(imageAsset.buffer)
    .trim({ threshold: 12 })
    .resize({
      width: 760,
      height: 420,
      fit: 'inside',
      background: { r: 248, g: 251, b: 253, alpha: 0 },
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return `data:image/png;base64,${normalized.toString('base64')}`;
}

function buildSiteGlassesLogoSvg({
  x = 0,
  y = 0,
  size = 74,
  background = '#2563EB',
  foreground = '#FFFFFF',
}) {
  const scale = size / 24;
  const radius = Math.round(size * 0.22);

  return `
    <g transform="translate(${x} ${y})">
      <rect
        x="0"
        y="0"
        width="${size}"
        height="${size}"
        rx="${radius}"
        fill="${background}"
      />

      <g transform="translate(${size * 0.12} ${size * 0.18}) scale(${scale * 0.76})">
        <path
          d="M2.5 13.5 5.3 7.1C6 5.5 7.1 5 8.4 5"
          fill="none"
          stroke="${foreground}"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M21.5 13.5 18.7 7.1C18 5.5 16.9 5 15.6 5"
          fill="none"
          stroke="${foreground}"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          cx="7"
          cy="15"
          r="4"
          fill="none"
          stroke="${foreground}"
          stroke-width="2.4"
        />
        <circle
          cx="17"
          cy="15"
          r="4"
          fill="none"
          stroke="${foreground}"
          stroke-width="2.4"
        />
        <path
          d="M11 15h2"
          fill="none"
          stroke="${foreground}"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </g>
    </g>
  `;
}

function buildCardLabelSvg({
  type = 'Pergunta',
  width = 1772,
  accent = '#10A8B5',
}) {
  const isQuestion = type === 'Pergunta';

  if (isQuestion) {
    return `
      <rect x="32" y="34" width="760" height="106" rx="53" fill="none" stroke="#8D8D8D" stroke-width="4"/>
      <text x="118" y="106" font-size="68" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" fill="#213A5B">Pergunta</text>
      <circle cx="718" cy="84" r="28" fill="none" stroke="#8D8D8D" stroke-width="5"/>
      <line x1="698" y1="104" x2="662" y2="140" stroke="#8D8D8D" stroke-width="7" stroke-linecap="round"/>
    `;
  }

  const labelWidth = 725;
  const labelX = Math.round((width - labelWidth) / 2);

  return `
    <rect x="${labelX}" y="34" width="${labelWidth}" height="92" rx="46" fill="none" stroke="#8D8D8D" stroke-width="4"/>
    <text x="${labelX + 128}" y="97" font-size="58" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" fill="#213A5B">Resposta</text>
    <circle cx="${labelX + labelWidth - 78}" cy="80" r="25" fill="none" stroke="${accent}" stroke-width="5"/>
    <path d="M${labelX + labelWidth - 92} 80 l12 13 l28 -35" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function buildFlashcardHeaderBrandSvg({
  cardNumber = 1,
  totalCards = 1,
  accent = '#10A8B5',
}) {
  return `
    <g transform="translate(1320 36)">
      ${buildSiteGlassesLogoSvg({
        x: 0,
        y: 0,
        size: 74,
        background: '#2563EB',
        foreground: '#FFFFFF',
      })}
      <text x="96" y="54" font-size="54" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" fill="${accent}">Flashcard</text>
      <text x="98" y="102" font-size="20" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" fill="#94A3B8">CARD ${cardNumber} / ${totalCards}</text>
    </g>
  `;
}

function buildDecorativeSideBarsSvg({
  x = 0,
  y = 220,
  accent = '#10A8B5',
  muted = '#BFC7CE',
}) {
  return `
    <rect x="${x}" y="${y}" width="22" height="300" rx="11" fill="${accent}" opacity="0.72"/>
    <rect x="${x}" y="${y + 34}" width="116" height="26" rx="13" fill="${accent}" opacity="0.95"/>
    <rect x="${x}" y="${y + 68}" width="76" height="22" rx="11" fill="${muted}" opacity="0.95"/>
  `;
}

async function buildFlashcardFaceSvg({
  type = 'Pergunta',
  text = '',
  englishText = '',
  specialty = '',
  topic = '',
  cardNumber = 1,
  totalCards = 1,
  imageAsset = null,
}) {
  const isQuestion = type === 'Pergunta';
  const width = 1772;
  const height = 1185;

  const accent = isQuestion ? '#10A8B5' : '#5BA7E5';
  const accentDark = isQuestion ? '#0C8C97' : '#428FD2';

  const specialtyLabel = String(specialty || topic || 'Clínica Médica').trim();
  const subSpecialtyLabel = String(topic || specialty || 'Flashcard').trim();

  const plainText = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  const plainEnglishText = String(englishText || '')
    .replace(/\s+/g, ' ')
    .trim();

  const imageDataUrl = await buildEmbeddedImageDataUrl(imageAsset);

  const maxChars = isQuestion
    ? imageDataUrl
      ? 20
      : 27
    : imageDataUrl
    ? 21
    : 30;

  const maxLines = isQuestion
    ? imageDataUrl
      ? 6
      : 7
    : imageDataUrl
    ? 6
    : 7;

  const textLines = wrapSvgText(
    plainText,
    plainEnglishText ? Math.max(18, maxChars - 4) : maxChars,
    plainEnglishText ? Math.max(3, Math.ceil(maxLines * 0.55)) : maxLines
  );

  const englishTextLines = plainEnglishText
    ? wrapSvgText(
        plainEnglishText,
        Math.max(18, maxChars - 3),
        isQuestion
          ? Math.max(1, Math.min(3, Math.floor(maxLines * 0.38)))
          : Math.max(2, Math.min(4, Math.floor(maxLines * 0.45)))
      )
    : [];

  const fontSize = (() => {
    if (imageDataUrl) {
      if (plainText.length > 300) return 50;
      if (plainText.length > 220) return 56;
      if (plainText.length > 150) return 62;
      return 70;
    }

    if (isQuestion) {
      if (plainText.length > 260) return 62;
      if (plainText.length > 200) return 70;
      if (plainText.length > 140) return 78;
      return 86;
    }

    if (plainText.length > 300) return 56;
    if (plainText.length > 220) return 64;
    if (plainText.length > 150) return 72;
    return 82;
  })();

  const lineHeight = Math.round(fontSize * 1.22);
  const englishFontSize = Math.max(34, Math.round(fontSize * 0.62));
  const englishLineHeight = Math.round(englishFontSize * 1.26);

  const bilingualVisualGap = englishTextLines.length
    ? Math.round(Math.max(38, fontSize * 0.42))
    : 0;

  const bilingualSeparatorGap = bilingualVisualGap;

  const bilingualSeparatorToEnglishGap = englishTextLines.length
    ? Math.round(bilingualVisualGap + englishFontSize * 0.78)
    : 0;

  const textBlockHeight =
    textLines.length * lineHeight +
    (englishTextLines.length
      ? bilingualSeparatorGap +
        bilingualSeparatorToEnglishGap +
        englishTextLines.length * englishLineHeight
      : 0);

  const questionTextX = 115;
  const questionTextY = imageDataUrl ? 330 : 335;

  const answerTextX = imageDataUrl ? 118 : width / 2;
  const answerTextY = imageDataUrl
    ? 410
    : Math.max(470, Math.round((height - textBlockHeight) / 2) + 70);

  const baseTextY = isQuestion ? questionTextY : answerTextY;

  const portugueseLastLineY =
    baseTextY + Math.max(0, textLines.length - 1) * lineHeight;

  const bilingualSeparatorY = englishTextLines.length
    ? portugueseLastLineY + bilingualSeparatorGap
    : null;

  const englishStartY = englishTextLines.length
    ? bilingualSeparatorY + bilingualSeparatorToEnglishGap
    : null;

  const englishLastLineY = englishTextLines.length
    ? englishStartY + Math.max(0, englishTextLines.length - 1) * englishLineHeight
    : portugueseLastLineY;

  const contentBottomY = englishTextLines.length
    ? englishLastLineY
    : portugueseLastLineY;

  const questionDividerY = Math.min(height - 170, contentBottomY + 115);

  const portugueseTextSvg = textLines
    .map((line, index) => {
      const x = isQuestion ? questionTextX : answerTextX;
      const y = baseTextY + index * lineHeight;
      const anchor = isQuestion ? 'start' : imageDataUrl ? 'start' : 'middle';

      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="700" fill="#111827">${escapeSvgText(
        line
      )}</text>`;
    })
    .join('\n');

  const bilingualSeparatorSvg = englishTextLines.length
    ? isQuestion
      ? `<line x1="${questionTextX}" y1="${bilingualSeparatorY}" x2="${questionTextX + 142}" y2="${bilingualSeparatorY}" stroke="#BFC7CE" stroke-width="12" stroke-linecap="round"/>`
      : `<line x1="${width / 2 - 72}" y1="${bilingualSeparatorY}" x2="${width / 2 + 72}" y2="${bilingualSeparatorY}" stroke="#BFC7CE" stroke-width="12" stroke-linecap="round"/>`
    : '';

  const englishTextSvg = englishTextLines
    .map((line, index) => {
      const x = isQuestion ? questionTextX : answerTextX;
      const y = englishStartY + index * englishLineHeight;
      const anchor = isQuestion ? 'start' : imageDataUrl ? 'start' : 'middle';

      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${englishFontSize}" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="700" fill="#2563EB">${escapeSvgText(
        line
      )}</text>`;
    })
    .join('\n');

  const textSvg = [
    portugueseTextSvg,
    bilingualSeparatorSvg,
    englishTextSvg,
  ]
    .filter(Boolean)
    .join('\n');

  const repeatedWatermarks = '';

  const imageSvg = imageDataUrl
    ? isQuestion
      ? `
        <defs>
          <clipPath id="questionImageClip">
            <rect x="1160" y="204" width="530" height="430" rx="24" ry="24"/>
          </clipPath>
        </defs>

        <rect x="1138" y="180" width="574" height="478" rx="28" fill="#FFFFFF" stroke="${accent}" stroke-width="3"/>
        ${buildDecorativeSideBarsSvg({
          x: 1092,
          y: 244,
          accent,
          muted: '#BFC7CE',
        })}

        <image
          href="${imageDataUrl}"
          x="1160"
          y="204"
          width="530"
          height="430"
          preserveAspectRatio="xMidYMid meet"
          clip-path="url(#questionImageClip)"
        />

        <rect x="1160" y="204" width="530" height="430" rx="24" fill="none" stroke="${accent}" stroke-width="2"/>
      `
      : `
        <defs>
          <clipPath id="answerImageClip">
            <rect x="1160" y="300" width="540" height="420" rx="24" ry="24"/>
          </clipPath>
        </defs>

        <rect x="1138" y="274" width="584" height="470" rx="28" fill="#FFFFFF" stroke="${accent}" stroke-width="3"/>
        ${buildDecorativeSideBarsSvg({
          x: 1092,
          y: 334,
          accent,
          muted: '#BFC7CE',
        })}

        <image
          href="${imageDataUrl}"
          x="1160"
          y="300"
          width="540"
          height="420"
          preserveAspectRatio="xMidYMid meet"
          clip-path="url(#answerImageClip)"
        />

        <rect x="1160" y="300" width="540" height="420" rx="24" fill="none" stroke="${accent}" stroke-width="2"/>
      `
    : '';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#DEE6ED" stroke-width="1.6"/>
    </pattern>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="${isQuestion ? '#08A9B7' : '#5AA1DE'}"/>
  <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="16" fill="#FBFDFE"/>
  <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="16" fill="url(#grid)" opacity="0.9"/>

  ${repeatedWatermarks}

  ${buildCardLabelSvg({
    type,
    width,
    accent,
  })}

  ${buildFlashcardHeaderBrandSvg({
    cardNumber,
    totalCards,
    accent: isQuestion ? '#10A8B5' : '#5BA7E5',
  })}

  ${
    !isQuestion
      ? `
        ${buildDecorativeSideBarsSvg({
          x: 0,
          y: 210,
          accent,
          muted: '#BFC7CE',
        })}
        <text x="140" y="295" font-size="34" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="800" fill="#8E8E8E">${escapeSvg(
          subSpecialtyLabel
        )}</text>
      `
      : ''
  }

  ${textSvg}
  ${imageSvg}

  ${
    isQuestion
      ? `
        ${
          englishTextLines.length
            ? ''
            : `<line x1="48" y1="${questionDividerY}" x2="190" y2="${questionDividerY}" stroke="#BFC7CE" stroke-width="12" stroke-linecap="round"/>`
        }
        <text x="1660" y="1060" text-anchor="end" font-size="86" font-family="${EXPORT_SVG_FONT_FAMILY}" font-weight="900" fill="${accent}">${escapeSvg(
          specialtyLabel
        )}</text>
        <rect x="1668" y="1016" width="110" height="18" rx="9" fill="${accent}" opacity="0.85"/>
        <rect x="1708" y="1048" width="70" height="16" rx="8" fill="#BFC7CE"/>
      `
      : `
        <g transform="translate(${width / 2 - 44} ${height - 155})">
          ${buildSiteGlassesLogoSvg({
            x: 0,
            y: 0,
            size: 88,
            background: '#2563EB',
            foreground: '#FFFFFF',
          })}
        </g>
      `
  }
</svg>`;
}

async function buildFlashcardFacePngBuffer(options) {
  const svg = await buildFlashcardFaceSvg(options);

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

async function buildFlashcardsPdfBuffer({ cards = [], title = 'Flashcards' }) {
  const PAGE_WIDTH = 1772;
  const PAGE_HEIGHT = 1185;

  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    size: [PAGE_WIDTH, PAGE_HEIGHT],
  });

  const chunks = [];

  const finished = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];

    const questionImageAsset = await fetchImageAsset(
      card.questionImageUrl ||
        card.question_image_url ||
        card.imageUrl ||
        card.image_url
    );

    const answerImageAsset = await fetchImageAsset(
      card.answerImageUrl ||
        card.answer_image_url ||
        card.imageUrl ||
        card.image_url
    );

    const questionPng = await buildFlashcardFacePngBuffer({
      type: 'Pergunta',
      text: getBilingualPortugueseText(card, 'question'),
      englishText: getBilingualEnglishText(card, 'question'),
      specialty: card.specialty,
      topic: card.topic,
      cardNumber: index + 1,
      totalCards: cards.length,
      imageAsset: questionImageAsset,
    });

    const answerPng = await buildFlashcardFacePngBuffer({
      type: 'Resposta',
      text: getBilingualPortugueseText(card, 'answer'),
      englishText: getBilingualEnglishText(card, 'answer'),
      specialty: card.specialty,
      topic: card.topic,
      cardNumber: index + 1,
      totalCards: cards.length,
      imageAsset: answerImageAsset,
    });

    doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    doc.image(questionPng, 0, 0, {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });

    doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    doc.image(answerPng, 0, 0, {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });
  }

  doc.end();

  return await finished;
}

const FLASHCARD_DOCX_TABLE_WIDTH_DXA = 9200;
const FLASHCARD_DOCX_HEADER_TAB_DXA = 9100;

const FLASHCARD_DOCX_COLORS = {
  teal: '009688',
  tealLight: 'E0F2F1',
  englishBlue: '3B82F6',
  portugueseText: '333333',
  mutedText: '64748B',
};

function buildDocxText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFlashcardDocxHeaderCell({
  headerText = '',
  topBorder = null,
  bottomBorder = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: FLASHCARD_DOCX_COLORS.teal,
  },
} = {}) {
  return new TableCell({
    width: {
      size: FLASHCARD_DOCX_TABLE_WIDTH_DXA,
      type: WidthType.DXA,
    },
    shading: {
      fill: FLASHCARD_DOCX_COLORS.tealLight,
    },
    borders: {
      top: topBorder || {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      bottom: bottomBorder || {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      left: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
      right: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    margins: {
      top: 120,
      bottom: 120,
      left: 240,
      right: 240,
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: headerText,
            bold: true,
            size: 20,
            color: FLASHCARD_DOCX_COLORS.teal,
          }),
        ],
      }),
    ],
  });
}

function buildFlashcardDocxBodyCell({
  portuguese = '',
  english = '',
  portugueseSize = 32,
  englishSize = 32,
  fill = 'FFFFFF',
} = {}) {
  const portugueseText = buildDocxText(portuguese);
  const englishText = buildDocxText(english);

  const children = [];

  if (portugueseText) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          after: englishText ? 200 : 0,
          line: 360,
        },
        children: [
          new TextRun({
            text: portugueseText,
            size: portugueseSize,
            bold: true,
            color: FLASHCARD_DOCX_COLORS.portugueseText,
          }),
        ],
      })
    );
  }

  if (englishText) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 0,
          line: 360,
        },
        children: [
          new TextRun({
            text: englishText,
            size: englishSize,
            bold: true,
            color: FLASHCARD_DOCX_COLORS.englishBlue,
          }),
        ],
      })
    );
  }

  if (!children.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '' })],
      })
    );
  }

  return new TableCell({
    width: {
      size: FLASHCARD_DOCX_TABLE_WIDTH_DXA,
      type: WidthType.DXA,
    },
    shading: {
      fill,
    },
    margins: {
      top: 600,
      bottom: 600,
      left: 400,
      right: 400,
    },
    children,
  });
}

function buildFlashcardDocxTable({ card = {}, cardNumber = 1, totalCards = 1 }) {
  const specialty = buildDocxText(card.specialty || 'Flashcard');
  const topic = buildDocxText(
    card.topic ||
      card.theme ||
      card.subSpecialty ||
      card.sub_specialty ||
      specialty
  );

  const questionPt = getBilingualPortugueseText(card, 'question');
  const questionEn = getBilingualEnglishText(card, 'question');

  const answerPt = getBilingualPortugueseText(card, 'answer');
  const answerEn = getBilingualEnglishText(card, 'answer');

  return new Table({
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    columnWidths: [FLASHCARD_DOCX_TABLE_WIDTH_DXA],
    width: {
      size: FLASHCARD_DOCX_TABLE_WIDTH_DXA,
      type: WidthType.DXA,
    },
    borders: {
      top: {
        style: BorderStyle.SINGLE,
        size: 8,
        color: FLASHCARD_DOCX_COLORS.teal,
      },
      bottom: {
        style: BorderStyle.SINGLE,
        size: 8,
        color: FLASHCARD_DOCX_COLORS.teal,
      },
      left: {
        style: BorderStyle.SINGLE,
        size: 8,
        color: FLASHCARD_DOCX_COLORS.teal,
      },
      right: {
        style: BorderStyle.SINGLE,
        size: 8,
        color: FLASHCARD_DOCX_COLORS.teal,
      },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: 'D9E7E5',
      },
      insideVertical: {
        style: BorderStyle.NONE,
        size: 0,
        color: 'FFFFFF',
      },
    },
    rows: [
      new TableRow({
        children: [
          buildFlashcardDocxHeaderCell({
            headerText: `Flashcard ${String(cardNumber).padStart(2, '0')} · Pergunta: ${specialty}`,
          }),
        ],
      }),

      new TableRow({
        children: [
          buildFlashcardDocxBodyCell({
            portuguese: questionPt,
            english: questionEn,
            portugueseSize: 32,
            englishSize: 32,
            fill: 'FFFFFF',
          }),
        ],
      }),

      new TableRow({
        children: [
          buildFlashcardDocxHeaderCell({
            headerText: `Resposta: ${topic}`,
            topBorder: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: FLASHCARD_DOCX_COLORS.teal,
            },
            bottomBorder: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: FLASHCARD_DOCX_COLORS.teal,
            },
          }),
        ],
      }),

      new TableRow({
        children: [
          buildFlashcardDocxBodyCell({
            portuguese: answerPt,
            english: answerEn,
            portugueseSize: 30,
            englishSize: 30,
            fill: 'F8FAFC',
          }),
        ],
      }),
    ],
  });
}

function buildFlashcardDocxSpacer(after = 400) {
  return new Paragraph({
    text: '',
    spacing: {
      after,
    },
  });
}

async function buildFlashcardsDocxBuffer({ cards = [], title = 'Flashcards' }) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 420,
      },
      children: [
        new TextRun({
          text: title || 'Apostila de Flashcards',
          bold: true,
          size: 36,
          color: FLASHCARD_DOCX_COLORS.teal,
        }),
      ],
    }),
  ];

  cards.forEach((card, index) => {
    children.push(
      buildFlashcardDocxTable({
        card,
        cardNumber: index + 1,
        totalCards: cards.length,
      })
    );

    children.push(buildFlashcardDocxSpacer(420));
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.PORTRAIT,
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(document);
}

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    exportFontFamily: EXPORT_SVG_FONT_FAMILY,
    transcription: 'deepgram',
    textModels: GEMINI_TEXT_MODELS,
    metadataModels: GEMINI_METADATA_MODELS,
    flashcardsModels: GEMINI_FLASHCARD_MODELS,
    imageModels: GEMINI_IMAGE_MODELS,
    persistence: Boolean(supabase),
    videoStorage: r2 ? 'cloudflare-r2' : 'disabled',
  });
});

app.get('/api/history', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 12);
    const search = String(req.query.search || '');

    const result = await listStudyRuns({ page, limit, search });
    return res.json(result);
  } catch (error) {
    console.error('❌ Erro ao carregar histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/history/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);
    return res.json({ run });
  } catch (error) {
    console.error('❌ Erro ao carregar item do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/history/:id/flashcards/:cardIndex', async (req, res) => {
  try {
    const { id, cardIndex } = req.params;
    const { origin = 'current', updates = {} } = req.body || {};

    const result = await updateRunFlashcardAtIndex({
      runId: id,
      cardIndex: Number(cardIndex),
      origin,
      updates,
    });

    return res.json(result);
  } catch (error) {
    console.error('❌ Erro ao editar flashcard do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/history/:id/flashcards', async (req, res) => {
  try {
    const { id } = req.params;
    const { origin = 'current', flashcards = [] } = req.body || {};

    if (!Array.isArray(flashcards)) {
      return res.status(400).json({ error: 'Lista de flashcards inválida.' });
    }

    const run = await getStudyRunById(id);
    const resolvedList = resolveFlashcardListForWrite(run, origin);
    const column = resolvedList.column;

    const normalizedFlashcards = flashcards
      .filter((card) => card && (card.question || card.pergunta) && (card.answer || card.resposta))
      .map((card, index) => ({
        ...card,
        position: index + 1,
        sort_order: index,
      }));

    const updatePayload = {
      [column]: normalizedFlashcards,
    };

    if (column === 'enriched_flashcards') {
      updatePayload.enriched_flashcards_generated_at = new Date().toISOString();
    }

    const { data: updatedRun, error } = await supabase
      .from('study_runs')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Falha ao salvar lista de flashcards: ${error.message}`);
    }

    const runView = buildStudyRunFlashcardView(updatedRun);

    const librarySetSync = await syncRunFlashcardsToLibrarySet({
      run: runView,
      flashcards: runView.display_flashcards || normalizedFlashcards,
    });

    return res.json({
      run: runView,
      flashcards: runView.display_flashcards || normalizedFlashcards,
      display_flashcards: runView.display_flashcards || normalizedFlashcards,
      displayFlashcards: runView.display_flashcards || normalizedFlashcards,
      origin: resolvedList.origin,
      column,
      librarySetSync,
    });
  } catch (error) {
    console.error('❌ Erro ao salvar lista de flashcards do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/flashcards/preview-image-upload-url', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      filename = 'new-flashcard-image.png',
      contentType = 'image/png',
      field = 'question',
    } = req.body || {};

    if (!String(contentType || '').startsWith('image/')) {
      return res.status(400).json({ error: 'O arquivo precisa ser uma imagem.' });
    }

    await getStudyRunById(id);

    const key = buildFlashcardPreviewImageKey({
      runId: id,
      field,
      filename,
      contentType,
    });

    const upload = await createR2PresignedUploadUrl({
      key,
      contentType,
      expiresIn: 60 * 20,
    });

    return res.json(upload);
  } catch (error) {
    console.error('❌ Erro ao criar URL temporária de upload de imagem:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/flashcards/:cardIndex/image-upload-url', async (req, res) => {
  try {
    const { id, cardIndex } = req.params;
    const { filename = 'flashcard-image.png', contentType = 'image/png' } = req.body || {};

    if (!String(contentType || '').startsWith('image/')) {
      return res.status(400).json({ error: 'O arquivo precisa ser uma imagem.' });
    }

    await getStudyRunById(id);

    const key = buildFlashcardImageKey({
      runId: id,
      cardIndex: Number(cardIndex),
      filename,
      contentType,
    });

    const upload = await createR2PresignedUploadUrl({
      key,
      contentType,
      expiresIn: 60 * 20,
    });

    return res.json(upload);
  } catch (error) {
    console.error('❌ Erro ao criar URL de upload de imagem do flashcard:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/flashcards/:cardIndex/insights', async (req, res) => {
  try {
    const { id, cardIndex } = req.params;
    const { origin = 'current' } = req.body || {};

    const run = await getStudyRunById(id);
    const resolvedList = resolveFlashcardListForWrite(run, origin);
    const cards = Array.isArray(resolvedList.cards) ? resolvedList.cards : [];
    const normalizedIndex = Number(cardIndex);

    if (
      !Number.isInteger(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= cards.length
    ) {
      return res.status(400).json({ error: 'Índice do flashcard inválido.' });
    }

    const card = cards[normalizedIndex];

    const insights = await generateFlashcardInsights({
      run,
      card,
      cardIndex: normalizedIndex,
    });

    const generatedAt = new Date().toISOString();

    const result = await updateRunFlashcardAtIndex({
      runId: id,
      cardIndex: normalizedIndex,
      origin,
      updates: {
        cardInsights: insights,
        card_insights: insights,
        cardInsightsGeneratedAt: generatedAt,
        card_insights_generated_at: generatedAt,
        imagePrompt: insights.image_prompt || '',
        image_prompt: insights.image_prompt || '',
      },
    });

    return res.json({
      ...result,
      insights,
      generatedAt,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar insights do flashcard:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/flashcards/generate-image-preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { concept = '', prompt = '', field = 'question' } = req.body || {};

    await getStudyRunById(id);

    const conceptBase = String(concept || prompt || '').trim();

    if (!conceptBase) {
      return res.status(400).json({ error: 'Conteúdo base da imagem é obrigatório.' });
    }

    const finalPrompt = buildKawaiiMedicalFlashcardImagePrompt({
      field,
      concept: conceptBase,
    });

    const illustrationBuffer = await generateImagenIllustrationBuffer(finalPrompt);

    const key = buildFlashcardPreviewImageKey({
      runId: id,
      field,
      filename: `ai-${field}-new-flashcard.png`,
      contentType: 'image/png',
    });

    const uploaded = await uploadBufferToR2({
      buffer: illustrationBuffer,
      key,
      contentType: 'image/png',
    });

    return res.json({
      imageUrl: uploaded.publicUrl || '',
      publicUrl: uploaded.publicUrl || '',
      imageObjectKey: uploaded.key || '',
      key: uploaded.key || '',
      imagePrompt: finalPrompt,
      field,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Erro ao gerar imagem temporária para novo flashcard:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/flashcards/:cardIndex/generate-image', async (req, res) => {
  try {
    const { id, cardIndex } = req.params;
    const { origin = 'current', concept = '', field = 'card' } = req.body || {};

    const run = await getStudyRunById(id);
    const resolvedList = resolveFlashcardListForWrite(run, origin);
    const cards = Array.isArray(resolvedList.cards) ? resolvedList.cards : [];
    const normalizedIndex = Number(cardIndex);

    if (
      !Number.isInteger(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= cards.length
    ) {
      return res.status(400).json({ error: 'Índice do flashcard inválido.' });
    }

    const card = cards[normalizedIndex];
    const normalizedField =
      field === 'question' || field === 'answer'
        ? field
        : 'answer';
    
    const insights = card.cardInsights || card.card_insights || {};

    const conceptBase =
      String(concept || '').trim() ||
      String(
        normalizedField === 'question'
          ? card.question || card.pergunta || insights.image_keyword || ''
          : insights.corrected_answer ||
              card.answer ||
              card.resposta ||
              insights.image_keyword ||
              card.question ||
              card.pergunta ||
              ''
      )
        .replace(/\s+/g, ' ')
        .trim();

    const finalPrompt = buildKawaiiMedicalFlashcardImagePrompt({
      field: normalizedField,
      concept: conceptBase,
    });

    const illustrationBuffer = await generateImagenIllustrationBuffer(finalPrompt);

    const key = buildFlashcardImageKey({
      runId: id,
      cardIndex: normalizedIndex,
      filename: 'ai-flashcard-illustration.png',
      contentType: 'image/png',
    });

    const uploaded = await uploadBufferToR2({
      buffer: illustrationBuffer,
      key,
      contentType: 'image/png',
    });

    const generatedAt = new Date().toISOString();

    const result = await updateRunFlashcardAtIndex({
      runId: id,
      cardIndex: normalizedIndex,
      origin,
      updates:
      field === 'question'
        ? {
            questionImageUrl: uploaded.publicUrl || '',
            question_image_url: uploaded.publicUrl || '',
            questionImageObjectKey: uploaded.key,
            question_image_object_key: uploaded.key,
            imageSource: 'ai',
            image_source: 'ai',
            imagePrompt: finalPrompt,
            image_prompt: finalPrompt,
            imageGeneratedAt: generatedAt,
            image_generated_at: generatedAt,
          }
        : field === 'answer'
        ? {
            answerImageUrl: uploaded.publicUrl || '',
            answer_image_url: uploaded.publicUrl || '',
            answerImageObjectKey: uploaded.key,
            answer_image_object_key: uploaded.key,
            imageSource: 'ai',
            image_source: 'ai',
            imagePrompt: finalPrompt,
            image_prompt: finalPrompt,
            imageGeneratedAt: generatedAt,
            image_generated_at: generatedAt,
          }
        : {
            imageUrl: uploaded.publicUrl || '',
            image_url: uploaded.publicUrl || '',
            imageObjectKey: uploaded.key,
            image_object_key: uploaded.key,
            imageSource: 'ai',
            image_source: 'ai',
            imagePrompt: finalPrompt,
            image_prompt: finalPrompt,
            imageGeneratedAt: generatedAt,
            image_generated_at: generatedAt,
          },
    });

    return res.json({
      ...result,
      imageUrl: uploaded.publicUrl,
      imageObjectKey: uploaded.key,
      imagePrompt: finalPrompt,
      generatedAt,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar imagem do flashcard:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/exports/flashcards/pdf', async (req, res) => {
  try {
    const {
      cards = [],
      title = 'Flashcards',
    } = req.body || {};

    const normalizedCards = normalizeExportFlashcards(cards);

    if (!normalizedCards.length) {
      return res.status(400).json({
        error: 'Nenhum flashcard válido para exportar.',
      });
    }

    const buffer = await buildFlashcardsPdfBuffer({
      cards: normalizedCards,
      title,
    });

    const filename = `${safeExportFilename(title)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(buffer);
  } catch (error) {
    console.error('❌ Erro ao exportar PDF:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/exports/flashcards/docx', async (req, res) => {
  try {
    const {
      cards = [],
      title = 'Flashcards',
    } = req.body || {};

    const normalizedCards = normalizeExportFlashcards(cards);

    if (!normalizedCards.length) {
      return res.status(400).json({
        error: 'Nenhum flashcard válido para exportar.',
      });
    }

    const buffer = await buildFlashcardsDocxBuffer({
      cards: normalizedCards,
      title,
    });

    const filename = `${safeExportFilename(title)}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(buffer);
  } catch (error) {
    console.error('❌ Erro ao exportar DOCX:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/flashcard-decks', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const specialty = String(req.query.specialty || '').trim();

    let query = supabase
      .from('flashcard_decks')
      .select('*')
      .order('specialty', { ascending: true })
      .order('name', { ascending: true });

    if (specialty) {
      query = query.eq('specialty', specialty);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return res.json({
      decks: data || [],
    });
  } catch (error) {
    console.error('❌ Erro ao listar decks:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/flashcard-decks/tree', async (req, res) => {
  try {
    const specialty = String(req.query.specialty || '').trim();
    const tree = await listDeckTree({ specialty });

    return res.json({ tree });
  } catch (error) {
    console.error('❌ Erro ao listar árvore de decks:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcard-decks', async (req, res) => {
  try {
    const {
      name,
      description = '',
      specialty = '',
      sub_specialty = '',
      parent_deck_id = null,
      deck_type = 'manual',
    } = req.body || {};

    if (!String(name || '').trim()) {
      return res.status(400).json({
        error: 'Nome do deck é obrigatório.',
      });
    }

    const deck = await resolveOrCreateDeck({
      name: String(name).trim(),
      specialty: String(specialty || '').trim(),
      subSpecialty: String(sub_specialty || '').trim(),
      parentDeckId: parent_deck_id || null,
      description: String(description || '').trim() || null,
      deckType: String(deck_type || 'manual').trim(),
    });

    return res.json({ deck });
  } catch (error) {
    console.error('❌ Erro ao criar deck:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/flashcard-decks/:id', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;
    const {
      name,
      specialty,
      sub_specialty,
      parent_deck_id,
      deck_type,
      description,
    } = req.body || {};

    const payload = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) payload.name = String(name || '').trim();
    if (specialty !== undefined) payload.specialty = String(specialty || '').trim() || null;
    if (sub_specialty !== undefined) payload.sub_specialty = String(sub_specialty || '').trim() || null;
    if (parent_deck_id !== undefined) payload.parent_deck_id = parent_deck_id || null;
    if (deck_type !== undefined) payload.deck_type = String(deck_type || 'manual').trim();
    if (description !== undefined) payload.description = String(description || '').trim() || null;

    const { data, error } = await supabase
      .from('flashcard_decks')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return res.json({ deck: data });
  } catch (error) {
    console.error('❌ Erro ao atualizar deck:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcard-decks/:id/clear-cards', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('flashcards_library')
      .update({
        deck_id: null,
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('deck_id', id)
      .select('id');

    if (error) {
      throw new Error(error.message);
    }

    await touchDeck(id);

    return res.json({
      ok: true,
      clearedCount: data?.length || 0,
    });
  } catch (error) {
    console.error('❌ Erro ao limpar pasta:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/flashcard-decks/:id', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;
    const rootDeckId = String(id || '').trim();

    if (!rootDeckId) {
      return res.status(400).json({ error: 'ID da pasta é obrigatório.' });
    }

    const { data: allDecks, error: decksError } = await supabase
      .from('flashcard_decks')
      .select('id, parent_deck_id');

    if (decksError) {
      throw new Error(decksError.message);
    }

    const deckMap = new Map(
      (allDecks || []).map((deck) => [String(deck.id), deck])
    );

    if (!deckMap.has(rootDeckId)) {
      return res.json({
        ok: true,
        alreadyDeleted: true,
        deletedDeckIds: [],
        archivedCardsCount: 0,
      });
    }

    const childMap = new Map();

    for (const deck of allDecks || []) {
      const parentId = deck.parent_deck_id ? String(deck.parent_deck_id) : '';

      if (!parentId) continue;

      if (!childMap.has(parentId)) {
        childMap.set(parentId, []);
      }

      childMap.get(parentId).push(String(deck.id));
    }

    const idsToDelete = [];

    const collectDeckAndChildren = (deckId) => {
      if (!deckId || idsToDelete.includes(deckId)) return;

      idsToDelete.push(deckId);

      const children = childMap.get(deckId) || [];
      children.forEach(collectDeckAndChildren);
    };

    collectDeckAndChildren(rootDeckId);

    const now = new Date().toISOString();

    const { data: archivedCards, error: cardsError } = await supabase
      .from('flashcards_library')
      .update({
        deck_id: null,
        is_archived: true,
        updated_at: now,
      })
      .in('deck_id', idsToDelete)
      .select('id');

    if (cardsError) {
      throw new Error(cardsError.message);
    }

    const deleteOrder = [...idsToDelete].reverse();

    for (const deckId of deleteOrder) {
      const { error: deleteError } = await supabase
        .from('flashcard_decks')
        .delete()
        .eq('id', deckId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    return res.json({
      ok: true,
      deletedDeckIds: idsToDelete,
      archivedCardsCount: archivedCards?.length || 0,
    });
  } catch (error) {
    console.error('❌ Erro ao excluir deck:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcard-decks/ensure-hierarchy', async (req, res) => {
  try {
    const {
      specialty = '',
      sub_specialty = '',
      theme = '',
      create_leaf_deck = true,
    } = req.body || {};

    const hierarchy = await ensureDeckHierarchy({
      specialty: String(specialty || '').trim(),
      subSpecialty: String(sub_specialty || '').trim(),
      theme: String(theme || '').trim(),
      createLeafDeck: Boolean(create_leaf_deck),
    });

    return res.json(hierarchy);
  } catch (error) {
    console.error('❌ Erro ao garantir hierarquia:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcard-decks/:deckId/cards', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { deckId } = req.params;
    const {
      cards = [],
      source_run_id = null,
      specialty = '',
      sub_specialty = '',
    } = req.body || {};

    if (!deckId) {
      return res.status(400).json({
        error: 'Deck inválido.',
      });
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        error: 'Nenhum flashcard enviado.',
      });
    }

    const payload = cards
      .map(normalizeLibraryFlashcard)
      .filter((card) => card.question && card.answer)
      .map((card, index) => ({
        deck_id: deckId,
        source_run_id: source_run_id || null,
        question: card.question,
        answer: card.answer,
        preceptor_note: card.preceptor_note,
        difficulty: card.difficulty,
        specialty: card.specialty || String(specialty || '').trim() || null,
        sub_specialty: card.sub_specialty || String(sub_specialty || '').trim() || null,
        tags: Array.isArray(card.tags) ? card.tags : [],
        review_state: card.review_state || {},
        review_stats: card.review_stats || {},
        sort_order: index,
      }));

    if (!payload.length) {
      return res.status(400).json({
        error: 'Nenhum flashcard válido para salvar.',
      });
    }

    const { data, error } = await supabase
      .from('flashcards_library')
      .insert(payload)
      .select('*');

    if (error) {
      throw new Error(error.message);
    }

    await touchDeck(deckId);

    return res.json({
      savedCount: data?.length || 0,
      cards: data || [],
    });
  } catch (error) {
    console.error('❌ Erro ao salvar flashcards no deck:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/flashcards-library', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const {
      deckId = '',
      specialty = '',
      favorites = '',
      dueOnly = '',
      search = '',
      archived = 'false',
      limit = '300',
    } = req.query;

    let query = supabase
      .from('flashcards_library')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit || 300), 1), 5000));

    if (String(deckId).trim()) {
      query = query.eq('deck_id', String(deckId).trim());
    }

    if (String(specialty).trim()) {
      query = query.eq('specialty', String(specialty).trim());
    }

    if (favorites === 'true') {
      query = query.eq('is_favorite', true);
    }

    if (archived === 'true') {
      query = query.eq('is_archived', true);
    } else {
      query = query.eq('is_archived', false);
    }

    if (String(search).trim()) {
      const term = String(search).trim();
      query = query.or(`question.ilike.%${term}%,answer.ilike.%${term}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    let cards = Array.isArray(data) ? data : [];

    if (dueOnly === 'true') {
      const now = new Date();
      cards = cards.filter((card) => {
        const dueAt = card?.review_state?.dueAt;
        if (!dueAt) return false;
        return new Date(dueAt) <= now;
      });
    }

    return res.json({ cards });
  } catch (error) {
    console.error('❌ Erro ao listar flashcards da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/library-analytics', async (req, res) => {
  try {
    const specialty = String(req.query.specialty || '').trim();
    const deckId = String(req.query.deckId || '').trim();

    const analytics = await getLibraryAnalytics({
      specialty,
      deckId,
    });

    return res.json(analytics);
  } catch (error) {
    console.error('❌ Erro ao carregar analytics da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcards-library/:id/image-upload-url', async (req, res) => {
  try {
    const { id } = req.params;
    const { filename = 'library-flashcard-image.png', contentType = 'image/png' } = req.body || {};

    if (!String(contentType || '').startsWith('image/')) {
      return res.status(400).json({ error: 'O arquivo precisa ser uma imagem.' });
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(String(contentType).toLowerCase())) {
      return res.status(400).json({
        error: 'Use PNG ou JPG para garantir compatibilidade com PDF e Word.',
      });
    }

    const key = `flashcard-images/library-card-${sanitizeObjectKeyPart(id)}/${Date.now()}-${sanitizeFilename(filename)}`;

    const upload = await createR2PresignedUploadUrl({
      key,
      contentType,
      expiresIn: 60 * 20,
    });

    return res.json(upload);
  } catch (error) {
    console.error('❌ Erro ao criar URL de upload de imagem da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/flashcards-library/:id', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;
    const permanent = String(req.query.permanent || 'false') === 'true';

    if (permanent) {
      const { error } = await supabase
        .from('flashcards_library')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }

      return res.json({
        ok: true,
        deleted: true,
      });
    }

    const { data, error } = await supabase
      .from('flashcards_library')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.deck_id) {
      await touchDeck(data.deck_id);
    }

    return res.json({
      ok: true,
      archived: true,
      card: data,
    });
  } catch (error) {
    console.error('❌ Erro ao excluir flashcard da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/flashcards-library/:id', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;
    const {
      is_favorite,
      is_archived,
      deck_id,
      specialty,
      sub_specialty,
      tags,
      question,
      answer,
      preceptor_note,
      question_html,
      answer_html,
      preceptor_note_html,
      question_image_url,
      question_image_object_key,
      answer_image_url,
      answer_image_object_key,
      image_url,
      image_object_key,
      difficulty,
      review_state,
      review_stats,
    } = req.body || {};

    const payload = {
      updated_at: new Date().toISOString(),
    };

    if (typeof is_favorite === 'boolean') payload.is_favorite = is_favorite;
    if (typeof is_archived === 'boolean') payload.is_archived = is_archived;
    if (deck_id !== undefined) payload.deck_id = deck_id || null;
    if (specialty !== undefined) payload.specialty = specialty || null;
    if (sub_specialty !== undefined) payload.sub_specialty = sub_specialty || null;
    if (tags !== undefined) payload.tags = Array.isArray(tags) ? tags : [];
    if (question !== undefined) payload.question = question;
    if (answer !== undefined) payload.answer = answer;
    if (preceptor_note !== undefined) payload.preceptor_note = preceptor_note;
    if (question_html !== undefined) payload.question_html = question_html || null;
    if (answer_html !== undefined) payload.answer_html = answer_html || null;
    if (preceptor_note_html !== undefined) {
      payload.preceptor_note_html = preceptor_note_html || null;
    }

    if (question_image_url !== undefined) {
      payload.question_image_url = question_image_url || null;
    }

    if (question_image_object_key !== undefined) {
      payload.question_image_object_key = question_image_object_key || null;
    }

    if (answer_image_url !== undefined) {
      payload.answer_image_url = answer_image_url || null;
    }

    if (answer_image_object_key !== undefined) {
      payload.answer_image_object_key = answer_image_object_key || null;
    }

    if (image_url !== undefined) payload.image_url = image_url || null;
    if (image_object_key !== undefined) payload.image_object_key = image_object_key || null;
    if (difficulty !== undefined) payload.difficulty = difficulty;
    if (review_state !== undefined) payload.review_state = review_state || {};
    if (review_stats !== undefined) payload.review_stats = review_stats || {};

    const { data, error } = await supabase
      .from('flashcards_library')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (payload.deck_id) {
      await touchDeck(payload.deck_id);
    }

    return res.json({ card: data });
  } catch (error) {
    console.error('❌ Erro ao atualizar flashcard da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/flashcards-library/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { target_deck_id } = req.body || {};

    if (!target_deck_id) {
      return res.status(400).json({ error: 'Deck de destino é obrigatório.' });
    }

    const card = await moveLibraryCardToDeck(id, target_deck_id);
    return res.json({ card });
  } catch (error) {
    console.error('❌ Erro ao mover card:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/flashcards-library/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;

    const card = await updateLibraryCard(id, req.body || {});
    return res.json({ card });
  } catch (error) {
    console.error('❌ Erro ao editar card:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/flashcards-library/:id/review', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;
    const {
      grade,
      review_state = {},
      review_stats = {},
      session_mode = 'study',
      session_source = 'library',
    } = req.body || {};

    if (typeof grade !== 'number') {
      return res.status(400).json({
        error: 'Grade inválida.',
      });
    }

    const { error: updateError } = await supabase
      .from('flashcards_library')
      .update({
        review_state,
        review_stats,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const reviewLogPayload = {
      flashcard_id: Number(id),
      grade,
      session_mode,
      session_source,
    };

    const { error: logError } = await supabase
      .from('flashcard_review_log')
      .insert(reviewLogPayload);

    if (logError) {
      const isMissingMetadataColumn =
        logError.message?.includes('session_mode') ||
        logError.message?.includes('session_source') ||
        logError.message?.includes('schema cache');

      if (isMissingMetadataColumn) {
        console.warn(
          '⚠️ flashcard_review_log sem colunas session_mode/session_source. Salvando log básico.'
        );

        const { error: fallbackLogError } = await supabase
          .from('flashcard_review_log')
          .insert({
            flashcard_id: Number(id),
            grade,
          });

        if (fallbackLogError) {
          console.warn(
            '⚠️ Não foi possível salvar log básico da revisão:',
            fallbackLogError.message
          );
        }
      } else {
        throw new Error(logError.message);
      }
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error('❌ Erro ao registrar revisão da biblioteca:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    const deletedRun = await deleteStudyRunById(req.params.id);
    return res.json({ ok: true, deletedRun });
  } catch (error) {
    console.error('❌ Erro ao deletar item do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/history/:id/meta', async (req, res) => {
  try {
    const { is_favorite, study_tag, specialty } = req.body || {};

    const updatedRun = await updateStudyRunMeta(req.params.id, {
      ...(typeof is_favorite === 'boolean' ? { is_favorite } : {}),
      ...(typeof study_tag === 'string' ? { study_tag } : {}),
      ...(typeof specialty === 'string' ? { specialty } : {}),
    });

    return res.json({ run: updatedRun });
  } catch (error) {
    console.error('❌ Erro ao atualizar metadados do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/history/:id/review', async (req, res) => {
  try {
    const { review_state, review_stats } = req.body || {};

    const updatedRun = await updateStudyRunReview(
      req.params.id,
      review_state || {},
      review_stats || {}
    );

    return res.json({ run: updatedRun });
  } catch (error) {
    console.error('❌ Erro ao atualizar revisão do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/:id/reclassify', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.transcript || !run.transcript.trim()) {
      return res.status(400).json({
        error: 'Esta execução não possui transcrição válida para reclassificação.',
      });
    }

    const classification = await classifyTranscriptMetadata(
      run.transcript,
      run.original_filename || ''
    );

    const updatedRun = await updateStudyRunClassification(run.id, classification);

    return res.json({
      run: updatedRun,
      classification,
    });
  } catch (error) {
    console.error('❌ Erro ao reclassificar run:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/history/reclassify-missing', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const limit = Math.min(Math.max(Number(req.body?.limit || 10), 1), 50);

    const { data: allRuns, error } = await supabase
      .from('study_runs')
      .select('id, original_filename, transcript, specialty, secondary_topics, auto_tags')
      .order('created_at', { ascending: false })
      .limit(limit * 3);

    if (error) {
      throw new Error(`Falha ao buscar runs para reclassificação: ${error.message}`);
    }

    const runs = (allRuns || [])
      .filter((run) => {
        const missingSpecialty = !run.specialty || !String(run.specialty).trim();
        const missingSecondaryTopics =
          !Array.isArray(run.secondary_topics) || run.secondary_topics.length === 0;
        const missingAutoTags =
          !Array.isArray(run.auto_tags) || run.auto_tags.length === 0;

        return missingSpecialty || missingSecondaryTopics || missingAutoTags;
      })
      .slice(0, limit);

    const results = [];

    for (const run of runs || []) {
      try {
        if (!run?.transcript || !run.transcript.trim()) {
          results.push({
            id: run.id,
            status: 'skipped',
            reason: 'Sem transcrição válida',
          });
          continue;
        }

        const classification = await classifyTranscriptMetadata(
          run.transcript,
          run.original_filename || ''
        );

        const updatedRun = await updateStudyRunClassification(run.id, classification);

        results.push({
          id: run.id,
          status: 'updated',
          specialty: updatedRun.specialty,
          secondary_topics: updatedRun.secondary_topics || [],
          auto_tags: updatedRun.auto_tags || [],
        });
      } catch (innerError) {
        results.push({
          id: run.id,
          status: 'error',
          reason: innerError.message,
        });
      }
    }

    return res.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('❌ Erro no backfill de reclassificação:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-flashcards-from-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);
    const forceRegenerate = Boolean(req.body?.forceRegenerate);

    if (Array.isArray(run.flashcards) && run.flashcards.length > 0 && !forceRegenerate) {
      return res.json({
        run,
        reused: true,
      });
    }

    const textForFlashcards = buildTextWithEnrichmentSupport({
      transcript: run.transcript,
      enrichmentSupportTranscript: getRunEnrichmentSupportTranscript(run),
    });

    const result = await generateFlashcardsWithGemini(textForFlashcards);
    const updatedRun = await updateStudyRunFlashcards(run.id, result.flashcards, result.modelUsed);

    try {
      await saveFlashcardsToLibrary({
        theme:
          Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 1
            ? updatedRun.secondary_topics[1]
            : '',
        runId: updatedRun.id,
        flashcards: updatedRun.flashcards || [],
        specialty: updatedRun.specialty || 'Clínica Médica',
        subSpecialty:
          Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 0
            ? updatedRun.secondary_topics[0]
            : '',
      });
    } catch (libraryError) {
      console.warn(
        '⚠️ Falha ao salvar flashcards regenerados na biblioteca:',
        libraryError.message
      );
    }

    return res.json({
      run: updatedRun,
      reused: false,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar flashcards do histórico:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/uploads/direct-video-url', async (req, res) => {
  try {
    const {
      filename,
      contentType,
      size,
      generateFlashcards = true,
    } = req.body || {};

    if (!filename) {
      return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });
    }

    const key = buildTempVideoKey(filename);

    const upload = await createR2PresignedUploadUrl({
      key,
      contentType: contentType || 'video/mp4',
      expiresIn: 60 * 60 * 2,
    });

    return res.json({
      ...upload,
      originalFilename: filename,
      originalFileSize: size || null,
      originalMimeType: contentType || null,
      generateFlashcards: Boolean(generateFlashcards),
    });
  } catch (error) {
    console.error('❌ Erro ao criar URL de upload direto:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/uploads/multipart-video/start', async (req, res) => {
  try {
    const {
      filename,
      contentType,
      size,
      generateFlashcards = true,
    } = req.body || {};

    if (!filename) {
      return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });
    }

    const fileSize = Number(size || 0);
    const key = buildTempVideoKey(filename);

    const session = await createR2MultipartUploadSession({
      key,
      contentType: contentType || 'video/mp4',
    });

    return res.json({
      ...session,
      partSize: MULTIPART_PART_SIZE_BYTES,
      totalParts: fileSize > 0 ? Math.ceil(fileSize / MULTIPART_PART_SIZE_BYTES) : null,
      originalFilename: filename,
      originalFileSize: fileSize || null,
      originalMimeType: contentType || null,
      generateFlashcards: Boolean(generateFlashcards),
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar multipart upload:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/uploads/multipart-video/part-url', async (req, res) => {
  try {
    const {
      key,
      uploadId,
      partNumber,
    } = req.body || {};

    if (!key || !uploadId || !partNumber) {
      return res.status(400).json({
        error: 'key, uploadId e partNumber são obrigatórios.',
      });
    }

    const part = await createR2MultipartPartUrl({
      key,
      uploadId,
      partNumber,
      expiresIn: 60 * 60 * 2,
    });

    return res.json(part);
  } catch (error) {
    console.error('❌ Erro ao criar URL de parte multipart:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/uploads/multipart-video/complete', async (req, res) => {
  try {
    const {
      key,
      uploadId,
      parts,
    } = req.body || {};

    if (!key || !uploadId || !Array.isArray(parts) || !parts.length) {
      return res.status(400).json({
        error: 'key, uploadId e parts são obrigatórios.',
      });
    }

    const completed = await completeR2MultipartUpload({
      key,
      uploadId,
      parts,
    });

    return res.json(completed);
  } catch (error) {
    console.error('❌ Erro ao completar multipart upload:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/uploads/multipart-video/abort', async (req, res) => {
  try {
    const {
      key,
      uploadId,
    } = req.body || {};

    if (!key || !uploadId) {
      return res.status(400).json({
        error: 'key e uploadId são obrigatórios.',
      });
    }

    await abortR2MultipartUpload({
      key,
      uploadId,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('❌ Erro ao abortar multipart upload:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/processing-jobs', async (req, res) => {
  try {
    const {
      originalFilename,
      originalFileSize,
      originalMimeType,
      tempVideoObjectKey,
      generateFlashcards = true,
    } = req.body || {};

    if (!tempVideoObjectKey) {
      return res.status(400).json({ error: 'tempVideoObjectKey é obrigatório.' });
    }

    const job = await createProcessingJob({
      originalFilename,
      originalFileSize,
      originalMimeType,
      tempVideoObjectKey,
      shouldGenerateFlashcards: Boolean(generateFlashcards),
    });

    return res.status(201).json({ job });
  } catch (error) {
    console.error('❌ Erro ao criar job:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

async function getProcessingJobQueueInfo(job) {
  if (!supabase || !job?.id) {
    return {
      position: null,
      waitingCount: null,
    };
  }

  const status = String(job.status || '').toLowerCase();

  if (!['uploaded', 'queued'].includes(status)) {
    return {
      position: 0,
      waitingCount: 0,
    };
  }

  const { count, error } = await supabase
    .from('processing_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['uploaded', 'queued'])
    .lt('created_at', job.created_at);

  if (error) {
    console.warn('⚠️ Falha ao calcular posição na fila:', error.message);

    return {
      position: null,
      waitingCount: null,
    };
  }

  const waitingCount = Number(count || 0);

  return {
    position: waitingCount + 1,
    waitingCount,
  };
}

app.get('/api/processing-jobs/:id', async (req, res) => {
  try {
    const job = await getProcessingJobById(req.params.id);
    const queue = await getProcessingJobQueueInfo(job);

    return res.json({
      job: {
        ...job,
        queue_position: queue.position,
        queue_waiting_count: queue.waitingCount,
      },
      queue,
    });
  } catch (error) {
    console.error('❌ Erro ao consultar job:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/process-video', (req, res, next) => {
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'enrichmentVideo', maxCount: 1 },
  ])(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'O vídeo enviado é muito grande. Envie um arquivo menor ou aumente o limite no servidor.',
        });
      }

      return res.status(400).json({
        error: `Falha no upload do vídeo: ${error.message}`,
      });
    }

    next();
  });
}, async (req, res) => {
  let uploadedVideoPath = null;
  let extractedAudioPath = null;
  let uploadedEnrichmentVideoPath = null;
  let extractedEnrichmentAudioPath = null;

  try {
    const mainVideoFile = req.files?.video?.[0] || null;
    const enrichmentVideoFile = req.files?.enrichmentVideo?.[0] || null;

    if (!mainVideoFile) {
      return res.status(400).json({ error: 'Nenhum vídeo principal foi enviado.' });
    }

    const shouldGenerateFlashcards = String(req.body.generateFlashcards ?? 'true') !== 'false';
    const normalizedOriginalFilename = normalizeUtf8Filename(mainVideoFile.originalname);

    uploadedVideoPath = mainVideoFile.path;
    extractedAudioPath = path.join(
      TEMP_AUDIO_DIR,
      `${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
    );

    console.log(`📥 Vídeo recebido: ${normalizedOriginalFilename}`);
    console.log('🎵 Extraindo áudio com FFmpeg...');
    await convertVideoToMp3(uploadedVideoPath, extractedAudioPath);

    console.log('📝 Transcrevendo com Deepgram...');
    const transcript = await transcribeAudioWithDeepgram(extractedAudioPath);

    let enrichmentSupportTranscript = '';
    let normalizedEnrichmentFilename = null;
    let storedEnrichmentVideo = {
      videoStorageProvider: null,
      videoObjectKey: null,
      videoUrl: null,
    };

    if (enrichmentVideoFile) {
      normalizedEnrichmentFilename = normalizeUtf8Filename(enrichmentVideoFile.originalname);
      uploadedEnrichmentVideoPath = enrichmentVideoFile.path;
      extractedEnrichmentAudioPath = path.join(
        TEMP_AUDIO_DIR,
        `${Date.now()}-${Math.random().toString(36).slice(2)}-enrichment.mp3`
      );

      console.log(`📥 Vídeo complementar recebido: ${normalizedEnrichmentFilename}`);
      console.log('🎵 Extraindo áudio do vídeo complementar...');
      await convertVideoToMp3(uploadedEnrichmentVideoPath, extractedEnrichmentAudioPath);

      console.log('📝 Transcrevendo vídeo complementar com Deepgram...');
      enrichmentSupportTranscript = await transcribeAudioWithDeepgram(extractedEnrichmentAudioPath);

      console.log('☁️ Enviando vídeo complementar para o R2...');
      storedEnrichmentVideo = await uploadVideoToR2(
        uploadedEnrichmentVideoPath,
        normalizedEnrichmentFilename,
        enrichmentVideoFile.mimetype,
        'enrichment-videos'
      );
    }

    let classifiedMetadata = null;
    let specialty = req.body.specialty || 'Clínica Médica';
    let secondaryTopics = [];
    let autoTags = [];

    try {
      console.log('🩺 Classificando metadados médicos...');
      classifiedMetadata = await classifyTranscriptMetadata(
        transcript,
        normalizedOriginalFilename
      );

      specialty = req.body.specialty || classifiedMetadata.specialty || 'Clínica Médica';

      secondaryTopics = Array.isArray(classifiedMetadata?.secondary_topics)
        ? classifiedMetadata.secondary_topics
        : [];

      autoTags = Array.isArray(classifiedMetadata?.auto_tags)
        ? classifiedMetadata.auto_tags
        : [];
    } catch (classificationError) {
      console.warn(
        '⚠️ Falha na classificação automática. Seguindo com fallback:',
        classificationError.message
      );

      specialty = req.body.specialty || 'Clínica Médica';
      secondaryTopics = [];
      autoTags = [];
    }

    let flashcards = null;
    let flashcardsModel = null;
    let flashcardsProvider = null;

    if (shouldGenerateFlashcards) {
      console.log('🧠 Gerando flashcards com Gemini...');
      const textForFlashcards = buildTextWithEnrichmentSupport({
        transcript,
        enrichmentSupportTranscript,
      });

      const result = await generateFlashcardsWithGemini(textForFlashcards);
      flashcards = result.flashcards;
      flashcardsModel = result.modelUsed;
      flashcardsProvider = 'gemini';
    }

    const storedVideo = await uploadVideoToR2(
      uploadedVideoPath,
      normalizedOriginalFilename,
      mainVideoFile.mimetype
    );

    const savedRun = await saveStudyRun({
      originalFilename: normalizedOriginalFilename,
      transcript,
      flashcards,
      transcriptionProvider: 'deepgram',
      flashcardsProvider,
      flashcardsModel,
      videoStorageProvider: storedVideo.videoStorageProvider,
      videoObjectKey: storedVideo.videoObjectKey,
      videoUrl: storedVideo.videoUrl,

      enrichmentSupportFilename: normalizedEnrichmentFilename,
      enrichmentSupportTranscript,
      enrichmentSupportVideoStorageProvider: storedEnrichmentVideo.videoStorageProvider,
      enrichmentSupportVideoObjectKey: storedEnrichmentVideo.videoObjectKey,
      enrichmentSupportVideoUrl: storedEnrichmentVideo.videoUrl,
      enrichmentSupportTranscriptionProvider: enrichmentSupportTranscript ? 'deepgram' : null,

      specialty,
      secondaryTopics,
      autoTags,
    });

    if (savedRun?.id && Array.isArray(flashcards) && flashcards.length > 0) {
      try {
        await saveFlashcardsToLibrary({
          theme:
            Array.isArray(secondaryTopics) && secondaryTopics.length > 1
              ? secondaryTopics[1]
              : '',
          runId: savedRun.id,
          flashcards,
          specialty: specialty || 'Clínica Médica',
          subSpecialty:
            Array.isArray(secondaryTopics) && secondaryTopics.length > 0
              ? secondaryTopics[0]
              : '',
        });
      } catch (libraryError) {
        console.warn(
          '⚠️ Falha ao salvar flashcards processados na biblioteca:',
          libraryError.message
        );
      }
    }

    console.log('✅ Pipeline concluído.');
    return res.json({
      transcript,
      enrichmentSupportTranscript,
      enrichmentSupportFilename: normalizedEnrichmentFilename,
      enrichmentSupportVideoUrl: storedEnrichmentVideo.videoUrl,
      flashcards: flashcards || [],
      transcriptionProvider: 'deepgram',
      flashcardsProvider,
      flashcardsModel,
      detectedSpecialty: specialty,
      detectedSpecialtyConfidence: classifiedMetadata?.confidence || 'fallback',
      detectedSecondaryTopics: secondaryTopics,
      detectedAutoTags: autoTags,
      savedRun,
    });
  } catch (error) {
    console.error('❌ Erro no pipeline:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    safeDelete(uploadedVideoPath);
    safeDelete(extractedAudioPath);
    safeDelete(uploadedEnrichmentVideoPath);
    safeDelete(extractedEnrichmentAudioPath);
  }
});



app.get('/api/analyze-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.id) {
      return res.status(404).json({ error: 'Study run não encontrado.' });
    }

    const result = await getLatestEvidenceAnalysisByStudyRunId(run.id);

    return res.json(result);
  } catch (error) {
    console.error('❌ Erro ao buscar análise de evidência:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/enrich-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    return res.json({
      enrichedTranscript: run.enriched_transcript || null,
      enrichedSummary: run.enriched_summary || null,
      enrichedGeneratedAt: run.enriched_generated_at || null,
      enrichedFlashcards: Array.isArray(run.enriched_flashcards) ? run.enriched_flashcards : [],
      enrichedFlashcardsGeneratedAt: run.enriched_flashcards_generated_at || null,

      enrichmentSupportFilename: run.enrichment_support_filename || null,
      enrichmentSupportTranscript: run.enrichment_support_transcript || null,
      enrichmentSupportTranscriptPreview: run.enrichment_support_transcript_preview || null,
      enrichmentSupportVideoUrl: run.enrichment_support_video_url || null,
      enrichmentSupportProcessedAt: run.enrichment_support_processed_at || null,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar enriquecimento:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/enrich-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.id) {
      return res.status(404).json({ error: 'Study run não encontrado.' });
    }

    const { enrichedTranscript, enrichedSummary } = req.body || {};

    if (typeof enrichedTranscript !== 'string') {
      return res.status(400).json({
        error: 'Texto enriquecido inválido.',
      });
    }

    const previousSummary =
      run.enriched_summary && typeof run.enriched_summary === 'object'
        ? run.enriched_summary
        : {};

    const nextSummary = {
      ...previousSummary,
      ...(enrichedSummary && typeof enrichedSummary === 'object' ? enrichedSummary : {}),
      manually_edited: true,
      manual_last_saved_at: new Date().toISOString(),
    };

    const updatedRun = await updateStudyRunEnrichment(
      run.id,
      enrichedTranscript,
      nextSummary
    );

    return res.json({
      run: updatedRun,
      enrichedTranscript: updatedRun.enriched_transcript || '',
      enrichedSummary: updatedRun.enriched_summary || null,
      enrichedGeneratedAt: updatedRun.enriched_generated_at || null,
      enrichedFlashcards: Array.isArray(updatedRun.enriched_flashcards)
        ? updatedRun.enriched_flashcards
        : [],
      enrichedFlashcardsGeneratedAt: updatedRun.enriched_flashcards_generated_at || null,
    });
  } catch (error) {
    console.error('❌ Erro ao salvar edição do texto enriquecido:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/google-calendar/status', async (req, res) => {
  try {
    const tokens = await getGoogleCalendarTokens();

    res.json({
      connected: Boolean(tokens?.refresh_token),
      scope: tokens?.scope || null,
      updated_at: tokens?.updated_at || null,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get('/api/google-calendar/auth-url', async (req, res) => {
  try {
    const oauth2Client = getGoogleOAuthClient();

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_CALENDAR_SCOPES,
    });

    res.json({ url });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get('/api/google-calendar/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      throw new Error('Código OAuth ausente.');
    }

    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    await saveGoogleCalendarTokens(tokens);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    res.redirect(`${frontendUrl}?googleCalendar=connected`);
  } catch (err) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(
      `${frontendUrl}?googleCalendar=error&message=${encodeURIComponent(err.message)}`
    );
  }
});

app.delete('/api/google-calendar/disconnect', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { error } = await supabase
      .from('google_oauth_tokens')
      .delete()
      .eq('provider', 'google_calendar')
      .eq('user_key', 'default_user');

    if (error) {
      throw new Error(error.message);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get('/api/google-calendar/review-events', async (req, res) => {
  try {
    const calendar = await getAuthorizedGoogleCalendarClient();

    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const timeMin = new Date(`${month}-01T00:00:00.000Z`);
    const timeMax = new Date(timeMin);
    timeMax.setMonth(timeMax.getMonth() + 1);

    const response = await calendar.events.list({
      calendarId: 'primary',
      q: 'Revisão espaçada - Flashcards IA',
      singleEvents: true,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500,
      orderBy: 'startTime',
    });

    res.json({
      events: response.data.items || [],
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/google-calendar/sync-reviews', async (req, res) => {
  try {
    const { cards = [] } = req.body;

    if (!Array.isArray(cards)) {
      throw new Error('Lista de cards inválida.');
    }

    const calendar = await getAuthorizedGoogleCalendarClient();

    const limitedCards = cards.slice(0, 80);
    const created = [];

    for (const card of limitedCards) {
      const event = buildGoogleCalendarReviewEventFromCard(card);

      const reviewLabel =
        card.smartReviewLabel || card.reviewLabel || 'D0';

      const existingEventsResponse = await calendar.events.list({
        calendarId: 'primary',
        privateExtendedProperty: [
          `flashcardsIaCardId=${String(card.id)}`,
          `flashcardsIaReviewLabel=${reviewLabel}`,
        ],
        singleEvents: true,
        maxResults: 10,
      });

      const existingEvent = existingEventsResponse.data.items?.[0];

      if (existingEvent) {
        const response = await calendar.events.update({
          calendarId: 'primary',
          eventId: existingEvent.id,
          requestBody: {
            ...existingEvent,
            ...event,
          },
        });

        created.push(response.data);
        continue;
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      created.push(response.data);
    }

    res.json({
      ok: true,
      created_count: created.length,
      events: created,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/enrich-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.transcript) {
      return res.status(400).json({ error: 'Esta execução não possui transcrição válida.' });
    }

    const analysisPack = await getLatestEvidenceAnalysisByStudyRunId(run.id);

    if (!analysisPack.analysis) {
      return res.status(400).json({
        error: 'Nenhuma análise de evidência encontrada para esta execução.',
      });
    }

    const referenceVideos = findRelevantReferenceVideos(run, VIDEO_REFERENCE_LIBRARY);

    const enriched = await buildEnrichedTranscriptFromAnalysis(
      run,
      analysisPack.analysis,
      analysisPack.sources || [],
      referenceVideos
    );

    const updatedRun = await updateStudyRunEnrichment(
      run.id,
      enriched.enriched_transcript,
      enriched.enriched_summary
    );

    return res.json({
      run: updatedRun,
      enrichedTranscript: updatedRun.enriched_transcript,
      enrichedSummary: updatedRun.enriched_summary,
      enrichedGeneratedAt: updatedRun.enriched_generated_at,
      referenceVideos,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar texto enriquecido:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-flashcards-from-enriched-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.enriched_transcript || !run.enriched_transcript.trim()) {
      return res.status(400).json({
        error: 'Nenhum texto enriquecido encontrado para esta execução.',
      });
    }

    const result = await generateFlashcardsWithGemini(run.enriched_transcript);

    const enrichedGeneratedFlashcards = (result.flashcards || []).map((card) => {
      const currentTags = Array.isArray(card.tags) ? card.tags : [];

      return {
        ...card,
        tags: Array.from(
          new Set([
            ...currentTags,
            'texto enriquecido',
            'flashcard enriquecido',
            'origem:texto-enriquecido',
          ])
        ),
        nota_preceptor: [
          card.nota_preceptor || card.preceptor_note || card.preceptorNote || '',
          'Origem: flashcard criado automaticamente a partir do texto enriquecido/aprovado.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      };
    });

    const existingEnrichedFlashcards = Array.isArray(run.enriched_flashcards)
      ? run.enriched_flashcards
      : [];

    const mergedGeneratedFlashcards = buildRunEditableFlashcards({
      ...run,
      enriched_flashcards: [
        ...existingEnrichedFlashcards,
        ...enrichedGeneratedFlashcards,
      ],
    });

    const updatedRun = await updateStudyRunEnrichedFlashcards(
      run.id,
      mergedGeneratedFlashcards,
      result.modelUsed
    );

    const shouldSaveToLibrary = req.body?.saveToLibrary === true;
    let librarySaved = false;
    let libraryWarning = null;

    if (shouldSaveToLibrary) {
      try {
        const savedLibraryCards = await saveFlashcardsToLibrary({
          theme:
            Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 1
              ? updatedRun.secondary_topics[1]
              : '',
          runId: updatedRun.id,
          flashcards: updatedRun.enriched_flashcards || [],
          specialty: updatedRun.specialty || 'Clínica Médica',
          subSpecialty:
            Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 0
              ? updatedRun.secondary_topics[0]
              : '',
        });

        librarySaved = Array.isArray(savedLibraryCards) && savedLibraryCards.length > 0;
      } catch (libraryError) {
        libraryWarning = libraryError.message;

        console.warn(
          '⚠️ Falha ao salvar flashcards enriquecidos na biblioteca:',
          libraryError.message
        );
      }
    }

    const displayFlashcards = Array.isArray(updatedRun.display_flashcards)
      ? updatedRun.display_flashcards
      : buildRunEditableFlashcards(updatedRun);

    return res.json({
      run: updatedRun,
      flashcards: displayFlashcards,
      displayFlashcards,
      display_flashcards: displayFlashcards,
      displayFlashcardsCount: displayFlashcards.length,
      enrichedFlashcardsGeneratedAt: updatedRun.enriched_flashcards_generated_at,
      librarySaved,
      libraryWarning,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar flashcards do texto enriquecido:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-mnemonic-flashcards-from-run/:id', async (req, res) => {
  try {
    const run = await getStudyRunById(req.params.id);

    if (!run?.id) {
      return res.status(404).json({ error: 'Study run não encontrado.' });
    }

    const analysisPack = await getLatestEvidenceAnalysisByStudyRunId(run.id);

    const mnemonics = Array.isArray(analysisPack?.analysis?.mnemonics)
      ? analysisPack.analysis.mnemonics
      : [];

    if (!mnemonics.length) {
      return res.status(400).json({
        error: 'Nenhum mnemônico encontrado na análise de evidência.',
      });
    }

    const mnemonicFlashcards = mnemonics
      .map((item, index) => {
        const title = item?.title || `Mnemônico ${index + 1}`;
        const mnemonic = item?.mnemonic || '';
        const explanation = item?.explanation || '';
        const useCase = item?.use_case || '';

        return {
          id: `mnemonic-${Date.now()}-${index}`,
          pergunta: `Mnemônico: como lembrar ${title}?`,
          resposta: [
            mnemonic ? `Mnemônico: ${mnemonic}` : '',
            explanation ? `Explicação: ${explanation}` : '',
            useCase ? `Quando usar: ${useCase}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          nota_preceptor:
            'Flashcard exclusivo criado a partir da seção Mnemônicos sugeridos da Análise de Evidência.',
          difficulty: 'medium',
          tags: ['mnemônico', 'análise de evidência'],
          sourceOrigin: 'mnemonic',
          source_origin: 'mnemonic',
        };
      })
      .filter((card) => card.pergunta && card.resposta);

    const currentEditableFlashcards = buildRunEditableFlashcards(run);

    const existingQuestions = new Set(
      currentEditableFlashcards.map((card) =>
        String(card.question || card.pergunta || '').trim().toLowerCase()
      )
    );

    const uniqueMnemonicFlashcards = mnemonicFlashcards.filter((card) => {
      const question = String(card.pergunta || '').trim().toLowerCase();
      return question && !existingQuestions.has(question);
    });

    const mergedFlashcards = mergeFlashcardGroupsForDisplay([
      { cards: currentEditableFlashcards, origin: 'current' },
      { cards: uniqueMnemonicFlashcards, origin: 'mnemonic' },
    ]);

    const updatedRun = await updateStudyRunEnrichedFlashcards(
      run.id,
      mergedFlashcards,
      'mnemonic-builder'
    );

    try {
      if (uniqueMnemonicFlashcards.length > 0) {
        await saveFlashcardsToLibrary({
          theme: 'Mnemônicos',
          runId: updatedRun.id,
          flashcards: uniqueMnemonicFlashcards,
          specialty: updatedRun.specialty || 'Clínica Médica',
          subSpecialty:
            Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 0
              ? updatedRun.secondary_topics[0]
              : '',
        });
      }
    } catch (libraryError) {
      console.warn(
        '⚠️ Falha ao salvar flashcards de mnemônicos na biblioteca:',
        libraryError.message
      );
    }

    const displayFlashcards = Array.isArray(updatedRun.display_flashcards)
      ? updatedRun.display_flashcards
      : buildRunEditableFlashcards(updatedRun);

    return res.json({
      run: updatedRun,
      mnemonicFlashcards: uniqueMnemonicFlashcards,
      flashcards: displayFlashcards,
      displayFlashcards,
      display_flashcards: displayFlashcards,
      displayFlashcardsCount: displayFlashcards.length,
      enrichedFlashcardsGeneratedAt: updatedRun.enriched_flashcards_generated_at,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar flashcards dos mnemônicos:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze-run/:id', async (req, res) => {
  try {
    const runId = String(req.params.id || '').trim();

    if (!runId) {
      return res.status(400).json({ error: 'ID inválido para análise.' });
    }

    const run = await getStudyRunById(runId);

    if (!run?.transcript) {
      return res.status(400).json({ error: 'Esta execução não possui transcrição válida.' });
    }

    const theme = req.body?.theme || '';
    const lesson = req.body?.lesson || '';
    const goal =
      req.body?.goal || 'Identificar lacunas, sugerir melhorias e possíveis mnemônicos.';

    const plan = await buildEvidencePlanFromTranscript(run, theme, lesson, goal);

    const evidencePack = await searchAllEvidenceSources(plan.search_queries || []);
    const referenceVideos = findRelevantReferenceVideos(run, VIDEO_REFERENCE_LIBRARY);

    const analysis = await analyzeTranscriptAgainstSources(
      run,
      plan,
      evidencePack.combined,
      referenceVideos
    );

    const savedAnalysis = await saveEvidenceAnalysis({
      studyRunId: run.id,
      plan,
      analysis,
    });

    const savedSources = await saveEvidenceSources(
      savedAnalysis.id,
      evidencePack.combined
    );

    return res.json({
      analysis: savedAnalysis,
      sources: savedSources,
      sourceBreakdown: {
        pubmed: evidencePack.pubmed.length,
        europePmc: evidencePack.europePmc.length,
        doaj: evidencePack.doaj.length,
        bmc: evidencePack.bmc.length,
      },
      referenceVideos,
    });
  } catch (error) {
    console.error('❌ Erro na análise de evidência:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

const FRONTEND_DIST_DIR = path.join(ROOT_DIR, '..', 'videos_flashcards', 'dist');

if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));

  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✅ Servidor backend rodando em http://localhost:${PORT}`);
});