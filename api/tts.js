// api/tts.js
// Vercel Serverless Function (Node.js)

const BASE_URL = 'https://abeshinzo0708-abe-voice-server.hf.space';
const DEFAULT_SPEAKER = 1099527840;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toNumber(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    return req.body.length ? JSON.parse(req.body) : {};
  }
  // Vercel環境によっては Buffer のことがある
  if (Buffer.isBuffer(req.body)) {
    const s = req.body.toString('utf8');
    return s.length ? JSON.parse(s) : {};
  }
  // すでにobjectとしてパース済みのケース
  if (typeof req.body === 'object') return req.body;

  return {};
}

async function fetchWithRetry(url, options, retry = {}) {
  const {
    retries = 3,
    timeoutMs = 20000,
    retryStatuses = [502, 503, 504],
    backoffBaseMs = 500
  } = retry;

  let lastRes = null;
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      lastRes = res;

      if (res.ok) return res;

      // 一時的な障害だけリトライ
      if (!retryStatuses.includes(res.status) || i === retries) return res;

      await sleep(backoffBaseMs * Math.pow(2, i));
    } catch (err) {
      lastErr = err;
      if (i === retries) throw err;
      await sleep(backoffBaseMs * Math.pow(2, i));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastErr) throw lastErr;
  return lastRes;
}

async function respondUpstreamError(res, stepName, upstreamRes) {
  const upstreamStatus = upstreamRes?.status;
  const upstreamStatusText = upstreamRes?.statusText;

  let upstreamBody = '';
  try {
    upstreamBody = await upstreamRes.text();
  } catch (_) {
    upstreamBody = '';
  }

  console.error(`[${stepName}] upstream error`, {
    upstreamStatus,
    upstreamStatusText,
    upstreamBody
  });

  // だいたい upstream 側の問題なので 502 にする（デバッグもしやすい）
  return res.status(502).json({
    error: `${stepName} failed`,
    upstreamStatus,
    upstreamStatusText,
    upstreamBody
  });
}

export default async function handler(req, res) {
  // 必要ならCORS（同一オリジンだけなら不要だけど、困らないように付けておく）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  let body;
  try {
    body = parseBody(req);
  } catch (err) {
    console.error('Invalid JSON body:', err);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const text = typeof body?.text === 'string' ? body.text : '';
  const speaker = toNumber(body?.speaker, DEFAULT_SPEAKER);
  const speed = toNumber(body?.speed, 1.0);
  const pitch = toNumber(body?.pitch, 0.0);

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  // HF Space が private / token必須なら Vercel に HF_TOKEN を設定する
  const HF_TOKEN = process.env.HF_TOKEN;
  const authHeaders = HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};

  try {
    // Step1: audio_query
    const queryRes = await fetchWithRetry(
      `${BASE_URL}/audio_query`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, speaker })
      },
      { retries: 3, timeoutMs: 20000 }
    );

    if (!queryRes.ok) {
      return await respondUpstreamError(res, 'audio_query', queryRes);
    }

    let query;
    try {
      query = await queryRes.json();
    } catch (err) {
      console.error('audio_query JSON parse error:', err);
      return res.status(502).json({ error: 'audio_query returned invalid JSON' });
    }

    // パラメータ調整
    query.speedScale = speed;
    query.pitchScale = pitch;

    // Step2: synthesis
    const synthRes = await fetchWithRetry(
      `${BASE_URL}/synthesis`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          Accept: 'audio/wav'
        },
        body: JSON.stringify(query)
      },
      { retries: 3, timeoutMs: 30000 }
    );

    if (!synthRes.ok) {
      return await respondUpstreamError(res, 'synthesis', synthRes);
    }

    const buffer = Buffer.from(await synthRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('tts handler error:', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}