// 監聽來自擴充功能背景或彈出視窗的訊息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 檢查訊息的動作是否為 "getPageContent"
  if (request.action === "getPageContent") {
    // 回應訊息，傳回當前頁面內容
    sendResponse({content: document.body.innerText});
  }
});