# RPG Training App

Telegram Mini App для тренировок в стиле RPG.

## Технологии

- **React 18 + Vite** — фронтенд
- **React Router** — роутинг между страницами
- **Telegram Web App SDK** — интеграция с Telegram (юзер, тема, кнопки, вибрация)
- **Supabase** — база данных (Postgres) для пользователей, тренировок, упражнений и истории
- **Selectel CDN** — медиа (картинки и видео упражнений)
- **Vercel** — хостинг и автоматический деплой при пуше в `main`

## Структура

- `src/lib/supabase.js` — клиент БД
- `src/lib/auth.js` — авторизация через Telegram
- `src/lib/storage.js` — обёртка над всеми операциями с данными
- `src/lib/levels.js` — система рангов и формул мускулов
- `src/lib/telegram.js` — обёртка над Telegram WebApp SDK

## Команды

- `npm install` — установить зависимости
- `npm run dev` — запустить локально для разработки
- `npm run build` — собрать для продакшна

## Переменные окружения

Нужны в `.env.local` (для локальной разработки) и в Vercel → Project Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-publishable-or-anon-key
```
