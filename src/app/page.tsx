import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mazda_session")?.value;

  if (!token) {
    redirect("/login");
  }

  const user = await validateSession(token);
  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
