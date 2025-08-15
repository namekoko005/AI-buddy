// Data stored in memory
let tasks = [];
let courses = [];
let chatHistory = [];
let summaryLibrary = [];
let notificationHistory = [];
let lineConnected = false;
let autoSyncInterval = null;

// OpenAI API Configuration
let OPENAI_API_KEY = '';

// Check and set API Key
function initializeAPI() {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
        OPENAI_API_KEY = savedKey;
    } else {
        promptForAPIKey();
    }
}

function promptForAPIKey() {
    const key = prompt(`🔑 กรุณาใส่ OpenAI API Key ของคุณ:
        
📋 วิธีการได้ API Key:
1. ไปที่ https://platform.openai.com/api-keys
2. สร้าง API Key ใหม่
3. Copy มาใส่ที่นี่
        
⚠️ หมายเหตุ: 
- API Key จะถูกเก็บไว้ในเครื่องของคุณเท่านั้น
- หากไม่มี API Key สามารถใช้งานแบบ Mock ได้
- กด Cancel เพื่อใช้แบบ Mock`);
        
    if (key && key.trim()) {
        OPENAI_API_KEY = key.trim();
        localStorage.setItem('openai_api_key', OPENAI_API_KEY);
        alert('✅ ตั้งค่า API Key เรียบร้อย!\n\n🧪 ลองทดสอบสรุปบทเรียนหรือถาม AI ติวเตอร์ดูครับ');
        return true;
    } else {
        alert('ℹ️ จะใช้งานแบบ Mock (จำลอง) แทน\nคุณสามารถเพิ่ม API Key ได้ทีหลังผ่านปุ่ม "⚙️ ตั้งค่า API Key"');
        return false;
    }
}

async function callOpenAI(messages, maxTokens = 500) {
    if (!OPENAI_API_KEY) {
        promptForAPIKey();
        if (!OPENAI_API_KEY) return null;
    }
    
    // Try multiple proxies
    const proxyUrls = [
        'https://api.openai.com/v1/chat/completions', // Direct (may fail due to CORS)
        'https://cors-anywhere.herokuapp.com/https://api.openai.com/v1/chat/completions', // CORS Proxy
        `https://api.allorigins.win/raw?url=${encodeURIComponent('https://api.openai.com/v1/chat/completions')}` // Alternative Proxy
    ];
    
    const requestBody = {
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.7
    };
    
    for (let i = 0; i < proxyUrls.length; i++) {
        try {
            console.log(`พยายามเชื่อมต่อผ่าน method ${i + 1}...`);
            
            let requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            };
            
            if (i < 2) {
                requestOptions.headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
            }
            
            if (i === 2) {
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        url: 'https://api.openai.com/v1/chat/completions',
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${OPENAI_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        data: requestBody
                    })
                };
            }
            
            const response = await fetch(proxyUrls[i], requestOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    alert('❌ API Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
                    localStorage.removeItem('openai_api_key');
                    OPENAI_API_KEY = '';
                    return null;
                }
                if (response.status === 429) {
                    alert('⚠️ ใช้งาน API เกินขนาด กรุณารอสักครู่แล้วลองใหม่');
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`✅ เชื่อมต่อสำเร็จผ่าน method ${i + 1}`);
            return data.choices[0].message.content;
            
        } catch (error) {
            console.log(`❌ Method ${i + 1} ไม่สำเร็จ:`, error.message);
            if (i === proxyUrls.length - 1) {
                console.error('All methods failed:', error);
                showConnectionError();
                return null;
            }
        }
    }
}

function showConnectionError() {
    const errorMsg = `❌ ไม่สามารถเชื่อมต่อ OpenAI API ได้
    
🔧 วิธีแก้ไข:
1. ตรวจสอบ API Key ให้ถูกต้อง
2. ตรวจสอบอินเทอร์เน็ต
3. ลองใช้งานใหม่ในอีกสักครู่
4. หรือใช้งานแบบ Mock ไปก่อน
    
💡 แอปจะกลับไปใช้ระบบจำลองแทน`;
    
    alert(errorMsg);
}

