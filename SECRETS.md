# Где лежат секреты AutoLight

**В git и на GitHub секреты не хранятся.** Файл `.env` в `.gitignore`.

## Локальная разработка (Windows)

| Что | Где |
|-----|-----|
| Токен бота, chat id, PORT | `AutoLight/.env` |
| Шаблон без значений | `AutoLight/.env.example` |

Создание локально:

```powershell
cd AutoLight
Copy-Item .env.example .env
# заполнить TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env
```

## Продакшен (VPS)

| Что | Где |
|-----|-----|
| Все переменные окружения | `/var/www/autolight/.env` |
| Права | `chmod 600` |

Значения те же, что в `.env.example`, но с реальными данными. Копировать с рабочей машины через SSH, **не** через git.

## Переменные

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен от [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ID чата/группы для заявок (отрицательный для групп) |
| `PORT` | Порт Node (8080 на VPS, локально можно 8081) |

## Если токен утёк

1. @BotFather → `/revoke` → новый токен.
2. Обновить `.env` локально и на VPS.
3. `pm2 restart autolight` на сервере.

## Деплой

Пошаговый алгоритм VPS: [DEPLOY_VPS.md](./DEPLOY_VPS.md).
