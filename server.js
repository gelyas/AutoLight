const path = require('path');

const express = require('express');

const dotenv = require('dotenv');



dotenv.config();



const app = express();

const PORT = Number(process.env.PORT || 8080);

const MAX_PER_WINDOW = 8;

const WINDOW_MS = 10 * 60 * 1000;



const leadAttempts = new Map();



app.use(express.json({ limit: '16kb' }));

app.use(express.urlencoded({ extended: false, limit: '16kb' }));



app.use((req, res, next) => {

  const origin = req.headers.origin || '';

  if (/^http:\/\/localhost:\d+$/i.test(origin)) {

    res.setHeader('Access-Control-Allow-Origin', origin);

    res.setHeader('Vary', 'Origin');

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  }

  if (req.method === 'OPTIONS') {

    return res.sendStatus(204);

  }

  return next();

});



app.use(express.static(path.resolve(__dirname)));



function getClientIp(req) {

  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {

    return forwarded.split(',')[0].trim();

  }

  return req.socket.remoteAddress || 'unknown';

}



function cleanupOldAttempts(now, attempts) {

  return attempts.filter((stamp) => now - stamp <= WINDOW_MS);

}



function rateLimitCheck(ip) {

  const now = Date.now();

  const attempts = cleanupOldAttempts(now, leadAttempts.get(ip) || []);

  if (attempts.length >= MAX_PER_WINDOW) {

    leadAttempts.set(ip, attempts);

    return { ok: false, retryMs: WINDOW_MS - (now - attempts[0]) };

  }

  attempts.push(now);

  leadAttempts.set(ip, attempts);

  return { ok: true, retryMs: 0 };

}



function isEmailValid(email) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

}



function isPhoneValid(phone) {

  const digits = String(phone || '').replace(/\D/g, '');

  return digits.length >= 10 && digits.length <= 15;

}



function isMessageValid(text) {

  return typeof text === 'string' && text.length >= 10 && text.length <= 1000;

}



function hasUrls(text) {

  return /(https?:\/\/|www\.)/i.test(text);

}



function escapeHtml(text) {

  return String(text)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;');

}



function sanitizeMeta(value, maxLen = 500) {

  if (value == null) return '';

  return String(value).trim().slice(0, maxLen);

}



function buildSourceLines({ pageUrl, pageTitle, pagePath, referrer, utmSource, utmMedium, utmCampaign, httpReferer, origin }) {

  const lines = [];

  const page = sanitizeMeta(pageUrl) || sanitizeMeta(origin);

  if (page) lines.push(`<b>Страница:</b> ${escapeHtml(page)}`);

  const title = sanitizeMeta(pageTitle, 200);

  if (title) lines.push(`<b>Заголовок:</b> ${escapeHtml(title)}`);

  const path = sanitizeMeta(pagePath, 200);

  if (path && path !== page) lines.push(`<b>Путь:</b> ${escapeHtml(path)}`);

  const ref = sanitizeMeta(referrer) || sanitizeMeta(httpReferer);

  lines.push(`<b>Переход с:</b> ${escapeHtml(ref || 'прямой заход / не указан')}`);

  const utmParts = [

    sanitizeMeta(utmSource, 120),

    sanitizeMeta(utmMedium, 120),

    sanitizeMeta(utmCampaign, 120)

  ].filter(Boolean);

  if (utmParts.length > 0) {

    lines.push(`<b>UTM:</b> ${escapeHtml(utmParts.join(' · '))}`);

  }

  return lines;

}