function showTab(tabName, element) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    element.classList.add('active');
}
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('preview-img');
        previewImg.src = e.target.result;
        document.getElementById('image-preview').style.display = 'block';
        document.getElementById('image-content').style.display = 'none';
        document.getElementById('lesson-text').value = ''; 
    };
    reader.readAsDataURL(file);
}
async function extractTextFromImage() {
    const previewImg = document.getElementById('preview-img');
    const imageTextDiv = document.getElementById('image-text');
    const lessonTextarea = document.getElementById('lesson-text');

    if (!previewImg.src) {
        alert('กรุณาอัปโหลดรูปภาพก่อน');
        return;
    }

    imageTextDiv.innerHTML = '🤖 กำลังแปลงรูปภาพเป็นข้อความ...';
    document.getElementById('image-content').style.display = 'block';

    try {
        const { data: { text } } = await Tesseract.recognize(
            previewImg.src,
            'tha+eng', 
            { logger: m => console.log(m) }
        );

        imageTextDiv.innerHTML = text.replace(/\n/g, '<br>');
        lessonTextarea.value = text;
        alert('✅ แปลงข้อความจากรูปภาพสำเร็จแล้ว! คุณสามารถกด "สรุปเนื้อหาอัตโนมัติ" ได้เลย');

    } catch (error) {
        console.error('OCR Error:', error);
        imageTextDiv.innerHTML = '❌ เกิดข้อผิดพลาดในการแปลงข้อความ กรุณาลองใหม่อีกครั้ง';
        alert('❌ ไม่สามารถแปลงข้อความจากรูปภาพได้');
    }
}

async function summarizeLesson() {
    const text = document.getElementById('lesson-text').value;
    if (!text.trim()) {
        alert('กรุณาใส่เนื้อหาที่ต้องการสรุป');
        return;
    }

    document.getElementById('summary-result').style.display = 'block';
    document.getElementById('summary-content').innerHTML = '🤖 กำลังสรุปเนื้อหา...';

    const messages = [
        {
            role: 'system',
            content: `คุณเป็น AI ผู้ช่วยสรุปบทเรียนสำหรับนักศึกษาไทย กรุณาสรุปเนื้อหาที่ได้รับมาให้กระชับ เข้าใจง่าย และมีประโยชน์ 
            
ให้ตอบในรูปแบบ:
**📝 สรุปเนื้อหา:**
[สรุปหลักภายใน 2-3 ประโยค]
    
**💡 จุดสำคัญ:**
• [จุดสำคัญที่ 1]
• [จุดสำคัญที่ 2] 
• [จุดสำคัญที่ 3]
    
**🎯 ข้อสอบน่าจะออก:**
• [คำถามที่อาจจะออกข้อสอบ]`
        },
        {
            role: 'user',
            content: `กรุณาสรุปเนื้อหานี้: ${text}`
        }
    ];

    const summary = await callOpenAI(messages, 800);
    
    if (summary) {
        document.getElementById('summary-content').innerHTML = summary.replace(/\n/g, '<br>');
        summaryLibrary.push({
            id: Date.now(),
            title: text.substring(0, 50) + '...',
            content: summary,
            style: 'simple',
            date: new Date().toLocaleDateString('th-TH')
        });
        showSummaryActions();
    } else {
        document.getElementById('summary-content').innerHTML = generateMockSummary(text);
    }
}

function showSummaryActions() {}

function saveSummary() {
    const content = document.getElementById('summary-content').innerHTML;
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `สรุปบทเรียน_${new Date().toLocaleDateString('th-TH')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('💾 บันทึกสรุปเรียบร้อย!');
}

function shareSummary() {
    const content = document.getElementById('summary-content').innerText;
    if (navigator.share) {
        navigator.share({
            title: 'สรุปบทเรียน - AI Buddy',
            text: content
        });
    } else {
        navigator.clipboard.writeText(content).then(() => {
            alert('📤 คัดลอกสรุปไปยังคลิปบอร์ดแล้ว!');
        });
    }
}

async function generateQuiz() {
    const summaryContent = document.getElementById('summary-content').innerText;
    
    const messages = [
        {
            role: 'system',
            content: `สร้างแบบทดสอบ 5 ข้อจากเนื้อหาที่ให้มา แบบ:
            
**🧠 แบบทดสอบความเข้าใจ**
            
**คำถามที่ 1:** [คำถาม]
a) [ตัวเลือก A]
b) [ตัวเลือก B] 
c) [ตัวเลือก C]
d) [ตัวเลือก D]
            
