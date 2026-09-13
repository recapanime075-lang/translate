export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/translate' && request.method === 'POST') {
      return handleTranslate(request, env);
    }

    // Everything else: serve the static site from /public via the ASSETS binding.
    return env.ASSETS.fetch(request);
  }
};

async function handleTranslate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { text, sourceLang, targetLang } = body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return jsonError('Missing "text" to translate', 400);
  }
  if (!targetLang) {
    return jsonError('Missing "targetLang"', 400);
  }
  if (text.length > 4000) {
    return jsonError('Text too long (max 4000 characters)', 400);
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError('Server is missing GEMINI_API_KEY. Set it with: wrangler secret put GEMINI_API_KEY', 500);
  }

  const sourceClause = sourceLang && sourceLang !== 'auto'
    ? `from ${sourceLang} `
    : '';

  const prompt =
    `Translate the following text ${sourceClause}into ${targetLang}. ` +
    `Return ONLY the translated text, with no explanation, no quotes, and no extra commentary.\n\n` +
    `Text:\n${text}`;

  const model = 'Gemini 3.6 Flash';
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const message = data?.error?.message || 'Gemini API request failed';
      return jsonError(message, geminiRes.status);
    }

    const translation = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!translation) {
      return jsonError('No translation returned from Gemini', 502);
    }

    return new Response(JSON.stringify({ translation }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return jsonError('Failed to reach Gemini API: ' + err.message, 502);
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
