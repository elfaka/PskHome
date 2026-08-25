/**
 * 조건부 클래스 합성기.
 *
 * `clsx` 를 따로 넣지 않은 이유: 이 프로젝트가 필요한 건 falsy 걸러서 join 하는
 * 것뿐이다. 의존성을 늘리지 않는다.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
