import { redirect } from "next/navigation";

/** The USG desk page was removed from the product; old links land on the ask page. */
export default function Removed() {
  redirect("/");
}
