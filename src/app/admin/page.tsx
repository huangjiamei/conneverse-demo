/**
 * /admin —— no standalone Dashboard any more (batch 3).
 * Users is the platform admin's home; Shops is one tab over.
 */

import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/users");
}
