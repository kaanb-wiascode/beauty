import { redirect } from "next/navigation";

export default function LegacySessionsRoute() {
  redirect("/operations/sessions");
}
