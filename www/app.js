// === СОСТОЯНИЕ И НАСТРОЙКИ ===
let chats = JSON.parse(localStorage.getItem('yarvis_chats') || '[]');
let currentChatId = null;
let modes = { think: false, web: true, rp: false };
let ttsEnabled = true;
let pendingImageBase64 = null;
let cameraStream = null;
let isLiveMode = false;

const DEFAULT_SYSTEM = `Ты — YARVIS (Ярвис), продвинутый персональный ИИ-ассистент. 
Отвечай быстро, чётко, живым и естественным языком, без воды. 
Ты отлично разбираешься в математике, физике, инженерии, программировании и анализе данных: при сложных задачах давай структурированный разбор и точные расчёты.`;

const RP_SYSTEM = `Ты переключён в режим литературной ролевой игры (РП). 
Пиши художественно, атмосферно и образно. Описывай действия, окружение, детали и эмоции от третьего лица или в рамках заданного сеттинга, поддерживая глубокий сюжет и живые диалоги.`;

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = () => {
  document.getElementById('worker-url').value = localStorage.getItem('yarvis_worker') || '';
  document.getElementById('system-prompt').value = localStorage.getItem('yarvis_sys') || '';
  if (chats.length === 0) createNewChat();
  else loadChat(chats[0].id);

  // Отправка по Enter (Shift+Enter — новая строка)
  document.getElementById('prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
};

// === УПРАВЛЕНИЕ ЧАТАМИ ===
function createNewChat() {
  const id = Date.now().toString();
  chats.unshift({ id, title: 'Новый диалог', messages: [] });
  saveChats();
  loadChat(id);
}

function loadChat(id) {
  currentChatId = id;
  renderChatList();
  const chat = chats.find(c => c.id === id);
  const box = document.getElementById('chat');
  box.innerHTML = '';
  if (!chat || chat.messages.length === 0) {
    appendBubble('ai', 'Системы YARVIS активны. Выберите режим снизу или задайте вопрос.');
    return;
  }
  chat.messages.forEach(m => appendBubble(m.role, m.text, m.image, m.thought));
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = '';
  chats.forEach(c => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (c.id === currentChatId ? ' active' : '');
    div.textContent = c.title;
    div.onclick = () => { loadChat(c.id); if (window.innerWidth <= 768) toggleSidebar(); };
    list.appendChild(div);
  });
}

function saveChats() {
  localStorage.setItem('yarvis_chats', JSON.stringify(chats));
}

// === ИНТЕРФЕЙС И РЕЖИМЫ ===
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function saveSettings() {
  localStorage.setItem('yarvis_worker', document.getElementById('worker-url').value.trim());
  localStorage.setItem('yarvis_sys', document.getElementById('system-prompt').value.trim());
  closeModal('settings-modal');
}

function toggleMode(mode) {
  modes[mode] = !modes[mode];
  document.getElementById('btn-' + mode).classList.toggle('active', modes[mode]);
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  document.getElementById('tts-toggle').textContent = ttsEnabled ? '🔊' : '🔇';
  if (!ttsEnabled) window.speechSynthesis.cancel();
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
    // Если браузер не дал прямой доступ к потоку — открываем стандартную камеру телефона
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

// === ГОЛОСОВОЙ ВВОД И БЫСТРАЯ ОЗВУЧКА ===
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
  if (!ttsEnabled || !text.trim()) return;
  const clean = text.replace(/[*#`_]/g, '');
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'ru-RU';
  utter.rate = 1.12; // Чуть ускоренная живая речь
  window.speechSynthesis.speak(utter);
}

// === ОТПРАВКА И ПОТОКОВЫЙ ОТВЕТ (STREAMING) ===
async function sendMessage() {
  const input = document.getElementById('prompt');
  const text = input.value.trim();
  const workerUrl = localStorage.getItem('yarvis_worker');

  if (!text && !pendingImageBase64) return;
  if (!workerUrl) {
    alert('Сначала укажите адрес Cloudflare Worker в настройках (⚙)');
    return openSettings();
  }

  window.speechSynthesis.cancel();
  const chat = chats.find(c => c.id === currentChatId);
  const imgToSend = pendingImageBase64;

  // Обновляем заголовок чата по первому сообщению
  if (chat.messages.length === 0 && text) {
    chat.title = text.slice(0, 32);
    renderChatList();
  }

  chat.messages.push({ role: 'user', text, image: imgToSend });
  appendBubble('user', text, imgToSend);
  input.value = '';
  clearImage();

  // Создаём пустой пузырь ответа для мгновенной печати по словам
  const aiBubble = appendBubble('ai', '...');
  const systemInstruction = (modes.rp ? RP_SYSTEM : DEFAULT_SYSTEM) + '\n' + (localStorage.getItem('yarvis_sys') || '');

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        messages: chat.messages.slice(-14), // Память последних 14 сообщений
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

      // Озвучиваем сразу по мере появления законченных предложений!
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
    aiBubble.textContent = 'Ошибка соединения с сервером YARVIS: ' + err.message;
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
