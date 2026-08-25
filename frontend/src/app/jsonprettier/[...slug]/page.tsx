import { redirect } from "next/navigation";

/**
 * `/jsonprettier/아무거나` 로 들어오면 index 로 되돌린다.
 * (기존 `pages/jsonprettier/jsonprettier.tsx` 의 `<Navigate to="/jsonprettier" replace />`)
 */
export default function JsonPrettierCatchAll() {
  redirect("/jsonprettier");
}
