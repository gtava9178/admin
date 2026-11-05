import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

export const SUPABASE_URL = 'https://bhpxhnxfwusrwhkleudf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_VRWfp_sJYOt6UquSli8pDw_I4K78YBD';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface PostItem {
  id: string;
  uid?: string;
  user: string;
  cap: string;
  url?: string;
  blob?: Blob;
  g?: number;
  demo?: number;
  likes: number;
  liked: boolean;
  saved: boolean;
  cm: Array<{ id?: string; u: string; t: string }>;
  t: number;
  fc?: number;
  isFol?: boolean;
}

export interface DirectMessageItem {
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

// Local Storage helpers
export const ls = {
  get: <T>(k: string, d: T): T => {
    try {
      const v = localStorage.getItem(k);
      return v !== null ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set: (k: string, v: unknown) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // ignore
    }
  },
};

export const INITIAL_DEMO_POSTS: PostItem[] = [
  {
    id: 'tt-featured-1',
    user: 'عالم_البحار',
    cap: 'أمواج البحر وتصميم الفيديوهات العمودية بتشغيل أصلي تلقائي 🌊✨ #تيك_توك #بحر #اكسبلور #بحرك',
    url: 'https://www.tiktok.com/@.zagg1/video/7700557057426001170',
    likes: 842,
    liked: false,
    saved: false,
    cm: [
      { id: 'c-tt-1', u: 'سالم_البحري', t: 'التشغيل العمودي الأصلي للفيديو كأنه محمل في التطبيق تماماً!' },
      { id: 'c-tt-2', u: 'هدى', t: 'انسيابي وسريع جداً بدون أي نوافذ خارجية' },
    ],
    t: Date.now() - 3600000 * 2,
    fc: 412,
  },
  {
    id: 'demo-1',
    user: 'موج_البحر',
    cap: 'صباح هادئ على الشاطئ… الموج يعرف كيف يبدأ يومك بنشاط وهدوء #بحر #صباح #راحة',
    g: 0,
    demo: 1,
    likes: 128,
    liked: false,
    saved: false,
    cm: [
      { id: 'c1', u: 'سفير_الأمل', t: 'منظر يشرح الصدر ما شاء الله' },
      { id: 'c2', u: 'غيمة', t: 'أجمل صباح مع صوت أمواج البحر' },
    ],
    t: Date.now() - 3600000 * 4,
    fc: 42,
  },
  {
    id: 'tt-featured-2',
    user: 'صناع_المحتوى',
    cap: 'مقطع تيك توك متصل تلقائياً مع البث والمشاهدة الحية 🎵🔥 #تيك_توك #فيديو #ترند',
    url: 'https://www.tiktok.com/@.zagg1/video/7700557057426001170',
    likes: 560,
    liked: false,
    saved: true,
    cm: [{ id: 'c-tt-3', u: 'ماجد', t: 'التكامل ممتاز جداً' }],
    t: Date.now() - 3600000 * 6,
    fc: 890,
  },
  {
    id: 'demo-2',
    user: 'نورس_الخليج',
    cap: 'كل رحلة تبدأ بخطوة نحو الماء… سحر الغروب لا ينتهي أبداً #سفر #بحر #غروب',
    g: 1,
    demo: 1,
    likes: 245,
    liked: false,
    saved: true,
    cm: [{ id: 'c3', u: 'بحار_عتيق', t: 'سبحان الخالق، تصوير فنان' }],
    t: Date.now() - 3600000 * 8,
    fc: 89,
  },
  {
    id: 'demo-3',
    user: 'لؤلؤة_الأعماق',
    cap: 'انشر أول مقطع فيديو لك من زر «+» وسيظهر هنا فوراً لكل العالم #بحرك #اكتشف',
    g: 2,
    demo: 1,
    likes: 310,
    liked: false,
    saved: false,
    cm: [{ id: 'c4', u: 'صانع_محتوى', t: 'تطبيق رائع وسريع جداً' }],
    t: Date.now() - 3600000 * 12,
    fc: 156,
  },
  {
    id: 'demo-4',
    user: 'شراع_الأمل',
    cap: 'الريح لا تتغير، لكن الشراع يتغير… اصنع يومك بنفسك #إلهام #حكمة #طاقة_إيجابية',
    g: 3,
    demo: 1,
    likes: 194,
    liked: false,
    saved: false,
    cm: [],
    t: Date.now() - 3600000 * 20,
    fc: 64,
  },
];

// Helper to check video extension & MIME type
const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
};

export function getFileExt(f: File): string {
  const nameExt = (f.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (VIDEO_TYPES[nameExt]) return nameExt;
  if (f.type.includes('mp4')) return 'mp4';
  if (f.type.includes('webm')) return 'webm';
  if (f.type.includes('quicktime')) return 'mov';
  return 'mp4';
}

export function getFileType(f: File, ext: string): string {
  const type = (f.type || '').split(';')[0];
  return type.startsWith('video/') ? type : VIDEO_TYPES[ext] || 'video/mp4';
}

// Upload video with resumable TUS protocol to Supabase storage
export async function uploadVideoTus(
  file: File,
  user: User,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const ext = getFileExt(file);
  const type = getFileType(file, ext);
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('انتهت الجلسة، سجّل الدخول مجدداً');

  if (tus.isSupported) {
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: {
          apikey: SUPABASE_KEY,
          'x-upsert': 'false',
        },
        metadata: {
          bucketName: 'videos',
          objectName: path,
          contentType: type,
          cacheControl: '3600',
        },
        async onBeforeRequest(req) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            req.setHeader('authorization', `Bearer ${data.session.access_token}`);
          }
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          onProgress(bytesUploaded / bytesTotal);
        },
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          upload.abort(true).catch(() => {});
          const err = new Error('أُلغي الرفع');
          err.name = 'AbortError';
          reject(err);
        });
      }

      upload.start();
    });
  } else {
    // Fallback standard Supabase storage upload
    const { error } = await supabase.storage.from('videos').upload(path, file, {
      contentType: type,
      cacheControl: '3600',
    });
    if (error) throw error;
    onProgress(1);
  }

  const { data: urlData } = supabase.storage.from('videos').getPublicUrl(path);
  return urlData.publicUrl;
}
