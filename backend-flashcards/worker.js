require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

function cleanEnv(value = '') {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\r?\n/g, '');
}

const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const R2_ACCOUNT_ID = cleanEnv(process.env.R2_ACCOUNT_ID);
const R2_ACCESS_KEY_ID = cleanEnv(process.env.R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = cleanEnv(process.env.R2_SECRET_ACCESS_KEY);
const R2_BUCKET_NAME = cleanEnv(process.env.R2_BUCKET_NAME);
const R2_PUBLIC_BASE_URL = cleanEnv(process.env.R2_PUBLIC_BASE_URL);

const DEEPGRAM_API_KEY = cleanEnv(process.env.DEEPGRAM_API_KEY);
const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY);
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const REQUEST_TIMEOUT_MS = Number(process.env.WORKER_REQUEST_TIMEOUT_MS || 10 * 60 * 1000);
const AUDIO_SEGMENT_SECONDS = Number(process.env.AUDIO_SEGMENT_SECONDS || 15 * 60);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos.');
}

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  throw new Error('Variáveis do Cloudflare R2 incompletas.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function buildR2PublicUrl(key) {
  return R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : null;
}

function safeDelete(localPath) {
  try {
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } catch {}
}

function buildTranscriptPreview(text, maxLength = 180) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();

  if (!cleaned) return '';

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function stripMarkdownJsonFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida em JSON: ${String(text).slice(0, 300)}`);
  }
}

function parseGeminiJson(text) {
  const cleaned = stripMarkdownJsonFence(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObject = cleaned.indexOf('{');
    const lastObject = cleaned.lastIndexOf('}');

    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(cleaned.slice(firstObject, lastObject + 1));
    }

    const firstArray = cleaned.indexOf('[');
    const lastArray = cleaned.lastIndexOf(']');

    if (firstArray >= 0 && lastArray > firstArray) {
      return JSON.parse(cleaned.slice(firstArray, lastArray + 1));
    }

    throw new Error(`Não foi possível interpretar JSON do Gemini: ${cleaned.slice(0, 300)}`);
  }
}

function getGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function extractTranscriptFromDeepgram(data) {
  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
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

async function updateJob(id, updates) {
  const { data, error } = await supabase
    .from('processing_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function claimNextJob() {
  const { data: jobs, error } = await supabase
    .from('processing_jobs')
    .select('*')
    .in('status', ['uploaded', 'queued'])
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!jobs?.length) return null;

  const job = jobs[0];

  return await updateJob(job.id, {
    status: 'processing',
    current_step: 'Iniciando processamento.',
    progress: 10,
    started_at: new Date().toISOString(),
    error_message: null,
  });
}

async function downloadR2ObjectToFile(key, localPath) {
  const response = await r2.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath);
    response.Body.pipe(writeStream);
    response.Body.on('error', reject);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

function convertVideoToMp3(inputPath, outputPath) {
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

async function uploadAudioToR2(localPath, jobId) {
  const key = `audio/${jobId}/audio.mp3`;
  const stats = fs.statSync(localPath);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: 'audio/mpeg',
    })
  );

  return {
    audio_object_key: key,
    audio_url: buildR2PublicUrl(key),
    audio_storage_provider: 'cloudflare-r2',
    audio_mime_type: 'audio/mpeg',
    audio_size_bytes: stats.size,
  };
}

function formatSegmentNumber(index) {
  return String(index + 1).padStart(3, '0');
}

function listSegmentFiles(segmentsDir) {
  return fs
    .readdirSync(segmentsDir)
    .filter((filename) => filename.endsWith('.mp3'))
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => path.join(segmentsDir, filename));
}

function splitAudioIntoSegments(inputPath, segmentsDir, segmentSeconds = AUDIO_SEGMENT_SECONDS) {
  fs.mkdirSync(segmentsDir, { recursive: true });

  const segmentPattern = path.join(segmentsDir, 'segment-%03d.mp3');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('segment')
      .outputOptions([
        `-segment_time ${segmentSeconds}`,
        '-reset_timestamps 1',
      ])
      .output(segmentPattern)
      .on('end', () => {
        const segmentFiles = listSegmentFiles(segmentsDir);

        if (!segmentFiles.length) {
          reject(new Error('Nenhum segmento de áudio foi gerado pelo FFmpeg.'));
          return;
        }

        resolve(segmentFiles);
      })
      .on('error', reject)
      .run();
  });
}

async function uploadAudioSegmentToR2(localPath, jobId, segmentIndex) {
  const segmentNumber = formatSegmentNumber(segmentIndex);
  const key = `audio-segments/${jobId}/segment-${segmentNumber}.mp3`;
  const stats = fs.statSync(localPath);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: 'audio/mpeg',
    })
  );

  return {
    audio_object_key: key,
    audio_url: buildR2PublicUrl(key),
    audio_mime_type: 'audio/mpeg',
    audio_size_bytes: stats.size,
  };
}

async function clearTranscriptSegmentsForJob(jobId) {
  const { error } = await supabase
    .from('transcript_segments')
    .delete()
    .eq('processing_job_id', jobId);

  if (error) {
    throw new Error(`Falha ao limpar segmentos anteriores: ${error.message}`);
  }
}

async function createTranscriptSegmentRecord({
  jobId,
  segmentIndex,
  audioObjectKey,
  audioUrl,
  audioMimeType,
  audioSizeBytes,
}) {
  const { data, error } = await supabase
    .from('transcript_segments')
    .insert({
      processing_job_id: jobId,
      segment_index: segmentIndex + 1,
      start_seconds: segmentIndex * AUDIO_SEGMENT_SECONDS,
      end_seconds: (segmentIndex + 1) * AUDIO_SEGMENT_SECONDS,
      audio_object_key: audioObjectKey,
      audio_url: audioUrl,
      audio_mime_type: audioMimeType || 'audio/mpeg',
      audio_size_bytes: audioSizeBytes || null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao criar segmento de transcrição: ${error.message}`);
  }

  return data;
}

