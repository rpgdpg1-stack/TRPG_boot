/**
 * Проверка подписи Telegram initData — общая для всех функций.
 *
 * Жила копией внутри telegram-auth; с появлением привязки почты мест стало
 * два, а расходиться такой проверке нельзя: это единственное, что отделяет
 * настоящего человека от подделанных данных.
 */

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

export async function verifyTelegramInitData(
  initData: string,
): Promise<Record<string, string> | null> {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  // data_check_string: все пары кроме hash, отсортированы по ключу, через \n
  params.delete("hash");
  const pairs: string[] = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(BOT_TOKEN));

  const signKey = await crypto.subtle.importKey(
    "raw", secret,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));

  const computed = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  if (computed !== hash) return null;

  // Свежесть: данные старше суток не принимаем (защита от переигрывания).
  const authDate = parseInt(params.get("auth_date") || "0", 10);
  if (Math.floor(Date.now() / 1000) - authDate > 86400) return null;

  return Object.fromEntries(params.entries());
}

/** telegram_id из проверенных данных, либо null. */
export function telegramIdFrom(verified: Record<string, string>): number | null {
  try {
    const user = JSON.parse(verified.user || "{}");
    return typeof user.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