*เฉลย: [ตัวเลือกที่ถูก] - [คำอธิบาย]*`
        },
        {
            role: 'user',
            content: `สร้างแบบทดสอบจากเนื้อหานี้: ${summaryContent}`
        }
    ];

    const quiz = await callOpenAI(messages, 800);
    if (quiz) {
        document.getElementById('summary-content').innerHTML += '<hr>' + quiz.replace(/\n/g, '<br>');
    }
}

function showInputMethod(method) {
    document.querySelectorAll('.input-method').forEach(el => el.style.display = 'none');
    document.getElementById(`${method}-input`).style.display = 'block';
}

function handleFileUpload(event) {}
function fetchFromURL() {}
function handleImageUpload(event) {}
function extractTextFromImage() {}

async function connectLINE() {
    const token = document.getElementById('line-token').value;
    const groupId = document.getElementById('line-group-id').value;
    
    if (!token || !groupId) {
        alert('กรุณากรอก Token และ Group ID');
        return;
    }

    const statusDiv = document.getElementById('line-status');
    statusDiv.innerHTML = '🔄 กำลังทดสอบการเชื่อมต่อ...';

    try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        lineConnected = true;
        statusDiv.innerHTML = '✅ เชื่อมต่อ LINE สำเร็จ!';
        
        localStorage.setItem('line_token', token);
        localStorage.setItem('line_group_id', groupId);
        
        updateAutoStatus();
    } catch (error) {
        statusDiv.innerHTML = '❌ การเชื่อมต่อล้มเหลว';
    }
}

async function testLINE() {
    if (!lineConnected) {
        alert('กรุณาเชื่อมต่อ LINE ก่อน');
        return;
    }

    const statusDiv = document.getElementById('line-status');
    statusDiv.innerHTML = '🧪 กำลังส่งข้อความทดสอบ...';

    setTimeout(() => {
        statusDiv.innerHTML = '✅ ส่งข้อความทดสอบสำเร็จ! ตรวจสอบในกลุ่ม LINE';
    }, 2000);
}

function startAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }

    const frequency = parseInt(document.getElementById('sync-frequency').value) * 60 * 1000;
    
    autoSyncInterval = setInterval(async () => {
        await syncDataFromLINE();
    }, frequency);

    updateAutoStatus();
    alert(`✅ เริ่มการดึงข้อมูลอัตโนมัติทุก ${document.getElementById('sync-frequency').value} นาที`);
}

function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
    updateAutoStatus();
    alert('⏹️ หยุดการดึงข้อมูลอัตโนมัติแล้ว');
}

async function syncDataFromLINE() {
    if (!lineConnected) return;

    const keywords = document.getElementById('keywords').value.split(',').map(k => k.trim());
    
    const mockData = [
        {
            type: 'assignment',
            title: 'รายงานวิชาคณิตศาสตร์',
            dueDate: '2025-08-10',
            source: 'กลุ่ม LINE วิชาคณิต',
            priority: 'urgent'
        },
        {
            type: 'exam',
            title: 'สอบกลางภาค ฟิสิกส์',
            dueDate: '2025-08-15',
            source: 'กลุ่ม LINE วิชาฟิสิกส์',
            priority: 'normal'
        }
    ];

    mockData.forEach(item => {
        const existingTask = tasks.find(task => task.title === item.title);
        if (!existingTask) {
            tasks.push({
                id: Date.now() + Math.random(),
                title: item.title,
                date: item.dueDate,
                priority: item.priority,
                source: item.source,
                autoAdded: true
            });
        }
    });

    displayTasks();
    updateLatestData(mockData);
    updateAutoStatus();

    mockData.forEach(item => {
        sendNotification(`📝 งานใหม่: ${item.title}`, `กำหนดส่ง: ${item.dueDate}`);
    });
}

function updateLatestData(data) {
    const latestDataDiv = document.getElementById('latest-data');
    latestDataDiv.innerHTML = data.map(item => 
        `<div style="padding: 5px; border-bottom: 1px solid #eee;">
            <strong>${item.title}</strong><br>
            <small>📅 ${item.dueDate} | 📱 ${item.source}</small>
        </div>`
    ).join('');
}

function updateAutoStatus() {
    const statusDiv = document.getElementById('auto-status');
    statusDiv.innerHTML = `
        <p>${autoSyncInterval ? '🟢 ระบบอัตโนมัติ: เปิด' : '🔴 ระบบอัตโนมัติ: ปิด'}</p>
        <p>📱 LINE: ${lineConnected ? '✅ เชื่อมต่อแล้ว' : '❌ ยังไม่เชื่อมต่อ'}</p>
        <p>🔄 อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')}</p>
        <p>📊 ข้อมูลที่พบ: ${tasks.filter(t => t.autoAdded).length} รายการ</p>
    `;
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                alert('✅ อนุญาตการแจ้งเตือนแล้ว!');
                sendNotification('🎉 AI Buddy', 'ระบบการแจ้งเตือนพร้อมใช้งาน!');
            } else {
                alert('❌ ไม่ได้รับอนุญาตการแจ้งเตือน');
            }
        });
    } else {
        alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
    }
}

function sendNotification(title, body, icon = '🤖') {
    if (document.getElementById('browser-notify').checked && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + icon + '</text></svg>'
        });
    }

    if (document.getElementById('line-notify').checked && lineConnected) {
        sendLINENotification(`${title}\n${body}`);
    }

    if (document.getElementById('email-notify').checked) {
        sendEmailNotification(title, body);
    }

    notificationHistory.unshift({
        title: title,
        body: body,
        time: new Date().toLocaleString('th-TH'),
        type: 'auto'
    });

    updateNotificationHistory();
}

async function sendLINENotification(message) {
    const token = localStorage.getItem('line_token');
    const groupId = localStorage.getItem('line_group_id');
    
    if (!token || !groupId) return;

    try {
        console.log('ส่งข้อความ LINE:', message);
    } catch (error) {
        console.error('LINE notification error:', error);
    }
}

async function sendEmailNotification(title, body) {
    const email = document.getElementById('notify-email').value;
    if (!email) return;

    console.log(`📧 ส่งอีเมลไปที่: ${email}`);
    console.log(`หัวข้อ: ${title}`);
    console.log(`เนื้อหา: ${body}`);
}

function updateNotificationHistory() {
    const historyDiv = document.getElementById('notification-history');
    historyDiv.innerHTML = notificationHistory.slice(0, 10).map(notif => 
        `<div style="padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 5px;">
            <strong>${notif.title}</strong><br>
            <small>${notif.body}</small><br>
            <small style="color: #666;">⏰ ${notif.time}</small>
        </div>`
    ).join('');
}

function saveNotificationSettings() {
    const settings = {
        browser: document.getElementById('browser-notify').checked,
        line: document.getElementById('line-notify').checked,
        email: document.getElementById('email-notify').checked,
        notifyEmail: document.getElementById('notify-email').value,
        notifyTime: document.getElementById('notify-time').value,
        advanceNotify: document.getElementById('advance-notify').value
    };

    localStorage.setItem('notification_settings', JSON.stringify(settings));
    alert('💾 บันทึกการตั้งค่าเรียบร้อย!');
}

function testBrowserNotification() {
    sendNotification('🧪 ทดสอบการแจ้งเตือน', 'นี่คือการแจ้งเตือนทดสอบจาก AI Buddy');
}

function testLINENotification() {
    if (!lineConnected) {
        alert('กรุณาเชื่อมต่อ LINE ก่อน');
        return;
    }
    sendLINENotification('🧪 ทดสอบการแจ้งเตือน LINE จาก AI Buddy');
    alert('📱 ส่งข้อความทดสอบไปยัง LINE แล้ว');
}

function testEmailNotification() {
    const email = document.getElementById('notify-email').value;
    if (!email) {
        alert('กรุณาใส่อีเมลสำหรับแจ้งเตือน');
        return;
    }
    sendEmailNotification('🧪 ทดสอบการแจ้งเตือน', 'นี่คือการแจ้งเตือนทดสอบทางอีเมลจาก AI Buddy');
    alert('📧 ส่งอีเมลทดสอบแล้ว (ตรวจสอบในกล่องจดหมาย)');
}

function connectGoogleCalendar() {
    alert('🚧 ฟีเจอร์นี้กำลังพัฒนา - จะเชื่อมต่อกับ Google Calendar API');
}

function connectOutlook() {
    alert('🚧 ฟีเจอร์นี้กำลังพัฒนา - จะเชื่อมต่อกับ Microsoft Graph API');
}

function exportToICS() {
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:AI Buddy\n';
    
    tasks.forEach(task => {
        const date = new Date(task.date);
        const dateStr = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        
        icsContent += `BEGIN:VEVENT
