import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// --- 關鍵診斷區 ---
const chatWindow = document.getElementById("chat-window");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

// 檢查元素是否存在，避免出現 "properties of null" 錯誤
if (!chatWindow || !messageInput || !sendBtn) {
    console.error("錯誤：找不到 HTML 元素！請檢查 index.html 中的 id 是否為 chat-window, message-input, send-btn");
} else {
    // 只有在元素存在時才執行邏輯
    const messagesRef = collection(db, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(50));

    onSnapshot(q, (snapshot) => {
        chatWindow.innerHTML = ""; // 這就是原本第 21 行出錯的地方
        snapshot.forEach((doc) => {
            const data = doc.data();
            const timeString = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleTimeString() : '傳送中...';
            const messageElement = document.createElement("div");
            messageElement.innerHTML = `<strong>${data.sender}:</strong> ${data.text} <small>(${timeString})</small>`;
            chatWindow.appendChild(messageElement);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });

    sendBtn.addEventListener("click", async () => {
        const text = messageInput.value.trim();
        if (!text) return;
        messageInput.value = "";
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: "測試員",
            createdAt: serverTimestamp()
        });
    });
}