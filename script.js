// --- CHAT UI LOGIC ---
const toggleBtn = document.getElementById('chat-toggle');
const chatWindow = document.getElementById('chat-window');
const closeBtn = document.getElementById('chat-close');
const messagesContainer = document.getElementById('chat-messages');
const inputField = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const typingIndicator = document.getElementById('typing-indicator');

// Image Upload UI
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const clearImageBtn = document.getElementById('clear-image');
let selectedImageBase64 = null;

let apiKey = null;

toggleBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
    if(chatWindow.classList.contains('open')) inputField.focus();
});

closeBtn.addEventListener('click', () => {
    chatWindow.classList.remove('open');
});

// Image Selection Handler (File Input)
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    processFile(file);
});

// PASTE Event Handler (Snip and Paste)
inputField.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.includes('image/')) {
            const blob = item.getAsFile();
            processFile(blob);
            e.preventDefault(); // Prevent pasting the image binary text
        }
    }
});

function processFile(file) {
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedImageBase64 = e.target.result;
            imagePreview.src = selectedImageBase64;
            imagePreviewContainer.classList.add('active');
        };
        reader.readAsDataURL(file);
    }
}

// Clear Image Handler
clearImageBtn.addEventListener('click', () => {
    imageInput.value = '';
    selectedImageBase64 = null;
    imagePreview.src = '';
    imagePreviewContainer.classList.remove('active');
});

// Add message to chat
function addMessage(text, sender, imageSrc = null) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    
    if (imageSrc) {
        const img = document.createElement('img');
        img.src = imageSrc;
        img.classList.add('message-image');
        div.appendChild(img);
    }

    if (text) {
        const textSpan = document.createElement('span');
        // Basic formatting for bot messages
        if (sender === 'bot') {
            let formatted = text.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
            formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
            formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            textSpan.innerHTML = formatted;
        } else {
            textSpan.textContent = text;
        }
        div.appendChild(textSpan);
    }
    
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- GEMINI API LOGIC ---
async function callGemini(prompt, imageBase64 = null) {
    if (!apiKey) return;

    typingIndicator.style.display = 'block';
    
    const systemInstruction = `
        You are a helpful assistant on a Stack Overflow-style website. 
        You are an expert in Python Exploratory Data Analysis (EDA) (using pandas, seaborn, matplotlib) and Java development.
        1. If the user asks a question about Python EDA or Java, answer it clearly with code examples where necessary.
        2. If an image is provided, analyze it in the context of Python EDA or Java (e.g., explain an error screenshot, interpret a data plot).
        3. If the user asks about other topics, politely refuse and remind them of your expertise.
        4. Keep answers concise and helpful.
    `;

    let contents = [];
    let userContentParts = [{ text: prompt }];

    if (imageBase64) {
        // Extract base64 data and mime type
        const [meta, data] = imageBase64.split(',');
        const mimeType = meta.match(/:(.*?);/)[1];
        
        userContentParts.push({
            inline_data: {
                mime_type: mimeType,
                data: data
            }
        });
    }
    
    // Add system instruction as the first content part
    contents.push({ role: 'user', parts: [{ text: systemInstruction }] });
    // Add the actual user query and optional image
    contents.push({ role: 'user', parts: userContentParts });


    // Use a model that supports vision
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();
        
        if (data.error) {
            addMessage("Error: " + data.error.message, 'bot');
        } else if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
            const text = data.candidates[0].content.parts[0].text;
            addMessage(text, 'bot');
        } else {
            addMessage("Received an unexpected response format from Gemini.", 'bot');
        }

    } catch (err) {
        addMessage("Network Error: Unable to reach Gemini API.", 'bot');
        console.error(err);
    } finally {
        typingIndicator.style.display = 'none';
    }
}

async function handleSend() {
    const text = inputField.value.trim();
    const image = selectedImageBase64;

    if (!text && !image) return;

    // Clear inputs
    inputField.value = '';
    clearImageBtn.click(); // This also clears selectedImageBase64
    
    // API Key Handling
    if (!apiKey) {
        if (text.startsWith('AIza') && text.length > 20) {
            apiKey = text;
            addMessage('API Key accepted! How can I help you with Python EDA or Java today?', 'bot');
        } else {
            addMessage("That doesn't look like a valid Google API Key. It should start with 'AIza'. Please try again.", 'bot');
            // Restore image selection if any, as the send failed
            if(image) {
                selectedImageBase64 = image;
                imagePreview.src = image;
                imagePreviewContainer.classList.add('active');
            }
        }
        return;
    }

    // Normal chat flow
    addMessage(text, 'user', image);
    await callGemini(text, image);
}

sendBtn.addEventListener('click', handleSend);
inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});