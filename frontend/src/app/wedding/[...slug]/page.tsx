import { redirect } from "next/navigation";

/** `/wedding/아무거나` 로 들어오면 청첩장 본문으로 되돌린다. */
export default function WeddingCatchAll() {
  redirect("/wedding");
}
