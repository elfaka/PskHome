import { api } from "./client";

export type PsPost = {
  id: number;
  title: string;
  site: string;
  problemNumber: string;
  link: string;
  level: string;
  language: string;
  solution: string;
  contentMd: string;
  isSolved: boolean;
  createdAt: string;
};

export type PsPostRequest = {
  title: string;
  site: string;
  problemNumber: string;
  link: string;
  level: string;
  language: string;
  solution: string;
  contentMd: string;
};

type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // current page index
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

export async function listPosts(page = 0, size = 10) {
  const { data } = await api.get<Page<PsPost>>("/api/posts", {
    params: { page, size },
  });
  return data; // Page 그대로 반환
}

export async function getPost(id: number) {
  const { data } = await api.get<PsPost>(`/api/posts/${id}`);
  return data;
}

export async function createPost(payload: PsPostRequest) {
  const { data } = await api.post<number>("/api/posts", payload);
  return data;
}

export async function updatePost(id: number, payload: PsPostRequest) {
  const { data } = await api.put<number>(`/api/posts/${id}`, payload);
  return data;
}

export async function deletePost(id: number) {
  await api.delete(`/api/posts/${id}`);
}
