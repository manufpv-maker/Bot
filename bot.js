const express = require('express');
const axios = require('axios');
const fs = require('fs');

// ============================================================================
// KONFIGURATION
// ============================================================================
const PORT = process.env.PORT || 3001;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID).trim() : null;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ? String(process.env.ADMIN_TOKEN).trim() : '';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const ACCESS_FILE = './access.json';
const FAVORITES_FILE = './favorites.json';

const app = express();
app.use(express.json());

// ============================================================================
// DATEN LADEN
// ============================================================================
let psalmsData = [];
let collectionsData = {};
let accessData = { users: {}, tokens: {} };
let favoritesData = {};
let userState = {};
let userLanguage = {};

// Sprach-Strings
const translations = {
  ru: {
    welcome: '🙏 Добро пожаловать в Сборник Псалмов!',
    search_help: 'Как искать:\n• Введите номер: <code>5</code>\n• Введите название: <code>Радость</code>\n• Введите код сборника + номер: <code>п5</code>, <code>к10</code>',
    commands: 'Команды:\n/start - Начало\n/help - Справка\n/favorites - Избранное\n/language - Язык\n/glavy - Все сборники',
    all_collections: '📚 Все сборники',
    search_placeholder: '🔍 Введите номер, название или код сборника',
    new_search: '🔍 Новый поиск',
    favorites: '❤️ Избранное',
    language: '🌐 Язык',
    add_favorite: '❤️ в избранное',
    remove_favorite: '🤍 Удалить',
    no_favorites: 'Нет избранных псалмов',
    favorite_added: '✅ Добавлено в избранное',
    favorite_removed: '✅ Удалено из избранного',
    results: 'Результаты',
    page: 'страница',
    next: '➡️ Далее',
    prev: '⬅️ Назад',
    back: '🔙 Назад',
    more: 'ещё',
    admin_panel: '🛡️ Админ-панель',
    users: '👥 Пользователи',
    pending: '⏳ Ожидающие',
    statistics: '📊 Статистика',
    approved: '✅ Одобрено',
    denied: '❌ Отклонено',
    blocked: '🚫 Заблокировано',
    total: '📊 Всего',
    welcome_approved: '🙏 Добро пожаловать в Сборник Псалмов!',
    not_approved: 'Это бот со всеми нашими псалмами, ваша заявка принята и будет как можно быстрее обработана',
    new_request: '🔔 Новая заявка на доступ',
    approve: '✅ Одобрить',
    deny: '❌ Отклонить',
    request_denied: '❌ Ваша заявка была отклонена.',
    approved_text: '✅ Одобрено',
    denied_text: '❌ Заявка отклонена',
    user_not_found: 'Пользователь не найден',
    invalid_token: 'Ungültiger Admin-Token',
    user_id_required: 'User ID erforderlich',
    success: 'Успешно',
    error: 'Ошибка',
    invalid_psalm: 'Псалом не найден',
    collections_list: 'Поддерживаемые сборники',
    language_selected: 'Язык выбран'
  },
  de: {
    welcome: '🙏 Willkommen zur Psalmensammlung!',
    search_help: 'So suchen Sie:\n• Geben Sie eine Nummer ein: <code>5</code>\n• Geben Sie einen Titel ein: <code>Freude</code>\n• Geben Sie einen Sammlungscode + Nummer ein: <code>п5</code>, <code>к10</code>',
    commands: 'Befehle:\n/start - Start\n/help - Hilfe\n/favorites - Favoriten\n/language - Sprache\n/glavy - Alle Sammlungen',
    all_collections: '📚 Alle Sammlungen',
    search_placeholder: '🔍 Geben Sie eine Nummer, einen Titel oder einen Sammlungscode ein',
    new_search: '🔍 Neue Suche',
    favorites: '❤️ Favoriten',
    language: '🌐 Sprache',
    add_favorite: '❤️ в избранное',
    remove_favorite: '🤍 Entfernen',
    no_favorites: 'Keine Lieblingssalmen',
    favorite_added: '✅ Zu Favoriten hinzugefügt',
    favorite_removed: '✅ Aus Favoriten entfernt',
    results: 'Ergebnisse',
    page: 'Seite',
    next: '➡️ Weiter',
    prev: '⬅️ Zurück',
    back: '🔙 Zurück',
    more: 'mehr',
    admin_panel: '🛡️ Admin-Panel',
    users: '👥 Benutzer',
    pending: '⏳ Ausstehend',
    statistics: '📊 Statistik',
    approved: '✅ Genehmigt',
    denied: '❌ Abgelehnt',
    blocked: '🚫 Blockiert',
    total: '📊 Gesamt',
    welcome_approved: '🙏 Willkommen zur Psalmensammlung!',
    not_approved: 'Dies ist ein Bot mit allen unseren Psalmen. Ihr Antrag wurde eingereicht und wird so schnell wie möglich bearbeitet',
    new_request: '🔔 Neuer Zugriffsantrag',
    approve: '✅ Genehmigen',
    deny: '❌ Ablehnen',
    request_denied: '❌ Ihr Antrag wurde abgelehnt.',
    approved_text: '✅ Genehmigt',
    denied_text: '❌ Antrag abgelehnt',
    user_not_found: 'Benutzer nicht gefunden',
    invalid_token: 'Ungültiger Admin-Token',
    user_id_required: 'Benutzer-ID erforderlich',
    success: 'Erfolg',
    error: 'Fehler',
    invalid_psalm: 'Psalm nicht gefunden',
    collections_list: 'Unterstützte Sammlungen',
    language_selected: 'Sprache ausgewählt'
  },
  ua: {
    welcome: '🙏 Ласкаво просимо до Збірки Псалмів!',
    search_help: 'Як шукати:\n• Введіть номер: <code>5</code>\n• Введіть назву: <code>Радість</code>\n• Введіть код збірки + номер: <code>п5</code>, <code>к10</code>',
    commands: 'Команди:\n/start - Початок\n/help - Довідка\n/favorites - Улюблені\n/language - Мова\n/glavy - Усі збірки',
    all_collections: '📚 Усі збірки',
    search_placeholder: '🔍 Введіть номер, назву або код збірки',
    new_search: '🔍 Новий пошук',
    favorites: '❤️ Улюблені',
    language: '🌐 Мова',
    add_favorite: '❤️ в избранное',
    remove_favorite: '🤍 Видалити',
    no_favorites: 'Немає улюблених псалмів',
    favorite_added: '✅ Додано в улюблені',
    favorite_removed: '✅ Видалено з улюблених',
    results: 'Результати',
    page: 'сторінка',
    next: '➡️ Далі',
    prev: '⬅️ Назад',
    back: '🔙 Назад',
    more: 'ще',
    admin_panel: '🛡️ Адмін-панель',
    users: '👥 Користувачі',
    pending: '⏳ Очікування',
    statistics: '📊 Статистика',
    approved: '✅ Схвалено',
    denied: '❌ Відхилено',
    blocked: '🚫 Заблоковано',
    total: '📊 Всього',
    welcome_approved: '🙏 Ласкаво просимо до Збірки Псалмів!',
    not_approved: 'Це бот з усіма нашими псалмами, ваш запит прийнятий і буде оброблений якнайшвидше',
    new_request: '🔔 Новий запит на доступ',
    approve: '✅ Схвалити',
    deny: '❌ Відхилити',
    request_denied: '❌ Ваш запит був відхилений.',
    approved_text: '✅ Схвалено',
    denied_text: '❌ Запит відхилено',
    user_not_found: 'Користувача не знайдено',
    invalid_token: 'Невірний токен адміна',
    user_id_required: 'Потрібен ID користувача',
    success: 'Успіх',
    error: 'Помилка',
    invalid_psalm: 'Псалом не знайдений',
    collections_list: 'Підтримувані збірки',
    language_selected: 'Мова вибрана'
  }
};

