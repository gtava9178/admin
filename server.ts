import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// In-memory DM store for direct messaging synchronization across users/sessions
interface DirectMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  body: string;
  audio_url?: string;
  audio_duration?: number;
  created_at: string;
  read: boolean;
}

const memoryMessages: DirectMessage[] = [
  {
    id: 'm-welcome-1',
    sender_id: 'system-bahrak',
    sender_name: 'فريق بحرك 🌊',
    recipient_id: 'guest',
    recipient_name: 'أنت',
    body: 'أهلاً بك في بحرك! شارك مقاطعك واستمتع بأجمل الفيديوهات القصيرة.',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    read: false,
  },
];

// Helper to extract user identity from headers
function getUserId(req: Request): { id: string; name: string } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      // Decode JWT payload without external library to get sub/user_id & email/username
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const id = payload.sub || payload.user_id || 'user_' + token.slice(-8);
        const name = payload.user_metadata?.username || payload.email?.split('@')[0] || 'مستخدم';
        return { id, name };
      }
    } catch {
      // fallback
    }
  }
  const customUser = req.headers['x-user-id'] as string;
  const customName = req.headers['x-user-name'] as string;
  if (customUser) {
    return { id: customUser, name: customName || 'أنت' };
  }
  return { id: 'guest', name: 'أنت' };
}

// TikTok direct video cache (URL -> resolved MP4 data)
const tiktokCache = new Map<string, { direct_mp4: string; title: string; author: string; thumb: string; id: string }>();

// 1. TikTok Resolve API: Resolves TikTok link to direct MP4 video stream URL
app.get('/api/tiktok/resolve', async (req: Request, res: Response) => {
  try {
    let rawUrl = ((req.query.url as string) || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'الرابط مطلوب' });
    if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;

    if (tiktokCache.has(rawUrl)) {
      return res.json({ success: true, ...tiktokCache.get(rawUrl) });
    }

    let resolvedUrl = rawUrl;
    if (/vm\.tiktok\.com|vt\.tiktok\.com/i.test(rawUrl)) {
      try {
        const headRes = await fetch(rawUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
          },
        });
        resolvedUrl = headRes.url || rawUrl;
      } catch {
        // fallback
      }
    }

    // Try resolving direct MP4 via TikWM API
    const tikwmApiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(resolvedUrl)}`;
    const tikwmRes = await fetch(tikwmApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (tikwmRes.ok) {
      const data = await tikwmRes.json();
      if (data && data.code === 0 && data.data) {
        const d = data.data;
        const rawVideoUrl = d.play || d.wmplay || '';
        const streamUrl = `/api/tiktok/stream?url=${encodeURIComponent(rawVideoUrl)}`;
        const result = {
          success: true,
          id: d.id || '',
          direct_mp4: streamUrl,
          raw_mp4: rawVideoUrl,
          title: d.title || '',
          author: d.author?.nickname || d.author?.unique_id || 'تيك توك',
          thumb: d.cover || '',
        };
        tiktokCache.set(rawUrl, result);
        tiktokCache.set(resolvedUrl, result);
        return res.json(result);
      }
    }

    // Fallback to oEmbed if direct MP4 extraction fails
    const match = resolvedUrl.match(/(?:tiktok\.com\/.*?\/video\/|v\/|embed\/v2\/)(\d{8,25})/);
    const videoId = match ? match[1] : '';
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolvedUrl)}`;
    const oembedRes = await fetch(oembedUrl);
    if (oembedRes.ok) {
      const d = await oembedRes.json();
      return res.json({
        success: false,
        id: videoId || d.embed_product_id,
        direct_mp4: '',
        title: d.title || '',
        author: d.author_name || 'tiktok',
        thumb: d.thumbnail_url || '',
      });
    }

    return res.json({
      success: false,
      id: videoId || 'tt-' + Date.now(),
      direct_mp4: '',
      title: '',
      author: 'tiktok',
      thumb: '',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'تعذّر استخراج فيديو تيك توك';
    return res.status(500).json({ error: errorMsg });
  }
});

