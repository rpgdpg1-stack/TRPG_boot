---
name: trpg-supabase
description: Конвенции базы данных проекта TRPG (Supabase Postgres). Применять при написании SQL, RPC, RLS-политик, миграций и Edge Functions для проекта TRPG.
---

# TRPG Supabase

Правила работы с базой данных проекта **TRPG**. Project Ref: `jybwxbqmnommazjfucbq`.

## Применение миграций

- Если правка **утверждена Дмитрием** — применять её самому через Supabase MCP-коннектор
  (`apply_migration` / `execute_sql`), не выводить SQL-блок для ручной вставки.
- Перед применением показать финальный SQL.
- На деструктив (DROP, TRUNCATE, DELETE/UPDATE без WHERE, ALTER с потерей данных) —
  переспросить отдельно, даже если задача в целом утверждена.
- Если коннектор недоступен — фолбэк: готовый блок для Supabase SQL Editor.
- После применения миграции — сразу тестировать (см. ниже).

## Правила для RPC-функций

- Все RPC с `SECURITY DEFINER` + `SET search_path TO 'public'` + явные `GRANT`/`REVOKE`.
- `CREATE OR REPLACE FUNCTION` везде.
- **Перед написанием новой функции** проверять существующую логику:
  `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'имя_функции';`
- Тестировать сразу после миграции: `SELECT * FROM public.api_get_friends_list(2);`
- Для нескольких тестовых user ID — `UNION ALL` с алиасами:
  ```sql
  SELECT 'me(2)'  as who, * FROM public.api_get_my_league_place(2)
  UNION ALL
  SELECT 'fr(10)' as who, * FROM public.api_get_my_league_place(10);
  ```

### Шаблон RPC

```sql
CREATE OR REPLACE FUNCTION public.api_example(p_user_id bigint)
RETURNS TABLE (...)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ...
  WHERE user_id = current_user_id();   -- защита от чужого user_id
$$;

REVOKE ALL ON FUNCTION public.api_example(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_example(bigint) TO authenticated;
```

## Именование (SQL)

- Публичные RPC для фронта: префикс `api_*` (`api_get_friends_list`, `api_toggle_pin_friend`).
- Параметры функций: префикс `p_*` (`p_user_id`).
- Таблицы и колонки: snake_case.
- DEFINER-операции пользователя над собой: `api_*_my_*` (`api_reset_my_progress`).

## RLS

- Все таблицы защищены реальными политиками через `auth.uid()`.
- Хелпер `current_user_id()` мапит `auth.uid()` → внутренний `users.id`.
- Колоночная защита таблицы `users` от накрутки мускулов.
- DEFINER-функция `api_reset_my_progress()` для сброса прогресса.
- Тестовые внутренние user ID: 2 (Дмитрий), 10, 11, 12 (друзья).

## Аутентификация

- Edge Function `telegram-auth`: HMAC-SHA256 верификация Telegram initData.
- `auth_id` в таблице `users`; вход через `supabase.auth.verifyOtp`.

## Сезонная система

- Сброс раз в квартал через `pg_cron` + фронтенд-фолбэк.
- ISO-неделя: формат `IYYY-IW` (НЕ `YYYY-WW`) — для совместимости с `to_char`.
- Стрики кэпнуты на 7 естественно структурой БД (one-workout-per-day), `LEAST()` не нужен.

## Друзья

- Таблица `friend_pins` (лимит 5, RLS).
- RPC: `api_get_friends_list`, `api_toggle_pin_friend`, `api_get_my_league_place`.

## Медиа (Selectel S3, бакет `trpg`)

- Cache-Control `public, max-age=31536000, immutable`.
- Видео: `TRPG/video/`, превью: `TRPG/`.
- При замене видео — всегда НОВОЕ имя файла; старый удалять с задержкой (из-за immutable-кэша).
- Не смешивать публичные и приватные файлы в одном бакете.
- Модерация пользовательских аватаров — только server-side через Edge Function.

## Важно

- Legacy `service_role` ключ (формат `eyJ…`) действителен до конца 2026.
  Кнопку «disable legacy keys» НЕ нажимать до полной миграции ключей.
- GitHub Actions keepalive (2×/неделю) не даёт уснуть Supabase free-tier.
