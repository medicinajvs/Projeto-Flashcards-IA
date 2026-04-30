const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

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

function normalizeLibraryFlashcard(card = {}, index = 0) {
  return {
    question: card.question ?? card.pergunta ?? '',
    answer: card.answer ?? card.resposta ?? '',
    preceptor_note: card.preceptorNote ?? card.nota_preceptor ?? null,
    difficulty: card.difficulty || 'medium',
    specialty: card.specialty || null,
    sub_specialty: card.subSpecialty ?? card.sub_specialty ?? null,
    tags: Array.isArray(card.tags) ? card.tags : [],
    review_state: card.review_state || {},
    review_stats: card.review_stats || {},
    sort_order: index,
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

  const safeName = String(name || '').trim();
  const safeSpecialty = String(specialty || '').trim() || null;
  const safeSubSpecialty = String(subSpecialty || '').trim() || null;

  if (!safeName) {
    throw new Error('Nome do deck é obrigatório.');
  }

  let existingDeckQuery = supabase
    .from('flashcard_decks')
    .select('*')
    .eq('name', safeName)
    .eq('specialty', safeSpecialty)
    .eq('sub_specialty', safeSubSpecialty);

  if (parentDeckId) {
    existingDeckQuery = existingDeckQuery.eq('parent_deck_id', parentDeckId);
  } else {
    existingDeckQuery = existingDeckQuery.is('parent_deck_id', null);
  }

  const { data: existingDeck, error: existingDeckError } = await existingDeckQuery.maybeSingle();

  if (existingDeckError) {
    throw new Error(`Falha ao buscar deck existente: ${existingDeckError.message}`);
  }

  if (existingDeck) {
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
    const leafName = safeTheme
      ? `${safeTheme} — Deck Principal`
      : safeSubSpecialty
        ? `${safeSubSpecialty} — Deck Principal`
        : `${safeSpecialty} — Deck Principal`;

    finalDeck = await resolveOrCreateDeck({
      name: leafName,
      specialty: safeSpecialty,
      subSpecialty: safeSubSpecialty || null,
      parentDeckId: parent.id,
      deckType: 'leaf-deck',
    });
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
  if (updates.difficulty !== undefined) payload.difficulty = updates.difficulty;
  if (updates.specialty !== undefined) payload.specialty = updates.specialty || null;
  if (updates.sub_specialty !== undefined) payload.sub_specialty = updates.sub_specialty || null;
  if (updates.theme !== undefined) payload.theme = updates.theme || null;
  if (updates.notes !== undefined) payload.notes = updates.notes || null;
  if (updates.tags !== undefined) payload.tags = Array.isArray(updates.tags) ? updates.tags : [];

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
      difficulty: card.difficulty,
      specialty: card.specialty || specialty || null,
      sub_specialty: card.sub_specialty || subSpecialty || null,
      theme: card.theme || theme || null,
      tags: Array.isArray(card.tags) ? card.tags : [],
      notes: card.notes || null,
      review_state: card.review_state || {},
      review_stats: card.review_stats || {},
      sort_order: index,
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

async function callGeminiWithModel(modelName, payload) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

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
- Use quantidade proporcional à riqueza do texto. Em geral, produza entre 12 e 30 cards.
- Evite cards triviais, vagos ou repetitivos.
- Cada card deve cobrar uma ideia central, objetiva e útil.
- A pergunta deve ser clara, específica e com cara de revisão de residência.
- A resposta deve ser curta, correta e de alta retenção.
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
              },
              required: ['pergunta', 'resposta', 'nota_preceptor', 'difficulty'],
            },
          },
        },
        required: ['flashcards'],
      },
    },
  };

  const errors = [];

  for (const modelName of GEMINI_MODELS) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        console.log(`🧠 Gemini: tentando modelo ${modelName} (${attempt}/${maxAttempts})...`);

        const data = await callGeminiWithModel(modelName, payload);
        const jsonText = stripMarkdownJsonFence(getGeminiText(data));
        const parsed = parseJsonSafe(jsonText);

        if (!parsed?.flashcards || !Array.isArray(parsed.flashcards)) {
          throw new Error('O Gemini não retornou flashcards válidos.');
        }

        return {
          flashcards: parsed.flashcards,
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

  return data;
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

  return data;
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

  return data;
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

  for (const modelName of GEMINI_MODELS) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await callGeminiWithModel(modelName, payload);
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

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    transcription: 'deepgram',
    flashcardsModels: GEMINI_MODELS,
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

app.delete('/api/flashcard-decks/:id', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Supabase não configurado no backend.');
    }

    const { id } = req.params;

    await supabase
      .from('flashcards_library')
      .update({
        deck_id: null,
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('deck_id', id);

    const { error } = await supabase
      .from('flashcard_decks')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return res.json({ ok: true });
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
      .limit(Math.min(Math.max(Number(limit || 300), 1), 500));

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

    const analytics = await getLibraryAnalytics({
      specialty,
    });

    return res.json(analytics);
  } catch (error) {
    console.error('❌ Erro ao carregar analytics da biblioteca:', error.message);
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
    const updatedRun = await updateStudyRunEnrichedFlashcards(
      run.id,
      result.flashcards,
      result.modelUsed
    );

    try {
      await saveFlashcardsToLibrary({
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
    } catch (libraryError) {
      console.warn(
        '⚠️ Falha ao salvar flashcards enriquecidos na biblioteca:',
        libraryError.message
      );
    }

    return res.json({
      run: updatedRun,
      flashcards: updatedRun.enriched_flashcards || [],
      enrichedFlashcardsGeneratedAt: updatedRun.enriched_flashcards_generated_at,
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
          pergunta: `Como usar o mnemônico "${title}"?`,
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
        };
      })
      .filter((card) => card.pergunta && card.resposta);

    const existingFlashcards = Array.isArray(run.enriched_flashcards)
      ? run.enriched_flashcards
      : Array.isArray(run.flashcards)
        ? run.flashcards
        : [];

    const existingQuestions = new Set(
      existingFlashcards.map((card) =>
        String(card.question || card.pergunta || '').trim().toLowerCase()
      )
    );

    const uniqueMnemonicFlashcards = mnemonicFlashcards.filter((card) => {
      const question = String(card.pergunta || '').trim().toLowerCase();
      return question && !existingQuestions.has(question);
    });

    const mergedFlashcards = [...existingFlashcards, ...uniqueMnemonicFlashcards];

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

    return res.json({
      run: updatedRun,
      mnemonicFlashcards: uniqueMnemonicFlashcards,
      flashcards: updatedRun.enriched_flashcards || [],
      enrichedFlashcardsGeneratedAt: updatedRun.enriched_flashcards_generated_at,
    });
  } catch (error) {
    console.error('❌ Erro ao gerar flashcards dos mnemônicos:', error.message);
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
        };
      })
      .filter((card) => card.pergunta && card.resposta);

    const existingFlashcards = Array.isArray(run.enriched_flashcards)
      ? run.enriched_flashcards
      : Array.isArray(run.flashcards)
        ? run.flashcards
        : [];

    const existingQuestions = new Set(
      existingFlashcards.map((card) =>
        String(card.question || card.pergunta || '').trim().toLowerCase()
      )
    );

    const uniqueMnemonicFlashcards = mnemonicFlashcards.filter((card) => {
      const question = String(card.pergunta || '').trim().toLowerCase();
      return question && !existingQuestions.has(question);
    });

    if (!uniqueMnemonicFlashcards.length) {
      return res.json({
        run,
        mnemonicFlashcards: [],
        flashcards: existingFlashcards,
        message: 'Os flashcards de mnemônicos já existiam para esta execução.',
      });
    }

    const mergedFlashcards = [...existingFlashcards, ...uniqueMnemonicFlashcards];

    const updatedRun = await updateStudyRunEnrichedFlashcards(
      run.id,
      mergedFlashcards,
      'mnemonic-builder'
    );

    try {
      await saveFlashcardsToLibrary({
        theme:
          Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 1
            ? updatedRun.secondary_topics[1]
            : 'Mnemônicos',
        runId: updatedRun.id,
        flashcards: uniqueMnemonicFlashcards,
        specialty: updatedRun.specialty || 'Clínica Médica',
        subSpecialty:
          Array.isArray(updatedRun.secondary_topics) && updatedRun.secondary_topics.length > 0
            ? updatedRun.secondary_topics[0]
            : '',
      });
    } catch (libraryError) {
      console.warn(
        '⚠️ Falha ao salvar flashcards de mnemônicos na biblioteca:',
        libraryError.message
      );
    }

    return res.json({
      run: updatedRun,
      mnemonicFlashcards: uniqueMnemonicFlashcards,
      flashcards: updatedRun.enriched_flashcards || [],
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