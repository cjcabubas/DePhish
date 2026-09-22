async function request(mlUrl, path, input) {
  const response = await fetch(new URL(path, mlUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
  if (response.status === 429) throw Object.assign(new Error('Analyzer rate limit'), { status: 429 });
  if (!response.ok) throw new Error('Analyzer unavailable');
  return response.json();
}

export function analyzerClient(mlUrl) {
  return {
    classify: input => request(mlUrl, '/api/classify', { text: input.original }),
    analyzeIndicators: async (input, artifacts) => {
      try {
        const response = await request(mlUrl, '/api/indicators', { text: input.original, normalized_text: input.normalized, has_url: artifacts.urls.length > 0 });
        if (!Array.isArray(response.indicators)) throw new Error('Invalid indicator response');
        return { ...response, status: 'complete' };
      } catch { return { status: 'unavailable', indicators: [], phishing_type: 'Not established',
        reason: 'Indicator analysis could not finish. The text model and link checks are reported separately.' }; }
    },
  };
}
