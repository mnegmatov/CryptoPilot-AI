# CryptoPilot AI — Руководство по надёжной автоматизации планировщиков

## 1. Проблема встроенного планировщика GitHub Actions

В ходе технического аудита 229 запусков GitHub Actions было установлено:
- **Заявленное расписание в YAML:** `cron: "*/10 * * * *"` (каждые 10 минут).
- **Фактическая медиана интервалов:** **4.70 – 4.77 часа**.
- **Максимальная задержка:** **9.48 часов**.

### Последствия для торговых систем
1. **Breakout V2-AD:** Окно исполнения пробоя строго ограничено свечой $T+1$ (4 часа). При задержках запуска более 4 часов свеча $T+1$ успевает закрыться, и торговый сигнал безвозвратно теряется.
2. **Model D:** Трейлинг-стопы и стоп-лоссы проверяются с опозданием до 4–9 часов вместо 10 минут.

---

## 2. Сравнение внешних решений

| Параметр | Upstash QStash (Рекомендуется) | cron-job.org (Альтернатива) | GitHub Actions (Текущий) | Vercel Cron |
| :--- | :--- | :--- | :--- | :--- |
| **Точность запуска** | **Секунды** | 1–2 минуты | Задержка 2–9 часов | 1 минута |
| **Стоимость** | **Бесплатно** (до 500 запросов/день) | **Бесплатно** без ограничений | Бесплатно | $20/мес (Pro plan Vercel) |
| **Лимиты** | 288 запросов/день при интервале 10 мин | Без лимитов | 2000 мин/мес | 1 раз/день на Hobby плане |
| **Ретраи при сбоях** | Да (3 попытки, backoff) | Да | Нет | Нет |
| **Подпись / Безопасность**| `CRON_SECRET` + QStash Signature | `CRON_SECRET` Header | `CRON_SECRET` Header | Vercel Signature |
| **Сложность настройки** | 1 команда CLI (`npm run qstash:setup`) | 2 минуты в веб-интерфейсе | Уже настроен | Требует апгрейда Vercel |

---

## 3. Вариант 1: Автоматическая настройка через Upstash QStash (1 команда)

Проект CryptoPilot AI уже использует Upstash Redis. Консоль QStash доступна в том же аккаунте Upstash.
Скрипт `scripts/setup-qstash.mjs` выполняется напрямую нативно в Node.js без установки дополнительных пакетов или компиляторов (`tsx`).

