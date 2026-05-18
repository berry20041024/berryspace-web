// 1. 引入 Firebase 核心與 Firestore 模組 (加入 serverTimestamp)
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

// 2. 你的專屬 Firebase 設定檔
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

// 4. 取得畫面的 DOM 元素 (請確保 HTML 中有這些 ID)
const chatWindow = document.getElementById("chat-window");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

// 5. 實作「即時監聽」功能 (讀取)
// 這裡使用了你引入的 limit，只抓取最新的 50 筆訊息，並依照時間舊到新排序
const messagesRef = collection(db, "messages");
const q = query(messagesRef, orderBy("createdAt", "asc"), limit(50));

onSnapshot(q, (snapshot) => {
    chatWindow.innerHTML = ""; // 每次更新前先清空畫面
    snapshot.forEach((doc) => {
        const data = doc.data();

        // 建立一條新訊息的 HTML 元素
        const messageElement = document.createElement("div");
        messageElement.style.marginBottom = "8px";

        // 如果是剛送出的訊息，伺服器時間可能還在計算(null)，這裡做個簡單防呆
        const timeString = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleTimeString() : '傳送中...';

        messageElement.innerHTML = `
      <span style="color: gray; font-size: 0.8em;">[${timeString}]</span>
      <strong>${data.sender || '匿名訪客'}:</strong> 
      <span>${data.text}</span>
    `;

        chatWindow.appendChild(messageElement);
    });
    // 自動往下捲動到底部
    chatWindow.scrollTop = chatWindow.scrollHeight;
});

// 6. 實作「送出訊息」功能 (寫入)
sendBtn.addEventListener("click", async () => {
    const text = messageInput.value.trim();
    if (text === "") return; // 如果沒打字就不執行

    // 先清空輸入框，讓使用者感覺反應很快
    messageInput.value = "";

    try {
        // 寫入資料到 'messages' 集合
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: "測試員",
            createdAt: serverTimestamp() // 使用 Firebase 伺服器時間
        });
    } catch (error) {
        console.error("發送失敗: ", error);
        alert("訊息發送失敗，請檢查主控台錯誤訊息。");
    }
});

// 讓使用者按 Enter 鍵也能送出
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendBtn.click();
    }
});