async function sendLeadToTelegram({ name, phone, email, message, ip, userAgent, source }) {

  const token = process.env.TELEGRAM_BOT_TOKEN;

  const chatId = process.env.TELEGRAM_CHAT_ID;



  if (!token || !chatId) {

    return { ok: false, status: 500, message: 'Telegram не настроен на сервере. Заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env.' };

  }



  const sourceLines = buildSourceLines(source || {});

  const text = [

    '<b>Новая заявка AutoLight</b>',

    '',

    `<b>Имя:</b> ${escapeHtml(name)}`,

    `<b>Телефон:</b> ${escapeHtml(phone)}`,

    `<b>Email:</b> ${escapeHtml(email)}`,

    '',

    '<b>Сообщение:</b>',

    escapeHtml(message),

    '',

    '<b>Откуда заявка:</b>',

    ...sourceLines,

    '',

    `<b>IP:</b> ${escapeHtml(ip)}`,

    `<b>User-Agent:</b> ${escapeHtml(userAgent)}`,

    `<b>Время:</b> ${new Date().toISOString()}`

  ].join('\n');



  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      chat_id: chatId,

      text,

      parse_mode: 'HTML'

    })

  });



  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {

    return {

      ok: false,

      status: 500,

      message: 'Ошибка отправки в Telegram. Проверьте настройки бота.',

      error: process.env.NODE_ENV === 'development' ? result : undefined

    };

  }



  return { ok: true };

}



app.post('/api/lead', async (req, res) => {

  const ip = getClientIp(req);

  const {

    name = '',

    phone = '',

    email = '',

    message = '',

    website = '',

    pageUrl = '',

    pageTitle = '',

    pagePath = '',

    referrer = '',

    utmSource = '',

    utmMedium = '',

    utmCampaign = ''

  } = req.body || {};



  if (String(website).trim() !== '') {

    return res.json({ ok: true, message: 'ok' });

  }



  const limiter = rateLimitCheck(ip);

  if (!limiter.ok) {

    return res.status(429).json({

      ok: false,

      message: 'Слишком много заявок. Повторите позже.',

      retryAfterSec: Math.ceil(limiter.retryMs / 1000)

    });

  }



  if (String(name).trim().length < 2 || String(name).trim().length > 60) {

    return res.status(422).json({ ok: false, message: 'Некорректное имя.' });

  }

  if (!isPhoneValid(phone)) {

    return res.status(422).json({ ok: false, message: 'Некорректный телефон.' });

  }

  if (!isEmailValid(String(email).trim())) {

    return res.status(422).json({ ok: false, message: 'Некорректный email.' });

  }

  if (!isMessageValid(String(message).trim())) {

    return res.status(422).json({ ok: false, message: 'Некорректное сообщение.' });

  }

  if (hasUrls(String(message))) {

    return res.status(422).json({ ok: false, message: 'Ссылки в сообщении не разрешены.' });

  }



  try {

    const telegramResult = await sendLeadToTelegram({

      name: String(name).trim(),

      phone: String(phone).trim(),

      email: String(email).trim(),

      message: String(message).trim(),

      ip,

      userAgent: sanitizeMeta(req.headers['user-agent'] || 'unknown', 500),

      source: {

        pageUrl: sanitizeMeta(pageUrl),

        pageTitle: sanitizeMeta(pageTitle, 200),

        pagePath: sanitizeMeta(pagePath, 200),

        referrer: sanitizeMeta(referrer),

        utmSource: sanitizeMeta(utmSource, 120),

        utmMedium: sanitizeMeta(utmMedium, 120),

        utmCampaign: sanitizeMeta(utmCampaign, 120),

        httpReferer: sanitizeMeta(req.headers.referer || ''),

        origin: sanitizeMeta(req.headers.origin || '')

      }

    });



    if (!telegramResult.ok) {

      return res.status(telegramResult.status || 500).json({

        ok: false,

        message: telegramResult.message,

        error: telegramResult.error

      });

    }



    return res.json({ ok: true, message: 'Заявка отправлена' });

  } catch (error) {

    return res.status(500).json({

      ok: false,

      message: 'Ошибка отправки заявки. Попробуйте позже.',

      error: process.env.NODE_ENV === 'development' ? String(error) : undefined

    });

  }

});



app.listen(PORT, () => {

  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (chatId && !String(chatId).trim().startsWith('-')) {

    // eslint-disable-next-line no-console

    console.warn('Telegram: TELEGRAM_CHAT_ID похож на личный чат. Для группы используйте отрицательный id, например -5219787426');

  }

  // eslint-disable-next-line no-console

  console.log(`AutoLight server started: http://localhost:${PORT}`);

});


