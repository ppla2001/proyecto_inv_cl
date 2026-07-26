import { redirect } from "next/navigation";

/** Alias: el dashboard vive en la home (/). */
export default function DashboardAlias() {
  redirect("/");
}
