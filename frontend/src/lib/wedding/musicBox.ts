import { buildLoop, EIGHTH_SEC, LOOP_EIGHTHS, midiToHz, type NoteEvent } from "./musicLoop";

const LOOKAHEAD_SEC = 0.3;
const TICK_MS = 100;
const MASTER_VOLUME = 0.5;
const FADE_IN_SEC = 1.2;
const FADE_OUT_SEC = 0.35;

type AudioContextCtor = typeof AudioContext;

/** 잔향용 임펄스 — 짧게 잦아드는 스테레오 잡음 */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
  }
  return buf;
}

/**
 * Web Audio 로 오르골을 합성해 루프 재생한다. 음원 파일이 없다.
 *
 * - 반드시 사용자 제스처(탭) 안에서 create() / play() 를 불러야 한다 (자동재생 정책).
 * - 재생할 때마다 새 "세션" 게인을 만들고, 멈출 때 그 게인만 줄여 끊는다.
 *   이미 예약해 둔 음이 멈춘 뒤 튀어나오지 않게 하려는 것이다.
 * - 미리 LOOKAHEAD 만큼만 예약한다. 탭이 숨으면 호출 측이 suspend() 해서 시간이 멈춘다.
 */
export class MusicBox {
  private readonly ctx: AudioContext;
  private readonly dry: GainNode;
  private readonly wet: ConvolverNode;
  private readonly loop: NoteEvent[] = buildLoop();
  private session: GainNode | null = null;
  private timer: number | undefined;
  private index = 0;
  private loopStart = 0;
  /** play() 의 resume 을 기다리는 사이 pause() 가 불리면 그 play 는 무효 */
  private playToken = 0;

  /** Web Audio 가 없거나 막힌 환경이면 null — 호출 측은 소리 없이 LP 만 돌린다 */
  static create(): MusicBox | null {
    const w = window as typeof window & { webkitAudioContext?: AudioContextCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;

    // iOS: 무음 스위치가 켜져 있어도 음악으로 취급해 재생되게 한다 (Safari 16.4+)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      // 지원하지 않으면 무시
    }

    try {
      return new MusicBox(new Ctor());
    } catch {
      return null;
    }
  }

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(master);

    this.wet = ctx.createConvolver();
    this.wet.buffer = makeImpulse(ctx, 2.4);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.35;
    this.wet.connect(wetGain).connect(master);
  }

  /** 소리가 실제로 나기 시작하면 true. 제스처 밖이라 막히면 false */
  async play(): Promise<boolean> {
    const token = ++this.playToken;
    // resume() 는 await 전에 동기적으로 호출돼야 제스처로 인정된다
    await this.ctx.resume();
    if (token !== this.playToken || this.ctx.state !== "running") return false;

    window.clearInterval(this.timer);
    this.endSession(0);
    const now = this.ctx.currentTime;
    const s = this.ctx.createGain();
    s.gain.setValueAtTime(0, now);
    s.gain.linearRampToValueAtTime(1, now + FADE_IN_SEC);
    s.connect(this.dry);
    s.connect(this.wet);
    this.session = s;

    this.index = 0;
    this.loopStart = now + 0.08;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    return true;
  }

  pause(): void {
    this.playToken++;
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.endSession(FADE_OUT_SEC);
  }

  /** 탭이 숨었을 때 — 시간을 멈춘다(예약된 음도 같이 멈춤) */
  suspend(): void {
    void this.ctx.suspend().catch(() => {});
  }

  /** 탭이 돌아왔을 때. iOS 는 제스처 없이 재개를 거부할 수 있다 → false */
  async resume(): Promise<boolean> {
    try {
      await this.ctx.resume();
    } catch {
      return false;
    }
    return this.ctx.state === "running";
  }

  dispose(): void {
    this.pause();
    void this.ctx.close().catch(() => {});
  }

  private endSession(fade: number) {
    const s = this.session;
    if (!s) return;
    this.session = null;
    const now = this.ctx.currentTime;
    s.gain.cancelScheduledValues(now);
    s.gain.setValueAtTime(s.gain.value, now);
    s.gain.linearRampToValueAtTime(0, now + fade);
    window.setTimeout(() => s.disconnect(), (fade + 0.1) * 1000);
  }

  private schedule() {
    const out = this.session;
    if (!out) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD_SEC;

    for (;;) {
      const ev = this.loop[this.index];
      const t = this.loopStart + ev.at * EIGHTH_SEC;
      if (t > horizon) break;
      // 늦게 깨어난 틱(프레임 드랍)에서 한참 지난 음은 건너뛴다
      if (t >= this.ctx.currentTime - 0.05) this.note(ev, Math.max(t, this.ctx.currentTime), out);

      this.index++;
      if (this.index >= this.loop.length) {
        this.index = 0;
        this.loopStart += LOOP_EIGHTHS * EIGHTH_SEC;
      }
    }
  }

  /** 사인파 배음 몇 개를 겹쳐 금속 빗(오르골) 소리를 흉내 낸다. 높은 배음일수록 빨리 사라진다 */
  private note(ev: NoteEvent, t: number, out: AudioNode) {
    const f = midiToHz(ev.midi);
    const partials: [number, number, number][] =
      ev.voice === "bell"
        ? [
            [1, 1, ev.decay],
            [2, 0.28, ev.decay * 0.5],
            [3, 0.08, ev.decay * 0.25],
          ]
        : [
            [1, 1, ev.decay],
            [2, 0.12, ev.decay * 0.5],
          ];
    const attack = ev.voice === "bass" ? 0.03 : 0.005;

    for (const [mul, amp, decay] of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * mul;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(ev.velocity * amp, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }
}
