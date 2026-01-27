import { api } from "./client";

export type JsonFormatMode = "prettify" | "minify";

export interface JsonFormatRequest {
  input: string;
  mode?: JsonFormatMode;
  indent?: number; // 2 | 4
  sortKeys?: boolean;
  ensureAscii?: boolean;
}

export interface JsonFormatResponse {
  ok: boolean;
  mode?: string;
  formatted?: string;
  stats?: {
    inputLength: number;
    outputLength: number;
  };
  error?: {
    code: string;
    message: string;
    line?: number;
    column?: number;
  };
}

export async function formatJson(req: JsonFormatRequest) {
  const { data } = await api.post<JsonFormatResponse>("/api/json/format", req);
  return data;
}
