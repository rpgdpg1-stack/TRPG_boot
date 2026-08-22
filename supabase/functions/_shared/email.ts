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
 * Вёрстка на таблицах и инлайн-стилях: почтовые клиенты режут современный CSS.
 * Полотно светлое намеренно — сплошной тёмный фон половина клиентов покажет
 * чёрным прямоугольником с невидимым текстом; фирменная темнота отдана только
 * плашке с кодом, где потерять её не страшно. Код продублирован обычным
 * текстом — на случай, если картинки в письмах человек отключил вовсе.
 */
export async function sendCodeEmail(to: string, code: string, purpose: "login" | "link") {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("smtp_not_configured");
  }

  const title = purpose === "link" ? "Подтверждение почты" : "Вход в TRPG";
  const lead = purpose === "link"
    ? "Вы привязываете эту почту к своему аккаунту TRPG."
    : "Вы входите в TRPG по этой почте.";

  // Логотип берём с боевого домена: base64-картинки Gmail и часть клиентов
  // режут, а внешний PNG по HTTPS показывают все. Если картинки отключены —
  // на её месте остаётся alt-текст «TRPG», письмо не разваливается.
  const logo = "https://trpg1.ru/icon-192.png";

  const html = `<!doctype html>
<html lang="ru"><body style="margin:0;padding:24px 16px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;">
    <tr><td style="padding:32px 32px 28px;">

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="vertical-align:middle;">
            <img src="${logo}" width="44" height="44" alt="TRPG"
                 style="display:block;width:44px;height:44px;border-radius:12px;border:0;" />
          </td>
          <td style="vertical-align:middle;padding-left:12px;">
            <div style="font-size:17px;font-weight:700;color:#0A0A0B;letter-spacing:0.5px;">TRPG</div>
            <div style="font-size:12px;color:#9ca3af;">тренировки</div>
          </td>
        </tr>
      </table>

      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0A0A0B;">${title}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4b5563;">${lead} Введите код в приложении:</p>

      <div style="background:#0A0A0B;border-radius:14px;padding:20px 16px;text-align:center;">
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#9ED153;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
      </div>

      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">Код действует 10 минут. Если вы этого не запрашивали — просто удалите письмо, ничего не произойдёт.</p>

    </td></tr>
    <tr><td style="padding:16px 32px 20px;border-top:1px solid #f0f0f1;">
      <div style="font-size:12px;color:#9ca3af;">trpg1.ru · письмо отправлено автоматически, отвечать на него не нужно</div>
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
      // ТЕМА КОРОТКАЯ — это вынужденно, а не выбор стиля.
      //
      // Кириллица в заголовке письма кодируется втрое длиннее себя, а стандарт
      // ограничивает такую строку 75 символами; denomailer длинные не разбивает,
      // и почтовый сервис отвечает отказом «invalid mail data» — без единого
      // намёка, что дело в теме. Прежняя «123456 — код для входа в TRPG» в лимит
      // не влезала, и письма не уходили вовсе.
      //
      // «Код 123456» влезает с запасом и заодно читается прямо в списке писем:
      // открывать его ради шести цифр часто и не понадобится.
      subject: `Код ${code}`,
      content: `${lead}\n\nКод: ${code}\n\nДействует 10 минут. Если вы этого не запрашивали — просто удалите письмо.`,
      html,
    });
  } catch (e) {
    // В лог кладём отправителя и домен получателя. Почтовый сервис отвечает
    // общей фразой «invalid mail data» на любые претензии к письму, и без этих
    // двух значений причину не отличить: опечатка в адресе отправителя,
    // неподтверждённый домен и отказ по получателю выглядят одинаково.
    const toDomain = String(to).split("@")[1] || "?";
    throw new Error(`from="${MAIL_FROM}" toDomain="${toDomain}" :: ${String(e)}`);
  } finally {
    await client.close();
  }
}
