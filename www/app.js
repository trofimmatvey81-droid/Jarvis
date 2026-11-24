// === СОСТОЯНИЕ И НАСТРОЙКИ ===
let chats = JSON.parse(localStorage.getItem('yarvis_chats') || '[]');
let currentChatId = null;
let modes = { think: false, web: true };
let ttsEnabled = true;
let pendingImageBase64 = null;
let cameraStream = null;
let isLiveMode = false;

// Единый системный интеллект в стиле DeepSeek: сам распознаёт обычные вопросы, науку и литературное РП
const SYSTEM_CORE = `Ты — YARVIS (Ярвис), продвинутый персональный ИИ-ассистент.
Твой интеллект адаптивен (как у DeepSeek):
1. Если пользователь задаёт обычный вопрос, просит решить задачу по математике, физике, инженерии или проанализировать данные — отвечай максимально быстро, чётко, структурированно и естественным языком без воды.
2. Если пользователь начинает ролевую игру (РП), описывает действия в звёздочках (*...*), задаёт сюжет, персонажа или художественную сцену — ТЫ МГНОВЕННО И БЕЗ ЛИШНИХ СЛОВ переходишь в художественный литературный стиль: красиво описываешь атмосферу, окружение, детали, эмоции и действия от третьего лица, развивая сюжет и диалог в рамках заданного мира.
3. Если прикреплено фото с камеры — внимательно опиши, что происходит на снимке, и ответь по существу.`;

// === ПРИВЯЗКА ВСЕХ КНОПОК ПОСЛЕ ЗАГРУЗКИ ===
document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);

  byId('worker-url').value = localStorage.getItem('yarvis_worker') || '';
  byId('system-prompt').value = localStorage.getItem('yarvis_sys') || '';

  // Меню и чаты
  byId('btn-menu').addEventListener('click', () => byId('sidebar').classList.toggle('open'));
  byId('btn-close-side').addEventListener('click', () => byId('sidebar').classList.remove('open'));
  byId('btn-new-chat').addEventListener('click', createNewChat);

  // Настройки
  byId('btn-open-settings').addEventListener('click', () => { byId('settings-modal').style.display = 'flex'; });
  byId('btn-cancel-settings').addEventListener('click', () => { byId('settings-modal').style.display = 'none'; });
  byId('btn-save-settings').addEventListener('click', () => {
    localStorage.setItem('yarvis_worker', byId('worker-url').value.trim());
    localStorage.setItem('yarvis_sys', byId('system-prompt').value.trim());
    byId('settings-modal').style.display = 'none';
  });

  // Режимы DeepSeek
  byId('btn-think').addEventListener('click', () => toggleMode('think'));
  byId('btn-web').addEventListener('click', () => toggleMode('web'));

  // Озвучка
  byId('btn-tts').addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    byId('btn-tts').textContent = ttsEnabled ? '🔊' : '🔇';
    if (!ttsEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  // Камера и файлы
  byId('btn-cam').addEventListener('click', openCameraSnap);
  byId('btn-live').addEventListener('click', openLiveCamera);
  byId('btn-close-cam').addEventListener('click', closeCamera);
  byId('cam-action-btn').addEventListener('click', captureAndAnalyze);
  byId('btn-clear-img').addEventListener('click', clearImage);
  byId('file-input').addEventListener('change', handleFileSelect);

  // Голос и отправка
  byId('mic-btn').addEventListener('click', startVoice);
  byId('btn-send').addEventListener('click', sendMessage);
  byId('prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  if (chats.length === 0) createNewChat();
  else loadChat(chats[0].id);
});

// === УПРАВЛЕНИЕ ЧАТАМИ ===
function createNewChat() {
  const id = Date.now().toString();
  chats.unshift({ id, title: 'Новый чат', messages: [] });
  saveChats();
  loadChat(id);
  document.getElementById('sidebar').classList.remove('open');
}

function loadChat(id) {
  currentChatId = id;
  renderChatList();
  const chat = chats.find(c => c.id === id);
  const box = document.getElementById('chat');
  const welcome = document.getElementById('welcome-screen');
  box.innerHTML = '';

  if (!chat || chat.messages.length === 0) {
    welcome.style.display = 'flex';
    box.style.display = 'none';
    return;
  }

  welcome.style.display = 'none';
  box.style.display = 'flex';
  chat.messages.forEach(m => appendBubble(m.role, m.text, m.image));
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = '';
  chats.forEach(c => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (c.id === currentChatId ? ' active' : '');
    div.textContent = c.title;
    div.addEventListener('click', () => {
      loadChat(c.id);
      document.getElementById('sidebar').classList.remove('open');
    });
    list.appendChild(div);
  });
}