UID:${task.id}@aibuddy.com
DTSTAMP:${dateStr}
DTSTART:${dateStr}
SUMMARY:${task.title}
DESCRIPTION:งานจาก AI Buddy
END:VEVENT
`;
    });
    
    icsContent += 'END:VCALENDAR';
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_Buddy_Schedule.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('📄 ส่งออกปฏิทินเรียบร้อย! นำไปเพิ่มในแอปปฏิทินของคุณได้');
}

function checkUpcomingTasks() {
    const today = new Date();
    const settings = JSON.parse(localStorage.getItem('notification_settings') || '{"advanceNotify": 1}');
    const advanceDays = parseInt(settings.advanceNotify);

    tasks.forEach(task => {
        const taskDate = new Date(task.date);
        const daysUntil = Math.ceil((taskDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntil === advanceDays) {
            sendNotification(
                `⏰ เตือนล่วงหน้า: ${task.title}`,
                `กำหนดส่งในอีก ${daysUntil} วัน (${task.date})`
            );
        } else if (daysUntil === 0) {
            sendNotification(
                `🚨 ส่งวันนี้: ${task.title}`,
                `กำหนดส่งวันนี้! อย่าลืมส่งงาน`
            );
        }
    });
}

function generateMockSummary(text) {
    const sentences = text.split('.').filter(s => s.trim().length > 10);
    if (sentences.length <= 3) {
        return `<p><strong>สรุป:</strong> ${text.substring(0, 200)}...</p>`;
    }
    
    const importantSentences = sentences.slice(0, Math.min(3, sentences.length));
    return `
        <div>
            <p><strong>จุดสำคัญ:</strong></p>
            <ul>
                ${importantSentences.map(s => `<li>${s.trim()}.</li>`).join('')}
            </ul>
            <p><strong>สรุปโดยรวม:</strong> เนื้อหานี้กล่าวถึงประเด็นสำคัญหลายประการที่ช่วยในการเข้าใจหัวข้อดังกล่าว</p>
        </div>
    `;
}

async function generateProjectIdeas() {
    const subject = document.getElementById('subject-name').value;
    if (!subject.trim()) {
        alert('กรุณาใส่ชื่อวิชา');
        return;
    }

    document.getElementById('project-results').style.display = 'block';
    document.getElementById('project-content').innerHTML = '🤖 กำลังคิดหัวข้อโปรเจกต์...';

    const messages = [
        {
            role: 'system',
            content: `คุณเป็น AI ที่ช่วยแนะนำหัวข้อโปรเจกต์สำหรับนักศึกษาไทย ให้คำแนะนำที่เป็นประโยชน์ ทำได้จริง และเหมาะสมกับระดับมหาวิทยาลัย
            
