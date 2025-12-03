const chatBox = document.getElementById('chat-box');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const fileInput = document.getElementById('file-input');
const fileStatus = document.getElementById('file-status');
const statusBar = document.getElementById('status-bar');

const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model-input'); // Select değil Input+Datalist
const modelList = document.getElementById('models-list');
const refreshBtn = document.getElementById('refresh-models');
const systemPromptInput = document.getElementById('system-prompt');
const tempInput = document.getElementById('temperature');
const tempVal = document.getElementById('temp-val');

// --- DEĞİŞKENLER ---
let chatHistory = [];
let paperplaneUrl = ""; 
let trashUrl = "";
let allModelsList = [];

// --- AÇILIŞ ---
async function initApp() {
    await preloadAnimations();
    loadChatHistory();

    // GitHub Pages'de sistem değişkeni (Env Var) yoktur, sadece LocalStorage'a bakarız.
    apiKeyInput.value = localStorage.getItem('apikey') || '';
    
    // Key varsa modelleri çek
    if(apiKeyInput.value && modelList.options.length <= 1) fetchModels();
    
    modelInput.value = localStorage.getItem('model') || 'openrouter/auto';
    systemPromptInput.value = localStorage.getItem('sysprompt') || "Sen yardımsever bir asistansın.";
}

// --- ANİMASYON ÖN YÜKLEME ---
async function preloadAnimations() {
    try {
        // Yolların başında / yok, göreceli yol (relative path) kullanıyoruz
        const res1 = await fetch('lottie/Loading_Paperplane.json');
        const blob1 = await res1.blob();
        paperplaneUrl = URL.createObjectURL(blob1);

        const res2 = await fetch('lottie/Delete_animation.json');
        const blob2 = await res2.blob();
        trashUrl = URL.createObjectURL(blob2);
    } catch (e) {
        // Hata olursa düz yol
        paperplaneUrl = "lottie/Loading_Paperplane.json";
    }
}

// --- SOHBET YÖNETİMİ ---
function loadChatHistory() {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
        try {
            chatHistory = JSON.parse(saved);
            chatHistory.forEach(msg => {
                let contentToShow = "";
                if (typeof msg.content === 'string') {
                    contentToShow = msg.content;
                } else if (Array.isArray(msg.content)) {
                    const textPart = msg.content.find(p => p.type === 'text');
                    contentToShow = textPart ? textPart.text : '[Dosya]';
                    if(msg.content.some(p => p.type === 'image_url')) {
                        contentToShow += ' <br><small><i>[Resim Eklendi]</i></small>';
                    }
                }
                addMessageToUI(contentToShow, msg.role, false); 
            });
            setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 100);
        } catch (e) { }
    }
}

function saveChatHistory() {
    const historyToSave = chatHistory.slice(-50);
    localStorage.setItem('chat_history', JSON.stringify(historyToSave));
}

if(clearBtn) {
    clearBtn.addEventListener('click', () => {
        if(confirm("Tüm sohbet geçmişi silinsin mi?")) {
            chatHistory = [];
            localStorage.removeItem('chat_history');
            chatBox.innerHTML = '';
        }
    });
}

// --- OPENROUTER API İSTEĞİ (DOĞRUDAN) ---
async function fetchOpenRouter(endpoint, body = null, method = 'GET') {
    const key = apiKeyInput.value.trim();
    if (!key) throw new Error("API Key eksik");

    const headers = {
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": window.location.href, // GitHub Pages URL'si otomatik gider
        "X-Title": "GitHub Pages WebUI"
    };

    if (method === 'POST') {
        headers["Content-Type"] = "application/json";
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`https://openrouter.ai/api/v1${endpoint}`, options);
    
    if (!res.ok) {
        const errText = await res.text();
        try {
            const errJson = JSON.parse(errText);
            throw new Error(errJson.error?.message || "API Hatası");
        } catch {
            throw new Error(`Hata: ${res.status} - ${errText}`);
        }
    }
    return await res.json();
}

// --- MODEL LİSTESİ ---
async function fetchModels() {
    refreshBtn.innerText = "...";
    try {
        // Doğrudan OpenRouter'dan çekiyoruz
        const json = await fetchOpenRouter('/models');
        
        if (json.data) {
            allModelsList = json.data.sort((a, b) => a.id.localeCompare(b.id));
            renderModelList("");
            
            const saved = localStorage.getItem('model');
            if(saved) modelInput.value = saved;
        }
    } catch (err) { 
        alert("Model listesi alınamadı: " + err.message);
    } finally { 
        refreshBtn.innerText = "🔄 Listeyi Yenile"; 
    }
}

