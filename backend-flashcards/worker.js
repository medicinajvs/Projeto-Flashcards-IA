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
const ffprobeStatic = require('@ffprobe-installer/ffprobe');

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
} else if (ffprobeStatic?.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
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

function parseCommaList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => cleanEnv(item))
    .filter(Boolean);
}

function uniqueList(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

const GEMINI_API_KEYS = uniqueList([
  ...parseCommaList(process.env.GEMINI_API_KEYS),
  cleanEnv(process.env.GEMINI_API_KEY),
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

const REQUEST_TIMEOUT_MS = Number(process.env.WORKER_REQUEST_TIMEOUT_MS || 10 * 60 * 1000);
const TRANSCRIPTION_CONCURRENCY = Number(process.env.TRANSCRIPTION_CONCURRENCY || 2);
const SAVE_AUDIO_SEGMENTS_TO_R2 =
  String(process.env.SAVE_AUDIO_SEGMENTS_TO_R2 || 'false').toLowerCase() === 'true';
const AUDIO_SEGMENT_SECONDS = Number(process.env.AUDIO_SEGMENT_SECONDS || 15 * 60);
const STALE_PROCESSING_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 180);
const STALE_QUEUE_NOTICE_MINUTES = Number(process.env.STALE_QUEUE_NOTICE_MINUTES || 30);

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
  const { data, error } = await supabase.rpc('claim_next_processing_job');

  if (error) {
    throw new Error(error.message);
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

async function recoverStaleJobs() {
  const now = Date.now();

  const processingCutoff = new Date(
    now - STALE_PROCESSING_MINUTES * 60 * 1000
  ).toISOString();

  const queueCutoff = new Date(
    now - STALE_QUEUE_NOTICE_MINUTES * 60 * 1000
  ).toISOString();

  const { error: processingError } = await supabase
    .from('processing_jobs')
    .update({
      status: 'queued',
      current_step:
        'Processamento retomado automaticamente após demora excessiva.',
      progress: 5,
      started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('updated_at', processingCutoff);

  if (processingError) {
    console.warn(
      '⚠️ Falha ao recuperar jobs em processamento:',
      processingError.message
    );
  }

  const { error: queueError } = await supabase
    .from('processing_jobs')
    .update({
      status: 'queued',
      current_step:
        'Seu vídeo continua na fila. O sistema está aguardando um worker disponível.',
      updated_at: new Date().toISOString(),
    })
    .in('status', ['uploaded', 'queued'])
    .lt('updated_at', queueCutoff);

  if (queueError) {
    console.warn('⚠️ Falha ao atualizar jobs antigos na fila:', queueError.message);
  }
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

function getAudioDurationSeconds(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }

      const duration = Number(metadata?.format?.duration || 0);
      resolve(Number.isFinite(duration) ? duration : 0);
    });
  });
}

function cutAudioSegment(inputPath, outputPath, startSeconds, durationSeconds) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .duration(durationSeconds)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

async function runWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }).map(() => worker())
  );

  return results;
}