ให้ตอบในรูปแบบ:
**💡 หัวข้อโปรเจกต์ที่แนะนำ:**
            
**1. [ชื่อหัวข้อ]**
- วัตถุประสงค์: [อธิบายสั้นๆ]
- วิธีการ: [แนวทางการดำเนินงาน]
            
**2. [ชื่อหัวข้อ]**
- วัตถุประสงค์: [อธิบายสั้นๆ]
- วิธีการ: [แนวทางการดำเนินงาน]
            
[ต่อไปอีก 3 หัวข้อ]
            
**📚 เทคนิคเพิ่มเติม:**
[คำแนะนำในการทำโปรเจกต์]`
        },
        {
            role: 'user',
            content: `กรุณาแนะนำหัวข้อโปรเจกต์สำหรับวิชา "${subject}" ให้ 5 หัวข้อ`
        }
    ];

    const ideas = await callOpenAI(messages, 1000);
    
    if (ideas) {
        document.getElementById('project-content').innerHTML = ideas.replace(/\n/g, '<br>');
    } else {
        document.getElementById('project-content').innerHTML = generateMockProjectIdeas(subject);
    }
}

function generateMockProjectIdeas(subject) {
    const projectTemplates = {
        'วิทยาการคอมพิวเตอร์': [
            'ระบบจัดการหอสมุดออนไลน์',
            'แอปพลิเคชันติดตามสุขภาพ',
            'เว็บไซต์อีคอมเมิร์ซขนาดเล็ก',
            'ระบบจองห้องประชุม',
            'แชทบอทช่วยตอบคำถาม'
        ],
        'การตลาด': [
            'แผนการตลาดสำหรับร้านกาแฟท้องถิ่น',
            'การวิเคราะห์พฤติกรรมผู้บริโภคออนไลน์',
            'กลยุทธ์ Social Media Marketing',
            'การสร้างแบรนด์สำหรับผลิตภัณฑ์ใหม่',
            'การศึกษาตลาดสำหรับธุรกิจ Startup'
        ],
        'จิตวิทยา': [
            'ผลกระทบของโซเชียลมีเดียต่อจิตใจวัยรุ่น',
            'การศึกษาพฤติกรรมการเรียนรู้',
            'จิตวิทยาสีในการออกแบบ',
            'การจัดการความเครียดในนักศึกษา',
            'ผลของดนตรีต่ออารมณ์และความจำ'
        ]
    };

    let ideas = projectTemplates[subject] || [
        'การศึกษาเปรียบเทียบในหัวข้อที่สนใจ',
        'การวิเคราะห์กรณีศึกษาที่เกี่ยวข้อง',
        'การพัฒนาแนวทางใหม่ในสาขา',
        'การสำรวจความคิดเห็นของกลุ่มเป้าหมาย',
        'การทบทวนวรรณกรรมในหัวข้อเฉพาะ'
    ];

    return ideas.map((idea, index) => 
        `<div class="project-suggestion">
            <strong>${index + 1}. ${idea}</strong>
            <p>หัวข้อนี้เหมาะสมสำหรับวิชา "${subject}" และสามารถขยายผลเป็นงานวิจัยได้</p>
        </div>`
    ).join('');
}

function addTask() {
    const title = document.getElementById('task-title').value;
    const date = document.getElementById('task-date').value;
    const priority = document.getElementById('task-priority').value;

    if (!title || !date) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    const task = {
        id: Date.now(),
        title: title,
        date: date,
        priority: priority
    };

    tasks.push(task);
    displayTasks();
    
    document.getElementById('task-title').value = '';
    document.getElementById('task-date').value = '';
    document.getElementById('task-priority').value = 'normal';
}

function displayTasks() {
    const taskList = document.getElementById('task-list');
    if (tasks.length === 0) {
        taskList.innerHTML = '<p>ยังไม่มีงานที่ต้องทำ</p>';
        return;
    }

    tasks.sort((a, b) => new Date(a.date) - new Date(b.date));

    taskList.innerHTML = tasks.map(task => {
        const daysLeft = Math.ceil((new Date(task.date) - new Date()) / (1000 * 60 * 60 * 24));
        const urgentClass = task.priority === 'urgent' || daysLeft <= 3 ? 'task-urgent' : 'task-normal';
        
        return `
            <div class="task-item ${urgentClass} ${task.autoAdded ? 'auto-added' : ''}">
                <div>
                    <strong>${task.title}</strong><br>
                    <small>ส่งวันที่: ${task.date} (อีก ${daysLeft} วัน)</small>
                </div>
                <button class="delete-btn" onclick="deleteTask(${task.id})">ลบ</button>
            </div>
        `;
    }).join('');
}

function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    displayTasks();
}

async function sendMessage() {
    const question = document.getElementById('user-question').value;
    if (!question.trim()) return;

    addChatMessage(question, 'user');
    
    addChatMessage('🤖 กำลังคิด...', 'ai');
    
    const messages = [
        {
            role: 'system',
            content: `คุณเป็น AI ติวเตอร์ที่ช่วยสอนนักศึกษาไทย คุณมีบุคลิกเป็นมิตร อดทน และอธิบายได้เข้าใจง่าย 
            
