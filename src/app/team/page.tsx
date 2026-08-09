/**
 * /team —— renamed to /shop in batch 3 (it grew a Shop info section).
 * Kept as a redirect so existing links and bookmarks still land somewhere.
 */

import { redirect } from "next/navigation";

export default function TeamRedirect() {
  redirect("/shop");
}
