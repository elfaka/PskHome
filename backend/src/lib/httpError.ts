/**
 * HTTP 상태코드를 가진 애플리케이션 예외.
 *
 * 기존 Spring 코드의 `IllegalArgumentException("해당 게시글이 없습니다.")` 처럼
 * "상태코드 의미를 가진 예외"를 표현하기 위한 최소 타입.
 * 실제 응답 변환은 `middleware/errorHandler.ts` 가 담당한다.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new HttpError(400, code, message);
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new HttpError(401, code, message);
  }

  static notFound(message: string, code = "NOT_FOUND") {
    return new HttpError(404, code, message);
  }

  static internal(message: string, code = "INTERNAL_ERROR") {
    return new HttpError(500, code, message);
  }
}
