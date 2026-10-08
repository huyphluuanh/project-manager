// Tiếng chuông nhắc việc êm dịu (kiểu hộp nhạc), tạo bằng Web Audio — không cần file âm thanh.
// Trình duyệt chỉ cho phát âm thanh sau khi người dùng đã tương tác với trang:
// unlockAudio() được gọi ở lần bấm/gõ phím đầu tiên. App Windows được phép phát luôn.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

// Mi – Sol – Đô, rồi Sol – Đô vang nhẹ
const MELODY: [number, number, number][] = [
  // [tần số Hz, bắt đầu (giây), độ to]
  [659.25, 0.0, 1],
  [783.99, 0.18, 1],
  [1046.5, 0.36, 1],
  [783.99, 0.9, 0.55],
  [1046.5, 1.08, 0.7],
];

// Âm bội nhẹ cho tiếng giống chuông
const PARTIALS: [number, number][] = [[1, 1], [2, 0.22], [3, 0.06]];

export async function playChime(volume = 0.22) {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  if (c.state !== 'running') return;

  const master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.05;

  for (const [freq, at, amp] of MELODY) {
    const start = t0 + at;
    for (const [mult, partAmp] of PARTIALS) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.5 * amp * partAmp, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.8);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 1.9);
    }
  }
}