function renderModelList(filterText) {
    const currentVal = modelInput.value;
    modelList.innerHTML = '';

    const autoOpt = document.createElement('option');
    autoOpt.value = "openrouter/auto";
    autoOpt.innerText = "Auto (Best/Cheapest)";
    modelList.appendChild(autoOpt);

    const lowerFilter = filterText.toLowerCase();
    
    allModelsList.forEach(m => {
        const modelName = (m.name || m.id).toLowerCase();
        const modelId = m.id.toLowerCase();

        if (modelName.includes(lowerFilter) || modelId.includes(lowerFilter)) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.innerText = m.name || m.id;
            modelList.appendChild(opt);
        }
    });
}

// Input dinleyicileri
modelInput.addEventListener('input', (e) => renderModelList(e.target.value));
refreshBtn.addEventListener('click', fetchModels);

// --- AYARLARI KAYDET ---
let currentFile = null;
const saveSettings = () => {
    localStorage.setItem('apikey', apiKeyInput.value);
    localStorage.setItem('model', modelInput.value);
    localStorage.setItem('sysprompt', systemPromptInput.value);
};
[modelInput, systemPromptInput, apiKeyInput].forEach(el => el.addEventListener('change', saveSettings));
tempInput.addEventListener('input', (e) => tempVal.innerText = e.target.value);

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentFile = { name: file.name, data: ev.target.result, type: file.type };
            fileStatus.innerText = `📎 ${file.name}`;
        };
        reader.readAsDataURL(file);
    }
});

// --- LATEX VE RENDER ---
function preprocessLaTeX(text) {
    if (!text) return "";
    text = text.replace(/\\\[/g, '$$$').replace(/\\\]/g, '$$$');
    text = text.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
    text = text.replace(/(\\begin\{[a-z]+\}[\s\S]*?\\end\{[a-z]+\})/g, (match) => {
        if (text.includes('$$' + match)) return match;
        return `$$\n${match}\n$$`;
    });
    return text;
}

function renderContent(text) {
    const normalizedText = preprocessLaTeX(text);
    const rawHtml = marked.parse(normalizedText);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = rawHtml;
    if (window.renderMathInElement) {
        renderMathInElement(wrapper, {
            delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], 
            throwOnError: false, trust: true
        });
    }
    return wrapper.innerHTML;
}

function addMessageToUI(content, role, animate = false) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    if (animate) {
        bubble.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; overflow: hidden;">
                <lottie-player 
                    src="${paperplaneUrl}" 
                    background="transparent" 
                    speed="1" 
                    style="width: 150px; height: 150px; transform: scale(1.2);" 
                    loop 
                    autoplay>
                </lottie-player>
            </div>`;
    } else {
        bubble.innerHTML = renderContent(content);
    }
    
    div.appendChild(bubble);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

// --- MESAJ GÖNDERME ---
async function sendMessage() {
    const text = promptInput.value.trim();
    if (!text && !currentFile) return;
    if (!apiKeyInput.value) { alert("Lütfen API Key giriniz!"); return; }

    let userContent = [];
    if (text) userContent.push({ type: "text", text: text });
    if (currentFile) {
        userContent.push({ type: "image_url", image_url: { url: currentFile.data } });
    }

    let displayHtml = text;
    if (currentFile) displayHtml += ` <br><small>📎 ${currentFile.name}</small>`;
    if (currentFile && currentFile.type.startsWith('image')) {
        displayHtml += `<br><img src="${currentFile.data}" width="200">`;
    }
    addMessageToUI(displayHtml, 'user');

    chatHistory.push({ role: "user", content: userContent });
    saveChatHistory();

    promptInput.value = '';
    const loadingBubble = addMessageToUI('', 'bot', true);

    // Sistem mesajını geçmişin en başına ekle (OpenRouter formatı)
    const messagesToSend = [
        { role: "system", content: systemPromptInput.value },
        ...chatHistory
    ];

    const payload = {
        model: modelInput.value,
        messages: messagesToSend,
        temperature: parseFloat(tempInput.value)
    };

    try {
        // DOĞRUDAN OPENROUTER ÇAĞRISI
        const data = await fetchOpenRouter('/chat/completions', payload, 'POST');
        
        const botReply = data.choices?.[0]?.message?.content || "Hata: Boş cevap";
        loadingBubble.innerHTML = renderContent(botReply);
        
        chatHistory.push({ role: "assistant", content: botReply });
        saveChatHistory();

        if (window.renderMathInElement) {
            renderMathInElement(loadingBubble, {delimiters: [{left: '$', right: '$', display: false}]});
        }
    } catch (err) {
        loadingBubble.innerText = "Hata: " + err.message;
    }

    currentFile = null;
    fileInput.value = '';
    fileStatus.innerText = '';
}

sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

initApp();