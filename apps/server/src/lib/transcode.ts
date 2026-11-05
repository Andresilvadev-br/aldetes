import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Short video banners (profile / Server Studio), safe pipeline:
 * - input is only accepted after magic-byte detection (MP4/WebM/MOV), ≤ 12 MB;
 * - ffmpeg re-encodes EVERYTHING (never stores the original): H.264, no audio, ≤ 6 s, ≤ 960×540, 30 FPS, faststart;
 * - one job at a time, hard 45 s timeout, output ≤ 4 MB, temp files always removed.
 * If ffmpeg isn't installed, video banners are refused with a clear message (images keep working).
 */
export const VIDEO_INPUT_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
export const VIDEO_MAX_INPUT = 12 * 1024 * 1024;
const MAX_OUTPUT = 4 * 1024 * 1024;

let busy: Promise<unknown> = Promise.resolve();
let available: boolean | null = null;

function run(args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => (clearTimeout(t), reject(e)));
    p.on('close', (code) => (clearTimeout(t), code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).pop() || `ffmpeg saiu com código ${code}`))));
  });
}

export async function ffmpegAvailable() {
  if (available !== null) return available;
  available = await run(['-version'], 5000).then(
    () => true,
    () => false,
  );
  return available;
}

export async function transcodeBanner(input: Buffer): Promise<Buffer> {
  if (!(await ffmpegAvailable())) throw new Error('Este servidor ainda não aceita vídeo no banner. Use uma imagem, GIF ou um banner animado pronto.');
  const job = busy.then(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aldetes-banner-'));
    try {
      const src = join(dir, 'in');
      const out = join(dir, 'out.mp4');
      await writeFile(src, input);
      await run(
        [
          '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
          '-t', '6', '-i', src,
          '-an', '-sn', '-dn', '-map_metadata', '-1',
          '-vf', "scale='min(960,iw)':'min(540,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
          '-threads', '2', '-movflags', '+faststart',
          out,
        ],
        45_000,
      );
      const buf = await readFile(out);
      if (buf.length > MAX_OUTPUT) throw new Error('O vídeo ficou grande demais mesmo comprimido. Use um trecho mais curto ou mais simples.');
      return buf;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  busy = job.catch(() => {});
  return job;
}
