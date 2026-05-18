import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Firebase 初始化組態
const firebaseConfig = {
    apiKey: "AIzaSyC458PR1_J-nR0dCo7wxadj8Ov0qdIsFOY",
    authDomain: "berryspace-database.firebaseapp.com",
    projectId: "berryspace-database",
    storageBucket: "berryspace-database.firebasestorage.app",
    messagingSenderId: "13310689851",
    appId: "1:13310689851:web:bad9522dddaf865b87121e",
    measurementId: "G-08B6T0V1D1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. DOM 元素宣告
const messageContainer = document.getElementById("message-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const chatHeaderTitle = document.getElementById("current-channel-title");
const channelItems = document.querySelectorAll(".channel-item");

// 3. 狀態變數
let currentChannelId = "general"; // 預設大廳頻道
let unsubscribeSnapshot = null;   // 用於儲存目前的即時監聽解綁函數

/**
 * 核心函式：切換並即時監聽指定頻道的訊息
 * @param {string} channelId 頻道代碼
 */
function listenToChannel(channelId) {
    // 如果之前有開著的監聽器，先解除，避免重複消耗流量與渲染錯誤
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    // 指向 Firestore 子集合：channels -> {channelId} -> messages
    const messagesRef = collection(db, "channels", channelId, "messages");

    // 設定查詢條件：依時間正序排列，限制載入最新 100 筆
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(100));

    // 啟動實時監聽
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        messageContainer.innerHTML = ""; // 清空舊畫面重新渲染

        snapshot.forEach((doc) => {
            const data = doc.data();

            // 處理時間戳記 (防止伺服器端尚未回傳資料時產生的 null 報錯)
            let timeString = "傳送中...";
            if (data.timestamp) {
                const date = data.timestamp.toDate();
                timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            // 動態產生 Discord 風格的訊息節點
            const msgItem = document.createElement("div");
            msgItem.className = "message-item";
            msgItem.innerHTML = `
                <div class="message-meta">
                    <span class="message-user">${data.userName || "匿名用戶"}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">${escapeHTML(data.content)}</div>
            `;
            messageContainer.appendChild(msgItem);
        });

        // 自動捲動至最新訊息處
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }, (error) => {
        console.error("Firestore 監聽失敗:", error);
    });
}

/**
 * 安全防護：過濾 HTML 標籤防止 XSS 注入攻擊
 */
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// 4. 事件：點擊左側頻道進行切換
channelItems.forEach(item => {
    item.addEventListener("click", () => {
        // 切換點擊的 active 樣式
        channelItems.forEach(el => el.classList.remove("active"));
        item.classList.add("active");

        // 讀取標籤上的 data-channel 屬性
        currentChannelId = item.getAttribute("data-channel");
        chatHeaderTitle.textContent = item.textContent;

        // 切換資料庫監聽目標
        listenToChannel(currentChannelId);
    });
});

// 5. 事件：發送訊息
messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = messageInput.value.trim();
    if (!text) return;

    const messagesRef = collection(db, "channels", currentChannelId, "messages");

    try {
        messageInput.value = ""; // 送出瞬間立刻清空，優化使用者流暢感

        await addDoc(messagesRef, {
            userName: "BerryUser",       // 之後可整合 Firebase Auth 改為真實使用者名稱
            content: text,
            timestamp: serverTimestamp() // 使用伺服器統一時間記號
        });
    } catch (err) {
        console.error("寫入資料庫失敗:", err);
        alert("傳送失敗，請確認 Firestore 安全規則。");
    }
});

// 6. 頁面首次載入時，預設初始化 general 頻道
listenToChannel(currentChannelId);