function t(lang, key) {
  return translations[lang]?.[key] || translations['ru']?.[key] || key;
}

// ============================================================================
// DATEN LADEN
// ============================================================================
function loadPsalms() {
  try {
    const data = JSON.parse(fs.readFileSync('./psalms-data.json', 'utf-8'));
    psalmsData = Array.isArray(data) ? data : (data.psalms || []);
    console.log(`✅ ${psalmsData.length} Psalmen geladen`);
    
    // Lade collectionsData aus psalms-data-extended.json
    try {
      const extendedData = JSON.parse(fs.readFileSync('./psalms-data-extended.json', 'utf-8'));
      collectionsData = extendedData.collections || {};
      console.log('✅ Sammlungsmetadaten geladen');
    } catch (err) {
      console.warn('⚠️ psalms-data-extended.json nicht gefunden, verwende Defaults');
      // Defaults für Sammlungen
      collectionsData = {
        'п': { name: 'Песни Юности', name_de: 'Lieder der Jugend', name_ua: 'Пісні Юності' },
        'к': { name: 'Кувшинчик', name_de: 'Kännchen', name_ua: 'Кувшинчик' },
        'н': { name: 'Новые псалмы', name_de: 'Neue Psalmen', name_ua: 'Нові псалми' },
        'г': { name: 'Горлица', name_de: 'Taube', name_ua: 'Горлиця' },
        'с': { name: 'Псалмы Сиона', name_de: 'Psalmen Zions', name_ua: 'Псалми Сіону' },
        'м': { name: 'Мы поём Господу', name_de: 'Wir singen dem Herrn', name_ua: 'Ми поємо Господу' },
        'юс': { name: 'Мелодия юных сердец', name_de: 'Melodie junger Herzen', name_ua: 'Мелодія молодих сердець' },
        'гх': { name: 'Голосок хваления', name_de: 'Stimme des Lobes', name_ua: 'Голосок хвалення' }
      };
    }
  } catch (err) {
    console.error('❌ Fehler beim Laden der Psalmen:', err.message);
    process.exit(1);
  }
}

