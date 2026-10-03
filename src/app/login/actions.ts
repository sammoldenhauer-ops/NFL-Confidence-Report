"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, expectedAuthToken } from "../../lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/prizepicks");
  const expected = await expectedAuthToken();

  if (!expected || password !== process.env.APP_PASSWORD) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=1`);
  }

  (await cookies()).set(AUTH_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next);
}
