import "server-only";

const PIXABAY_BASE_URL = "https://pixabay.com/api";

function requireApiKey(): string {
  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) {
    throw new Error("Pixabay is not configured yet.");
  }

  return apiKey;
}

// Pixabay's `q` param is capped at 100 characters and works best as a short
// keyword phrase, not a full descriptive sentence -- the scene planner's
// visual_prompt_or_keyword can be a longer prompt, so trim it down to a
// handful of words before sending it to Pixabay (this is also what caused
// the 400s: a query over 100 chars is rejected outright).
function sanitizeQuery(query: string): string {
  const words = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6);

  return words.join(" ").slice(0, 100);
}

async function throwWithBody(response: Response, label: string): Promise<never> {
  const text = await response.text().catch(() => "");
  throw new Error(`${label}: ${response.status}${text ? ` -- ${text.slice(0, 300)}` : ""}`);
}

export async function searchPixabayImage(query: string): Promise<{ url: string } | null> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({
    key: apiKey,
    q: sanitizeQuery(query),
    image_type: "photo",
    safesearch: "true",
    per_page: "3",
  });

  const response = await fetch(`${PIXABAY_BASE_URL}/?${params.toString()}`);

  if (!response.ok) {
    await throwWithBody(response, "Pixabay image search failed");
  }

  const body = await response.json();
  const hit = body?.hits?.[0];

  if (!hit) return null;

  return { url: hit.largeImageURL ?? hit.webformatURL };
}

export async function searchPixabayVideo(query: string): Promise<{ url: string } | null> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({ key: apiKey, q: sanitizeQuery(query), safesearch: "true", per_page: "3" });

  const response = await fetch(`${PIXABAY_BASE_URL}/videos/?${params.toString()}`);

  if (!response.ok) {
    await throwWithBody(response, "Pixabay video search failed");
  }

  const body = await response.json();
  const hit = body?.hits?.[0];

  if (!hit) return null;

  const videos = hit.videos ?? {};
  const bestUrl = videos.medium?.url ?? videos.small?.url ?? videos.large?.url ?? videos.tiny?.url;

  if (!bestUrl) return null;

  return { url: bestUrl };
}