function loadAccessData() {
  try {
    if (process.env.ACCESS_DATA) {
      try {
        accessData = JSON.parse(process.env.ACCESS_DATA);
        console.log('✅ Zugriffsdaten aus Umgebung geladen');
        return;
      } catch (e) {
        console.warn('⚠️ Fehler beim Parsen von ACCESS_DATA aus Umgebung');
      }
    }
    
    if (fs.existsSync(ACCESS_FILE)) {
      accessData = JSON.parse(fs.readFileSync(ACCESS_FILE, 'utf-8'));
      console.log('✅ Zugriffsdaten aus Datei geladen');
    }
  } catch (err) {
    console.error('❌ Fehler beim Laden der Zugriffsdaten:', err.message);
  }
}

function loadFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      favoritesData = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf-8'));
      console.log('✅ Favoriten geladen');
    }
  } catch (err) {
    console.error('❌ Fehler beim Laden der Favoriten:', err.message);
  }
}

function saveFavorites() {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favoritesData, null, 2));
  } catch (err) {
    console.error('❌ Fehler beim Speichern der Favoriten:', err.message);
  }
}

function saveAccessData() {
  try {
    fs.writeFileSync(ACCESS_FILE, JSON.stringify(accessData, null, 2));
  } catch (err) {
    console.error('❌ Fehler beim Speichern der Zugriffsdaten:', err.message);
  }
}

// ============================================================================
// FAVORITEN VERWALTUNG
// ============================================================================
function addFavorite(userId, psalomId) {
  if (!favoritesData[userId]) {
    favoritesData[userId] = [];
  }
  if (!favoritesData[userId].includes(psalomId)) {
    favoritesData[userId].push(psalomId);
    saveFavorites();
    return true;
  }
  return false;
}

function removeFavorite(userId, psalomId) {
  if (favoritesData[userId]) {
    const index = favoritesData[userId].indexOf(psalomId);
    if (index > -1) {
      favoritesData[userId].splice(index, 1);
      saveFavorites();
      return true;
    }
  }
  return false;
}

function getFavorites(userId) {
  const ids = favoritesData[userId] || [];
  return ids.map(id => {
    const [collection, actualNumber] = id.split('_');
    return psalmsData.find(p => p.collection === collection && p.actualNumber === parseInt(actualNumber));
  }).filter(p => p);
}

function isFavorite(userId, collection, actualNumber) {
  const id = `${collection}_${actualNumber}`;
  return favoritesData[userId] && favoritesData[userId].includes(id);
}

// ============================================================================
// TOKEN VERWALTUNG
// ============================================================================
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 5; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function hasAccess(userId) {
  const user = accessData.users[userId];
  return user && user.approved === true && !user.blocked;
}

// ============================================================================
// SUCHFUNKTION
// ============================================================================
function searchPsalm(query, collection = null, lang = 'ru') {
  if (!query || query.trim().length === 0) return null;

  const normalized = query.toLowerCase().trim();

  // Typ 1: Nur Nummer
  if (/^\d+$/.test(normalized)) {
    const num = parseInt(normalized);
    const coll = collection || 'п';
    return psalmsData.filter(p => p.actualNumber === num && p.collection === coll);
  }

  // Typ 2: Abkürzung + Nummer (z.B. п5, к10, гх80)
  const abbrevMatch = normalized.match(/^([а-яюёжш]+)\s*(\d+)$/);
  if (abbrevMatch) {
    const [, abbr, num] = abbrevMatch;
    return psalmsData.filter(p => p.actualNumber === parseInt(num) && p.collection === abbr);
  }

  // Typ 3: Suche nach Namen (Priorität auf Titel)
  const results = psalmsData.filter(p => {
    const titleField = (p.title || '').toLowerCase();
    return titleField.includes(normalized);
  });

  return results.length > 0 ? results : null;
}

// ============================================================================
// TELEGRAM API FUNKTIONEN
// ============================================================================
async function sendMessage(chatId, text, keyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (keyboard) payload.reply_markup = keyboard;
    
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    console.error('❌ Fehler beim Senden der Nachricht:', err.message);
  }
}

function formatPsalm(text) {
  let lines = text.split('\n');
  let formatted = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('Псалом')) continue;
    
    if (/^\d+\./.test(line) && formatted.length > 0) {
      formatted.push('');
    }
    
    if (line.startsWith('Пр.:') && formatted.length > 0) {
      formatted.push('');
    }
    
    formatted.push(line);
  }
  
  return formatted.join('\n');
}

