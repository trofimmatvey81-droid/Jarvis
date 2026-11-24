// === СОСТОЯНИЕ И НАСТРОЙКИ ===
let chats = [];
try {
  chats = JSON.parse(localStorage.getItem('yarvis_chats') || '[]');
} catch (e) {
  chats = [];
}

let currentChatId = null;
let modes = { think: false, web: true };
let ttsEnabled = true;
let pendingImageBase64 = null;
let cameraStream = null;
let isLiveMode = false;

const SYSTEM_CORE = `Ты — YARVIS (Ярвис), продвинутый персональный ИИ-ассистент.
Твой интеллект адаптивен (как у DeepSeek):
1. Если пользователь задаёт обычный вопрос, просит решить задачу по математике, физике, инженерии или проанализировать данные — отвечай максимально быстро, чётко, структурированно и естественным языком без воды.
2. Если пользователь начинает ролевую игру (РП), описывает действия в звёздочках (*...*), задаёт сюжет, персонажа или художественную суену — ТЫ МГНОВЕННО И БЕЗ ЛИШНИХ СЛОВ переходишь в художественный литературный стиль: красиво описываешь атмосферу, окружение, детали, эмоции и действия от третьего лица, развивая сюжет и диалог в рамках заданного мира.
3. Если прикреплено фото с камеры — внимательно опиши, что происходит на снимке, и ответь по существу.`;

function byId(id) {
  return document.getElementById(id);
}

function bindClick(id, handler) {
  const el = byId(id);
  if (el) {
    el.addEventListener('click', handler);
  }
}

