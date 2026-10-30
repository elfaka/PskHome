import { redirect } from "next/navigation";

/** `/stocksim/아무거나` 로 들어오면 index 로 되돌린다. */
export default function StockSimCatchAll() {
  redirect("/stocksim");
}