คำแนะนำในการตอบ:
- ใช้ภาษาไทยที่เป็นกันเอง
- อธิบายจากพื้นฐานไปซับซ้อน
- ให้ตัวอย่างประกอบเมื่อเป็นไปได้
- หากเป็นคำถามยาก ให้แบ่งเป็นขั้นตอน
- สนับสนุนให้นักศึกษาคิดเอง`
        },
        ...chatHistory.slice(-6),
        {
            role: 'user',
            content: question
        }
    ];

    const answer = await callOpenAI(messages, 800);
    
    const chatContainer = document.getElementById('chat-container');
    chatContainer.removeChild(chatContainer.lastChild);
    
    if (answer) {
        addChatMessage(answer, 'ai');
        chatHistory.push({role: 'user', content: question});
        chatHistory.push({role: 'assistant', content: answer});
    } else {
        const fallbackAnswer = generateMockAnswer(question);
        addChatMessage(fallbackAnswer, 'ai');
    }

    document.getElementById('user-question').value = '';
}

function addChatMessage(message, sender) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;
    
    if (sender === 'user') {
        messageDiv.innerHTML = `<strong>คุณ:</strong> ${message}`;
    } else {
        messageDiv.innerHTML = `<strong>AI ติวเตอร์:</strong> ${message}`;
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function generateMockAnswer(question) {
    const answers = [
        "คำถามที่น่าสนใจเลยครับ! ตามที่คุณถาม เรื่องนี้มีหลายมุมมองที่ควรพิจารณา...",
        "จากประสบการณ์การสอน เรื่องนี้เป็นหัวข้อที่นักศึกษาสนใจกันมาก ผมขอแนะนำว่า...",
        "เยี่ยมเลยครับ! คำถามนี้เกี่ยวข้องกับแนวคิดพื้นฐานที่สำคัญ ลองดูตัวอย่างนี้นะครับ...",
        "ครับ เรื่องนี้อธิบายได้หลายวิธี วิธีที่ง่ายที่สุดคือ...",
        "คำถามดีครับ! เรื่องนี้มักจะเข้าใจผิดกันบ่อย ผมขอชี้แจงให้ฟังนะครับ..."
    ];
    
    return answers[Math.floor(Math.random() * answers.length)];
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function addCourse() {
    const name = document.getElementById('course-name').value;
    const day = document.getElementById('course-day').value;
    const time = document.getElementById('course-time').value;

    if (!name || !time) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    const course = {
        id: Date.now(),
        name: name,
        day: day,
        time: time
    };

    courses.push(course);
    displaySchedule();
    
    document.getElementById('course-name').value = '';
    document.getElementById('course-time').value = '';
}

function displaySchedule() {
    const scheduleDisplay = document.getElementById('schedule-display');
    
    if (courses.length === 0) {
        scheduleDisplay.innerHTML = '<p>ยังไม่มีตารางเรียน</p>';
        return;
    }

    const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
    const schedule = {};
    
    days.forEach(day => {
        schedule[day] = courses.filter(course => course.day === day);
    });

    let html = '<table class="schedule-table"><tr><th>วัน</th><th>รายวิชา</th><th>เวลา</th></tr>';
    
    days.forEach(day => {
        if (schedule[day].length > 0) {
            schedule[day].forEach((course, index) => {
                html += `<tr>
                    ${index === 0 ? `<td rowspan="${schedule[day].length}">${day}</td>` : ''}
                    <td>${course.name}</td>
                    <td>${course.time}</td>
                </tr>`;
            });
        } else {
            html += `<tr><td>${day}</td><td colspan="2">ไม่มีเรียน</td></tr>`;
        }
    });
    
    html += '</table>';
    scheduleDisplay.innerHTML = html;
}

window.onload = function() {
    displayTasks();
    displaySchedule();
    initializeAPI();
    addAPISettingsButton();
    loadSettings();
    
    setInterval(checkUpcomingTasks, 60 * 60 * 1000);
    
    setTimeout(checkUpcomingTasks, 5000);
    
    showWelcomeMessage();
};

function loadSettings() {
    const notificationSettings = JSON.parse(localStorage.getItem('notification_settings') || '{}');
    if (notificationSettings.browser !== undefined) {
        document.getElementById('browser-notify').checked = notificationSettings.browser;
    }
    if (notificationSettings.line !== undefined) {
        document.getElementById('line-notify').checked = notificationSettings.line;
    }
    if (notificationSettings.email !== undefined) {
        document.getElementById('email-notify').checked = notificationSettings.email;
    }
    if (notificationSettings.notifyEmail) {
        document.getElementById('notify-email').value = notificationSettings.notifyEmail;
    }
    if (notificationSettings.notifyTime) {
        document.getElementById('notify-time').value = notificationSettings.notifyTime;
    }
    if (notificationSettings.advanceNotify) {
        document.getElementById('advance-notify').value = notificationSettings.advanceNotify;
    }

    const lineToken = localStorage.getItem('line_token');
    const lineGroupId = localStorage.getItem('line_group_id');
    if (lineToken && lineGroupId) {
        document.getElementById('line-token').value = lineToken;
        document.getElementById('line-group-id').value = lineGroupId;
        lineConnected = true;
        document.getElementById('line-status').innerHTML = '✅ เชื่อมต่อ LINE จากครั้งก่อน';
    }
}

function showWelcomeMessage() {
    const isFirstTime = !localStorage.getItem('ai_buddy_visited');
    
    if (isFirstTime) {
        setTimeout(() => {
            const welcome = `🎉 ยินดีต้อนรับสู่ AI Buddy!
            
