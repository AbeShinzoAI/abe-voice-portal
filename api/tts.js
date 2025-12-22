// Vercel Edge Runtime (高速)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text, speaker = 1099527840, speed = 1.0, pitch = 0.0 } = await req.json();

  const HF_TOKEN = process.env.HF_TOKEN;  // Vercel Secrets
  if (!HF_TOKEN) return res.status(500).json({ error: 'Token missing' });

  try {
    // Step1: audio_query
    const queryRes = await fetch('https://abeshinzo0708-abe-voice-server.hf.space/audio_query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, speaker })
    });
    const query = await queryRes.json();

    // パラメータ調整
    query.speedScale = speed;
    query.pitchScale = pitch;

    // Step2: synthesis
    const synthRes = await fetch('https://abeshinzo0708-abe-voice-server.hf.space/synthesis', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/wav'
      },
      body: JSON.stringify(query)
    });

    const audio = await synthRes.blob();
    res.setHeader('Content-Type', 'audio/wav');
    res.status(200).send(audio);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}