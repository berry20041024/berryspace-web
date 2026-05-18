// 1. 引入 Firebase 核心與 Firestore 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. 你的 Firebase 設定檔
const firebaseConfig = {
    apiKey: "AIzaSyC458PR1_J-nR0dCo7wxadj8Ov0qdIsFOY",
    authDomain: "berryspace-database.firebaseapp.com",
    projectId: "berryspace-database",
    storageBucket: "berryspace-database.firebasestorage.app",
    messagingSenderId: "13310689851",
    appId: "1:13310689851:web:bad9522dddaf865b87121e",
    measurementId: "G-08B6T0V1D1"
};

// 3. 初始化 Firebase 與 Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. 取得畫面的 DOM 元素
const chatWindow = document.getElementById("chat-window");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

// 5. 即時監聽與顯示訊息 (抓取最新 50 筆)
const messagesRef = collection(db, "messages");
const q = query(messagesRef, orderBy("createdAt", "asc"), limit(50));

onSnapshot(q, (snapshot) => {
    chatWindow.innerHTML = ""; // 更新前清空畫面

    snapshot.forEach((doc) => {
        const data = doc.data();

        // 計算時間，若剛送出(伺服器還在算時間)則顯示傳送中
        const timeString = data.createdAt
            ? new Date(data.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '傳送中...';

        // 建立訊息 DOM 元素
        const messageElement = document.createElement("div");
        messageElement.classList.add("message-item");
        messageElement.innerHTML = `
      <span class="message-time">[${timeString}]</span>
      <span class="message-sender">${data.sender || '匿名訪客'}:</span> 
      <span class="message-text">${data.text}</span>
    `;

        chatWindow.appendChild(messageElement);
    });

    // 讓聊天室捲軸永遠保持在最底部
    chatWindow.scrollTop = chatWindow.scrollHeight;
});

// 6. 送出訊息的共用函數
async function sendMessage() {
    const text = messageInput.value.trim();
    if (text === "") return; // 防呆：空訊息不送出

    messageInput.value = ""; // 先清空輸入框，提升使用者體驗

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: "測試員",
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("發送失敗: ", error);
        alert("發送失敗，請打開 F12 Console 查看詳細錯誤。");
    }
}

// 7. 綁定按鈕點擊與 Enter 鍵事件
sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});