// TikTok Proxy / Metadata API
app.get('/api/tiktok', async (req: Request, res: Response) => {
  try {
    let rawUrl = ((req.query.url as string) || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'الرابط مطلوب' });
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    // Delegate to resolve logic
    const resolveUrl = `http://localhost:3000/api/tiktok/resolve?url=${encodeURIComponent(rawUrl)}`;
    const resolveRes = await fetch(resolveUrl);
    if (resolveRes.ok) {
      const data = await resolveRes.json();
      if (data.direct_mp4) {
        return res.json({
          id: data.id,
          url: data.direct_mp4,
          raw_tiktok_url: rawUrl,
          title: data.title,
          author: data.author,
          thumb: data.thumb,
        });
      }
    }

    return res.json({
      id: 'tt-' + Date.now(),
      url: rawUrl,
      title: '',
      author: 'tiktok',
      thumb: '',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'تعذّر الاتصال بخادم تيك توك';
    return res.status(500).json({ error: errorMsg });
  }
});

// Direct MP4 Video Streaming Proxy (Streams pure MP4 bytes to <video> element with Range support)
app.get('/api/tiktok/stream', async (req: Request, res: Response) => {
  try {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.tiktok.com/',
    };

    if (req.headers.range) {
      headers.Range = req.headers.range as string;
    }

    const videoRes = await fetch(videoUrl, { headers });
    if (!videoRes.ok || !videoRes.body) {
      return res.status(videoRes.status).send('Failed to fetch video stream');
    }

    res.status(videoRes.status);
    res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    const contentRange = videoRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const contentLength = videoRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Stream chunks directly to client response
    const reader = videoRes.body.getReader();
    const pump = async () => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(value);
        pump();
      } catch {
        res.end();
      }
    };
    pump();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Streaming error';
    if (!res.headersSent) {
      res.status(500).send(errorMsg);
    }
  }
});

// 2. Direct Messaging (DM) API
app.get('/api/dm/users', (req: Request, res: Response) => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  const currentUser = getUserId(req);

  // Collect distinct users from messages
  const userMap = new Map<string, string>();
  userMap.set('system-bahrak', 'فريق بحرك 🌊');
  userMap.set('nour-sea', 'نورس البحر');
  userMap.set('amwaj-aljanoub', 'أمواج الجنوب');
  userMap.set('al-qersh', 'صياد الخليج');

  for (const m of memoryMessages) {
    if (m.sender_id !== currentUser.id) userMap.set(m.sender_id, m.sender_name);
    if (m.recipient_id !== currentUser.id) userMap.set(m.recipient_id, m.recipient_name);
  }

  const results: Array<{ id: string; username: string }> = [];
  for (const [id, username] of userMap.entries()) {
    if (id !== currentUser.id && (username.toLowerCase().includes(query) || id.toLowerCase().includes(query))) {
      results.push({ id, username });
    }
  }

  // If query is non-empty and nothing found, allow chatting with the searched username directly
  if (query && !results.some((u) => u.username.toLowerCase() === query)) {
    results.push({ id: 'user_' + query.replace(/\s+/g, '_'), username: query });
  }

  return res.json(results);
});

app.get('/api/dm/inbox', (req: Request, res: Response) => {
  const currentUser = getUserId(req);
  const conversationMap = new Map<
    string,
    { uid: string; name: string; last: string; t: number; out: boolean; unread: number }
  >();

  const myMessages = memoryMessages.filter(
    (m) =>
      m.sender_id === currentUser.id ||
      m.recipient_id === currentUser.id ||
      (currentUser.id === 'guest' && (m.recipient_id === 'guest' || m.sender_id === 'guest'))
  );

  for (const m of myMessages) {
    const isOut = m.sender_id === currentUser.id;
    const otherId = isOut ? m.recipient_id : m.sender_id;
    const otherName = isOut ? m.recipient_name : m.sender_name;
    const timeMs = new Date(m.created_at).getTime();

    const existing = conversationMap.get(otherId);
    const unreadCount = !isOut && !m.read ? 1 : 0;

    if (!existing || timeMs > existing.t) {
      conversationMap.set(otherId, {
        uid: otherId,
        name: otherName,
        last: m.body,
        t: timeMs,
        out: isOut,
        unread: (existing?.unread || 0) + unreadCount,
      });
    } else if (unreadCount) {
      existing.unread += 1;
    }
  }

  const sortedList = Array.from(conversationMap.values()).sort((a, b) => b.t - a.t);
  return res.json(sortedList);
});