// === ПРИВЯЗКА ВСЕХ КНОПОК ПОСЛЕ ЗАГРУЗКИ ===
document.addEventListener('DOMContentLoaded', () => {
  const workerInput = byId('worker-url');
  const sysInput = byId('system-prompt');

  if (workerInput) workerInput.value = localStorage.getItem('yarvis_worker') || '';
  if (sysInput) sysInput.value = localStorage.getItem('yarvis_sys') || '';

  // Меню и чаты
  bindClick('btn-menu', () => {
    const sb = byId('sidebar');
    if (sb) sb.classList.toggle('open');
  });
  bindClick('btn-close-side', () => {
    const sb = byId('sidebar');
    if (sb) sb.classList.remove('open');
  });
  bindClick('btn-new-chat', createNewChat);

  // Настройки
  bindClick('btn-open-settings', () => {
    const modal = byId('settings-modal');
    if (modal) modal.style.display = 'flex';
  });
  bindClick('btn-cancel-settings', () => {
    const modal = byId('settings-modal');
    if (modal) modal.style.display = 'none';
  });
  bindClick('btn-save-settings', () => {
    if (workerInput) localStorage.setItem('yarvis_worker', workerInput.value.trim());
    if (sysInput) localStorage.setItem('yarvis_sys', sysInput.value.trim());
    const modal = byId('settings-modal');
    if (modal) modal.style.display = 'none';
  });

  // Режимы DeepSeek
  bindClick('btn-think', () => toggleMode('think'));
  bindClick('btn-web', () => toggleMode('web'));

  // Озвучка
  bindClick('btn-tts', () => {
    ttsEnabled = !ttsEnabled;
    const btnTts = byId('btn-tts');
    if (btnTts) btnTts.textContent = ttsEnabled ? '🔊' : '🔇';
    if (!ttsEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  });

  // Камера и файлы
  bindClick('btn-cam', openCameraSnap);
  bindClick('btn-live', openLiveCamera);
  bindClick('btn-close-cam', closeCamera);
  bindClick('cam-action-btn', captureAndAnalyze);
  bindClick('btn-clear-img', clearImage);

  const fileInput = byId('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  // Голос и отправка
  bindClick('mic-btn', startVoice);
  bindClick('btn-send', sendMessage);

  const promptEl = byId('prompt');
  if (promptEl) {
    promptEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (chats.length === 0) {
    createNewChat();
  } else {
    loadChat(chats[0].id);
  }
});
// === УПРАВЛЕНИЕ ЧАТАМИ ===
function createNewChat() {
  const id = Date.now().toString();
  chats.unshift({ id, title: 'Новый чат', messages: [] });
  saveChats();
  loadChat(id);
  const sb = byId('sidebar');
  if (sb) sb.classList.remove('open');
}

function loadChat(id) {
  currentChatId = id;
  renderChatList();
  const chat = chats.find((c) => c.id === id);
  const box = byId('chat');
  const welcome = byId('welcome-screen');
  if (!box || !welcome) return;

  box.innerHTML = '';

  if (!chat || chat.messages.length === 0) {
    welcome.style.display = 'flex';
    box.style.display = 'none';
    return;
  }

  welcome.style.display = 'none';
  box.style.display = 'flex';
  chat.messages.forEach((m) => appendBubble(m.role, m.text, m.image));
}

function renderChatList() {
  const list = byId('chat-list');
  if (!list) return;
  list.innerHTML = '';
  chats.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (c.id === currentChatId ? ' active' : '');
    div.textContent = c.title;
    div.addEventListener('click', () => {
      loadChat(c.id);
      const sb = byId('sidebar');
      if (sb) sb.classList.remove('open');
    });
    list.appendChild(div);
  });
}

function saveChats() {
  try {
    localStorage.setItem('yarvis_chats', JSON.stringify(chats));
  } catch (e) {}
}

function toggleMode(mode) {
  modes[mode] = !modes[mode];
  const btn = byId('btn-' + mode);
  if (btn) btn.classList.toggle('active', modes[mode]);
}

// === КАМЕРА И ФОТО ===
async function openCameraSnap() {
  isLiveMode = false;
  const title = byId('cam-title');
  const actionBtn = byId('cam-action-btn');
  if (title) title.textContent = '📷 Камера YARVIS';
  if (actionBtn) actionBtn.textContent = 'Сделать снимок';
  await startCameraStream();
}

async function openLiveCamera() {
  isLiveMode = true;
  const title = byId('cam-title');
  const actionBtn = byId('cam-action-btn');
  if (title) title.textContent = '📹 Эфир (показать обстановку)';
  if (actionBtn) actionBtn.textContent = 'Показать что творится';
  await startCameraStream();
}

async function startCameraStream() {
  const modal = byId('camera-modal');
  const video = byId('video-feed');
  if (!modal || !video) return;

  modal.style.display = 'flex';
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('No camera API');
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = cameraStream;
  } catch (e) {
    closeCamera();
    const fileInput = byId('file-input');
    if (fileInput) fileInput.click();
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const modal = byId('camera-modal');
  if (modal) modal.style.display = 'none';
}

function captureAndAnalyze() {
  const video = byId('video-feed');
  const canvas = byId('snap-canvas');
  if (!video || !canvas) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  pendingImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
  closeCamera();

  if (isLiveMode) {
    const promptEl = byId('prompt');
    if (promptEl) {
      promptEl.value = 'Посмотри через камеру, что сейчас происходит вокруг, и кратко прокомментируй.';
    }
    sendMessage();
  } else {
    const previewImg = byId('preview-img');
    const previewBar = byId('preview-bar');
    if (previewImg) previewImg.src = pendingImageBase64;
    if (previewBar) previewBar.style.display = 'flex';
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingImageBase64 = reader.result;
    const previewImg = byId('preview-img');
    const previewBar = byId('preview-bar');
    if (previewImg) previewImg.src = pendingImageBase64;
    if (previewBar) previewBar.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  pendingImageBase64 = null;
  const previewBar = byId('preview-bar');
  const fileInput = byId('file-input');
  if (previewBar) previewBar.style.display = 'none';
  if (fileInput) fileInput.value = '';
}
// === ГОЛОС И МГНОВЕННАЯ ОЗВУЧКА ===
function startVoice() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert('Голосовой ввод не поддерживается в этом WebView');
    return;
  }
  const rec = new SpeechRec();
  rec.lang = 'ru-RU';
  const btn = byId('mic-btn');
  if (btn) btn.style.background = 'var(--danger, #e53935)';

  rec.onresult = (e) => {
    const promptEl = byId('prompt');
    if (promptEl) promptEl.value = e.results[0][0].transcript;
    sendMessage();
  };
  rec.onerror = () => {
    if (btn) btn.style.background = 'var(--surface, #222)';
  };
  rec.onend = () => {
    if (btn) btn.style.background = 'var(--surface, #222)';
  };
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
  const input = byId('prompt');
  if (!input) return;

  const text = input.value.trim();
  const workerUrl = localStorage.getItem('yarvis_worker');

  if (!text && !pendingImageBase64) return;
  if (!workerUrl) {
    alert('Сначала вставьте адрес Cloudflare Worker в настройках (⚙)');
    const modal = byId('settings-modal');
    if (modal) modal.style.display = 'flex';
    return;
  }

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const welcome = byId('welcome-screen');
  const chatBox = byId('chat');
  if (welcome) welcome.style.display = 'none';
  if (chatBox) chatBox.style.display = 'flex';

  let chat = chats.find((c) => c.id === currentChatId);
  if (!chat) {
    createNewChat();
    chat = chats.find((c) => c.id === currentChatId);
  }

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
  const systemInstruction = SYSTEM_CORE + (extraSys ? '\n' + extraSys : '');

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

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    if (!response.body) {
      const fallbackText = await response.text();
      aiBubble.textContent = fallbackText;
      chat.messages.push({ role: 'ai', text: fallbackText });
      saveChats();
      return;
    }

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
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;

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
  const box = byId('chat');
  if (!box) return document.createElement('span');

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