async function insertTranscriptSegment({
  processingJobId,
  segmentIndex,
  startSeconds,
  endSeconds,
  audioObjectKey = null,
  audioUrl = null,
  audioMimeType = 'audio/mpeg',
  audioSizeBytes = null,
}) {
  const { data, error } = await supabase
    .from('transcript_segments')
    .insert({
      processing_job_id: processingJobId,
      segment_index: segmentIndex,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      audio_object_key: audioObjectKey,
      audio_url: audioUrl,
      audio_mime_type: audioMimeType,
      audio_size_bytes: audioSizeBytes,
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao criar segmento de transcrição: ${error.message}`);
  }

  return data;
}

async function updateTranscriptSegment(segmentId, updates) {
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

async function attachTranscriptSegmentsToStudyRun(processingJobId, studyRunId) {
  if (!processingJobId || !studyRunId) return;

  const { error } = await supabase
    .from('transcript_segments')
    .update({
      study_run_id: studyRunId,
      updated_at: new Date().toISOString(),
    })
    .eq('processing_job_id', processingJobId);

  if (error) {
    throw new Error(`Falha ao vincular segmentos ao estudo: ${error.message}`);
  }
}

async function uploadAudioSegmentToR2(localPath, jobId, segmentIndex) {
  const key = `audio-segments/${jobId}/segment-${String(segmentIndex).padStart(3, '0')}.mp3`;
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

async function transcribeAudioInSegments({
  audioPath,
  workDir,
  jobId,
}) {
  const durationSeconds = await getAudioDurationSeconds(audioPath);

  if (!durationSeconds || durationSeconds <= AUDIO_SEGMENT_SECONDS) {
    await updateJob(jobId, {
      status: 'processing',
      current_step: 'Transcrevendo áudio com Deepgram.',
      progress: 45,
    });

    return await transcribeAudioWithDeepgram(audioPath);
  }

  const totalSegments = Math.ceil(durationSeconds / AUDIO_SEGMENT_SECONDS);

  const segments = Array.from({ length: totalSegments }).map((_, index) => {
    const startSeconds = index * AUDIO_SEGMENT_SECONDS;
    const endSeconds = Math.min(startSeconds + AUDIO_SEGMENT_SECONDS, durationSeconds);

    return {
      segmentIndex: index + 1,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      localPath: path.join(
        workDir,
        `segment-${String(index + 1).padStart(3, '0')}.mp3`
      ),
    };
  });

  await updateJob(jobId, {
    status: 'processing',
    current_step: `Dividindo áudio em ${totalSegments} partes para transcrição.`,
    progress: 42,
    audio_duration_seconds: Math.round(durationSeconds),
  });

  for (const segment of segments) {
    await cutAudioSegment(
      audioPath,
      segment.localPath,
      segment.startSeconds,
      segment.durationSeconds
    );
  }

  let completedCount = 0;

  const transcriptResults = await runWithConcurrency(
    segments,
    TRANSCRIPTION_CONCURRENCY,
    async (segment) => {
      let segmentRow = null;

      try {
        await updateJob(jobId, {
          status: 'processing',
          current_step: `Transcrevendo parte ${segment.segmentIndex} de ${totalSegments}.`,
          progress: Math.min(
            58,
            44 + Math.round((completedCount / totalSegments) * 14)
          ),
        });

        let segmentAudioData = {
          audio_object_key: null,
          audio_url: null,
          audio_mime_type: 'audio/mpeg',
          audio_size_bytes: fs.statSync(segment.localPath).size,
        };

        if (SAVE_AUDIO_SEGMENTS_TO_R2) {
          segmentAudioData = await uploadAudioSegmentToR2(
            segment.localPath,
            jobId,
            segment.segmentIndex
          );
        }

        segmentRow = await insertTranscriptSegment({
          processingJobId: jobId,
          segmentIndex: segment.segmentIndex,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          audioObjectKey: segmentAudioData.audio_object_key,
          audioUrl: segmentAudioData.audio_url,
          audioMimeType: segmentAudioData.audio_mime_type,
          audioSizeBytes: segmentAudioData.audio_size_bytes,
        });

        const transcript = await transcribeAudioWithDeepgram(segment.localPath);

        completedCount += 1;

        await updateTranscriptSegment(segmentRow.id, {
          transcript,
          transcript_preview: buildTranscriptPreview(transcript),
          status: 'completed',
          finished_at: new Date().toISOString(),
        });

        await updateJob(jobId, {
          status: 'processing',
          current_step: `Transcrição: ${completedCount} de ${totalSegments} partes concluídas.`,
          progress: Math.min(
            60,
            44 + Math.round((completedCount / totalSegments) * 16)
          ),
        });

        return {
          segmentIndex: segment.segmentIndex,
          transcript,
        };
      } catch (error) {
        if (segmentRow?.id) {
          await updateTranscriptSegment(segmentRow.id, {
            status: 'error',
            error_message: error.message,
            finished_at: new Date().toISOString(),
          });
        }

        throw error;
      } finally {
        safeDelete(segment.localPath);
      }
    }
  );

  return transcriptResults
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map((item) => item.transcript)
    .join('\n\n')
    .trim();
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

async function callGeminiWithModel(modelName, payload, apiKey = GEMINI_API_KEY) {
  if (!apiKey) {
    throw new Error('Nenhuma chave Gemini disponível.');
  }

  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent` +
    `?key=${apiKey}`;

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

  const result = await callGeminiWithFallback(
    {
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
    },
    GEMINI_METADATA_MODELS
  );

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

function extractFlashcardArrayFromGeminiPayload(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const directCandidates = [
    parsed.flashcards,
    parsed.cards,
    parsed.flashcard_list,
    parsed.study_cards,
    parsed.items,
    parsed.data?.flashcards,
    parsed.data?.cards,
    parsed.result?.flashcards,
    parsed.result?.cards,
    parsed.output?.flashcards,
    parsed.output?.cards,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  const seen = new Set();

  function findNestedFlashcards(value, depth = 0) {
    if (!value || depth > 4) return [];

    if (Array.isArray(value)) {
      const looksLikeFlashcards = value.some((item) => {
        if (!item || typeof item !== 'object') return false;

        return Boolean(
          item.question ||
            item.pergunta ||
            item.front ||
            item.prompt ||
            item.answer ||
            item.resposta ||
            item.back ||
            item.response
        );
      });

      return looksLikeFlashcards ? value : [];
    }

    if (typeof value !== 'object') return [];

    if (seen.has(value)) return [];
    seen.add(value);

    for (const child of Object.values(value)) {
      const found = findNestedFlashcards(child, depth + 1);

      if (found.length) {
        return found;
      }
    }

    return [];
  }

  return findNestedFlashcards(parsed);
}

function normalizeGeneratedFlashcards(rawFlashcards = []) {
  if (!Array.isArray(rawFlashcards)) return [];

  return rawFlashcards
    .map((card, index) => {
      const question = String(
        card.question ||
          card.pergunta ||
          card.front ||
          card.frente ||
          card.prompt ||
          card.enunciado ||
          card.ask ||
          ''
      ).trim();

      const answer = String(
        card.answer ||
          card.resposta ||
          card.back ||
          card.verso ||
          card.response ||
          card.explanation ||
          card.explicacao ||
          ''
      ).trim();

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

function countWords(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function calculateFlashcardTarget(wordCount = 0) {
  if (wordCount > 9000) return { min: 70, max: 110 };
  if (wordCount > 6000) return { min: 50, max: 85 };
  if (wordCount > 3000) return { min: 32, max: 55 };
  if (wordCount > 1200) return { min: 20, max: 35 };
  return { min: 10, max: 22 };
}

function splitTranscriptIntoWordChunks(text = '', maxWordsPerChunk = 1800) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);

  if (!words.length) return [];

  const chunks = [];

  for (let index = 0; index < words.length; index += maxWordsPerChunk) {
    chunks.push(words.slice(index, index + maxWordsPerChunk).join(' '));
  }

  return chunks;
}

function dedupeGeneratedFlashcards(cards = []) {
  const seen = new Set();

  return cards.filter((card) => {
    const key = String(card.question || card.pergunta || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key) return false;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function generateFlashcardsForTranscriptChunk({
  chunk,
  chunkIndex,
  totalChunks,
  minCards,
  maxCards,
}) {
  const prompt = `
Você é um professor médico especialista em preparar alunos para residência médica.

Crie flashcards de alta qualidade a partir deste trecho de uma transcrição maior.

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

Regras obrigatórias:
- Este é o bloco ${chunkIndex + 1} de ${totalChunks}.
- Gere entre ${minCards} e ${maxCards} flashcards para ESTE bloco.
- Não gere menos de ${minCards} flashcards, exceto se o trecho for realmente vazio ou sem conteúdo médico.
- Cubra todos os conceitos médicos testáveis do trecho.
- Priorize definições, critérios diagnósticos, manifestações clínicas, diagnóstico diferencial, condutas, contraindicações, complicações, pegadinhas de prova e raciocínio clínico.
- Evite flashcards vagos.
- Evite repetir perguntas dentro do mesmo bloco.
- Não invente informações fora da transcrição.
- Use português do Brasil.
- Respostas devem ser completas, mas não excessivamente longas.
- Se houver listas, organize de forma clara.
- Cada flashcard deve cobrar uma ideia central útil.

Trecho da transcrição:
${chunk}
`.trim();

  const attempts = 2;
  const errors = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await callGeminiWithFallback(
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    attempt === 1
                      ? prompt
                      : `${prompt}

ATENÇÃO: A tentativa anterior falhou ou gerou poucos flashcards.
Retorne JSON puro válido.
Gere obrigatoriamente entre ${minCards} e ${maxCards} flashcards, se houver conteúdo suficiente.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: attempt === 1 ? 0.35 : 0.2,
            responseMimeType: 'application/json',
          },
        },
        GEMINI_FLASHCARD_MODELS
      );

      const parsed = parseGeminiJson(result.text);
      const rawFlashcards = extractFlashcardArrayFromGeminiPayload(parsed);
      const flashcards = normalizeGeneratedFlashcards(rawFlashcards);

      if (!flashcards.length) {
        errors.push(`Tentativa ${attempt}: sem flashcards válidos.`);
        continue;
      }

      return {
        flashcards,
        modelUsed: result.modelUsed,
      };
    } catch (error) {
      errors.push(`Tentativa ${attempt}: ${error.message}`);
    }
  }

  console.warn(
    `⚠️ Falha ao gerar flashcards do bloco ${chunkIndex + 1}/${totalChunks}: ${errors.join(' | ')}`
  );

  return {
    flashcards: [],
    modelUsed: '',
  };
}

function countTranscriptWords(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function calculateFlashcardTargetByWordCount(wordCount = 0) {
  if (wordCount >= 10000) return { min: 75, max: 120 };
  if (wordCount >= 8000) return { min: 60, max: 100 };
  if (wordCount >= 6000) return { min: 45, max: 80 };
  if (wordCount >= 3000) return { min: 28, max: 55 };
  if (wordCount >= 1200) return { min: 18, max: 35 };
  return { min: 8, max: 18 };
}

function splitTranscriptIntoChunks(text = '', maxWordsPerChunk = 1200) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);

  if (!words.length) return [];

  const chunks = [];

  for (let index = 0; index < words.length; index += maxWordsPerChunk) {
    chunks.push(words.slice(index, index + maxWordsPerChunk).join(' '));
  }

  return chunks;
}

function extractFlashcardArrayFromGeminiPayload(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const candidates = [
    parsed.flashcards,
    parsed.cards,
    parsed.items,
    parsed.data?.flashcards,
    parsed.data?.cards,
    parsed.result?.flashcards,
    parsed.result?.cards,
    parsed.output?.flashcards,
    parsed.output?.cards,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function dedupeGeneratedFlashcards(cards = []) {
  const seen = new Set();

  return cards.filter((card) => {
    const key = String(card.question || card.pergunta || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key) return false;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function generateFlashcardsForChunk({
  chunk,
  chunkIndex,
  totalChunks,
  minCards,
  maxCards,
}) {
  const prompt = `
Você é um professor médico especialista em residência médica.

Você receberá UM BLOCO de uma transcrição maior.

Sua tarefa é criar flashcards de alta qualidade APENAS sobre este bloco.

Retorne APENAS JSON válido, sem markdown, sem comentários e sem texto fora do JSON.

Formato obrigatório:
{
  "flashcards": [
    {
      "question": "Pergunta objetiva e testável",
      "answer": "Resposta completa, didática e clinicamente útil",
      "difficulty": "easy | medium | hard",
      "tags": ["tema", "subtema"],
      "nota_preceptor": "Comentário curto explicando relevância clínica, pegadinha de prova ou raciocínio."
    }
  ]
}

Regras obrigatórias:
- Este é o bloco ${chunkIndex + 1} de ${totalChunks}.
- Gere de ${minCards} a ${maxCards} flashcards NESTE BLOCO.
- Não gere menos de ${minCards}, exceto se o bloco for praticamente vazio ou sem conteúdo médico.
- Cubra todos os conceitos testáveis do bloco.
- Priorize: definição, fisiopatologia, clínica, diagnóstico, critérios, diferenciais, conduta, contraindicação, complicações, prognóstico, pegadinhas e raciocínio clínico.
- Cada flashcard deve cobrar uma ideia central.
- Não resuma o bloco em poucos cards.
- Não crie flashcards genéricos.
- Não invente informação fora do bloco.
- Use português do Brasil.
- Use obrigatoriamente os campos "question" e "answer".
- Não use "pergunta" e "resposta"; use "question" e "answer".

Bloco da transcrição:
${chunk}
`.trim();

  const errors = [];
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await callGeminiWithFallback(
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    attempt === 1
                      ? prompt
                      : `${prompt}

ATENÇÃO: A tentativa anterior falhou ou gerou poucos flashcards.
Retorne JSON puro válido.
Gere obrigatoriamente de ${minCards} a ${maxCards} flashcards para este bloco, se houver conteúdo suficiente.
Não compacte demais.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: attempt === 1 ? 0.3 : 0.15,
            responseMimeType: 'application/json',
          },
        },
        GEMINI_FLASHCARD_MODELS
      );

      const parsed = parseGeminiJson(result.text);
      const rawFlashcards = extractFlashcardArrayFromGeminiPayload(parsed);
      const flashcards = normalizeGeneratedFlashcards(rawFlashcards);

      if (flashcards.length < Math.max(3, Math.floor(minCards * 0.6))) {
        errors.push(
          `Tentativa ${attempt}: gerou poucos flashcards (${flashcards.length}/${minCards}).`
        );
        continue;
      }

      return {
        flashcards,
        modelUsed: result.modelUsed,
      };
    } catch (error) {
      errors.push(`Tentativa ${attempt}: ${error.message}`);
    }
  }

  console.warn(
    `⚠️ Falha ou baixa geração no bloco ${chunkIndex + 1}/${totalChunks}: ${errors.join(' | ')}`
  );

  return {
    flashcards: [],
    modelUsed: '',
  };
}

async function generateFlashcardsWithGemini(transcript) {
  const wordCount = countTranscriptWords(transcript);
  const target = calculateFlashcardTargetByWordCount(wordCount);
  const chunks = splitTranscriptIntoChunks(transcript, 1200);

  if (!chunks.length) {
    throw new Error('Transcrição vazia para geração de flashcards.');
  }

  const totalChunks = chunks.length;

  const minPerChunk = Math.max(7, Math.floor(target.min / totalChunks));
  const maxPerChunk = Math.max(minPerChunk + 3, Math.ceil(target.max / totalChunks));

  console.log(
    `🧠 Gerando flashcards por blocos. Palavras: ${wordCount}. Blocos: ${totalChunks}. Meta final: ${target.min}-${target.max}. Meta por bloco: ${minPerChunk}-${maxPerChunk}.`
  );

  const allFlashcards = [];
  let modelUsed = '';

  for (let index = 0; index < chunks.length; index += 1) {
    console.log(`🧠 Gerando flashcards do bloco ${index + 1}/${totalChunks}...`);

    const result = await generateFlashcardsForChunk({
      chunk: chunks[index],
      chunkIndex: index,
      totalChunks,
      minCards: minPerChunk,
      maxCards: maxPerChunk,
    });

    if (result.modelUsed && !modelUsed) {
      modelUsed = result.modelUsed;
    }

    allFlashcards.push(...result.flashcards);

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const uniqueFlashcards = dedupeGeneratedFlashcards(allFlashcards);

  const absoluteMinimum = Math.max(10, Math.floor(target.min * 0.65));

  if (uniqueFlashcards.length < absoluteMinimum) {
    throw new Error(
      `Geração insuficiente de flashcards. Esperado pelo menos ${absoluteMinimum} para ${wordCount} palavras; gerado ${uniqueFlashcards.length}.`
    );
  }

  console.log(
    `✅ Flashcards gerados: ${uniqueFlashcards.length}. Meta: ${target.min}-${target.max}. Palavras: ${wordCount}.`
  );

  return {
    flashcards: uniqueFlashcards,
    modelUsed,
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
      current_step: 'Salvando áudio permanente e iniciando transcrição.',
      progress: 35,
    });

    const audioUploadPromise = uploadAudioToR2(localAudioPath, job.id);

    const transcript = await transcribeAudioInSegments({
      audioPath: localAudioPath,
      workDir,
      jobId: job.id,
    });

    audioData = await audioUploadPromise;

    await updateJob(job.id, {
      ...audioData,
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

    await attachTranscriptSegmentsToStudyRun(job.id, studyRun.id);

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
      try {
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
      } catch (flashcardError) {
        console.warn(
          `⚠️ Estudo ${studyRun.id} criado, mas falha ao gerar flashcards no job ${job.id}:`,
          flashcardError.message
        );

        await updateStudyRun(studyRun.id, {
          flashcards: [],
          flashcards_provider: 'gemini_failed',
          flashcards_model: 'failed',
        });

        await updateJob(job.id, {
          flashcards: [],
          flashcards_model: 'failed',
          status: 'processing',
          current_step:
            'Estudo salvo com transcrição. Os flashcards não foram gerados automaticamente.',
          error_message: `Flashcards não gerados: ${flashcardError.message}`,
          progress: 88,
        });
      }
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
      await recoverStaleJobs();

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