async function sendPsalm(chatId, text, keyboard = null, collection = null, actualNumber = null) {
  try {
    let formattedText = formatPsalm(text);
    
    if (collection && actualNumber) {
      formattedText = `<b>${collection}${actualNumber}</b>\n\n${formattedText}`;
    }
    
    const payload = {
      chat_id: chatId,
      text: formattedText,
      parse_mode: 'HTML'
    };
    if (keyboard) payload.reply_markup = keyboard;
    
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    console.error('❌ Fehler beim Senden des Psalms:', err.message);
  }
}

async function editMessage(chatId, messageId, text, keyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML'
    };
    if (keyboard) payload.reply_markup = keyboard;
    
    await axios.post(`${TELEGRAM_API}/editMessageText`, payload);
  } catch (err) {
    console.error('❌ Fehler beim Bearbeiten der Nachricht:', err.message);
  }
}

async function notifyAdminNewRequest(userId, user) {
  if (!ADMIN_CHAT_ID) return;

  const text = `🔔 <b>Новая заявка на доступ</b>\n\n` +
    `👤 <b>Имя:</b> ${user.first_name || 'N/A'}\n` +
    `📱 <b>Username:</b> @${user.username || 'N/A'}\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n\n` +
    `<b>Одобрить или отклонить:</b>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: t('ru', 'approve'), callback_data: `approve_${userId}` },
        { text: t('ru', 'deny'), callback_data: `deny_${userId}` }
      ]
    ]
  };

  await sendMessage(ADMIN_CHAT_ID, text, keyboard);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================
async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';

  if (!userLanguage[userId]) {
    userLanguage[userId] = 'ru';
  }
  const lang = userLanguage[userId];

  if (text.startsWith('/')) {
    const command = text.split(' ')[0];

    if (command === '/start') {
      const user = accessData.users[userId];
      
      if (!user) {
        accessData.users[userId] = {
          userId: userId,
          firstName: message.from.first_name || 'N/A',
          lastName: message.from.last_name || '',
          username: message.from.username || '',
          requestedAt: new Date().toISOString(),
          approved: false,
          blocked: false
        };
        saveAccessData();
        
        await sendMessage(chatId, t(lang, 'not_approved'));
        await notifyAdminNewRequest(userId, message.from);
      } else if (!user.approved || user.blocked) {
        await sendMessage(chatId, t(lang, 'not_approved'));
      } else {
        const helpText = `${t(lang, 'welcome')}\n\n${t(lang, 'search_help')}\n\n${t(lang, 'commands')}`;

        const keyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'all_collections'), callback_data: 'show_collections' }],
            [{ text: t(lang, 'favorites'), callback_data: 'show_favorites' }],
            [{ text: t(lang, 'language'), callback_data: 'select_language' }]
          ]
        };

        await sendMessage(chatId, helpText, keyboard);
      }
    } else if (command === '/help') {
      const helpText = `${t(lang, 'welcome')}\n\n${t(lang, 'search_help')}\n\n${t(lang, 'commands')}`;
      await sendMessage(chatId, helpText);
    } else if (command === '/favorites') {
      const favorites = getFavorites(userId);
      if (favorites.length === 0) {
        await sendMessage(chatId, t(lang, 'no_favorites'));
      } else {
        let text = `${t(lang, 'favorites')} (${favorites.length}):\n\n`;
        const keyboard = {
          inline_keyboard: favorites.slice(0, 20).map(p => [
            { text: `${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` },
            { text: '🗑️', callback_data: `remove_fav_${p.collection}_${p.actualNumber}` }
          ])
        };
        await sendMessage(chatId, text, keyboard);
      }
    } else if (command === '/language') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
          [{ text: '🇩🇪 Deutsch', callback_data: 'lang_de' }],
          [{ text: '🇺🇦 Українська', callback_data: 'lang_ua' }]
        ]
      };
      await sendMessage(chatId, t(lang, 'language'), keyboard);
    } else if (command === '/glavy') {
      // Alle Sammlungen direkt anzeigen
      const collections = [
        { name: collectionsData['п']?.name || 'Песни Юности', abbr: 'п', count: '1-1005' },
        { name: collectionsData['к']?.name || 'Кувшинчик', abbr: 'к', count: '1-89' },
        { name: collectionsData['н']?.name || 'Новые псалмы', abbr: 'н', count: '1-217' },
        { name: collectionsData['г']?.name || 'Горлица', abbr: 'г', count: '1-571' },
        { name: collectionsData['с']?.name || 'Псалмы Сиона', abbr: 'с', count: '1-525' },
        { name: collectionsData['м']?.name || 'Мы поём Господу', abbr: 'м', count: '1-200' },
        { name: collectionsData['юс']?.name || 'Мелодия юных сердец', abbr: 'юс', count: '1-850' },
        { name: collectionsData['гх']?.name || 'Голосок хваления', abbr: 'гх', count: '1-393' }
      ];

      let text = `${t(lang, 'all_collections')}:\n\n`;
      const keyboard = {
        inline_keyboard: collections.map(c => [
          { text: `${c.name} (${c.count})`, callback_data: `coll_${c.abbr}` }
        ])
      };

      await sendMessage(chatId, text, keyboard);
    } else if (command === '/admin' && userId === parseInt(ADMIN_CHAT_ID)) {
      const keyboard = {
        inline_keyboard: [
          [{ text: t(lang, 'pending'), callback_data: 'admin_pending' }],
          [{ text: t(lang, 'approved'), callback_data: 'admin_approved' }],
          [{ text: t(lang, 'statistics'), callback_data: 'admin_stats' }]
        ]
      };
      await sendMessage(chatId, t(lang, 'admin_panel'), keyboard);
    }
  } else {
    // Обработка поиска
    const results = searchPsalm(text, null, lang);
    if (results && results.length > 0) {
      // Wenn nur 1 Ergebnis: direkt anzeigen
      if (results.length === 1) {
        const psalm = results[0];
        const formatted = formatPsalm(psalm.text);
        const responseText = `<b>${psalm.collection}${psalm.actualNumber}</b>\n${psalm.title}\n\n${formatted}`;
        const keyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'favorite'), callback_data: `fav_${psalm.collection}_${psalm.actualNumber}` }],
            [{ text: t(lang, 'new_search'), callback_data: 'new_search' }]
          ]
        };
        await sendMessage(chatId, responseText, keyboard);
      } else {
        // Mehrere Ergebnisse: Liste anzeigen
        let responseText = `${t(lang, 'results')}:\n\n`;
        const keyboard = {
          inline_keyboard: results.slice(0, 10).map(p => [
            { text: `${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }
          ])
        };

        if (results.length > 10) {
          keyboard.inline_keyboard.push([
            { text: `➡️ +${results.length - 10} ${t(lang, 'more')}`, callback_data: `search_more_${encodeURIComponent(text)}_0` }
          ]);
        }

        keyboard.inline_keyboard.push([
          { text: t(lang, 'new_search'), callback_data: 'new_search' }
        ]);

        await sendMessage(chatId, responseText, keyboard);
      }
    } else {
      await sendMessage(chatId, t(lang, 'invalid_psalm'));
    }
  }
}

