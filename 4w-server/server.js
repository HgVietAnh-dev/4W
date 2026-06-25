const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cron    = require('node-cron');
const fetch   = require('node-fetch');
const cors    = require('cors');

const app  = express();
app.use(cors());
app.use(express.json());

// ================================================================
// CONFIG — điền vào đây hoặc dùng biến môi trường Render.com
// ================================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'ĐIỀN_TOKEN_VÀO_ĐÂY';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '8762337019';
const TG_API    = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ================================================================
// IN-MEMORY EVENT STORE (được đồng bộ từ PWA app)
// ================================================================
let events = [];
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
: null;

// Mapping app day (2-8) → JS getDay() (0=Sun,1=Mon...6=Sat)
// appDay: 2=T2,3=T3,4=T4,5=T5,6=T6,7=T7,8=CN
const DAY_NAMES = ["","","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ Nhật"];

// appDay → JS weekday
function appDayToJs(appDay) {
    return appDay <= 7 ? appDay - 1 : 0; // 2→1,3→2,...,7→6,8→0
}

// ================================================================
// TELEGRAM HELPER
// ================================================================
async function sendTelegram(text) {
    try {
        const res = await fetch(`${TG_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id:    CHAT_ID,
                text:       text,
                parse_mode: 'HTML'
            })
        });
        const data = await res.json();
        if (!data.ok) console.error('[TG Error]', data);
        else console.log('[TG Sent]', text.slice(0, 60));
    } catch(e) {
        console.error('[TG Fetch Error]', e.message);
    }
}

// ================================================================
// NOTIFICATION LOGIC
// ================================================================
function getTodayAppDay() {
    const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const jsDay = nowVN.getUTCDay(); // 0=Sun
    return jsDay === 0 ? 8 : jsDay + 1; // Sun→8, Mon→2,...,Sat→7
}

function getTomorrowAppDay() {
    const today = getTodayAppDay();
    return today >= 8 ? 2 : today + 1;
}

// Chạy mỗi phút — kiểm tra có sự kiện nào cần thông báo không
cron.schedule('* * * * *', () => {
    // Render chạy UTC — đổi sang giờ Việt Nam (UTC+7)
    const nowVN    = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const nowHour  = nowVN.getUTCHours();
    const nowMin   = nowVN.getUTCMinutes();

    // getUTCDay() trên giờ VN: 0=CN,1=T2...6=T7 → appDay
    const jsDay    = nowVN.getUTCDay();
    const todayApp = jsDay === 0 ? 8 : jsDay + 1;

    events.forEach(ev => {
        if (ev.type !== 'calendar') return;

        // --- Mốc 1: 21:00 tối hôm trước ---
        // "Hôm trước" của ev.day trong app
        const prevDay = ev.day - 1 < 2 ? 8 : ev.day - 1;
        if (todayApp === prevDay && nowHour === 21 && nowMin === 0) {
            const msg =
                `🔔 <b>Nhắc lịch ngày mai!</b>\n\n` +
                `📅 <b>${ev.title}</b>\n` +
                `🗓 ${DAY_NAMES[ev.day]} — ${ev.start}:00 → ${ev.end}:00\n` +
                (ev.note ? `📝 ${ev.note}\n` : '') +
                `\n⏰ Còn khoảng <b>~${ev.start - 21 < 0 ? 24 + ev.start - 21 : ev.start - 21} tiếng</b> nữa`;
            sendTelegram(msg);
        }

        // --- Mốc 2: nhắc trước X phút/giờ (theo notifyBefore của từng sự kiện) ---
        const nb = ev.notifyBefore || '2h';
        const offsetMin = nb === '1m' ? 1 : nb === '2h' ? 120 : 180;
        const label     = nb === '1m' ? '1 phút' : nb === '2h' ? '2 tiếng' : '3 tiếng';

        // Tính giờ & ngày cần thông báo
        const totalMin  = ev.start * 60 - offsetMin;
        const notifH    = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
        const notifM    = ((totalMin % 60) + 60) % 60;
        let   notifDay  = ev.day;
        if (totalMin < 0) { notifDay = ev.day - 1 < 2 ? 8 : ev.day - 1; }

        if (todayApp === notifDay && nowHour === notifH && nowMin === notifM) {
            const msg =
                `⏰ <b>Còn ${label} nữa!</b>\n\n` +
                `📌 <b>${ev.title}</b>\n` +
                `🗓 ${DAY_NAMES[ev.day]} — <b>${ev.start}:00</b> → ${ev.end}:00\n` +
                (ev.note ? `📝 ${ev.note}` : '');
            sendTelegram(msg);
        }
    });
});

// Mỗi sáng 7:00 (giờ VN = 0:00 UTC) gửi tổng kết lịch hôm nay
cron.schedule('0 0 * * *', () => {
    const todayApp   = getTodayAppDay();
    const todayEvs   = events.filter(ev => ev.type === 'calendar' && ev.day === todayApp);

    if (todayEvs.length === 0) {
        sendTelegram(`☀️ <b>Lịch hôm nay (${DAY_NAMES[todayApp]})</b>\n\nKhông có sự kiện nào. Ngày nhẹ nhàng! 🎉`);
        return;
    }

    let msg = `☀️ <b>Lịch hôm nay — ${DAY_NAMES[todayApp]}</b>\n\n`;
    todayEvs.sort((a,b) => a.start - b.start).forEach(ev => {
        msg += `• ${ev.start}:00–${ev.end}:00  <b>${ev.title}</b>`;
        if (ev.note) msg += `\n  📝 ${ev.note}`;
        msg += '\n';
    });
    sendTelegram(msg);
});

// ================================================================
// REST API — PWA app gọi để đồng bộ sự kiện lên server
// ================================================================

// Nhận toàn bộ danh sách sự kiện từ app
app.post('/api/sync', (req, res) => {
    const incoming = req.body.events;
    if (!Array.isArray(incoming)) {
        return res.status(400).json({ ok: false, message: 'events phải là array' });
    }
    events = incoming;
    console.log(`[Sync] Received ${events.length} events`);
    res.json({ ok: true, count: events.length });
});

// Thêm 1 sự kiện mới
app.post('/api/event', (req, res) => {
    const ev = req.body;
    if (!ev || !ev.id) return res.status(400).json({ ok: false });
    events = events.filter(e => e.id !== ev.id);
    events.push(ev);
    console.log(`[Add] Event: ${ev.title}`);

    // Gửi xác nhận ngay qua Telegram
    if (ev.type === 'calendar') {
        const prevDay  = ev.day - 1 < 2 ? 8 : ev.day - 1;
        const nb       = ev.notifyBefore || '2h';
        const label    = nb === '1m' ? '1 phút' : nb === '2h' ? '2 tiếng' : '3 tiếng';
        const offsetMin = nb === '1m' ? 1 : nb === '2h' ? 120 : 180;
        const totalMin = ev.start * 60 - offsetMin;
        const notifH   = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
        const notifM   = ((totalMin % 60) + 60) % 60;
        const notifDay = totalMin < 0 ? (ev.day - 1 < 2 ? 8 : ev.day - 1) : ev.day;
        const msg =
            `✅ <b>Đã lên lịch thông báo!</b>\n\n` +
            `📌 <b>${ev.title}</b>\n` +
            `🗓 ${DAY_NAMES[ev.day]} — ${ev.start}:00 → ${ev.end}:00\n` +
            (ev.note ? `📝 ${ev.note}\n` : '') +
            `\n🔔 Sẽ nhắc bạn:\n` +
            `  • 21:00 ${DAY_NAMES[prevDay]} (tối hôm trước)\n` +
            `  • ${String(notifH).padStart(2,'0')}:${String(notifM).padStart(2,'0')} ${DAY_NAMES[notifDay]} (trước ${label})`;
        sendTelegram(msg);
    }

    res.json({ ok: true });
});

// Xóa sự kiện
app.delete('/api/event/:id', (req, res) => {
    const id  = parseInt(req.params.id);
    const old = events.find(e => e.id === id);
    events    = events.filter(e => e.id !== id);
    if (old) sendTelegram(`🗑 Đã xóa lịch: <b>${old.title}</b>`);
    res.json({ ok: true });
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        events: events.length,
        time:   new Date().toISOString()
    });
});

// Test gửi tin nhắn
app.get('/api/test', async (req, res) => {
    await sendTelegram('✅ <b>4W Server đang hoạt động!</b>\nThông báo Telegram đã kết nối thành công 🎉');
    res.json({ ok: true, message: 'Đã gửi tin nhắn test' });
});

// ================================================================
// KEEP-ALIVE — tự ping mỗi 10 phút để Render không sleep
// ================================================================
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || '';
if (SERVER_URL) {
    cron.schedule('*/10 * * * *', () => {
        fetch(`${SERVER_URL}/`)
            .then(() => console.log('[Keep-alive] Pinged'))
            .catch(e => console.warn('[Keep-alive] Failed:', e.message));
    });
}

// ================================================================
// START
// ================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[4W Server] Running on port ${PORT}`);
    console.log(`[4W Server] Telegram Chat ID: ${CHAT_ID}`);
    console.log(`[4W Server] Events loaded: ${events.length}`);
    sendTelegram('🚀 <b>4W Workspace Server đã khởi động!</b>\nThông báo tự động đã sẵn sàng.');
});