async function updateTranscriptSegmentRecord(segmentId, updates = {}) {
  const { data, error } = await supabase
    .from('transcript_segments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', segmentId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar segmento de transcrição: ${error.message}`);
  }

  return data;
}

async function attachSegmentsToStudyRun(jobId, studyRunId) {
  const { error } = await supabase
    .from('transcript_segments')
    .update({
      study_run_id: studyRunId,
      updated_at: new Date().toISOString(),
    })
    .eq('processing_job_id', jobId);

  if (error) {
    throw new Error(`Falha ao vincular segmentos ao estudo: ${error.message}`);
  }
}

async function transcribeAudioForJob({ job, localAudioPath, workDir }) {
  const segmentsDir = path.join(workDir, 'segments');

  await updateJob(job.id, {
    status: 'processing',
    current_step: 'Dividindo áudio em segmentos.',
    progress: 41,
  });

  await clearTranscriptSegmentsForJob(job.id);

  const segmentFiles = await splitAudioIntoSegments(localAudioPath, segmentsDir);
  const totalSegments = segmentFiles.length;
  const transcripts = [];

  await updateJob(job.id, {
    status: 'processing',
    current_step:
      totalSegments === 1
        ? 'Áudio curto detectado. Transcrevendo em uma parte.'
        : `Áudio dividido em ${totalSegments} partes. Iniciando transcrição.`,
    progress: 42,
  });

  for (let index = 0; index < segmentFiles.length; index += 1) {
    const segmentPath = segmentFiles[index];
    const segmentNumber = index + 1;

    const uploadedSegment = await uploadAudioSegmentToR2(segmentPath, job.id, index);

    const segmentRecord = await createTranscriptSegmentRecord({
      jobId: job.id,
      segmentIndex: index,
      audioObjectKey: uploadedSegment.audio_object_key,
      audioUrl: uploadedSegment.audio_url,
      audioMimeType: uploadedSegment.audio_mime_type,
      audioSizeBytes: uploadedSegment.audio_size_bytes,
    });

    const progress = Math.min(
      58,
      42 + Math.round((segmentNumber / totalSegments) * 16)
    );

    await updateJob(job.id, {
      status: 'processing',
      current_step: `Transcrevendo parte ${segmentNumber} de ${totalSegments}.`,
      progress,
    });

    await updateTranscriptSegmentRecord(segmentRecord.id, {
      status: 'processing',
      started_at: new Date().toISOString(),
    });

    try {
      const segmentTranscript = await transcribeAudioWithDeepgram(segmentPath);

      transcripts.push(segmentTranscript);

      await updateTranscriptSegmentRecord(segmentRecord.id, {
        status: 'completed',
        transcript: segmentTranscript,
        transcript_preview: buildTranscriptPreview(segmentTranscript),
        finished_at: new Date().toISOString(),
        error_message: null,
      });
    } catch (segmentError) {
      await updateTranscriptSegmentRecord(segmentRecord.id, {
        status: 'error',
        error_message: segmentError.message,
        finished_at: new Date().toISOString(),
      });

      throw new Error(
        `Falha ao transcrever parte ${segmentNumber} de ${totalSegments}: ${segmentError.message}`
      );
    }
  }

  const finalTranscript = transcripts
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!finalTranscript) {
    throw new Error('Nenhum texto foi gerado a partir dos segmentos de áudio.');
  }

  await updateJob(job.id, {
    status: 'processing',
    current_step: 'Transcrição por segmentos concluída. Juntando texto final.',
    progress: 60,
  });

  return finalTranscript;
}

async function deleteR2Object(key) {
  if (!key) return;

  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

async function transcribeAudioWithDeepgram(audioPath) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY não definida.');
  }

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
    body: fs.createReadStream(audioPath),
    duplex: 'half',
  });

  const rawText = await response.text();
  const data = parseJsonSafe(rawText);

  if (!response.ok) {
    const message =
      data?.err_msg ||
      data?.error ||
      data?.message ||
      'Falha ao transcrever com Deepgram.';

    throw new Error(`Deepgram ${response.status}: ${message}`);
  }

  const transcript = extractTranscriptFromDeepgram(data);

  if (!transcript || !transcript.trim()) {
    throw new Error('O Deepgram não retornou uma transcrição válida.');
  }

  return transcript.trim();
}

async function callGeminiWithModel(modelName, payload) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não definida.');
  }

  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent` +
    `?key=${GEMINI_API_KEY}`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const data = parseJsonSafe(rawText);

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Falha na chamada ao Gemini.');
    error.statusCode = response.status;
    error.responseData = data;
    throw error;
  }

  return {
    data,
    modelUsed: modelName,
    text: getGeminiText(data),
  };
}

