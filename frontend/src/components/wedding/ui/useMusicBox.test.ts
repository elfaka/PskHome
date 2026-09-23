import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BGM_TOGGLE_ATTR, useMusicBox } from "./useMusicBox";

/** 가짜 재생 엔진 — play() 결과를 테스트가 정한다 */
const fake = vi.hoisted(() => ({
  play: vi.fn<() => Promise<boolean>>(),
  pause: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(async () => true),
  dispose: vi.fn(),
}));

vi.mock("@/lib/wedding/musicBox", () => ({
  MusicBox: { create: () => fake },
}));

const never = () => new Promise<boolean>(() => {});
const flush = () => act(async () => {});

function tap(target: EventTarget = document.body) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("useMusicBox autoplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("자동재생이 허용되면 진입하자마자 재생된다", async () => {
    fake.play.mockResolvedValue(true);
    const { result } = renderHook(() => useMusicBox({ autoplay: true }));
    await flush();
    expect(result.current.playing).toBe(true);
    expect(fake.play).toHaveBeenCalledTimes(1);

    // 이미 재생 중이면 첫 탭에서 다시 재생하지 않는다
    tap();
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it("막히면(resume 이 끝나지 않음) 기다렸다가 화면 첫 탭에서 재생한다", async () => {
    fake.play.mockImplementationOnce(never).mockResolvedValue(true);
    const { result } = renderHook(() => useMusicBox({ autoplay: true }));
    await flush();
    expect(result.current.playing).toBe(false);

    tap();
    expect(result.current.playing).toBe(true);
    expect(fake.play).toHaveBeenCalledTimes(2);

    // 한 번만 — 이후 탭은 무시
    tap();
    expect(fake.play).toHaveBeenCalledTimes(2);
  });

  it("첫 탭이 LP 면 자동재생은 물러나고 LP 토글이 처리한다 (켜졌다 바로 꺼지지 않게)", async () => {
    fake.play.mockImplementationOnce(never).mockResolvedValue(true);
    const lp = document.createElement("button");
    lp.setAttribute(BGM_TOGGLE_ATTR, "");
    document.body.appendChild(lp);

    const { result } = renderHook(() => useMusicBox({ autoplay: true }));
    await flush();

    tap(lp); // 문서 리스너: LP 라서 무시
    expect(fake.play).toHaveBeenCalledTimes(1);
    act(() => result.current.toggle()); // LP 의 onClick
    expect(result.current.playing).toBe(true);
    expect(fake.play).toHaveBeenCalledTimes(2);
  });

  it("사용자가 LP 로 멈췄다면 다시 자동으로 켜지 않는다", async () => {
    fake.play.mockResolvedValue(true);
    const { result } = renderHook(() => useMusicBox({ autoplay: true }));
    await flush();
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    expect(fake.pause).toHaveBeenCalledTimes(1);

    tap();
    expect(result.current.playing).toBe(false);
  });

  it("autoplay 가 아니면 진입 시 재생하지 않는다", async () => {
    fake.play.mockResolvedValue(true);
    const { result } = renderHook(() => useMusicBox());
    await flush();
    tap();
    expect(result.current.playing).toBe(false);
    expect(fake.play).not.toHaveBeenCalled();
  });

  it("언마운트하면 오디오를 정리하고 탭 리스너도 떼어 낸다", async () => {
    fake.play.mockImplementationOnce(never).mockResolvedValue(true);
    const { unmount } = renderHook(() => useMusicBox({ autoplay: true }));
    await flush();
    unmount();
    expect(fake.dispose).toHaveBeenCalled();
    tap();
    expect(fake.play).toHaveBeenCalledTimes(1);
  });
});