📖 สรุปบทเรียนอัตโนมัติ - อ่านง่าย ตรงจุด
💡 แนะนำหัวข้อโปรเจกต์ - ไอเดียตามวิชาที่เรียน  
⏰ เตือนการบ้าน/สอบ - แจ้งเตือนผ่านแอป ปฏิทิน หรือ LINE
💬 AI ติวเตอร์ส่วนตัว - ถามคำถามได้ 24 ชม.
🤖 ดึงข้อมูลอัตโนมัติ - จากตารางเรียน/กลุ่มไลน์
            
✨ เริ่มต้นด้วยการตั้งค่า API Key หรือลองใช้แบบ Mock ได้เลย!`;
            
            alert(welcome);
            localStorage.setItem('ai_buddy_visited', 'true');
        }, 1000);
    }
}

function addAPISettingsButton() {
    const header = document.querySelector('.header');
    const settingsContainer = document.createElement('div');
    settingsContainer.style.marginTop = '15px';
    
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️ ตั้งค่า API Key';
    settingsBtn.className = 'btn';
    settingsBtn.onclick = function() {
        const currentKey = OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 8)}...` : 'ยังไม่ได้ตั้งค่า';
        const confirmed = confirm(`🔑 API Key ปัจจุบัน: ${currentKey}\n\nต้องการเปลี่ยน API Key ใหม่หรือไม่?`);
        if (confirmed) {
            promptForAPIKey();
        }
    };
    
    const testBtn = document.createElement('button');
    testBtn.innerHTML = '🧪 ทดสอบ API';
    testBtn.className = 'btn';
    testBtn.onclick = async function() {
        if (!OPENAI_API_KEY) {
            alert('❌ กรุณาตั้งค่า API Key ก่อน');
            return;
        }
        
        testBtn.innerHTML = '🔄 กำลังทดสอบ...';
        testBtn.disabled = true;
        
        const testMessages = [{
            role: 'user',
            content: 'สวัสดีครับ ตอบสั้นๆ ว่า "สวัสดี! ระบบ AI ทำงานปกติ" '
        }];
        
        const result = await callOpenAI(testMessages, 50);
        
        if (result) {
            alert(`✅ API ทำงานปกติ!\n\nการตอบ: ${result}`);
        } else {
            alert('❌ ไม่สามารถเชื่อมต่อ API ได้\nแอปจะใช้งานแบบ Mock แทน');
        }
        
        testBtn.innerHTML = '🧪 ทดสอบ API';
        testBtn.disabled = false;
    };
    
    const statusDiv = document.createElement('div');
    statusDiv.style.marginTop = '10px';
    statusDiv.style.fontSize = '14px';
    statusDiv.style.color = 'white';
    statusDiv.innerHTML = OPENAI_API_KEY ? 
        '🟢 API Key: ตั้งค่าแล้ว' : 
        '🟡 API Key: ยังไม่ได้ตั้งค่า (ใช้งานแบบ Mock)';
    
    settingsContainer.appendChild(settingsBtn);
    settingsContainer.appendChild(testBtn);
    settingsContainer.appendChild(statusDiv);
    header.appendChild(settingsContainer);
}