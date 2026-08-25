import axios from "axios";

/**
 * 사용자에게 보여줄 에러 메시지를 뽑아낸다.
 *
 * 백엔드는 실패 시 `{ error: { code, message } }` 형태를 돌려준다.
 * (jsonprettier 처럼 자체 스키마를 가진 응답은 각 화면에서 따로 다룬다)
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: { message?: string } }
      | undefined;

    return data?.error?.message || data?.message || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}
