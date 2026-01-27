import axios from "axios";

export const api = axios.create({
  baseURL: "", // same-origin 기준. 호출은 항상 "/api/..."로
  withCredentials: true, // JSESSIONID 등 쿠키 사용 시
});

// (선택) 공용 에러 처리/로깅 하고 싶으면 인터셉터도 여기서
api.interceptors.response.use(
  (res) => res,
  (err) => {
    return Promise.reject(err);
  }
);
