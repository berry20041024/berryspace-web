// 直接從 Google 的 CDN 引入 Firebase 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 你的專屬通行證
const firebaseConfig = {
    apiKey: "AIzaSyC458PR1_J-nR0dCo7wxadj8Ov0qdIsFOY",
    authDomain: "berryspace-database.firebaseapp.com",
    projectId: "berryspace-database",
    storageBucket: "berryspace-database.firebasestorage.app",
    messagingSenderId: "13310689851",
    appId: "1:13310689851:web:bad9522dddaf865b87121e",
    measurementId: "G-08B6T0V1D1"
};

// 啟動 Firebase 引擎
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 更改網頁上的狀態文字
document.getElementById('db-status').innerText = "連線成功，系統運作中";

// 綁定「傳送按鈕」的點擊事件
const saveBtn = document.getElementById('saveBtn');
saveBtn.addEventListener('click', async () => {
    const text = document.getElementById('userInput').value;

    // 如果輸入框是空的就擋下來
    if (!text) {
        alert("請先輸入一些數據！");
        return;
    }

    try {
        // 把資料寫入名為 "terminal_logs" 的資料夾 (Collection) 中
        const docRef = await addDoc(collection(db, "terminal_logs"), {
            content: text,
            timestamp: new Date()
        });
        alert("資料已上傳至雲端！資料 ID: " + docRef.id);

        // 清空輸入框
        document.getElementById('userInput').value = '';
    } catch (e) {
        console.error("儲存失敗: ", e);
        alert("錯誤：無法連線到資料庫");
    }
});