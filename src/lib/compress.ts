// Client-side video compression using canvas & MediaRecorder
const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function isCompressionSupported(): boolean {
  if (typeof window === 'undefined' || !window.MediaRecorder || !MediaRecorder.isTypeSupported) {
    return false;
  }
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const hasAudio = !!AudioCtx;
  const hasCanvasStream = !!(window.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream);
  const supportedType = TYPES.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
  return !!(hasAudio && hasCanvasStream && supportedType);
}

export async function compressVideo(
  file: File,
  options: {
    maxBytes: number;
    onProgress?: (ratio: number) => void;
    signal?: AbortSignal;
  }
): Promise<File> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const mime = TYPES.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });

  if (!mime || !AudioCtx) {
    throw new Error('هذا المتصفح لا يدعم ضغط الفيديو');
  }

  const ac = new AudioCtx();
  if (ac.resume) await ac.resume().catch(() => {});

  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(v);

  const dest = ac.createMediaStreamDestination();
  try {
    ac.createMediaElementSource(v).connect(dest);
  } catch {
    // fallback if audio fails
  }

  await v.play().then(() => v.pause()).catch(() => {});

  try {
    if (!v.videoWidth || !isFinite(v.duration)) {
      await new Promise<void>((resolve, reject) => {
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error('تعذّرت قراءة هذا الفيديو في المتصفح؛ جرّب صيغة MP4'));
      });
    }

    const d = v.duration;
    if (!isFinite(d) || d <= 0) {
      throw new Error('تعذّرت معرفة مدة الفيديو');
    }

    const sc = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const W = Math.max(2, Math.round((v.videoWidth * sc) / 2) * 2);
    const H = Math.max(2, Math.round((v.videoHeight * sc) / 2) * 2);

    const ab = 96000;
    const vb = Math.min(2500000, Math.floor((options.maxBytes * 8 * 0.85) / d) - ab);
    if (vb < 200000) {
      throw new Error('الفيديو طويل جداً ليُضغط إلى هذا الحد؛ قصّه إلى مقطع أقصر');
    }

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('تعذّر تهيئة معالج الفيديو');

    const vs = cv.captureStream(30);
    const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: vb,
      audioBitsPerSecond: ab,
    });

    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const stopped = new Promise<void>((res) => {
      rec.onstop = () => res();
    });

    v.pause();
    if (v.currentTime > 0) {
      v.currentTime = 0;
      await new Promise<void>((r) => {
        v.onseeked = () => r();
      });
    }

    ctx.drawImage(v, 0, 0, W, H);
    let done = false;

    const draw = () => {
      if (done) return;
      ctx.drawImage(v, 0, 0, W, H);
      options.onProgress?.(Math.min(1, v.currentTime / d));
      requestAnimationFrame(draw);
    };

    rec.start(1000);
    try {
      await v.play();
    } catch {
      v.muted = true;
      await v.play();
    }

    draw();

    await new Promise<void>((resolve, reject) => {
      v.onended = () => resolve();
      v.onerror = () => reject(new Error('تعذّرت قراءة الفيديو أثناء الضغط'));
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          reject(new Error('أُلغي الضغط'));
        });
      }
    });

    done = true;
    rec.stop();
    await stopped;

    const baseType = mime.split(';')[0];
    const out = new File(chunks, 'compressed.' + (baseType.includes('mp4') ? 'mp4' : 'webm'), {
      type: baseType,
      lastModified: Date.now(),
    });

    options.onProgress?.(1);
    return out;
  } finally {
    v.pause();
    v.removeAttribute('src');
    v.remove();
    URL.revokeObjectURL(url);
    ac.close().catch(() => {});
  }
}
