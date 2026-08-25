import { redirect } from "next/navigation";

/**
 * `/googleform/알 수 없는 경로` 는 루트로 되돌린다.
 * (기존 `<Route path="*" element={<Navigate to="" replace />} />`)
 */
export default function GoogleFormCatchAll() {
  redirect("/googleform");
}
