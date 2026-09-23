import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMusicBox } from "./useMusicBox";

/** 가짜 재생 엔진 */
const fake = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  pause: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(async () => true),
  dispose: vi.fn(),
}));
const create = vi.hoisted(() => vi.fn());

vi.mock("@/lib/wedding/musicBox", () => ({
  MusicBox: { create },
}));

describe("useMusicBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockReturnValue(fake);
  });

  it("진입만으로는 재생하지 않는다 (오디오도 만들지 않음)", () => {
    const { result } = renderHook(() => useMusicBox());
    expect(result.current.playing).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("start(봉투 터치) 로 재생이 시작된다", () => {
    const { result } = renderHook(() => useMusicBox());
    act(() => result.current.start());
    expect(result.current.playing).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it("이미 재생 중이면 start 는 아무것도 하지 않는다", () => {
    const { result } = renderHook(() => useMusicBox());
    act(() => result.current.start());
    act(() => result.current.start());
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it("LP 토글: 재생 중이면 멈추고, 다시 누르면 같은 오디오로 재생", () => {
    const { result } = renderHook(() => useMusicBox());
    act(() => result.current.start());
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    expect(fake.pause).toHaveBeenCalledTimes(1);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    expect(fake.play).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("Web Audio 를 못 쓰는 환경에서도 LP 는 돈다 (소리만 없음)", () => {
    create.mockReturnValue(null);
    const { result } = renderHook(() => useMusicBox());
    act(() => result.current.start());
    expect(result.current.playing).toBe(true);
  });

  it("언마운트하면 오디오를 정리한다", () => {
    const { result, unmount } = renderHook(() => useMusicBox());
    act(() => result.current.start());
    unmount();
    expect(fake.dispose).toHaveBeenCalled();
  });
});
