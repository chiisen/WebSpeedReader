let currentLanguage = 'zh';
let summarizing = false;

document.addEventListener('DOMContentLoaded', function() {
  const languageSelect = document.getElementById('language-select');
  const summarizeBtn = document.getElementById('summarize-btn');
  const messageDiv = document.getElementById('message');
  const summaryDiv = document.getElementById('summary');
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyBtn = document.getElementById('save-api-key');

  // 載入之前的狀態
  chrome.storage.local.get(['language', 'summary', 'apiKey'], function(result) {
    if (result.language) {
      currentLanguage = result.language;
      languageSelect.value = currentLanguage;
    }
    if (result.summary) {
      summaryDiv.textContent = result.summary;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    updateLanguage();
  });

  languageSelect.addEventListener('change', function() {
    currentLanguage = this.value;
    chrome.storage.local.set({language: currentLanguage});
    updateLanguage();
  });

  summarizeBtn.addEventListener('click', summarize);

  saveApiKeyBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({apiKey: apiKey});
      alert(currentLanguage === 'zh' ? 'API Key 已保存' : 'API Key saved');
    }
  });

  function updateLanguage() {
    if (currentLanguage === 'zh') {
      summarizeBtn.textContent = '總結';
      messageDiv.textContent = '請點擊"總結"按鈕開始總結當前頁面內容。';
    } else {
      summarizeBtn.textContent = 'Summarize';
      messageDiv.textContent = 'Please click the "Summarize" button to start summarizing the current page content.';
    }
  }

  async function summarize() {
    if (summarizing) return;
    summarizing = true;
    summarizeBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const pageContentResponse = await chrome.tabs.sendMessage(tab.id, {action: "getPageContent"});
      const pageContent = pageContentResponse.content;

      const apiKey = await new Promise((resolve) => {
        chrome.storage.local.get('apiKey', function(result) {
          resolve(result.apiKey);
        });
      });

      if (!apiKey) {
        alert(currentLanguage === 'zh' ? '請先設置 API Key' : 'Please set the API Key first');
        summarizing = false;
        summarizeBtn.disabled = false;
        return;
      }

      const prompt = currentLanguage === 'zh' 
        ? `請用繁體中文總結以下內容:\n\n${pageContent}`
        : `Please summarize the following content in English:\n\n${pageContent}`;

      const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "mixtral-8x7b-32768",
          messages: [{role: "user", content: prompt}],
          stream: true
        })
      });

      const reader = apiResponse.body.getReader();
      const decoder = new TextDecoder("utf-8");
      summaryDiv.textContent = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        const parsedLines = lines
          .map(line => line.replace(/^data: /, '').trim())
          .filter(line => line !== '' && line !== '[DONE]')
          .map(line => JSON.parse(line));

        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
          const { delta } = choices[0];
          const { content } = delta;
          if (content) {
            summaryDiv.textContent += content;
          }
        }
      }

      chrome.storage.local.set({summary: summaryDiv.textContent});
    } catch (error) {
      console.error('Error:', error);
      summaryDiv.textContent = currentLanguage === 'zh' ? '總結時發生錯誤' : 'An error occurred during summarization';
    } finally {
      summarizing = false;
      summarizeBtn.disabled = false;
    }
  }
});