async function callGeminiWithFallback(payload) {
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      return await callGeminiWithModel(modelName, payload);
    } catch (error) {
      lastError = error;

      if (!isRetryableGeminiError(error.statusCode, error.message)) {
        throw error;
      }

      console.warn(
        `⚠️ Gemini indisponível no modelo ${modelName}. Tentando próximo modelo:`,
        error.message
      );
    }
  }

  throw lastError || new Error('Falha ao chamar Gemini.');
}

async function classifyTranscriptMetadata(transcript) {
  const prompt = `
Você é um classificador de conteúdo médico para um sistema de flashcards.

Analise a transcrição abaixo e retorne APENAS JSON válido, sem markdown.

Formato obrigatório:
{
  "specialty": "Nome da especialidade principal",
  "secondary_topics": ["tema 1", "tema 2", "tema 3"],
  "auto_tags": ["tag 1", "tag 2", "tag 3"],
  "study_tag": "tag curta principal"
}

Regras:
- Use português do Brasil.
- A especialidade deve ser curta e útil para organização de biblioteca.
- secondary_topics deve ter de 2 a 6 temas relevantes.
- auto_tags deve ter de 3 a 10 tags.
- study_tag deve ser uma tag curta e específica.

Transcrição:
${transcript}
`.trim();

  const result = await callGeminiWithFallback({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const parsed = parseGeminiJson(result.text);

  return {
    specialty: String(parsed.specialty || 'Clínica Médica').trim() || 'Clínica Médica',
    secondary_topics: Array.isArray(parsed.secondary_topics)
      ? parsed.secondary_topics.map((item) => String(item).trim()).filter(Boolean)
      : [],
    auto_tags: Array.isArray(parsed.auto_tags)
      ? parsed.auto_tags.map((item) => String(item).trim()).filter(Boolean)
      : [],
    study_tag: String(parsed.study_tag || '').trim(),
    modelUsed: result.modelUsed,
  };
}

function normalizeGeneratedFlashcards(rawFlashcards = []) {
  if (!Array.isArray(rawFlashcards)) return [];

  return rawFlashcards
    .map((card, index) => {
      const question = String(card.question || card.pergunta || '').trim();
      const answer = String(card.answer || card.resposta || '').trim();

      if (!question || !answer) return null;

      return {
        id: card.id || `generated-${Date.now()}-${index}`,
        question,
        answer,
        nota_preceptor:
          card.nota_preceptor ||
          card.preceptor_note ||
          card.preceptorNote ||
          null,
        difficulty: card.difficulty || 'medium',
        tags: Array.isArray(card.tags)
          ? card.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
        reviewed: true,
      };
    })
    .filter(Boolean);
}

async function generateFlashcardsWithGemini(transcript) {
  const wordCount = String(transcript || '').trim().split(/\s+/).filter(Boolean).length;

  const targetCards =
    wordCount > 6000 ? '40 a 70' :
    wordCount > 3000 ? '30 a 55' :
    wordCount > 1200 ? '20 a 40' :
    '12 a 25';

  const prompt = `
Você é um professor médico especialista em preparar alunos para residência médica.

Crie flashcards de alta qualidade a partir da transcrição abaixo.

Retorne APENAS JSON válido, sem markdown.

Formato obrigatório:
{
  "flashcards": [
    {
      "question": "Pergunta objetiva e testável",
      "answer": "Resposta completa, didática e clinicamente útil",
      "difficulty": "easy | medium | hard",
      "tags": ["tema", "subtema"],
      "nota_preceptor": "Comentário curto explicando a relevância clínica ou pegadinha de prova"
    }
  ]
}

Regras:
- Criar aproximadamente ${targetCards} flashcards, desde que haja conteúdo suficiente.
- Priorizar conceitos testáveis, condutas, diferenciais, critérios diagnósticos, armadilhas e raciocínio clínico.
- Evitar flashcards vagos.
- Não inventar informações que não estejam sustentadas pela transcrição.
- Usar português do Brasil.
- Respostas devem ser completas, mas não excessivamente longas.
- Se houver listas, organize de forma clara.

Transcrição:
${transcript}
`.trim();

  const result = await callGeminiWithFallback({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: 'application/json',
    },
  });

  const parsed = parseGeminiJson(result.text);
  const flashcards = normalizeGeneratedFlashcards(parsed.flashcards || parsed.cards || []);

  if (!flashcards.length) {
    throw new Error('Gemini não retornou flashcards válidos.');
  }

  return {
    flashcards,
    modelUsed: result.modelUsed,
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
  if (!deckId) return;

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

  const { data: existingDeck, error: existingDeckError } =
    await existingDeckQuery.maybeSingle();

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
  let finalDeck = specialtyDeck;

  if (safeSubSpecialty) {
    const subSpecialtyDeck = await resolveOrCreateDeck({
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
    const themeDeck = await resolveOrCreateDeck({
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
    finalDeck,
  };
}

function normalizeLibraryFlashcard(card = {}, index = 0) {
  return {
    question: card.question ?? card.pergunta ?? '',
    answer: card.answer ?? card.resposta ?? '',
    preceptor_note:
      card.preceptorNote ??
      card.nota_preceptor ??
      card.preceptor_note ??
      null,
    difficulty: card.difficulty || 'medium',
    specialty: card.specialty || null,
    sub_specialty: card.subSpecialty ?? card.sub_specialty ?? null,
    tags: Array.isArray(card.tags) ? card.tags : [],
    review_state: card.review_state || {},
    review_stats: card.review_stats || {},
    sort_order: index,
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

async function createStudyRunFromJob({
  job,
  transcript,
  audioData,
  metadata,
}) {
  const shouldGenerateFlashcards = shouldGenerateFlashcardsForJob(job);

  const payload = {
    original_filename: job.original_filename || 'Aula enviada',
    transcript,
    transcript_preview: buildTranscriptPreview(transcript),

    flashcards: [],

    transcription_provider: 'deepgram',
    flashcards_provider: shouldGenerateFlashcards ? 'gemini' : 'none',
    flashcards_model: shouldGenerateFlashcards ? 'pending' : 'not_requested',

    video_url: null,
    video_object_key: null,
    video_storage_provider: null,

    audio_storage_provider: audioData.audio_storage_provider || 'cloudflare-r2',
    audio_object_key: audioData.audio_object_key || null,
    audio_url: audioData.audio_url || null,
    audio_mime_type: audioData.audio_mime_type || 'audio/mpeg',
    audio_size_bytes: audioData.audio_size_bytes || null,

    original_file_size: job.original_file_size || null,
    original_mime_type: job.original_mime_type || null,

    source_video_discarded: false,
    source_video_discarded_at: null,
    processing_job_id: job.id,

    specialty: metadata.specialty || 'Clínica Médica',
    secondary_topics: Array.isArray(metadata.secondary_topics)
      ? metadata.secondary_topics
      : [],
    auto_tags: Array.isArray(metadata.auto_tags)
      ? metadata.auto_tags
      : [],
    study_tag: metadata.study_tag || '',
  };

  const { data, error } = await supabase
    .from('study_runs')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao criar estudo no histórico: ${error.message}`);
  }

  return data;
}

async function updateStudyRun(id, updates = {}) {
  const { data, error } = await supabase
    .from('study_runs')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar estudo: ${error.message}`);
  }

  return data;
}

function shouldGenerateFlashcardsForJob(job) {
  return (
    job.generate_flashcards === true ||
    job.should_generate_flashcards === true ||
    String(job.flashcards_provider || '').toLowerCase() === 'gemini'
  );
}

async function processJob(job) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `job-${job.id}-`));
  const localVideoPath = path.join(workDir, 'source-video');
  const localAudioPath = path.join(workDir, 'audio.mp3');

  let studyRun = null;
  let audioData = null;
  let sourceVideoDiscarded = false;

  try {
    await updateJob(job.id, {
      status: 'processing',
      current_step: 'Baixando vídeo temporário do R2.',
      progress: 15,
    });

    await downloadR2ObjectToFile(job.temp_video_object_key, localVideoPath);

    await updateJob(job.id, {
      status: 'processing',
      current_step: 'Extraindo áudio do vídeo.',
      progress: 25,
    });

    await convertVideoToMp3(localVideoPath, localAudioPath);

    await updateJob(job.id, {
      status: 'processing',
      current_step: 'Salvando áudio permanente.',
      progress: 35,
    });

    audioData = await uploadAudioToR2(localAudioPath, job.id);

    await updateJob(job.id, {
      ...audioData,
      status: 'processing',
      current_step: 'Áudio salvo. Transcrevendo com Deepgram.',
      progress: 40,
    });

    const transcript = await transcribeAudioForJob({
      job,
      localAudioPath,
      workDir,
    });

    await updateJob(job.id, {
      transcript,
      transcript_preview: buildTranscriptPreview(transcript),
      status: 'processing',
      current_step: 'Transcrição concluída. Classificando conteúdo.',
      progress: 60,
    });

    let metadata = {
      specialty: 'Clínica Médica',
      secondary_topics: [],
      auto_tags: [],
      study_tag: '',
      modelUsed: null,
    };

    try {
      metadata = await classifyTranscriptMetadata(transcript);
    } catch (metadataError) {
      console.warn(
        `⚠️ Falha ao classificar metadados do job ${job.id}:`,
        metadataError.message
      );
    }

    await updateJob(job.id, {
      specialty: metadata.specialty,
      secondary_topics: metadata.secondary_topics,
      auto_tags: metadata.auto_tags,
      status: 'processing',
      current_step: 'Criando estudo no histórico.',
      progress: 70,
    });

    studyRun = await createStudyRunFromJob({
      job,
      transcript,
      audioData,
      metadata,
    });

    try {
      await attachSegmentsToStudyRun(job.id, studyRun.id);
    } catch (segmentAttachError) {
      console.warn(
        `⚠️ Estudo criado, mas falha ao vincular segmentos ao estudo ${studyRun.id}:`,
        segmentAttachError.message
      );
    }

    await updateJob(job.id, {
      study_run_id: studyRun.id,
      status: 'processing',
      current_step: shouldGenerateFlashcardsForJob(job)
        ? 'Estudo criado. Gerando flashcards com Gemini.'
        : 'Estudo criado. Finalizando processamento.',
      progress: shouldGenerateFlashcardsForJob(job) ? 78 : 88,
    });

    let generatedFlashcards = [];
    let flashcardsModelUsed = null;

    if (shouldGenerateFlashcardsForJob(job)) {
      const flashcardResult = await generateFlashcardsWithGemini(transcript);
      generatedFlashcards = flashcardResult.flashcards;
      flashcardsModelUsed = flashcardResult.modelUsed;

      await updateStudyRun(studyRun.id, {
        flashcards: generatedFlashcards,
        flashcards_provider: 'gemini',
        flashcards_model: flashcardsModelUsed || 'gemini',
      });

      await updateJob(job.id, {
        flashcards: generatedFlashcards,
        flashcards_model: flashcardsModelUsed,
        status: 'processing',
        current_step: 'Flashcards gerados. Salvando na biblioteca.',
        progress: 88,
      });

      await saveFlashcardsToLibrary({
        runId: studyRun.id,
        flashcards: generatedFlashcards,
        specialty: metadata.specialty || 'Clínica Médica',
        subSpecialty:
          Array.isArray(metadata.secondary_topics) && metadata.secondary_topics.length > 0
            ? metadata.secondary_topics[0]
            : '',
        theme:
          Array.isArray(metadata.secondary_topics) && metadata.secondary_topics.length > 1
            ? metadata.secondary_topics[1]
            : metadata.study_tag || '',
      });
    }

    await updateJob(job.id, {
      status: 'processing',
      current_step: 'Removendo vídeo temporário.',
      progress: 95,
    });

    try {
      await deleteR2Object(job.temp_video_object_key);
      sourceVideoDiscarded = true;
    } catch (cleanupError) {
      sourceVideoDiscarded = false;

      console.warn(
        `⚠️ Estudo criado, mas falha ao remover vídeo temporário do job ${job.id}:`,
        cleanupError.message
      );
    }

    if (studyRun?.id) {
      await updateStudyRun(studyRun.id, {
        source_video_discarded: sourceVideoDiscarded,
        source_video_discarded_at: sourceVideoDiscarded
          ? new Date().toISOString()
          : null,
      });
    }

    await updateJob(job.id, {
      status: 'completed',
      current_step: sourceVideoDiscarded
        ? 'Processamento concluído. Estudo pronto.'
        : 'Processamento concluído, mas o vídeo temporário não foi removido automaticamente.',
      progress: 100,
      source_video_discarded: sourceVideoDiscarded,
      source_video_discarded_at: sourceVideoDiscarded
        ? new Date().toISOString()
        : null,
      study_run_id: studyRun?.id || null,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ Erro no job ${job.id}:`, error.message);

    await updateJob(job.id, {
      status: 'error',
      current_step: 'Erro no processamento.',
      error_message: error.message,
    });
  } finally {
    safeDelete(localVideoPath);
    safeDelete(localAudioPath);

    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

async function mainLoop() {
  console.log('👷 Worker de processamento iniciado.');

  while (true) {
    try {
      const job = await claimNextJob();

      if (job) {
        console.log(`▶️ Processando job ${job.id}`);
        await processJob(job);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('❌ Erro no worker:', error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

mainLoop();