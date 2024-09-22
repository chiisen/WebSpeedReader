let currentLanguage = 'zh'; // 預設語言為繁體中文
let summarizing = false; // 標記是否正在進行總結

document.addEventListener('DOMContentLoaded', function() {
  // 獲取 DOM 元素
  const languageSelect = document.getElementById('language-select');
  const summarizeBtn = document.getElementById('summarize-btn');
  const clearSummaryBtn = document.getElementById('clear-summary-btn'); // 新增
  const messageDiv = document.getElementById('message');
  const summaryDiv = document.getElementById('summary');
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyBtn = document.getElementById('save-api-key');

  // 載入之前的狀態
  chrome.storage.local.get(['language', 'summary', 'apiKey'], function(result) {
    if (result.language) {
      currentLanguage = result.language; // 設定當前語言
      languageSelect.value = currentLanguage; // 更新語言選擇器的值
    }
    if (result.summary) {
      summaryDiv.textContent = result.summary; // 顯示之前的總結
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey; // 顯示之前保存的 groq API Key
    }
    updateLanguage(); // 更新語言相關的 UI 文本
  });

  // 語言選擇器變更事件
  languageSelect.addEventListener('change', function() {
    currentLanguage = this.value; // 更新當前語言
    chrome.storage.local.set({language: currentLanguage}); // 保存語言設定
    updateLanguage(); // 更新語言相關的 UI 文本
  });

  // 總結按鈕點擊事件
  summarizeBtn.addEventListener('click', summarize);

  // 清除按鈕點擊事件
  clearSummaryBtn.addEventListener('click', function() {
    summaryDiv.textContent = ''; // 清空總結區域
    chrome.storage.local.remove('summary'); // 移除保存的總結
  });

  // 保存 groq API Key 按鈕點擊事件
  saveApiKeyBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim(); // 獲取並修剪 groq API Key
    if (apiKey) {
      chrome.storage.local.set({apiKey: apiKey}); // 保存 groq API Key
      alert(currentLanguage === 'zh' ? 'groq API Key 已保存' : 'groq API Key saved'); // 顯示保存成功訊息
    }
  });

  // 更新語言相關的 UI 文本
  function updateLanguage() {
    if (currentLanguage === 'zh') {
      summarizeBtn.textContent = '總結'; // 更新總結按鈕文本
      clearSummaryBtn.textContent = '清除'; // 更新清除按鈕文本
      messageDiv.textContent = '請點擊"總結"按鈕開始總結當前頁面內容。'; // 更新提示訊息
    } else {
      summarizeBtn.textContent = 'Summarize'; // 更新總結按鈕文本
      clearSummaryBtn.textContent = 'Clear'; // 更新清除按鈕文本
      messageDiv.textContent = 'Please click the "Summarize" button to start summarizing the current page content.'; // 更新提示訊息
    }
  }

  // 總結功能
  async function summarize() {
    if (summarizing) return; // 如果正在總結，則返回
    summarizing = true; // 標記為正在總結
    summarizeBtn.disabled = true; // 禁用總結按鈕

    try {
      // 獲取當前活動標籤頁
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

      // 確認內容腳本已加載
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // 向內容腳本發送訊息以獲取頁面內容
      const pageContentResponse = await chrome.tabs.sendMessage(tab.id, {action: "getPageContent"});
      const pageContent = pageContentResponse.content;

      // 獲取保存的 groq API Key
      const apiKey = await new Promise((resolve) => {
        chrome.storage.local.get('apiKey', function(result) {
          resolve(result.apiKey);
        });
      });

      if (!apiKey) {
        alert(currentLanguage === 'zh' ? '請先設置 groq API Key' : 'Please set the groq API Key first'); // 提示設置 groq API Key
        summarizing = false; // 重置總結狀態
        summarizeBtn.disabled = false; // 啟用總結按鈕
        return;
      }

      // 根據語言生成提示文本
      const prompt = currentLanguage === 'zh' 
        ? `請用繁體中文總結以下內容:\n\n${pageContent}`
        : `Please summarize the following content in English:\n\n${pageContent}`;

      // 向 API 發送請求以獲取總結
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
      summaryDiv.textContent = ''; // 清空總結區域

      // 逐行讀取 API 響應
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        const parsedLines = lines
          .map(line => line.replace(/^data: /, '').trim())
          .filter(line => line !== '' && line !== '[DONE]')
          .map(line => JSON.parse(line));

        // 更新總結區域的內容
        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
          const { delta } = choices[0];
          const { content } = delta;
          if (content) {
            summaryDiv.textContent += content;
          }
        }
      }

      // 保存總結結果
      chrome.storage.local.set({summary: summaryDiv.textContent});
    } catch (error) {
      console.error('Error:', error);
      summaryDiv.textContent = currentLanguage === 'zh' ? '總結時發生錯誤' : 'An error occurred during summarization'; // 顯示錯誤訊息
    } finally {
      summarizing = false; // 重置總結狀態
      summarizeBtn.disabled = false; // 啟用總結按鈕
    }
  }
});