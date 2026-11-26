const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ============================================================================
// KONFIGURATION
// ============================================================================
const PORT = process.env.PORT || 3001;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID).trim() : null;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ? String(process.env.ADMIN_TOKEN).trim() : '';

const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const TELEGRAM_API = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}`;
// Persistent data lives on a Railway volume (DATA_DIR), so approvals and favorites survive redeploys.
const DATA_DIR = process.env.DATA_DIR || '.';
const ACCESS_FILE = path.join(DATA_DIR, 'access.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
// The website (Mini App) hosts the shared folders; the bot reads and edits them through its API.
const MINIAPP_URL = (process.env.MINIAPP_URL || 'https://miniapp-production-538c.up.railway.app').replace(/\/$/, '');

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

// Sprach-Strings
const translations = {
  ru: {
    welcome: '🙏 Добро пожаловать в Сборник Псалмов!',
    search_help: 'Как искать:\n• Введите номер: <code>5</code>\n• Введите название: <code>Радость</code>\n• Введите код сборника + номер: <code>п5</code>, <code>к10</code>',
    commands: 'Команды:\n/start - Начало\n/help - Справка\n/papki - Общие папки\n/favorites - Избранное\n/glavy - Все сборники',
    all_collections: '📚 Все сборники',
    search_placeholder: '🔍 Введите номер, название или код сборника',
    new_search: '🔍 Новый поиск',
    favorites: '❤️ Избранное',
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
    open_app: '📖 Открыть сборник',
    open_in_app: '📖 Открыть в приложении',
    folders: '📁 Общие папки',
    to_folder: '📁 В папку',
    new_folder: '➕ Новая папка',
    folders_intro: 'Общие папки видят и могут менять все пользователи — и в боте, и на сайте.',
    no_folders: 'Папок пока нет. Создайте первую!',
    folder_empty: 'Папка пустая. Откройте псалом и нажмите «📁 В папку».',
    choose_folder: 'Выберите папки для',
    ask_folder_name: '✏️ Напишите название новой папки (например: Вечернее).\n\n/cancel — отмена',
    ask_rename: '✏️ Напишите новое название для папки',
    folder_created: '✅ Папка создана',
    folder_renamed: '✅ Папка переименована',
    folder_deleted: '🗑 Папка удалена. Её можно восстановить на сайте в разделе «Недавно удалённые» (30 дней).',
    confirm_delete: 'Удалить папку? Она исчезнет у всех пользователей.',
    yes_delete: '🗑 Да, удалить',
    cancel: 'Отмена',
    rename: '✏️ Переименовать',
    delete: '🗑 Удалить',
    all_folders: '📁 Все папки',
    open_site: '🌐 Открыть на сайте',
    folders_error: '⚠️ Папки сейчас недоступны. Попробуйте через минуту.',
    added_to: '✅ Добавлено в',
    removed_from: '✅ Убрано из',
    cancelled: 'Отменено',
    reorder_hint: 'Порядок псалмов можно менять на сайте.',
    prev_psalm: '◀️',
    next_psalm: '▶️'
  }
};

function t(lang, key) {
  return translations[lang]?.[key] || translations['ru']?.[key] || key;
}

// ============================================================================
// DATEN LADEN
// ============================================================================
const COLLECTION_FILES = { 'к': 'k', 'н': 'n', 'г': 'g', 'п': 'p', 'с': 's', 'м': 'm', 'юс': 'ys', 'гх': 'gh' };
const COLLECTION_ORDER = Object.keys(COLLECTION_FILES);
const DEFAULT_COLLECTIONS = {
  'п': { name: 'Песни Юности' }, 'к': { name: 'Кувшинчик' }, 'н': { name: 'Новые псалмы' }, 'г': { name: 'Горлица' },
  'с': { name: 'Псалмы Сиона' }, 'м': { name: 'Мы поём Господу' }, 'юс': { name: 'Мелодия юных сердец' }, 'гх': { name: 'Голосок хваления' }
};
let psalmByKey = new Map();

// Same texts as the website: data/index.json.gz (number, title, first line) + one file per collection.
function loadPsalms() {
  try {
    const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', f))));
    const index = gz('index.json.gz');
    const texts = {};
    for (const [c, file] of Object.entries(COLLECTION_FILES)) texts[c] = gz(`${file}.json.gz`);
    psalmsData = index.map(([c, n, title, firstLine, subtitle]) => ({
      collection: c, actualNumber: n, number: n, id: c + n, title, firstLine, subtitle: subtitle || '', text: texts[c][n] || ''
    }));
    psalmByKey = new Map(psalmsData.map(p => [p.id, p]));
    console.log(`✅ ${psalmsData.length} Psalmen geladen`);
    collectionsData = DEFAULT_COLLECTIONS;
  } catch (err) {
    console.error('❌ Fehler beim Laden der Psalmen:', err.message);
    process.exit(1);
  }
}

function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function loadAccessData() {
  try {
    if (fs.existsSync(ACCESS_FILE)) {
      accessData = JSON.parse(fs.readFileSync(ACCESS_FILE, 'utf-8'));
      accessData.users = accessData.users || {};
      accessData.tokens = accessData.tokens || {};
      console.log(`✅ Zugriffsdaten aus Datei geladen (${Object.keys(accessData.users).length} Nutzer)`);
      return;
    }
    if (process.env.ACCESS_DATA) {
      try {
        accessData = JSON.parse(process.env.ACCESS_DATA);
        console.log('✅ Zugriffsdaten aus Umgebung geladen (Startwert für die Datei)');
        saveAccessData();
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
    writeJSON(FAVORITES_FILE, favoritesData);
  } catch (err) {
    console.error('❌ Fehler beim Speichern der Favoriten:', err.message);
  }
}

function saveAccessData() {
  try {
    writeJSON(ACCESS_FILE, accessData);
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

function isAdmin(userId) {
  return !!ADMIN_CHAT_ID && String(userId) === ADMIN_CHAT_ID;
}

// Psalms, collections, folders and search are only for approved users (and the admin).
function canUseBot(userId) {
  return isAdmin(userId) || hasAccess(userId);
}

// Admin API: the token must be set on the server and match (header or body); constant-time compare.
function adminTokenOk(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = String(req.headers['authorization'] || '');
  const provided = String(req.headers['x-admin-token'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '') || req.body?.adminToken || '').trim();
  const a = Buffer.from(provided), b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

// ============================================================================
// SUCHFUNKTION
// ============================================================================
const norm = str => String(str || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function searchPsalm(query, collection = null, lang = 'ru') {
  if (!query || query.trim().length === 0) return null;

  const normalized = query.toLowerCase().replace(/ё/g, 'е').trim();

  // Typ 1: Nur Nummer
  if (/^\d+$/.test(normalized)) {
    const num = parseInt(normalized);
    const coll = collection || 'п';
    return psalmsData.filter(p => p.actualNumber === num && p.collection === coll);
  }

  // Typ 2: Abkürzung + Nummer (z.B. п5, к10, гх80)
  const abbrevMatch = normalized.match(/^(юс|гх|к|н|г|п|с|м)\s*(\d+)$/);
  if (abbrevMatch) {
    const [, abbr, num] = abbrevMatch;
    return psalmsData.filter(p => p.actualNumber === parseInt(num) && p.collection === abbr);
  }

  // Typ 3: Titel, dann erste Zeile, dann der ganze Text
  const q = norm(query);
  if (!q) return null;
  const words = q.split(' ');
  const has = s => { const n = norm(s); return words.every(w => n.includes(w)); };
  const byTitle = psalmsData.filter(p => has(p.title));
  const byFirst = psalmsData.filter(p => !byTitle.includes(p) && has(p.firstLine));
  const results = byTitle.concat(byFirst);
  if (results.length < 10) {
    for (const p of psalmsData) {
      if (results.length >= 60) break;
      if (!results.includes(p) && has(p.text)) results.push(p);
    }
  }
  return results.length > 0 ? results : null;
}

function collectionsList() {
  return COLLECTION_ORDER.map(abbr => {
    const count = psalmsData.filter(p => p.collection === abbr).length;
    return { name: collectionsData[abbr]?.name || DEFAULT_COLLECTIONS[abbr].name, abbr, count: `1-${count}` };
  });
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

const esc = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Psalm text → Telegram HTML: header line dropped, blank line between parts, chorus in italics.
function formatPsalm(text) {
  let lines = String(text || '').replace(/\r/g, '').split('\n');
  while (lines.length && (!lines[0].trim() || /^\s*Мы по[её]м Господу\s*\d+\s*$/i.test(lines[0]) || /^\s*псалом\s+\S+\s*$/i.test(lines[0]))) lines.shift();
  if (lines.length && /^\s*[А-ЯЁа-яё]{1,2}\s*\d+\s*\.?/.test(lines[0])) lines.shift();
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { cur = null; continue; }
    const isChorus = /^(пр|припев|хор|рефрен)\s*[.:]+/i.test(line);
    if (!cur || /^\d+\s*[.)]\s*\S/.test(line) || isChorus) { cur = { chorus: isChorus, lines: [] }; blocks.push(cur); }
    cur.lines.push(line);
  }
  return blocks.map(b => {
    const body = b.lines.map(esc).join('\n');
    return b.chorus ? `<i>${body}</i>` : body;
  }).join('\n\n');
}

// Telegram allows 4096 characters per message; long psalms are split at blank lines.
function splitMessage(text, limit = 3900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let cur = '';
  for (const block of text.split('\n\n')) {
    const add = (cur ? '\n\n' : '') + block;
    if (cur && cur.length + add.length > limit) { parts.push(cur); cur = block; } else cur += add;
  }
  if (cur) parts.push(cur);
  return parts.flatMap(p => p.length <= limit ? [p] : p.match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g')));
}

async function sendPsalm(chatId, text, keyboard = null, collection = null, actualNumber = null) {
  try {
    const psalm = psalmByKey.get(`${collection}${actualNumber}`);
    let formattedText = formatPsalm(text);
    if (collection && actualNumber) {
      const name = collectionsData[collection]?.name || '';
      const head = `<b>${esc(collection.toUpperCase() + actualNumber)}. ${esc(psalm ? psalm.title : '')}</b>\n<i>${esc(name)}</i>` + (psalm && psalm.subtitle ? `\n<i>${esc(psalm.subtitle)}</i>` : '');
      formattedText = `${head}\n\n${formattedText}`;
    }
    const parts = splitMessage(formattedText);
    for (let i = 0; i < parts.length; i++) {
      const payload = { chat_id: chatId, text: parts[i], parse_mode: 'HTML' };
      if (keyboard && i === parts.length - 1) payload.reply_markup = keyboard;
      await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    }
  } catch (err) {
    console.error('❌ Fehler beim Senden des Psalms:', err.response?.data?.description || err.message);
  }
}

function psalmNeighbors(psalm) {
  const list = psalmsData.filter(p => p.collection === psalm.collection);
  const i = list.indexOf(psalm);
  return [list[i - 1], list[i + 1]];
}

function psalmKeyboard(userId, lang, psalm) {
  const isFav = isFavorite(userId, psalm.collection, psalm.actualNumber);
  const [prev, next] = psalmNeighbors(psalm);
  const nav = [];
  if (prev) nav.push({ text: `◀️ ${prev.collection}${prev.actualNumber}`, callback_data: `psalm_${prev.collection}_${prev.actualNumber}` });
  if (next) nav.push({ text: `${next.collection}${next.actualNumber} ▶️`, callback_data: `psalm_${next.collection}_${next.actualNumber}` });
  const rows = [
    [
      { text: isFav ? t(lang, 'remove_favorite') : t(lang, 'add_favorite'), callback_data: `fav_${psalm.collection}_${psalm.actualNumber}` },
      { text: t(lang, 'to_folder'), callback_data: `fa_${psalm.collection}_${psalm.actualNumber}` }
    ]
  ];
  if (nav.length) rows.push(nav);
  rows.push([{ text: t(lang, 'open_in_app'), web_app: { url: `${MINIAPP_URL}/?p=${COLLECTION_FILES[psalm.collection]}${psalm.actualNumber}` } }]);
  rows.push([{ text: t(lang, 'new_search'), callback_data: 'new_search' }]);
  return { inline_keyboard: rows };
}

async function showPsalm(chatId, userId, lang, psalm) {
  await sendPsalm(chatId, psalm.text, psalmKeyboard(userId, lang, psalm), psalm.collection, psalm.actualNumber);
}

async function answerCallback(queryId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: queryId, text: text || undefined, show_alert: false });
  } catch (err) { /* already answered */ }
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

// ============================================================================
// GEMEINSAME ORDNER (gespeichert auf dem Website-Server)
// ============================================================================
let foldersCache = { at: 0, data: null };
async function folderApi(method, url = '', body) {
  const res = await axios({ method, url: `${MINIAPP_URL}/api/folders${url}`, data: body, timeout: 20000, validateStatus: () => true });
  if (res.data && Array.isArray(res.data.folders)) foldersCache = { at: Date.now(), data: res.data };
  if (res.status >= 400) throw new Error(res.data?.error || `HTTP ${res.status}`);
  return res.data;
}
async function getFolders(fresh = false) {
  if (!fresh && foldersCache.data && Date.now() - foldersCache.at < 10000) return foldersCache.data.folders;
  return (await folderApi('get')).folders;
}
// Telegram replaces the #hash of a web_app URL with its own launch data, so deep links use the query.
const folderUrl = id => `${MINIAPP_URL}/?f=${encodeURIComponent(id)}`;

async function showFolders(chatId, lang, messageId = null) {
  let folders;
  try { folders = await getFolders(true); } catch (e) { return messageId ? editMessage(chatId, messageId, t(lang, 'folders_error')) : sendMessage(chatId, t(lang, 'folders_error')); }
  const text = `<b>${t(lang, 'folders')}</b> (${folders.length})\n\n${t(lang, 'folders_intro')}` + (folders.length ? '' : `\n\n${t(lang, 'no_folders')}`);
  const keyboard = { inline_keyboard: folders.slice(0, 40).map(f => [{ text: `📁 ${f.name} · ${f.items.length}`, callback_data: `fo_${f.id}` }]) };
  keyboard.inline_keyboard.push([{ text: t(lang, 'new_folder'), callback_data: 'fn' }]);
  keyboard.inline_keyboard.push([{ text: t(lang, 'open_site'), web_app: { url: MINIAPP_URL } }]);
  return messageId ? editMessage(chatId, messageId, text, keyboard) : sendMessage(chatId, text, keyboard);
}

async function showFolder(chatId, lang, id, messageId = null) {
  let folders;
  try { folders = await getFolders(true); } catch (e) { return editMessage(chatId, messageId, t(lang, 'folders_error')); }
  const f = folders.find(x => x.id === id);
  if (!f) return showFolders(chatId, lang, messageId);
  const psalms = f.items.map(k => psalmByKey.get(k)).filter(Boolean);
  let text = `📁 <b>${esc(f.name)}</b> · ${psalms.length}\n\n`;
  text += psalms.length ? psalms.map((p, i) => `${i + 1}. <b>${esc(p.collection.toUpperCase() + p.actualNumber)}</b> ${esc(p.title)}`).join('\n') : t(lang, 'folder_empty');
  if (psalms.length > 1) text += `\n\n<i>${t(lang, 'reorder_hint')}</i>`;
  const keyboard = { inline_keyboard: psalms.slice(0, 40).map((p, i) => [{ text: `${i + 1}. ${p.collection}${p.actualNumber}: ${p.title}`, callback_data: `psalm_${p.collection}_${p.actualNumber}` }]) };
  keyboard.inline_keyboard.push([{ text: t(lang, 'rename'), callback_data: `fr_${f.id}` }, { text: t(lang, 'delete'), callback_data: `fd_${f.id}` }]);
  keyboard.inline_keyboard.push([{ text: t(lang, 'open_site'), web_app: { url: folderUrl(f.id) } }]);
  keyboard.inline_keyboard.push([{ text: t(lang, 'all_folders'), callback_data: 'folders' }]);
  return editMessage(chatId, messageId, text, keyboard);
}

async function showFolderPicker(chatId, lang, psalm, messageId = null, fresh = true) {
  let folders;
  try { folders = await getFolders(fresh); } catch (e) { return messageId ? editMessage(chatId, messageId, t(lang, 'folders_error')) : sendMessage(chatId, t(lang, 'folders_error')); }
  const key = psalm.id;
  const text = `${t(lang, 'choose_folder')} <b>${esc(psalm.collection.toUpperCase() + psalm.actualNumber)}</b> ${esc(psalm.title)}:\n\n<i>${t(lang, 'folders_intro')}</i>`;
  const keyboard = { inline_keyboard: folders.slice(0, 40).map(f => [{ text: `${f.items.includes(key) ? '✅' : '▫️'} ${f.name}`, callback_data: `ft_${f.id}_${psalm.collection}_${psalm.actualNumber}` }]) };
  keyboard.inline_keyboard.push([{ text: t(lang, 'new_folder'), callback_data: `fnp_${psalm.collection}_${psalm.actualNumber}` }]);
  return messageId ? editMessage(chatId, messageId, text, keyboard) : sendMessage(chatId, text, keyboard);
}

// Replies to "write the folder name" prompts
async function handlePendingInput(chatId, userId, lang, text) {
  const st = userState[userId];
  delete userState[userId];
  const name = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return sendMessage(chatId, t(lang, 'cancelled'));
  try {
    if (st.await === 'folder_name') {
      const d = await folderApi('post', '', { name, items: st.add ? [st.add] : [] });
      const kb = { inline_keyboard: [[{ text: `📁 ${name}`, callback_data: `fo_${d.created}` }], [{ text: t(lang, 'all_folders'), callback_data: 'folders' }]] };
      return sendMessage(chatId, `${t(lang, 'folder_created')}: <b>${esc(name)}</b>`, kb);
    }
    if (st.await === 'folder_rename') {
      await folderApi('patch', `/${encodeURIComponent(st.id)}`, { name });
      const kb = { inline_keyboard: [[{ text: `📁 ${name}`, callback_data: `fo_${st.id}` }]] };
      return sendMessage(chatId, `${t(lang, 'folder_renamed')}: <b>${esc(name)}</b>`, kb);
    }
  } catch (e) {
    return sendMessage(chatId, `⚠️ ${esc(e.message)}`);
  }
}

async function notifyAdminNewRequest(userId, user) {
  if (!ADMIN_CHAT_ID) return;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'N/A';
  const text = `🔔 <b>Новая заявка на доступ</b>\n\n` +
    `👤 <b>Имя:</b> ${esc(fullName)}\n` +
    `📱 <b>Username:</b> ${user.username ? '@' + esc(user.username) : 'нет'}\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n` +
    `🔗 <a href="tg://user?id=${userId}">Открыть профиль</a>\n\n` +
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
// Search queries are kept server-side: Telegram limits callback_data to 64 bytes.
const savedQueries = {};
function rememberQuery(userId, text) {
  savedQueries[userId] = text;
  return 'q';
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';

  const lang = 'ru';

  const firstWord = text.split(' ')[0].split('@')[0];
  if (!canUseBot(userId) && firstWord !== '/start') {
    if (!accessData.users[userId]) {
      // unknown user wrote something other than /start: treat it as an access request
      return handleMessage(Object.assign({}, message, { text: '/start' }));
    }
    return sendMessage(chatId, t(lang, 'not_approved'));
  }

  if (userState[userId]?.await) {
    if (text.startsWith('/')) delete userState[userId];
    else return handlePendingInput(chatId, userId, lang, text);
  }

  if (text.startsWith('/')) {
    const command = text.split(' ')[0].split('@')[0];

    if (command === '/cancel') {
      await sendMessage(chatId, t(lang, 'cancelled'));
    } else if (command === '/papki' || command === '/folders') {
      await showFolders(chatId, lang);
    } else if (command === '/start') {
      const user = accessData.users[userId];
      
      if (!user && !isAdmin(userId)) {
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
      } else if (!isAdmin(userId) && (!user.approved || user.blocked)) {
        await sendMessage(chatId, t(lang, 'not_approved'));
      } else {
        const helpText = `${t(lang, 'welcome')}\n\n${t(lang, 'search_help')}\n\n${t(lang, 'commands')}`;

        const keyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'open_app'), web_app: { url: MINIAPP_URL } }],
            [{ text: t(lang, 'all_collections'), callback_data: 'show_collections' }],
            [{ text: t(lang, 'folders'), callback_data: 'folders' }, { text: t(lang, 'favorites'), callback_data: 'show_favorites' }]
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
    } else if (command === '/glavy') {
      // Alle Sammlungen direkt anzeigen
      const collections = collectionsList();

      let text = `${t(lang, 'all_collections')}:\n\n`;
      const keyboard = {
        inline_keyboard: collections.map(c => [
          { text: `${c.name} (${c.count})`, callback_data: `coll_${c.abbr}` }
        ])
      };

      await sendMessage(chatId, text, keyboard);
    } else if (command === '/admin' && isAdmin(userId)) {
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
        await showPsalm(chatId, userId, lang, results[0]);
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
            { text: `➡️ +${results.length - 10} ${t(lang, 'more')}`, callback_data: `search_more_${rememberQuery(userId, text)}_0` }
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

  const lang = 'ru';

  const adminAction = /^(approve_|deny_|block_|unblock_|admin_)/.test(data);
  if (adminAction && !isAdmin(userId)) return;
  if (!adminAction && !canUseBot(userId)) {
    await answerCallback(query.id, t(lang, 'not_approved'));
    return;
  }

  if (data === 'show_collections') {
    const collections = collectionsList();

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
    const searchQuery = parts[0] === 'q' ? (savedQueries[userId] || '') : decodeURIComponent(parts[0]);
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
        { text: t(lang, 'next'), callback_data: `search_more_q_${page + 1}` }
      ]);
    }

    if (page > 0) {
      keyboard.inline_keyboard.push([
        { text: t(lang, 'prev'), callback_data: `search_more_q_${page - 1}` }
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
      await showPsalm(chatId, userId, lang, psalm);
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
    const favPsalm = psalmByKey.get(`${collection}${actualNumber}`);
    if (favPsalm) {
      try {
        await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, { chat_id: chatId, message_id: messageId, reply_markup: psalmKeyboard(userId, lang, favPsalm) });
      } catch (err) { /* message too old or unchanged */ }
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
  } else if (data === 'folders') {
    await showFolders(chatId, lang, messageId);
  } else if (data.startsWith('fo_')) {
    await showFolder(chatId, lang, data.slice(3), messageId);
  } else if (data === 'fn') {
    userState[userId] = { await: 'folder_name' };
    await sendMessage(chatId, t(lang, 'ask_folder_name'));
  } else if (data.startsWith('fnp_')) {
    const m = data.match(/^fnp_(.+?)_(\d+)$/);
    if (m) {
      userState[userId] = { await: 'folder_name', add: m[1] + m[2] };
      await sendMessage(chatId, t(lang, 'ask_folder_name'));
    }
  } else if (data.startsWith('fr_')) {
    userState[userId] = { await: 'folder_rename', id: data.slice(3) };
    await sendMessage(chatId, t(lang, 'ask_rename'));
  } else if (data.startsWith('fdy_')) {
    try {
      await folderApi('delete', `/${encodeURIComponent(data.slice(4))}`);
      await editMessage(chatId, messageId, t(lang, 'folder_deleted'), { inline_keyboard: [[{ text: t(lang, 'all_folders'), callback_data: 'folders' }]] });
    } catch (e) {
      await answerCallback(query.id, e.message);
    }
  } else if (data.startsWith('fd_')) {
    const id = data.slice(3);
    await editMessage(chatId, messageId, t(lang, 'confirm_delete'), {
      inline_keyboard: [[{ text: t(lang, 'yes_delete'), callback_data: `fdy_${id}` }, { text: t(lang, 'cancel'), callback_data: `fo_${id}` }]]
    });
  } else if (data.startsWith('fa_')) {
    const m = data.match(/^fa_(.+?)_(\d+)$/);
    const psalm = m && psalmByKey.get(m[1] + m[2]);
    if (psalm) await showFolderPicker(chatId, lang, psalm);
  } else if (data.startsWith('ft_')) {
    const m = data.match(/^ft_(f-[a-z0-9]+)_(.+?)_(\d+)$/);
    const psalm = m && psalmByKey.get(m[2] + m[3]);
    if (psalm) {
      try {
        const folders = await getFolders(true);
        const f = folders.find(x => x.id === m[1]);
        if (!f) throw new Error('Папка не найдена');
        const inside = f.items.includes(psalm.id);
        if (inside) await folderApi('delete', `/${encodeURIComponent(f.id)}/items/${encodeURIComponent(psalm.id)}`);
        else await folderApi('post', `/${encodeURIComponent(f.id)}/items`, { key: psalm.id });
        await answerCallback(query.id, `${t(lang, inside ? 'removed_from' : 'added_to')} «${f.name}»`);
        await showFolderPicker(chatId, lang, psalm, messageId, false);
      } catch (e) {
        await answerCallback(query.id, `⚠️ ${e.message}`);
      }
    }
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
    
    let text = `👤 <b>${esc([user.firstName, user.lastName].filter(Boolean).join(' '))}</b>\n`;
    text += `📱 ${user.username ? '@' + esc(user.username) : 'нет username'}\n`;
    text += `🔗 <a href="tg://user?id=${adminUserId}">Открыть профиль</a>\n`;
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
  res.json({ ok: true }); // reply at once so Telegram does not resend slow updates

  try {
    if (update.message) {
      await handleMessage(update.message);
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      await answerCallback(update.callback_query.id);
    }
  } catch (err) {
    console.error('❌ Fehler bei der Verarbeitung:', err.message);
  }
});

app.post('/api/validate-token', (req, res) => {
  res.json({ valid: true });
});

app.get('/api/admin/pending', (req, res) => {
  if (!adminTokenOk(req)) return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  const pending = Object.values(accessData.users).filter(u => !u.approved && !u.blocked);
  res.json({ pending });
});

app.get('/api/admin/approved', (req, res) => {
  if (!adminTokenOk(req)) return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  const approved = Object.values(accessData.users).filter(u => u.approved && !u.blocked);
  res.json({ approved });
});

app.get('/api/admin/stats', (req, res) => {
  if (!adminTokenOk(req)) return res.status(403).json({ error: 'Ungültiger Admin-Token' });
  const total = Object.keys(accessData.users).length;
  const approvedCount = Object.values(accessData.users).filter(u => u.approved && !u.blocked).length;
  const pendingCount = Object.values(accessData.users).filter(u => !u.approved && !u.blocked).length;
  const blockedCount = Object.values(accessData.users).filter(u => u.blocked).length;

  res.json({ total, approvedCount, pendingCount, blockedCount });
});

app.post('/api/admin/approve', (req, res) => {
  const { userId, adminToken } = req.body;

  if (!adminTokenOk(req)) {
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

  if (!adminTokenOk(req)) {
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

  if (!adminTokenOk(req)) {
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
  console.log(`💾 Daten in ${path.resolve(DATA_DIR)}`);

  try {
    await axios.post(`${TELEGRAM_API}/setMyCommands`, {
      commands: [
        { command: 'start', description: 'Начало' },
        { command: 'papki', description: 'Общие папки' },
        { command: 'favorites', description: 'Избранное' },
        { command: 'glavy', description: 'Все сборники' },
        { command: 'help', description: 'Справка' }
      ]
    });
  } catch (err) {
    console.error('❌ setMyCommands:', err.message);
  }

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
