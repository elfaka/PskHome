import { redirect } from "next/navigation";

/** `/flights/아무거나` 로 들어오면 검색 화면으로 되돌린다. */
export default function FlightsCatchAll() {
  redirect("/flights");
}
