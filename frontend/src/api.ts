import axios from "axios";

export const api = axios.create({
  baseURL: "", // same-origin 기준. 호출은 항상 "/api/..."로
  withCredentials: true, // JSESSIONID 등 쿠키 사용 시
});
