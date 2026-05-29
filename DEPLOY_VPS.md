# Публикация AutoLight на VPS (РФ)

Алгоритм для российского VPS: Timeweb Cloud, Beget, Reg.ru, Selectel и аналоги (~150–300 ₽/мес).

## Что нужно заранее

- VPS с Ubuntu 22.04/24.04
- Домен (A-запись на IP VPS)
- Репозиторий: https://github.com/gelyas/AutoLight
- Секреты — см. [SECRETS.md](./SECRETS.md) (в git не коммитятся)

## 1. Подготовка сервера

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git caddy
node -v   # должно быть v20.x
```

Открыть порты в firewall провайдера: **80**, **443** (и **22** для SSH).

## 2. Код приложения

```bash
sudo mkdir -p /var/www/autolight
sudo chown $USER:$USER /var/www/autolight
git clone https://github.com/gelyas/AutoLight.git /var/www/autolight
cd /var/www/autolight
npm ci --omit=dev
```

## 3. Секреты на сервере

```bash
nano /var/www/autolight/.env
```

Содержимое (значения из [SECRETS.md](./SECRETS.md), не из репозитория):

```env
PORT=8080
TELEGRAM_BOT_TOKEN=<токен от @BotFather>
TELEGRAM_CHAT_ID=<id чата или группы>
```

Права:

```bash
chmod 600 /var/www/autolight/.env
```

Перед продом: в @BotFather выполнить `/revoke`, если старый токен где-то светился.

## 4. Запуск через pm2

```bash
sudo npm install -g pm2
cd /var/www/autolight
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# выполнить команду, которую выведет pm2 startup
```

Проверка локально на сервере:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/
# ожидается 200
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/server.js
# ожидается 404 (бэкенд не раздаётся)
```

## 5. HTTPS (Caddy)

`/etc/caddy/Caddyfile`:

```
ваш-домен.ru {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl enable caddy
sudo systemctl reload caddy
```

## 6. Cloudflare (рекомендуется)

1. Добавить домен в Cloudflare, сменить NS у регистратора.
2. A-запись → IP VPS, прокси включён (оранжевое облако).
3. SSL/TLS → **Full (strict)**.

В коде уже включено `trust proxy` — rate-limit по IP будет корректным за прокси.

## 7. Обновление после изменений в git

```bash
cd /var/www/autolight
git pull
npm ci --omit=dev
pm2 restart autolight
```

## 8. Чек-лист перед открытием сайта

- [ ] `.env` только на сервере, не в git
- [ ] Токен бота актуальный, бот в группе / пользователь нажал `/start`
- [ ] Форма на сайте отправляет заявку в Telegram
- [ ] `/server.js` и `/package.json` снаружи отдают 404
- [ ] HTTPS работает
- [ ] `npm audit fix` (при доступной сети к npm)
- [ ] Галочка согласия на обработку ПД (152-ФЗ) — при необходимости добавить позже

## Структура проекта

| Путь | Назначение |
|------|------------|
| `public/` | Сайт (HTML, assets) — единственное, что раздаётся наружу |
| `server.js` | API `/api/lead`, Telegram, rate-limit |
| `.env` | Секреты (локально и на VPS) |
| `.env.example` | Шаблон без секретов |
