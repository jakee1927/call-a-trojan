import { redirect } from "next/navigation";

/** The Insights page was removed from the product; old links land on the ask page. */
export default function Removed() {
  redirect("/");
}