function saveChats() {
  localStorage.setItem('yarvis_chats', JSON.stringify(chats));
}

function toggleMode(mode) {
  modes[mode] = !modes[mode];
  document.getElementById('btn-' + mode).classList.toggle('active', modes[mode]);
}

// === КАМЕРА И ФОТО ===
async function openCameraSnap() {
  isLiveMode = false;
  document.getElementById('cam-title').textContent = '📷 Камера YARVIS';
  document.getElementById('cam-action-btn').textContent = 'Сделать снимок';
  await startCameraStream();
}

async function openLiveCamera() {
  isLiveMode = true;
  document.getElementById('cam-title').textContent = '📹 Эфир (показать обстановку)';
  document.getElementById('cam-action-btn').textContent = 'Показать что творится';
  await startCameraStream();
}

async function startCameraStream() {
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('video-feed');
  modal.style.display = 'flex';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = cameraStream;
  } catch (e) {
    closeCamera();
    document.getElementById('file-input').click();
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('camera-modal').style.display = 'none';
}

function captureAndAnalyze() {
  const video = document.getElementById('video-feed');
  const canvas = document.getElementById('snap-canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  pendingImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
  closeCamera();

  if (isLiveMode) {
    document.getElementById('prompt').value = 'Посмотри через камеру, что сейчас происходит вокруг, и кратко прокомментируй.';
    sendMessage();
  } else {
    document.getElementById('preview-img').src = pendingImageBase64;
    document.getElementById('preview-bar').style.display = 'flex';
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingImageBase64 = reader.result;
    document.getElementById('preview-img').src = pendingImageBase64;
    document.getElementById('preview-bar').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  pendingImageBase64 = null;
  document.getElementById('preview-bar').style.display = 'none';
  document.getElementById('file-input').value = '';
}

// === ГОЛОС И МГНОВЕННАЯ ОЗВУЧКА ===
function startVoice() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return alert('Голосовой ввод не поддерживается на этом устройстве');
  const rec = new SpeechRec();
  rec.lang = 'ru-RU';
  const btn = document.getElementById('mic-btn');
  btn.style.background = 'var(--danger)';
  rec.onresult = (e) => {
    document.getElementById('prompt').value = e.results[0][0].transcript;
    sendMessage();
  };
  rec.onend = () => { btn.style.background = 'var(--surface)'; };
  rec.start();
}

function speakSentence(text) {
  if (!ttsEnabled || !text.trim() || !window.speechSynthesis) return;
  const clean = text.replace(/[*#`_]/g, '');
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'ru-RU';
  utter.rate = 1.15;
  window.speechSynthesis.speak(utter);
}

// === ОТПРАВКА И ПОТОКОВЫЙ ОТВЕТ ===
async function sendMessage() {
  const input = document.getElementById('prompt');
  const text = input.value.trim();
  const workerUrl = localStorage.getItem('yarvis_worker');

  if (!text && !pendingImageBase64) return;
  if (!workerUrl) {
    alert('Сначала вставьте адрес Cloudflare Worker в настройках (⚙)');
    document.getElementById('settings-modal').style.display = 'flex';
    return;
  }

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';

  const chat = chats.find(c => c.id === currentChatId);
  const imgToSend = pendingImageBase64;

  if (chat.messages.length === 0 && text) {
    chat.title = text.slice(0, 32);
    renderChatList();
  }

  chat.messages.push({ role: 'user', text, image: imgToSend });
  appendBubble('user', text, imgToSend);
  input.value = '';
  clearImage();

  const aiBubble = appendBubble('ai', '...');
  const extraSys = localStorage.getItem('yarvis_sys') || '';
  const systemInstruction = SYSTEM_CORE + (extraSys ? '
' + extraSys : '');

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        messages: chat.messages.slice(-14),
        system: systemInstruction,
        think: modes.think,
        web: modes.web
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let spokenBuffer = '';
    aiBubble.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      spokenBuffer += chunk;
      aiBubble.textContent = fullText;
      document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;

      const match = spokenBuffer.match(/^(.*?[.!?])\s+(.*)$/s);
      if (match) {
        speakSentence(match[1]);
        spokenBuffer = match[2];
      }
    }

    if (spokenBuffer.trim()) speakSentence(spokenBuffer);
    chat.messages.push({ role: 'ai', text: fullText });
    saveChats();
  } catch (err) {
    aiBubble.textContent = 'Ошибка соединения: ' + err.message;
  }
}

function appendBubble(role, text, image = null) {
  const box = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    div.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = text;
  div.appendChild(span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return span;
}
