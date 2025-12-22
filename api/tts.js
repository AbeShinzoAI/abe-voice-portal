export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : req.body;

    const {
      text,
      speaker = 1099527840,
      speed = 1.0,
      pitch = 0.0
    } = body || {};

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // audio_query
    const queryRes = await fetch(
      'https://abeshinzo0708-abe-voice-server.hf.space/audio_query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker })
      }
    );

    if (!queryRes.ok) {
      throw new Error('audio_query failed');
    }

    const query = await queryRes.json();
    query.speedScale = speed;
    query.pitchScale = pitch;

    // synthesis
    const synthRes = await fetch(
      'https://abeshinzo0708-abe-voice-server.hf.space/synthesis',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav'
        },
        body: JSON.stringify(query)
      }
    );

    if (!synthRes.ok) {
      throw new Error('synthesis failed');
    }

    const buffer = Buffer.from(await synthRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    res.status(200).send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
