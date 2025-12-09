document.addEventListener('DOMContentLoaded', () => {
    // --- Global DOM Elements & State ---
    const signInBtn = document.getElementById('sign-in-btn');
    const apiKeyModal = document.getElementById('api-key-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    const apiKeyInput = document.getElementById('api-key-input');

    let apiKey = localStorage.getItem('gemini_api_key') || null;
    let chatHistory = []; 

    // --- 1. Modal & API Key Handling ---
    signInBtn.addEventListener('click', () => {
        apiKeyModal.classList.remove('hidden');
        if (apiKey) apiKeyInput.value = apiKey;
        apiKeyInput.focus();
    });

    closeModalBtn.addEventListener('click', () => apiKeyModal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === apiKeyModal) apiKeyModal.classList.add('hidden');
    });

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            apiKey = key;
            localStorage.setItem('gemini_api_key', key);
            apiKeyModal.classList.add('hidden');
            // Silent Save (No alert)
        } else {
            alert("Please enter a valid API key.");
        }
    });

    // --- 2. Interactive Sections Logic ---
    const interactiveSections = document.querySelectorAll('.interactive-section');

    interactiveSections.forEach(section => {
        const triggerInput = section.querySelector('.trigger-input');
        const inputContainer = section.querySelector('.input-container');
        const submitBtn = section.querySelector('.submit-btn');
        const userPrompt = section.querySelector('.user-prompt');
        const codeDisplay = section.querySelector('.code-display');
        const copyBtn = section.querySelector('.copy-btn');
        const loader = section.querySelector('.loader');
        
        // Image UI Elements
        const imageIndicator = section.querySelector('.image-indicator');
        const imgCountSpan = section.querySelector('.img-count');
        const removeImgBtn = section.querySelector('.remove-img');

        const staticCode = codeDisplay.innerHTML;
        let isStaticCodeVisible = true;
        let pastedImages = []; 

        // A. Toggle Logic
        triggerInput.addEventListener('click', () => {
            if (isStaticCodeVisible) {
                inputContainer.classList.remove('hidden');
                codeDisplay.innerHTML = '<span style="color: #666;">// Waiting for your question...</span>';
                userPrompt.focus();
                isStaticCodeVisible = false;
            } else {
                inputContainer.classList.add('hidden');
                codeDisplay.innerHTML = staticCode;
                isStaticCodeVisible = true;
            }
        });

        // B. Image Paste Logic
        userPrompt.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            let imageFound = false;

            for (const item of items) {
                if (item.kind === 'file' && item.type.includes('image')) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        pastedImages.push(event.target.result);
                        updateImageIndicator();
                    };
                    reader.readAsDataURL(blob);
                    imageFound = true;
                }
            }
            if (imageFound) e.preventDefault(); 
        });

        // C. Remove Image Logic
        if (removeImgBtn) {
            removeImgBtn.addEventListener('click', () => {
                pastedImages = [];
                updateImageIndicator();
            });
        }

        function updateImageIndicator() {
            if (pastedImages.length === 0) {
                imageIndicator.classList.add('hidden');
                imgCountSpan.textContent = '';
            } else {
                imageIndicator.classList.remove('hidden');
                if (pastedImages.length > 1) {
                    imgCountSpan.textContent = pastedImages.length;
                } else {
                    imgCountSpan.textContent = ''; 
                }
            }
        }

        // D. Submit & Generate
        submitBtn.addEventListener('click', async () => {
            const promptText = userPrompt.value.trim();

            if (!promptText && pastedImages.length === 0) {
                alert("Please describe the code or paste an image first.");
                return;
            }

            if (!apiKey) {
                alert("Please Sign In and provide your Gemini API Key first.");
                signInBtn.click();
                return;
            }

            loader.classList.remove('hidden');
            codeDisplay.style.opacity = '0.3';

            try {
                const generatedCode = await callGemini(apiKey, promptText, pastedImages);
                displayCodeInBox(codeDisplay, generatedCode);
                
                // Clear inputs after successful generation
                userPrompt.value = '';
                pastedImages = [];
                updateImageIndicator();
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
                codeDisplay.style.opacity = '1';
            } finally {
                loader.classList.add('hidden');
            }
        });

        // E. Copy Button
        copyBtn.addEventListener('click', () => {
            const textToCopy = codeDisplay.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalIcon = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check" style="color: var(--gfg-green);"></i>';
                setTimeout(() => copyBtn.innerHTML = originalIcon, 2000);
            });
        });
    });

    // --- 3. Shared Display Function ---
    function displayCodeInBox(element, rawText) {
        element.style.opacity = '1';
        // Strip markdown backticks, "Output of Code" headers
        let cleanText = rawText
            .replace(/### Output of the Code:?/gi, '')
            .replace(/```[a-z]*\n?/gi, '')
            .replace(/```/g, '')
            .trim();

        // 1. Escape HTML entities
        cleanText = cleanText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // 2. Apply Syntax Highlighting
        cleanText = cleanText
            .replace(/\b(public|class|static|void|int|double|boolean|char|if|else|for|while|return|new|package|import|def|print|try|except|String|function|var|let|const)\b/g, '<span class="hl-keyword">$1</span>')
            .replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="hl-string">$1</span>')
            .replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-class">$1</span>')
            .replace(/\b([a-z][a-zA-Z0-9_]*)(?=\()/g, '<span class="hl-method">$1</span>');

        element.innerHTML = cleanText;
    }

    // --- 4. Shared API Call ---
    async function callGemini(key, prompt, imagesArray) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
        
        // System Prompt for clean code generation without comments
        const systemInstruction = {
            role: "user",
            parts: [{ text: "You are an expert programming assistant specializing in Python, Java, and Data Science. When generating code: 1. Return ONLY clean, executable code without any comments or explanations. 2. Do NOT include inline comments, header comments, or any form of documentation in the code. 3. Do NOT wrap in markdown backticks or add '### Output of the Code' headers. 4. Generate production-ready, clean code that is syntactically correct. 5. For general questions (math, science, algorithms), provide clear, direct answers. 6. Focus on writing efficient, well-structured code without commentary." }]
        };

        const currentParts = [];
        if (prompt) currentParts.push({ text: prompt });
        
        if (imagesArray && imagesArray.length > 0) {
            imagesArray.forEach(imgBase64 => {
                const base64Data = imgBase64.split(',')[1];
                const mimeType = imgBase64.split(';')[0].split(':')[1];
                currentParts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
            });
        }
        
        const newHistoryItem = { role: "user", parts: currentParts };
        const apiContents = [...chatHistory, newHistoryItem];
        if (chatHistory.length === 0) apiContents.unshift(systemInstruction);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: apiContents })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates || data.candidates.length === 0) throw new Error("No code generated.");
        
        const responseText = data.candidates[0].content.parts[0].text;
        
        chatHistory.push(newHistoryItem);
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

        return responseText;
    }
});