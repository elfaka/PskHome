/**
 * Spring Data `Page<T>` 의 JSON 형태를 그대로 재현한다.
 *
 * 프론트 `src/api/pspost.ts` 의 `Page<T>` 타입이 이 필드들을 그대로 참조하므로
 * 이름/의미가 달라지면 안 된다.
 */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  /** 현재 페이지 인덱스 (0-based) */
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export function toPage<T>(
  content: T[],
  pageNumber: number,
  size: number,
  totalElements: number
): Page<T> {
  // Spring 의 PageImpl.getTotalPages() 와 동일한 계산식
  const totalPages = size === 0 ? 1 : Math.ceil(totalElements / size);

  return {
    content,
    totalElements,
    totalPages,
    number: pageNumber,
    size,
    first: pageNumber === 0,
    // Spring: last = !hasNext(), hasNext = number + 1 < totalPages
    last: pageNumber + 1 >= totalPages,
    empty: content.length === 0,
  };
}