// ============================================================================
// CALLBACK QUERY HANDLER
// ============================================================================
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data;

  if (!userLanguage[userId]) {
    userLanguage[userId] = 'ru';
  }
  const lang = userLanguage[userId];

  if (data === 'show_collections') {
    const collections = [
      { name: collectionsData['п']?.name || 'Песни Юности', abbr: 'п', count: '1-1005' },
      { name: collectionsData['к']?.name || 'Кувшинчик', abbr: 'к', count: '1-89' },
      { name: collectionsData['н']?.name || 'Новые псалмы', abbr: 'н', count: '1-217' },
      { name: collectionsData['г']?.name || 'Горлица', abbr: 'г', count: '1-571' },
      { name: collectionsData['с']?.name || 'Псалмы Сиона', abbr: 'с', count: '1-525' },
      { name: collectionsData['м']?.name || 'Мы поём Господу', abbр: 'м', count: '1-200' },
      { name: collectionsData['юс']?.name || 'Мелодия юных сердец', abbr: 'юс', count: '1-850' },
      { name: collectionsData['гх']?.name || 'Голосок хваления', abbr: 'гх', count: '1-393' }
    ];

    let text = `${t(lang, 'all_collections')}:\n\n`;
    const keyboard = {
      inline_keyboard: collections.map(c => [
        { text: `${c.name} (${c.count})`, callback_data: `coll_${c.abbr}` }
      ])
    };

    await editMessage(chatId, messageId, text, keyboard);
    } else if (data.startsWith('coll_')) {
    const collection = data.replace('coll_', '');
    const psalms = psalmsData.filter(p => p.collection === collection).sort((a, b) => a.actualNumber - b.actualNumber);
    const collectionName = collectionsData[collection]?.name || collection;
    let text = `${collectionName}:\n\n`;
    const keyboard = {
      inline_keyboard: psalms.slice(0, 20).map(p => [
        { text: `${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }
      ])
    };

    if (psalms.length > 20) {
      keyboard.inline_keyboard.push([
        { text: `➡️ +${psalms.length - 20}`, callback_data: `cm_${collection}_0` }
      ]);
    }

    keyboard.inline_keyboard.push([
      { text: t(lang, 'back'), callback_data: 'show_collections' }
    ]);

    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('cm_')) {
    // Pagination für Sammlungen (kurze Notation: cm_ statt coll_more_)
    const parts = data.replace('cm_', '').split('_');
    const page = parseInt(parts[parts.length - 1]) || 0;
    const collection = parts.slice(0, -1).join('_');
    if (!collection) return;

    const psalms = psalmsData.filter(p => p.collection === collection).sort((a, b) => a.actualNumber - b.actualNumber);
    const start = 20 + page * 10;
    const end = start + 10;
    const items = psalms.slice(start, end);
    const collectionName = collectionsData[collection]?.name || collection;

    let text = `${collectionName} (${t(lang, 'page')} ${Math.floor(start / 10)}):\n\n`;
    const keyboard = {
      inline_keyboard: items.map(p => [
        { text: `${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }
      ])
    };

    if (end < psalms.length) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'next'), callback_data: `cm_${collection}_${page + 1}` }
      ]);
    }

    if (page > 0) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'prev'), callback_data: `cm_${collection}_${page - 1}` }
      ]);
    }

    keyboard.inline_keyboard.push([
      { text: t(lang, 'back'), callback_data: `coll_${collection}` }
    ]);

    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('search_more_')) {
    // Pagination für Suchergebnisse
    const parts = data.replace('search_more_', '').split('_');
    const searchQuery = decodeURIComponent(parts[0]);
    const page = parseInt(parts[1]) || 0;

    const results = searchPsalm(searchQuery, null, lang);
    if (!results) {
      await editMessage(chatId, messageId, t(lang, 'invalid_psalm'));
      return;
    }

    const start = 10 + page * 10;
    const end = start + 10;
    const items = results.slice(start, end);

    let text = `${t(lang, 'results')} (${t(lang, 'page')} ${Math.floor(start / 10)}):\n\n`;
    const keyboard = {
      inline_keyboard: items.map(p => [
        { text: `${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }
      ])
    };

    if (end < results.length) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'next'), callback_data: `search_more_${encodeURIComponent(searchQuery)}_${page + 1}` }
      ]);
    }

    if (page > 0) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'prev'), callback_data: `search_more_${encodeURIComponent(searchQuery)}_${page - 1}` }
      ]);
    }

    keyboard.inline_keyboard.push([
      { text: t(lang, 'new_search'), callback_data: 'new_search' }
    ]);

    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('psalm_')) {
    const match = data.match(/^psalm_(.+?)_(\d+)$/);
    if (!match) return;
    const collection = match[1];
    const actualNumber = parseInt(match[2]);

    const psalm = psalmsData.find(p => p.collection === collection && p.actualNumber === actualNumber);
    if (psalm) {
      const isFav = isFavorite(userId, collection, actualNumber);
      const keyboard = {
        inline_keyboard: [
          [
            { text: isFav ? t(lang, 'remove_favorite') : t(lang, 'add_favorite'), callback_data: `fav_${collection}_${actualNumber}` }
          ],
          [{ text: t(lang, 'new_search'), callback_data: 'new_search' }]
        ]
      };

      await sendPsalm(chatId, psalm.text, keyboard, collection, actualNumber);
    }
  } else if (data.startsWith('fav_')) {
    const match = data.match(/^fav_(.+?)_(\d+)$/);
    if (!match) return;
    const collection = match[1];
    const actualNumber = parseInt(match[2]);

    if (isFavorite(userId, collection, actualNumber)) {
      removeFavorite(userId, `${collection}_${actualNumber}`);
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: t(lang, 'favorite_removed'),
        show_alert: false
      });
    } else {
      addFavorite(userId, `${collection}_${actualNumber}`);
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: t(lang, 'favorite_added'),
        show_alert: false
      });
    }
  } else if (data.startsWith('remove_fav_')) {
    const match = data.match(/^remove_fav_(.+?)_(\d+)$/);
    if (!match) return;
    const collection = match[1];
    const actualNumber = parseInt(match[2]);

    removeFavorite(userId, `${collection}_${actualNumber}`);
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: query.id,
      text: t(lang, 'favorite_removed'),
      show_alert: false
    });

    // Aktualisiere die Favoritenliste
    const favorites = getFavorites(userId);
    if (favorites.length === 0) {
      await editMessage(chatId, messageId, t(lang, 'no_favorites'));
    } else {
      let text = `${t(lang, 'favorites')} (${favorites.length}):\n\n`;
      const keyboard = {
        inline_keyboard: favorites.slice(0, 20).map(p => [
          { text: `${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` },
          { text: '🗑️', callback_data: `remove_fav_${p.collection}_${p.actualNumber}` }
        ])
      };
      await editMessage(chatId, messageId, text, keyboard);
    }
  } else if (data === 'show_favorites') {
    const favorites = getFavorites(userId);
    if (favorites.length === 0) {
      await editMessage(chatId, messageId, t(lang, 'no_favorites'));
    } else {
      let text = `${t(lang, 'favorites')} (${favorites.length}):\n\n`;
      const keyboard = {
        inline_keyboard: favorites.slice(0, 20).map(p => [
          { text: `${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }
        ])
      };
      await editMessage(chatId, messageId, text, keyboard);
    }
  } else if (data === 'select_language') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
        [{ text: '🇩🇪 Deutsch', callback_data: 'lang_de' }],
        [{ text: '🇺🇦 Українська', callback_data: 'lang_ua' }]
      ]
    };
    await editMessage(chatId, messageId, t(lang, 'language'), keyboard);
  } else if (data.startsWith('lang_')) {
    const newLang = data.replace('lang_', '');
    userLanguage[userId] = newLang;
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: query.id,
      text: t(newLang, 'language_selected'),
      show_alert: false
    });
  } else if (data === 'new_search') {
    const text = t(lang, 'search_placeholder');
    const keyboard = {
      inline_keyboard: [
        [{ text: t(lang, 'all_collections'), callback_data: 'show_collections' }]
      ]
    };

    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('approve_')) {
    const approveUserId = data.replace('approve_', '');
    const user = accessData.users[approveUserId];

    if (user) {
      const token = generateToken();
      accessData.tokens[token] = {
        userId: approveUserId,
        token: token,
        active: true,
        createdAt: new Date().toISOString()
      };

      user.approved = true;
      user.approvedAt = new Date().toISOString();
      user.token = token;
      saveAccessData();

      const helpText = `${t('ru', 'welcome_approved')}\n\n${t('ru', 'search_help')}\n\n${t('ru', 'commands')}`;

      const keyboard = {
        inline_keyboard: [
          [{ text: t('ru', 'all_collections'), callback_data: 'show_collections' }]
        ]
      };

      await sendMessage(approveUserId, helpText, keyboard);

      const adminText = `✅ <b>Одобрено</b>\n\nПользователь: ${user.firstName}`;
      await editMessage(ADMIN_CHAT_ID, messageId, adminText);
    }
  } else if (data.startsWith('deny_')) {
    const denyUserId = data.replace('deny_', '');
    const user = accessData.users[denyUserId];

    if (user) {
      user.approved = false;
      user.deniedAt = new Date().toISOString();
      saveAccessData();

      await sendMessage(denyUserId, t('ru', 'request_denied'));

      const adminText = `❌ <b>Заявка отклонена</b>`;
      await editMessage(ADMIN_CHAT_ID, messageId, adminText);
    }
  } else if (data === 'admin_pending') {
    const pending = Object.values(accessData.users).filter(u => !u.approved && !u.blocked);
    let text = `${t(lang, 'pending')} (${pending.length}):\n\n`;
    const keyboard = {
      inline_keyboard: pending.map(u => [
        { text: `${u.firstName} (@${u.username})`, callback_data: `admin_user_${u.userId}` }
      ])
    };
    await editMessage(chatId, messageId, text, keyboard);
  } else if (data === 'admin_approved') {
    const approved = Object.values(accessData.users).filter(u => u.approved && !u.blocked);
    let text = `${t(lang, 'approved')} (${approved.length}):\n\n`;
    const keyboard = {
      inline_keyboard: approved.map(u => [
        { text: `${u.firstName} (@${u.username})`, callback_data: `admin_user_${u.userId}` }
      ])
    };
    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('admin_user_')) {
    const adminUserId = data.replace('admin_user_', '');
    const user = accessData.users[adminUserId];
    
    if (!user) {
      await editMessage(chatId, messageId, t(lang, 'user_not_found'));
      return;
    }
    
    let text = `👤 <b>${user.firstName}</b>\n`;
    text += `📱 @${user.username || 'N/A'}\n`;
    text += `🆔 ${adminUserId}\n\n`;
    text += `📊 Status: ${user.approved ? '✅ Одобрено' : '⏳ Ожидание'}${user.blocked ? ' | 🚫 Заблокировано' : ''}\n`;
    text += `📅 Запрос: ${new Date(user.requestedAt).toLocaleDateString('ru-RU')}`;
    
    const keyboard = {
      inline_keyboard: []
    };
    
    if (!user.approved && !user.blocked) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'approve'), callback_data: `approve_${adminUserId}` },
        { text: t(lang, 'deny'), callback_data: `deny_${adminUserId}` }
      ]);
    }
    
    if (!user.blocked) {
      keyboard.inline_keyboard.push([
        { text: '🚫 Блокировать', callback_data: `block_${adminUserId}` }
      ]);
    } else {
      keyboard.inline_keyboard.push([
        { text: '🔓 Разблокировать', callback_data: `unblock_${adminUserId}` }
      ]);
    }
    
    keyboard.inline_keyboard.push([
      { text: t(lang, 'back'), callback_data: 'admin_pending' }
    ]);
    
    await editMessage(chatId, messageId, text, keyboard);
  } else if (data.startsWith('block_')) {
    const blockUserId = data.replace('block_', '');
    const user = accessData.users[blockUserId];
    
    if (user) {
      user.blocked = true;
      user.blockedAt = new Date().toISOString();
      saveAccessData();
      
      await sendMessage(blockUserId, '🚫 Вы были заблокированы.');
      await editMessage(chatId, messageId, `✅ Пользователь заблокирован`);
    }
  } else if (data.startsWith('unblock_')) {
    const unblockUserId = data.replace('unblock_', '');
    const user = accessData.users[unblockUserId];
    
    if (user) {
      user.blocked = false;
      saveAccessData();
      
      await sendMessage(unblockUserId, '✅ Вы были разблокированы.');
      await editMessage(chatId, messageId, `✅ Пользователь разблокирован`);
    }
  } else if (data === 'admin_stats') {
    const total = Object.keys(accessData.users).length;
    const approvedCount = Object.values(accessData.users).filter(u => u.approved && !u.blocked).length;
    const pendingCount = Object.values(accessData.users).filter(u => !u.approved && !u.blocked).length;
    const blockedCount = Object.values(accessData.users).filter(u => u.blocked).length;

    let text = `${t(lang, 'statistics')}:\n\n`;
    text += `${t(lang, 'total')}: ${total}\n`;
    text += `${t(lang, 'approved')}: ${approvedCount}\n`;
    text += `${t(lang, 'pending')}: ${pendingCount}\n`;
    text += `${t(lang, 'blocked')}: ${blockedCount}`;

    await editMessage(chatId, messageId, text);
  }
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', psalms: psalmsData.length });
});

