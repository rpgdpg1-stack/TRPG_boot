// ESLint flat config (ESLint 9). Проект на ES-модулях ("type":"module"),
// поэтому и конфиг в формате import/export.
//
// Цель этапа 6.6 — поймать баги хуков:
//   react-hooks/rules-of-hooks  → ОШИБКА (условный/вложенный вызов хука = баг)
//   react-hooks/exhaustive-deps → ПРЕДУПРЕЖДЕНИЕ (неполные зависимости useEffect)
// Плюс пара полезных правил React (забытый key в списках, неизвестный компонент)
// и базовый набор ESLint. Шумные правила приглушены до warn, чтобы не пугать объёмом.

import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  // Не проверяем сборку, зависимости и серверную часть Supabase
  { ignores: ['dist', 'dist-ssr', 'build', 'node_modules', 'supabase'] },

  // Базовые рекомендации ESLint
  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // ID сборки, вшивается vite define (vite.config.js) — см. lib/version-check.js
        __BUILD_ID__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: '18.3' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      // --- Хуки: главная цель этапа ---
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // --- React: только то что ловит реальные баги ---
      'react/jsx-key': 'warn',          // забытый key в .map()
      'react/jsx-no-undef': 'error',    // используешь компонент, которого нет
      // КРИТИЧНО для flat-config: эти два правила объясняют ESLint, что
      // JSX (<App/>, <MuscleIcon/>) — это ИСПОЛЬЗОВАНИЕ импорта/переменной.
      // Без них no-unused-vars даёт лавину ложных срабатываний на всё,
      // что используется только внутри разметки.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',

      // --- Базовое от ESLint, приглушено ---
      // Игнорируем неиспользуемые аргументы с именем e/_ (наши пустые catch (e))
      // и переменные, начинающиеся с _ — это осознанные заглушки, не мусор.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^(e|_)',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',  // не ругаться на catch (e) {} — намеренное глушение ошибок
      }],
      'no-empty': 'off',               // пустые catch {} у нас намеренные
    },
  },
]