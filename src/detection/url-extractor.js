const urlPattern = /https?:\/\/[^\s<>'"`]+/gi;

function extractUrls(event) {
  const candidates = [
    ...(Array.isArray(event.content && event.content.urls) ? event.content.urls : []),
    event.content && event.content.text
  ].filter((value) => typeof value === 'string');
  const seen = new Set();
  const urls = [];

  for (const candidate of candidates) {
    const matches = candidate.match(urlPattern) || [candidate];
    for (const value of matches) {
      const cleaned = value.replace(/[),.;!?]+$/, '');
      try {
        const parsed = new URL(cleaned);
        if (!['http:', 'https:'].includes(parsed.protocol)) continue;
        const normalized = parsed.toString();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push({
          url: normalized,
          scheme: parsed.protocol.slice(0, -1),
          hostname: parsed.hostname.toLowerCase(),
          port: parsed.port ? Number(parsed.port) : null,
          path: parsed.pathname,
          query: parsed.search ? parsed.search.slice(1) : null
        });
      } catch (error) {
        continue;
      }
    }
  }

  return urls;
}

module.exports = { extractUrls };