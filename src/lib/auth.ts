// Shared-password gate for the private /prizepicks pages (Part D). Web Crypto so this works in
// both the Edge middleware runtime and Node server actions without a runtime-specific import.
export const AUTH_COOKIE = "pp_auth";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedAuthToken(): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}
