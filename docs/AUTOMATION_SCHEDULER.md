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

### Шаг 1. Получите `QSTASH_TOKEN`
1. Войдите в [Upstash Console](https://console.upstash.com).
2. В верхнем меню выберите **QStash**.
3. Нажмите кнопку **Copy** рядом с `QSTASH_TOKEN`.

### Шаг 2. Запустите автоматический скрипт
В терминале проекта выполните:
```bash
npm run qstash:setup -- --token=<ВАШ_QSTASH_TOKEN> --secret=<ВАШ_CRON_SECRET>
```

Скрипт автоматически:
- Проверит существующие расписания, чтобы не допустить дублирования;
- Создаст расписание для **Breakout V2-AD** (`*/10 * * * *` -> `/api/cron/breakout`);
- Создаст расписание для **Model D** (`*/10 * * * *` -> `/api/cron/model-d`);
- Установит 3 автоматических повтора при сетевых сбоях;
- Привяжет безопасный заголовок авторизации `Authorization: Bearer <CRON_SECRET>`.

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

## 6. Отключение GitHub Actions (по желанию)

После того как вы активировали QStash или cron-job.org, вы можете отключить расписание GitHub Actions, чтобы не тратить лимиты минут репозитория:
- Перейдите в GitHub -> **Actions** -> **Model D Scheduler** -> `...` -> **Disable workflow**.
- Перейдите в GitHub -> **Actions** -> **Breakout Paper Scheduler** -> `...` -> **Disable workflow**.
