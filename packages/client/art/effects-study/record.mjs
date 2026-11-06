/* global console, process, window */
// Records the ability-effects study (README.md): every scene in both styles, frame by frame at 30
// frames a second whatever speed the machine draws at, then the two styles side by side.
//
//   node packages/client/art/effects-study/record.mjs <out dir> [scene ...] [--width=1280] [--height=720]
//   node packages/client/art/effects-study/record.mjs <out dir> [scene ...] --stills=0.5,1.2
//
// --stills writes <scene>-<style>-<seconds>.jpg at those times instead, to check a scene quickly.
// Starts Vite on the client, opens the study in headless Chromium and writes, for each scene,
// <scene>-grounded.mp4, <scene>-punchy.mp4 and <scene>.mp4 (both side by side) with ffmpeg.
// Playwright isn't one of the repo's dependencies: this uses the copy installed on the machine.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const load = createRequire(import.meta.url);
const { chromium } = load('playwright');
const CLIENT = path.join(import.meta.dirname, '../..');
const { createServer } = await import(load.resolve('vite', { paths: [CLIENT] }));

const args = process.argv.slice(2);
const option = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const [outDir, ...wanted] = args.filter((a) => !a.startsWith('--'));
if (!outDir) throw new Error('usage: record.mjs <out dir> [scene ...]');
const width = option('width', 1280);
const height = option('height', 720);
const FPS = 30;
const stills = args.find((a) => a.startsWith('--stills='))?.split('=')[1].split(',').map(Number) ?? null;

const server = await createServer({ root: CLIENT, configFile: path.join(CLIENT, 'vite.config.ts'), server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:5199/art/effects-study/index.html#record', { waitUntil: 'load' });
  await page.evaluate(() => window.study.ready);
  const scenes = wanted.length > 0 ? wanted : await page.evaluate(() => window.study.scenes);
  fs.mkdirSync(outDir, { recursive: true });
  for (const scene of scenes) {
    const videos = [];
    for (const style of ['grounded', 'punchy']) {
      const duration = await page.evaluate(([s, st]) => window.study.load(s, st), [scene, style]);
      if (stills !== null) {
        for (const t of stills) {
          await page.evaluate((x) => window.study.draw(x), t);
          await page.screenshot({ path: path.join(outDir, `${scene}-${style}-${t}.jpg`), type: 'jpeg', quality: 90 });
        }
        continue;
      }
      const frames = fs.mkdtempSync(path.join(outDir, `.frames-${scene}-${style}-`));
      // A breath before and after, so each loop starts and ends at rest.
      const total = Math.ceil((duration + 0.5) * FPS);
      const started = Date.now();
      for (let i = 0; i < total; i++) {
        await page.evaluate((t) => window.study.draw(t), i / FPS - 0.2);
        await page.screenshot({ path: path.join(frames, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      }
      const video = path.join(outDir, `${scene}-${style}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', video]);
      fs.rmSync(frames, { recursive: true });
      videos.push(video);
      console.log(`${scene} ${style}: ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    if (stills !== null) continue;
    // Side by side; the shorter one holds its last frame.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videos[0], '-i', videos[1], '-filter_complex', '[0:v]tpad=stop_mode=clone:stop_duration=1[a];[1:v]tpad=stop_mode=clone:stop_duration=1[b];[a][b]hstack=inputs=2:shortest=1[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', path.join(outDir, `${scene}.mp4`)]);
  }
} finally {
  await browser.close();
  await server.close();
}