### Шаг 1. Получите `QSTASH_TOKEN` и `CRON_SECRET`
1. Войдите в [Upstash Console](https://console.upstash.com).
2. В верхнем меню выберите **QStash**.
3. Нажмите кнопку **Copy** рядом с `QSTASH_TOKEN`.
4. В панели [Vercel Dashboard](https://vercel.com) проекта проверьте значение `CRON_SECRET` в разделе **Settings -> Environment Variables**.

### Шаг 2. Запустите автоматический скрипт через переменные окружения
Чтобы секреты не сохранялись в истории терминала (`~/.zsh_history`), передавайте их через переменные окружения:

```bash
# 1. Проверить текущие расписания в QStash (режим только для чтения, без изменений):
export QSTASH_TOKEN="<ВАШ_QSTASH_TOKEN>"
npm run qstash:setup -- --action=list

# 2. Создать / обновить расписания для CryptoPilot:
export CRON_SECRET="<ВАШ_CRON_SECRET>"
npm run qstash:setup
```

Скрипт автоматически:
- Проверит существующие расписания в аккаунте;
- Заменит только расписания CryptoPilot AI, не трогая другие задачи в вашем Upstash аккаунте;
- Создаст расписание для **Breakout V2-AD** (`*/10 * * * *` -> `/api/cron/breakout`);
- Создаст расписание для **Model D** (`*/10 * * * *` -> `/api/cron/model-d`);
- Установит 3 автоматических повтора с экспоненциальной задержкой при сбоях;
- Привяжет безопасный заголовок `Authorization: Bearer <CRON_SECRET>`.

### Дополнительные команды управления:
```bash
# Просмотр активных расписаний (read-only аудит):
npm run qstash:setup -- --action=list

# Удаление только расписаний CryptoPilot:
npm run qstash:setup -- --action=delete
```

---

## 4. Ограничения тарифов Vercel Hobby и Upstash QStash Free

| Платформа | Метрика / Лимит тарифа | Расход CryptoPilot (интервал 10 мин) | Статус |
| :--- | :--- | :--- | :--- |
| **QStash Free** | **500 запросов/день** | 2 расписания × 144 запуска = **288 запросов/день** | ✅ **57.6% квоты**, с запасом на повторы |
| **QStash Free** | **Конкурентность 5** | 2 параллельных задачи в момент запуска | ✅ В пределах лимита (2 < 5) |
| **Vercel Hobby** | **Встроенный vercel.json cron** | Лимит: **1 раз в сутки** (не подходит для 10 мин) | ℹ️ Причина использования внешнего QStash |
| **Vercel Hobby** | **Serverless Function invocations** | Лимит: **100,000 в месяц** (CryptoPilot: ~8,640/мес) | ✅ **<9% квоты** |
| **Vercel Hobby** | **Function execution timeout** | Макс. **10 секунд** на вызов | ✅ Циклы выполняются за 0.8–2.5 сек |

---

## 4. Вариант 2: Бесплатная настройка через cron-job.org (2 минуты в браузере)

Если у вас нет под рукой токена Upstash, настройте вызовы через [cron-job.org](https://cron-job.org):

1. Зарегистрируйтесь на [cron-job.org](https://cron-job.org) (бесплатно, без кредитных карт).
2. Перейдите в **Cronjobs** -> **Create Cronjob**.
3. **Создайте Задачу 1 (Breakout Paper Trading):**
   - **Title:** `CryptoPilot Breakout Paper`
   - **URL:** `https://crypto-pilot-ai-beta.vercel.app/api/cron/breakout`
   - **Schedule:** Every 10 minutes (`*/10 * * * *`)
   - **Request method:** `GET`
   - **Headers:** Добавьте заголовок:
     - Name: `Authorization`
     - Value: `Bearer <ВАШ_CRON_SECRET>`
   - Нажмите **Create**.
4. **Создайте Задачу 2 (Model D Paper Trading):**
   - **Title:** `CryptoPilot Model D Paper`
   - **URL:** `https://crypto-pilot-ai-beta.vercel.app/api/cron/model-d`
   - **Schedule:** Every 10 minutes (`*/10 * * * *`)
   - **Request method:** `GET`
   - **Headers:** Добавьте заголовок:
     - Name: `Authorization`
     - Value: `Bearer <ВАШ_CRON_SECRET>`
   - Нажмите **Create**.

---

## 5. Защита от дублирования и параллельного запуска (Debounce Guard)

В кодовую базу CryptoPilot AI встроен **двухуровневый механизм защиты**:
1. **Распределенный Redis Lock:** Исключает одновременное выполнение двух циклов. Если два запроса пришли в одну секунду, один захватывает блокировку, второй безопасно ожидает либо возвращает статус занятости.
2. **Debounce Guard (60 секунд):** Если цикл уже выполнился менее 60 секунд назад, повторный вызов мгновенно возвращает:
   ```json
   {
     "success": true,
     "skipped": true,
     "skipReason": "Cycle skipped: already executed 15s ago (debounce threshold is 60s)"
   }
   ```
   Это полностью предотвращает спам в Binance API, дублирующие транзакции и лишние снапшоты даже в случае, если активны сразу GitHub Actions и внешний планировщик.

---

## 6. Отключение расписания GitHub Actions (для экономии минут)

После того как вы активировали QStash или cron-job.org, расписание GitHub Actions можно отключить одним из двух способов:

**Способ A (через репозиторную переменную):**
- Перейдите в GitHub -> **Settings** -> **Secrets and variables** -> **Actions** -> вкладка **Variables**.
- Добавьте переменную `ENABLE_GITHUB_ACTIONS_CRON` со значением `false`.
- Расписание перестанет запускаться, но ручной запуск (**Run workflow**) останется доступен.

**Способ B (в интерфейсе GitHub Actions):**
- Перейдите в GitHub -> **Actions** -> **Model D Scheduler** -> `...` -> **Disable workflow**.
- Перейдите в GitHub -> **Actions** -> **Breakout Paper Scheduler** -> `...` -> **Disable workflow**.

---

## 7. Справочник переменных окружения

| Переменная | Где настраивается | Обязательность | Назначение |
| :--- | :--- | :--- | :--- |
| `CRON_SECRET` | **Vercel** (Production) & **GitHub Secrets** | **Обязательно** | Секретный токен для авторизации запросов к `/api/cron/breakout` и `/api/cron/model-d`. |
| `UPSTASH_REDIS_REST_URL` | **Vercel** (Production) | **Обязательно** | URL базы данных Upstash Redis для сохранения сделок и распределённых блокировок. |
| `UPSTASH_REDIS_REST_TOKEN` | **Vercel** (Production) | **Обязательно** | Токен доступа к Upstash Redis REST API. |
| `QSTASH_TOKEN` | **Локальный терминал** при запуске скрипта | **Только при настройке QStash** | Токен API Upstash QStash для создания расписаний через `npm run qstash:setup`. В Vercel не требуется. |
| `QSTASH_CURRENT_SIGNING_KEY` | **Vercel** (Production) | Опционально | Публичный ключ для проверки криптографических подписей QStash HMAC-SHA256. |
| `QSTASH_NEXT_SIGNING_KEY` | **Vercel** (Production) | Опционально | Ключ ротации для бесшовной смены ключей QStash. |
| `GEMINI_API_KEY` | **Vercel** (Production) | Опционально | Ключ Gemini API для ИИ-анализа рынка (при отсутствии используется детерминированный движок). |
| `ENABLE_GITHUB_ACTIONS_CRON` | **GitHub Repo Variables** | Опционально (`true`/`false`) | Флаг включения/отключения запусков по расписанию в GitHub Actions (по умолчанию включён как резервный). |
| `BREAKOUT_CRON_URL` | **GitHub Repo Variables** | Для GitHub Actions | URL целевого эндпоинта (`https://crypto-pilot-ai-beta.vercel.app/api/cron/breakout`). |
| `MODEL_D_CRON_URL` | **GitHub Repo Variables** | Для GitHub Actions | URL целевого эндпоинта (`https://crypto-pilot-ai-beta.vercel.app/api/cron/model-d`). |
