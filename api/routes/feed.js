import { Router } from 'express';
import Parser from 'rss-parser';
import { cacheGet, cacheSet } from '../lib/cache.js';

const router = Router();
const parser = new Parser({ timeout: 8000 });

const HN_RSS = 'https://hnrss.org/frontpage';
const HN_TTL = 5 * 60 * 1000;

const GITHUB_QUERIES = [
  'language:javascript stars:>1000',
  'language:typescript stars:>1000',
  'language:python stars:>1000',
  'stars:>5000',
];

async function fetchHackerNews() {
  const cached = cacheGet('feed:hn');
  if (cached) return cached;

  const feed = await parser.parseURL(HN_RSS);
  const items = feed.items.slice(0, 12).map((item) => ({
    id: item.guid || item.link,
    title: item.title || 'Untitled',
    link: item.link,
    author: item.creator || 'Hacker News',
    published: item.isoDate || item.pubDate || null,
    comments: item.comments || null,
    points: item.contentSnippet ? item.contentSnippet.length : 0,
  }));

  cacheSet('feed:hn', items, HN_TTL);
  return items;
}

async function fetchGitHub() {
  const cached = cacheGet('feed:github');
  if (cached) return cached;

  const query = GITHUB_QUERIES[Math.floor(Math.random() * GITHUB_QUERIES.length)];
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=12`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CODEX-Community-Feed',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = new Error(`GitHub API responded ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const items = (data.items || []).slice(0, 12).map((repo) => ({
    id: `gh-${repo.id}`,
    name: repo.full_name,
    description: repo.description,
    stars: repo.stargazers_count,
    language: repo.language,
    url: repo.html_url,
    forks: repo.forks_count,
    updated: repo.updated_at,
  }));

  cacheSet('feed:github', items, 15 * 60 * 1000);
  return items;
}

router.get('/hackernews', async (_req, res) => {
  try {
    const items = await fetchHackerNews();
    res.set('Cache-Control', 'public, max-age=120, s-maxage=300');
    res.json({ source: 'hackernews', items });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Hacker News right now.', detail: err.message });
  }
});

router.get('/github', async (_req, res) => {
  try {
    const items = await fetchGitHub();
    res.set('Cache-Control', 'public, max-age=300, s-maxage=900');
    res.json({ source: 'github', items });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach GitHub right now.', detail: err.message });
  }
});

export default router;
