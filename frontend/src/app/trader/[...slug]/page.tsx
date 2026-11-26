import { redirect } from "next/navigation";

/** `/trader/아무거나` 로 들어오면 게이트로 되돌린다. */
export default function TraderCatchAll() {
  redirect("/trader");
}