app.get('/api/dm/thread', (req: Request, res: Response) => {
  const currentUser = getUserId(req);
  const otherId = req.query.uid as string;
  const after = req.query.after as string;

  if (!otherId) {
    return res.status(400).json({ error: 'معرّف المستخدم مطلوب' });
  }

  const threadMsgs = memoryMessages
    .filter((m) => {
      const match =
        (m.sender_id === currentUser.id && m.recipient_id === otherId) ||
        (m.sender_id === otherId && m.recipient_id === currentUser.id) ||
        (currentUser.id === 'guest' && (m.recipient_id === otherId || m.sender_id === otherId));
      if (!match) return false;
      if (after) {
        return new Date(m.created_at).getTime() > new Date(after).getTime();
      }
      return true;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return res.json(threadMsgs);
});

app.post('/api/dm/send', (req: Request, res: Response) => {
  const currentUser = getUserId(req);
  const { to, name, body, audio_url, audio_duration } = req.body || {};

  if (!to || (!body?.trim() && !audio_url)) {
    return res.status(400).json({ error: 'المستلم ومحتوى الرسالة مطلوبان' });
  }

  const newMsg: DirectMessage = {
    id: 'dm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    sender_id: currentUser.id,
    sender_name: currentUser.name,
    recipient_id: to,
    recipient_name: name || 'مستخدم',
    body: (body || (audio_url ? '🎙️ رسالة صوتية' : '')).trim(),
    audio_url: audio_url || undefined,
    audio_duration: typeof audio_duration === 'number' ? audio_duration : undefined,
    created_at: new Date().toISOString(),
    read: false,
  };

  memoryMessages.push(newMsg);

  // Auto-reply easter egg for system bot or demo users
  if (to === 'system-bahrak') {
    setTimeout(() => {
      memoryMessages.push({
        id: 'reply-' + Date.now(),
        sender_id: 'system-bahrak',
        sender_name: 'فريق بحرك 🌊',
        recipient_id: currentUser.id,
        recipient_name: currentUser.name,
        body: audio_url
          ? 'استمعت إلى رسالتك الصوتية الجميلة! 🎙️ نتمنى لك يوماً سعيداً على شاطئ بحرك.'
          : 'شكراً لرسالتك! نتمنى لك وقتاً ممتعاً في بحرك، ونسعد بمقاطعك الرائعة.',
        created_at: new Date().toISOString(),
        read: false,
      });
    }, 1500);
  }

  return res.json(newMsg);
});

app.post('/api/dm/read', (req: Request, res: Response) => {
  const currentUser = getUserId(req);
  const { uid } = req.body || {};

  for (const m of memoryMessages) {
    if (m.sender_id === uid && m.recipient_id === currentUser.id) {
      m.read = true;
    }
  }

  return res.json({ success: true });
});

app.get('/api/dm/unread', (req: Request, res: Response) => {
  const currentUser = getUserId(req);
  const unreadMessages = memoryMessages.filter(
    (m) => m.recipient_id === currentUser.id && !m.read
  );

  const latest = unreadMessages[unreadMessages.length - 1] || null;
  return res.json({
    count: unreadMessages.length,
    latest,
  });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Serve public static assets (PWA icons, manifest, etc.)
    app.use(express.static(path.resolve(__dirname, 'public')));

    // In development mode, mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bahrak server listening on http://localhost:${PORT}`);
  });
}

startServer();
