// Transkrip ucapan -> teks dengan waktu per kata, jalan di browser (Whisper lewat transformers.js).
// Model diunduh sekali (±80 MB) lalu disimpan di cache browser.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

env.allowLocalModels = false;
const MODEL = 'onnx-community/whisper-base_timestamped';
let asr = null;

self.onmessage = async (e) => {
  const { audio, language } = e.data;
  try {
    asr ??= await pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress') self.postMessage({ type: 'download', file: p.file, progress: p.progress });
      },
    });
    self.postMessage({ type: 'transcribing' });
    const out = await asr(audio, {
      language,
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const words = (out.chunks || [])
      .map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
      .filter((w) => w.text);
    self.postMessage({ type: 'result', text: out.text, words });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
