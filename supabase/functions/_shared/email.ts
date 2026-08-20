/**
 * Код подтверждения: генерация, отпечаток и письмо.
 *
 * Отпечаток (hash) считается с секретной солью и хранится в базе ВМЕСТО кода.
 * Соль здесь принципиальна: без неё шестизначное число перебирается по словарю
 * за секунды, и утёкшая таблица отдала бы все действующие коды разом.
 */

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CODE_SALT = Deno.env.get("EMAIL_CODE_SALT") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "465", 10);
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "noreply@trpg1.ru";

/** Шесть цифр из криптостойкого источника, а не из Math.random. */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** Отпечаток кода. Адрес входит в него намеренно: код, выпущенный одному
 *  человеку, не подойдёт другому даже при совпадении цифр. */
export async function hashCode(code: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${email.toLowerCase()}:${CODE_SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Письмо с кодом.
 *
 * Вёрстка нарочно простая и светлая: почтовые клиенты режут современный CSS,
 * а тёмный фон половина из них покажет как чёрный прямоугольник с невидимым
 * текстом. Код продублирован обычным текстом — на случай, если картинку писем
 * человек отключил вовсе.
 */
export async function sendCodeEmail(to: string, code: string, purpose: "login" | "link") {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("smtp_not_configured");
  }

  const title = purpose === "link" ? "Подтверждение почты" : "Вход в TRPG";
  const lead = purpose === "link"
    ? "Вы привязываете эту почту к своему аккаунту TRPG."
    : "Вы входите в TRPG по этой почте.";

  const html = `<!doctype html>
<html lang="ru"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
    <tr><td>
      <div style="font-size:13px;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;">TRPG</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#111827;">${title}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4b5563;">${lead} Введите код в приложении:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111827;text-align:center;padding:16px 0;background:#f9fafb;border-radius:12px;">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">Код действует 10 минут. Если вы этого не запрашивали — просто удалите письмо, ничего не произойдёт.</p>
    </td></tr>
  </table>
</body></html>`;

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });

  try {
    await client.send({
      from: `TRPG <${MAIL_FROM}>`,
      to,
      subject: `${code} — код для входа в TRPG`,
      content: `${lead}\n\nКод: ${code}\n\nДействует 10 минут. Если вы этого не запрашивали — просто удалите письмо.`,
      html,
    });
  } finally {
    await client.close();
  }
}