app.post('/api/telegram/webhook', async (req, res) => {
  const update = req.body;

  if (update.message) {
    await handleMessage(update.message);
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }

  res.json({ ok: true });
});

app.post('/api/validate-token', (req, res) => {
  res.json({ valid: true });
});

app.get('/api/admin/pending', (req, res) => {
  const pending = Object.values(accessData.users).filter(u => !u.approved && !u.blocked);
  res.json({ pending });
});

app.get('/api/admin/approved', (req, res) => {
  const approved = Object.values(accessData.users).filter(u => u.approved && !u.blocked);
  res.json({ approved });
});

app.get('/api/admin/stats', (req, res) => {
  const total = Object.keys(accessData.users).length;
  const approvedCount = Object.values(accessData.users).filter(u => u.approved && !u.blocked).length;
  const pendingCount = Object.values(accessData.users).filter(u => !u.approved && !u.blocked).length;
  const blockedCount = Object.values(accessData.users).filter(u => u.blocked).length;

  res.json({ total, approvedCount, pendingCount, blockedCount });
});

app.post('/api/admin/approve', (req, res) => {
  const { userId, adminToken } = req.body;

  const envToken = ADMIN_TOKEN;
  const providedToken = adminToken ? String(adminToken).trim() : '';

  if (providedToken !== envToken) {
    return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'User ID erforderlich' });
  }

  const user = accessData.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  const token = generateToken();
  accessData.tokens[token] = {
    userId: userId,
    token: token,
    active: true,
    createdAt: new Date().toISOString()
  };

  user.approved = true;
  user.approvedAt = new Date().toISOString();
  user.token = token;

  saveAccessData();

  res.json({ success: true, token: token });
});

