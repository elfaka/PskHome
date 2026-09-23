/**
 * 오르골 배경음악의 악보 — 직접 만든 8마디 6/8 박자 루프 (F장조, I–vi–IV–V–I–iii–IV–V).
 * 기존 곡을 옮긴 것이 아니다. 재생 엔진(musicBox.ts)과 분리해 두어 테스트할 수 있다.
 */

/** 8분음표 하나의 길이(초). 점4분음표 = 50bpm 의 느린 자장가 템포 */
export const EIGHTH_SEC = 0.4;
export const BAR_EIGHTHS = 6;

export type Voice = "bell" | "bass";

export type NoteEvent = {
  /** 루프 시작부터 8분음표 단위 */
  at: number;
  midi: number;
  velocity: number;
  /** 소리가 잦아드는 시간(초) */
  decay: number;
  voice: Voice;
};

type Chord = { root: number; minor: boolean };

// 베이스 음역(MIDI). F3 D3 B♭2 C3 F3 A2 B♭2 C3
const PROGRESSION: Chord[] = [
  { root: 53, minor: false },
  { root: 50, minor: true },
  { root: 46, minor: false },
  { root: 48, minor: false },
  { root: 53, minor: false },
  { root: 45, minor: true },
  { root: 46, minor: false },
  { root: 48, minor: false },
];

// 마디마다 1박·4박에 얹는 윗선율 (각 마디 화음의 구성음)
const MELODY: [number, number][] = [
  [81, 84], // A5 C6
  [86, 81], // D6 A5
  [86, 82], // D6 B♭5
  [84, 79], // C6 G5
  [84, 81], // C6 A5
  [88, 84], // E6 C6
  [86, 89], // D6 F6
  [88, 84], // E6 C6 → 다시 A5 로
];

export const LOOP_EIGHTHS = PROGRESSION.length * BAR_EIGHTHS;

export function buildLoop(): NoteEvent[] {
  const events: NoteEvent[] = [];

  PROGRESSION.forEach((chord, bar) => {
    const start = bar * BAR_EIGHTHS;
    const third = chord.minor ? 3 : 4;
    const r = chord.root + 12;
    // 근음 · 5도 · 옥타브 · 옥타브 위 3도 · 옥타브 · 5도 — 오르골 특유의 굴러가는 분산화음
    const arpeggio = [r, r + 7, r + 12, r + 12 + third, r + 12, r + 7];

    events.push({ at: start, midi: chord.root, velocity: 0.26, decay: 2.6, voice: "bass" });
    arpeggio.forEach((midi, i) =>
      events.push({ at: start + i, midi, velocity: i === 0 ? 0.17 : 0.12, decay: 1.6, voice: "bell" }),
    );

    const [m1, m2] = MELODY[bar];
    events.push({ at: start, midi: m1, velocity: 0.3, decay: 2.4, voice: "bell" });
    events.push({ at: start + 3, midi: m2, velocity: 0.26, decay: 2.2, voice: "bell" });
  });

  return events.sort((a, b) => a.at - b.at);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
