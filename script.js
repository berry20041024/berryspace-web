import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// 新增引入 query, orderBy, limit, onSnapshot
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

document.getElementById('db-status').innerText = "連線成功，系統運作中";

// ==================== [寫入資料邏輯] ====================
const saveBtn = document.getElementById('saveBtn');
saveBtn.addEventListener('click', async () => {
    const text = document.getElementById('userInput').value;
    if (!text) { alert("請先輸入一些數據！"); return; }

    try {
        await addDoc(collection(db, "terminal_logs"), {
            content: text,
            timestamp: new Date()
        });
        document.getElementById('userInput').value = '';
    } catch (e) {
        console.error("儲存失敗: ", e);
    }
});

// ==================== [即時讀取資料邏輯] ====================
// 1. 建立一個查詢：目標是 terminal_logs 集合，按照時間戳記「降冪」排序（最新的在上面），並且只連線最新的 5 筆
const q = query(collection(db, "terminal_logs"), orderBy("timestamp", "desc"), limit(5));

// 2. 啟動即時監聽水管
onSnapshot(q, (snapshot) => {
    const logDisplay = document.getElementById('log-display');
    logDisplay.innerHTML = ''; // 每次雲端有變動時，清空舊畫面重新渲染最新的 5 筆

    if (snapshot.empty) {
        logDisplay.innerHTML = '<div>雲端目前沒有任何日誌紀錄。</div>';
        return;
    }

    // 迴圈跑出每一筆文件
    snapshot.forEach((doc) => {
        const data = doc.data();

        // 處理時間格式
        let timeString = "未知時間";
        if (data.timestamp) {
            const date = data.timestamp.toDate(); // 將 Firebase 的 Timestamp 轉為 JS Date 物件
            timeString = date.toLocaleTimeString(); // 取得本地時間字串 (如 下午6:45:00)
        }

        // 組合 HTML 結構
        const logHtml = `
            <div class="log-item">
                <span class="log-time">[${timeString}]</span>
                <span class="log-content">${data.content}</span>
            </div>
        `;
        logDisplay.innerHTML += logHtml;
    });
});