app.post('/api/admin/deny', (req, res) => {
  const { userId, adminToken } = req.body;

  const envToken = ADMIN_TOKEN;
  const providedToken = adminToken ? String(adminToken).trim() : '';

  if (providedToken !== envToken) {
    return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'User ID erforderlich' });
  }

  const user = accessData.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  user.approved = false;
  user.deniedAt = new Date().toISOString();

  saveAccessData();

  res.json({ success: true });
});

app.post('/api/admin/block', (req, res) => {
  const { userId, adminToken } = req.body;

  const envToken = ADMIN_TOKEN;
  const providedToken = adminToken ? String(adminToken).trim() : '';

  if (providedToken !== envToken) {
    return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'User ID erforderlich' });
  }

  const user = accessData.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  user.blocked = true;
  user.blockedAt = new Date().toISOString();

  saveAccessData();

  res.json({ success: true });
});

// ============================================================================
// SERVER STARTEN
// ============================================================================
app.listen(PORT, async () => {
  console.log(`🚀 Bot läuft auf Port ${PORT}`);
  loadPsalms();
  loadAccessData();
  loadFavorites();

  const webhookUrl = `https://bot-production-8b3a.up.railway.app/api/telegram/webhook`;
  try {
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: webhookUrl,
      drop_pending_updates: false
    });
    console.log('✅ Webhook gesetzt');
  } catch (err) {
    console.error('❌ Webhook-Fehler:', err.message);
  }
});
