/**
 * VPS Agent - Node.js Server Điều Khiển & Giám Sát Treo Tool 24/7
 * 
 * - Siêu nhẹ, KHÔNG CẦN CÀI NPM (chạy trực tiếp bằng `node agent.js`)
 * - Tự động hồi sinh tool khi crash (Watchdog Auto-Restart)
 * - Quản lý tiến trình: Start, Stop, Restart, Live Log, Kill Process Tree
 * - Giám sát tài nguyên: CPU, RAM, Disk, Uptime thời gian thực
 * - Tích hợp Web Server: mở trực tiếp http://<ip-vps>:3000 trên điện thoại hoặc máy tính
 */

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const PORT = process.env.PORT || 80;
const API_KEY = process.env.API_KEY || 'vps-secret-key-123';
const DATA_DIR = path.join(__dirname, 'agent_data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const CONFIG_FILE = path.join(DATA_DIR, 'tasks_config.json');

// Khởi tạo thư mục dữ liệu
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// Danh sách tác vụ đang lưu trữ
let tasks = [];
// Lưu trữ tiến trình thực tế đang chạy: taskId -> { child, pid, logBuffer: [] }
const runningProcesses = new Map();

// Tải cấu hình từ file
function loadTasks() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      tasks = JSON.parse(data);
    } catch (e) {
      console.error('Lỗi đọc tasks_config.json:', e.message);
      tasks = [];
    }
  } else {
    // Dữ liệu mẫu ban đầu
    tasks = [
      {
        id: 'task-sample-1',
        name: 'Auto Bot Farm Vàng (Demo)',
        category: 'Bot / Tool',
        command: os.platform() === 'win32' ? 'ping 127.0.0.1 -n 3600' : 'ping 127.0.0.1 -c 3600',
        cwd: __dirname,
        autoRestart: true,
        status: 'stopped',
        pid: null,
        restarts: 0,
        note: 'Bot tự chạy lại sau mỗi chu kỳ hoặc khi bị văng.'
      }
    ];
    saveTasks();
  }
}

function saveTasks() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi lưu tasks_config.json:', e.message);
  }
}

// Ghi log cho một tác vụ
function appendTaskLog(taskId, text) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${text}`;
  const proc = runningProcesses.get(taskId);
  if (proc) {
    proc.logBuffer.push(line);
    if (proc.logBuffer.length > 500) proc.logBuffer.shift(); // Giữ 500 dòng mới nhất trong RAM
  }
  const logFilePath = path.join(LOGS_DIR, `${taskId}.log`);
  fs.appendFile(logFilePath, line + '\n', () => {});
}

// Bắt đầu một tác vụ
function startTask(task) {
  if (!task.command) return { success: false, message: 'Chưa cấu hình lệnh thực thi!' };

  // Dừng nếu đang có tiến trình cũ
  if (runningProcesses.has(task.id)) {
    stopTask(task.id);
  }

  try {
    const isWin = os.platform() === 'win32';
    const shell = isWin ? 'cmd.exe' : '/bin/sh';
    const shellArg = isWin ? '/c' : '-c';

    const child = spawn(shell, [shellArg, task.command], {
      cwd: task.cwd && fs.existsSync(task.cwd) ? task.cwd : __dirname,
      windowsHide: true,
      detached: false
    });

    const procData = {
      child,
      pid: child.pid,
      startTime: Date.now(),
      logBuffer: []
    };
    runningProcesses.set(task.id, procData);

    task.status = 'running';
    task.pid = child.pid;
    task.startedAt = Date.now();
    saveTasks();

    appendTaskLog(task.id, `🚀 ĐÃ KHỞI CHẠY (PID: ${child.pid}) - Lệnh: ${task.command}`);

    child.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);
      lines.forEach(l => appendTaskLog(task.id, l));
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);
      lines.forEach(l => appendTaskLog(task.id, `[LỖI] ${l}`));
    });

    child.on('close', (code) => {
      appendTaskLog(task.id, `⚠️ TIẾN TRÌNH ĐÃ THOÁT với mã kết thúc (Exit Code): ${code}`);
      runningProcesses.delete(task.id);

      const currentTask = tasks.find(t => t.id === task.id);
      if (currentTask) {
        currentTask.pid = null;
        if (currentTask.status === 'running') {
          // Bị thoát bất thường
          currentTask.status = code === 0 ? 'stopped' : 'crashed';
          saveTasks();

          // Watchdog: Nếu bật autoRestart, tự khởi động lại sau 5 giây
          if (currentTask.autoRestart) {
            currentTask.restarts = (currentTask.restarts || 0) + 1;
            appendTaskLog(task.id, `🔄 [WATCHDOG] Phát hiện bị văng. Sẽ tự khởi động lại lần ${currentTask.restarts} sau 5 giây...`);
            saveTasks();
            setTimeout(() => {
              const liveTask = tasks.find(t => t.id === task.id);
              if (liveTask && liveTask.autoRestart && liveTask.status !== 'stopped') {
                startTask(liveTask);
              }
            }, 5000);
          }
        }
      }
    });

    child.on('error', (err) => {
      appendTaskLog(task.id, `❌ KHÔNG THỂ KHỞI CHẠY: ${err.message}`);
      runningProcesses.delete(task.id);
      task.status = 'error';
      task.pid = null;
      saveTasks();
    });

    return { success: true, pid: child.pid };
  } catch (err) {
    appendTaskLog(task.id, `❌ Lỗi ngoại lệ: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// Dừng một tác vụ
function stopTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return { success: false, message: 'Không tìm thấy tác vụ' };

  task.status = 'stopped';
  saveTasks();

  const proc = runningProcesses.get(taskId);
  if (proc && proc.pid) {
    try {
      if (os.platform() === 'win32') {
        exec(`taskkill /pid ${proc.pid} /f /t`);
      } else {
        process.kill(-proc.pid, 'SIGKILL');
      }
    } catch (e) {
      try { proc.child.kill('SIGKILL'); } catch (ignore) {}
    }
    runningProcesses.delete(taskId);
    appendTaskLog(taskId, `⏹ Người dùng yêu cầu DỪNG tiến trình.`);
  }

  task.pid = null;
  saveTasks();
  return { success: true };
}

// ==========================================
// HỆ THỐNG AUTO ĐIỀU KHIỂN & ĐÁNH GAME THẬT TRÊN PC (REAL GAME AUTO-PLAY)
// ==========================================
let gameAutoState = {
  isRunning: false,
  targetGame: '',
  targetTitle: '',
  exePath: '',
  pid: null,
  startedAt: null,
  totalActions: 0,
  skills: ['1', '2'],
  skillIntervalMs: 600,
  useAttack: true,
  usePotion: true,
  potionKey: '3',
  potionIntervalMs: 3500,
  useLoot: true,
  lootKey: ' ',
  logBuffer: []
};

let gameAutoTimer = null;
let gamePotionTimer = null;

function appendGameLog(msg) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  gameAutoState.logBuffer.push(line);
  if (gameAutoState.logBuffer.length > 200) gameAutoState.logBuffer.shift();
  console.log(`[GameAuto] ${msg}`);
}

// Khởi chạy file game thật trên PC
function launchRealGame(exePath, name) {
  if (!exePath) return { success: false, message: 'Chưa có đường dẫn file game .exe!' };

  try {
    const isWin = os.platform() === 'win32';
    if (!isWin) {
      return { success: false, message: 'Tính năng chỉ hỗ trợ trên hệ điều hành Windows.' };
    }

    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exePath)
    });
    child.unref();

    gameAutoState.exePath = exePath;
    gameAutoState.targetGame = name || path.basename(exePath);
    gameAutoState.pid = child.pid;
    appendGameLog(`🚀 ĐÃ KHỞI CHẠY GAME THẬT: ${exePath} (PID: ${child.pid})`);

    return { success: true, pid: child.pid, name: gameAutoState.targetGame };
  } catch (err) {
    appendGameLog(`❌ Không thể mở game: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// Đưa cửa sổ game lên trên màn hình (Focus)
function focusGameWindow(targetTitle) {
  if (os.platform() === 'win32') {
    const title = targetTitle || gameAutoState.targetTitle || gameAutoState.targetGame;
    const psCmd = `$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate('${title}')`;
    exec(`powershell -NoProfile -Command "${psCmd}"`);
  }
}

// Bắt đầu vòng lặp tự động đánh trong game thật
function startRealGameAuto(config) {
  stopRealGameAuto();

  gameAutoState.isRunning = true;
  gameAutoState.startedAt = Date.now();
  if (config.targetGame) gameAutoState.targetGame = config.targetGame;
  if (config.targetTitle) gameAutoState.targetTitle = config.targetTitle;
  if (config.skills) gameAutoState.skills = config.skills;
  if (config.skillIntervalMs) gameAutoState.skillIntervalMs = Math.max(150, parseInt(config.skillIntervalMs));
  if (config.useAttack !== undefined) gameAutoState.useAttack = !!config.useAttack;
  if (config.usePotion !== undefined) gameAutoState.usePotion = !!config.usePotion;
  if (config.potionKey) gameAutoState.potionKey = config.potionKey;
  if (config.useLoot !== undefined) gameAutoState.useLoot = !!config.useLoot;

  appendGameLog(`⚡ BẮT ĐẦU AUTO ĐÁNH TRONG GAME: "${gameAutoState.targetGame || 'Cửa sổ game active'}"`);

  // Đưa game lên trên trước khi đánh
  focusGameWindow(gameAutoState.targetTitle);

  let skillIndex = 0;
  // Vòng lặp tung chiêu & đánh quái
  gameAutoTimer = setInterval(() => {
    if (!gameAutoState.isRunning) return;

    // Chọn phím skill lần lượt (ví dụ phím 1, rồi phím 2)
    let keyToSend = '1';
    if (gameAutoState.skills && gameAutoState.skills.length > 0) {
      keyToSend = gameAutoState.skills[skillIndex % gameAutoState.skills.length];
      skillIndex++;
    }

    // Gửi phím skill vào game
    sendKeyToGame(keyToSend);
    gameAutoState.totalActions++;

    // Nhặt đồ (phím Space)
    if (gameAutoState.useLoot && Math.random() > 0.6) {
      setTimeout(() => sendKeyToGame(' '), 100);
    }
  }, gameAutoState.skillIntervalMs);

  // Vòng lặp bơm máu riêng biệt (Phím 7 trong Knight Age)
  if (gameAutoState.usePotion) {
    gamePotionTimer = setInterval(() => {
      if (!gameAutoState.isRunning) return;
      sendKeyToGame(gameAutoState.potionKey || '7');
      appendGameLog(`💚 [Auto Potion] Đã tự bơm máu (Phím ${gameAutoState.potionKey || '7'})`);
    }, gameAutoState.potionIntervalMs || 3500);
  }

  // Vòng lặp bơm mana riêng biệt (Phím 8 trong Knight Age)
  if (config.useMana) {
    setInterval(() => {
      if (!gameAutoState.isRunning) return;
      sendKeyToGame('8');
      appendGameLog(`💙 [Auto Mana] Đã tự bơm mana (Phím 8)`);
    }, 4500);
  }

  return { success: true, message: 'Auto đang chạy trong game thật trên máy!' };
}

// Dừng vòng lặp auto
function stopRealGameAuto() {
  gameAutoState.isRunning = false;
  if (gameAutoTimer) {
    clearInterval(gameAutoTimer);
    gameAutoTimer = null;
  }
  if (gamePotionTimer) {
    clearInterval(gamePotionTimer);
    gamePotionTimer = null;
  }
  appendGameLog(`⏹ ĐÃ DỪNG AUTO ĐÁNH.`);
  return { success: true };
}

// Hàm gửi phím thật vào game qua PowerShell
function sendKeyToGame(key) {
  if (os.platform() !== 'win32' || !key) return;

  const target = gameAutoState.targetTitle || gameAutoState.targetGame;
  const scriptPath = path.join(__dirname, 'send_keys.ps1');

  if (fs.existsSync(scriptPath)) {
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${target}" "${key}"`);
  } else {
    const psCmd = `$wshell = New-Object -ComObject WScript.Shell; if ('${target}') { $wshell.AppActivate('${target}') }; $wshell.SendKeys('${key}')`;
    exec(`powershell -NoProfile -Command "${psCmd}"`);
  }
}



// Tính toán CPU usage
let previousCpuTime = { idle: 0, total: 0 };
function getCpuUsagePercent() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  const diffIdle = idle - previousCpuTime.idle;
  const diffTotal = total - previousCpuTime.total;
  previousCpuTime = { idle, total };
  if (diffTotal === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - diffIdle / diffTotal) * 100)));
}
getCpuUsagePercent(); // Gọi khởi tạo

// Đọc thông số bộ nhớ RAM
function getMemoryStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalMb: Math.round(total / (1024 * 1024)),
    freeMb: Math.round(free / (1024 * 1024)),
    usedMb: Math.round(used / (1024 * 1024)),
    percent: Math.round((used / total) * 100)
  };
}

// Xử lý request HTTP
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Serve trang giao diện trực tiếp khi người dùng truy cập web bằng trình duyệt
  if (pathname === '/' || pathname === '/index.html' || pathname === '/app') {
    const htmlFiles = [
      path.join(__dirname, 'index.html'),
      path.join(__dirname, 'Bảng quản lý treo.html')
    ];
    let served = false;
    for (const f of htmlFiles) {
      if (fs.existsSync(f)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(f).pipe(res);
        served = true;
        break;
      }
    }
    if (served) return;
  }

  // API Router
  function jsonResponse(data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  // Đọc body dữ liệu JSON
  function parseBody(callback) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        callback(null, data);
      } catch (e) {
        callback(e);
      }
    });
  }

  // Phục vụ giao diện Web (index.html)
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(indexPath).pipe(res);
    }
  }
  
  if (pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js') || pathname.endsWith('.png') || pathname.endsWith('.jpg')) {
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Kiểm tra API Key (nếu có yêu cầu bảo mật)
  const reqKey = req.headers['x-api-key'] || parsedUrl.searchParams.get('key');
  const isPublicPing = pathname === '/api/ping';

  if (!isPublicPing && reqKey !== API_KEY) {
    // Có thể nới lỏng cho môi trường local
    const isLocal = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1';
    if (!isLocal && pathname.startsWith('/api')) {
      return jsonResponse({ error: 'Sai hoặc thiếu API Key! Hãy cung cấp header x-api-key' }, 401);
    }
  }

  // 1. Kiểm tra kết nối
  if (pathname === '/api/ping') {
    return jsonResponse({
      status: 'online',
      message: 'VPS Agent đang hoạt động bình thường',
      serverTime: new Date().toISOString(),
      platform: os.platform(),
      hostname: os.hostname()
    });
  }

  // 2. Thống kê tài nguyên hệ thống
  if (pathname === '/api/system') {
    return jsonResponse({
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: Math.floor(os.uptime()),
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0] ? os.cpus()[0].model : 'Standard vCPU',
        usagePercent: getCpuUsagePercent()
      },
      memory: getMemoryStats(),
      tasksCount: {
        total: tasks.length,
        running: tasks.filter(t => t.status === 'running').length,
        crashed: tasks.filter(t => t.status === 'crashed').length
      }
    });
  }

  // 3. Lấy danh sách tác vụ
  if (pathname === '/api/tasks' && req.method === 'GET') {
    // Cập nhật trạng thái thực tế
    const enhancedTasks = tasks.map(t => {
      const proc = runningProcesses.get(t.id);
      return {
        ...t,
        isActuallyRunning: !!proc,
        livePid: proc ? proc.pid : null,
        uptimeMs: proc ? (Date.now() - proc.startTime) : 0
      };
    });
    return jsonResponse({ tasks: enhancedTasks });
  }

  // 4. Thêm tác vụ mới
  if (pathname === '/api/tasks' && req.method === 'POST') {
    parseBody((err, body) => {
      if (err || !body.name) return jsonResponse({ error: 'Dữ liệu không hợp lệ' }, 400);
      const newTask = {
        id: 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: body.name,
        category: body.category || 'Bot / Tool',
        command: body.command || '',
        cwd: body.cwd || __dirname,
        autoRestart: body.autoRestart !== false,
        status: 'stopped',
        pid: null,
        restarts: 0,
        note: body.note || '',
        createdAt: Date.now()
      };
      tasks.unshift(newTask);
      saveTasks();
      if (body.startImmediately) {
        startTask(newTask);
      }
      return jsonResponse({ success: true, task: newTask });
    });
    return;
  }

  // 5. Cập nhật tác vụ
  if (pathname.startsWith('/api/tasks/') && req.method === 'PUT') {
    const taskId = pathname.replace('/api/tasks/', '');
    parseBody((err, body) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return jsonResponse({ error: 'Không tìm thấy tác vụ' }, 404);
      if (body.name) task.name = body.name;
      if (body.category) task.category = body.category;
      if (body.command !== undefined) task.command = body.command;
      if (body.cwd !== undefined) task.cwd = body.cwd;
      if (body.autoRestart !== undefined) task.autoRestart = !!body.autoRestart;
      if (body.note !== undefined) task.note = body.note;
      saveTasks();
      return jsonResponse({ success: true, task });
    });
    return;
  }

  // 6. Xóa tác vụ
  if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
    const taskId = pathname.replace('/api/tasks/', '');
    stopTask(taskId);
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    return jsonResponse({ success: true });
  }

  // 7. Khởi động tác vụ
  if (pathname === '/api/tasks/start' && req.method === 'POST') {
    parseBody((err, body) => {
      const task = tasks.find(t => t.id === body.taskId);
      if (!task) return jsonResponse({ error: 'Không tìm thấy tác vụ' }, 404);
      const resStart = startTask(task);
      return jsonResponse(resStart);
    });
    return;
  }

  // 8. Dừng tác vụ
  if (pathname === '/api/tasks/stop' && req.method === 'POST') {
    parseBody((err, body) => {
      const resStop = stopTask(body.taskId);
      return jsonResponse(resStop);
    });
    return;
  }

  // 9. Khởi động lại tác vụ
  if (pathname === '/api/tasks/restart' && req.method === 'POST') {
    parseBody((err, body) => {
      const task = tasks.find(t => t.id === body.taskId);
      if (!task) return jsonResponse({ error: 'Không tìm thấy tác vụ' }, 404);
      stopTask(task.id);
      setTimeout(() => {
        const resStart = startTask(task);
        return jsonResponse(resStart);
      }, 1000);
    });
    return;
  }

  // 10. Xem log tác vụ
  if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/logs')) {
    const parts = pathname.split('/');
    const taskId = parts[3];
    const proc = runningProcesses.get(taskId);
    let logs = [];
    if (proc && proc.logBuffer.length > 0) {
      logs = proc.logBuffer;
    } else {
      const logFilePath = path.join(LOGS_DIR, `${taskId}.log`);
      if (fs.existsSync(logFilePath)) {
        try {
          const content = fs.readFileSync(logFilePath, 'utf8');
          logs = content.split('\n').slice(-200);
        } catch (e) {}
      }
    }
    return jsonResponse({ taskId, logs });
  }

  // 11. Chạy lệnh Console nhanh (Quick Terminal Exec)
  if (pathname === '/api/exec' && req.method === 'POST') {
    parseBody((err, body) => {
      if (!body.cmd) return jsonResponse({ error: 'Thiếu câu lệnh cmd' }, 400);
      exec(body.cmd, { timeout: 15000, maxBuffer: 1024 * 1024 }, (errExec, stdout, stderr) => {
        return jsonResponse({
          cmd: body.cmd,
          stdout: stdout || '',
          stderr: stderr || (errExec ? errExec.message : ''),
          exitCode: errExec ? (errExec.code || 1) : 0
        });
      });
    });
    return;
  }

  // 12. Điều khiển Chuột từ xa (Remote Click)
  if (pathname === '/api/remote/click' && req.method === 'POST') {
    parseBody((err, body) => {
      sendRemoteClick(body.x || 0, body.y || 0, body.button || 'left');
      return jsonResponse({ success: true, x: body.x, y: body.y });
    });
    return;
  }

  // 13. Gửi phím điều khiển từ xa (Remote Key Press)
  if (pathname === '/api/remote/key' && req.method === 'POST') {
    parseBody((err, body) => {
      if (body.key) sendRemoteKey(body.key);
      return jsonResponse({ success: true, key: body.key });
    });
    return;
  }

  // 14. Bật Auto Treo 24/7 (Persistent Macro Engine)
  if (pathname === '/api/macro/start' && req.method === 'POST') {
    parseBody((err, body) => {
      const result = startPersistentMacro(body);
      return jsonResponse(result);
    });
    return;
  }

  // 15. Dừng Auto Treo 24/7
  if (pathname === '/api/macro/stop' && req.method === 'POST') {
    parseBody((err, body) => {
      const result = stopPersistentMacro(body.id || 'default-macro');
      return jsonResponse(result);
    });
    return;
  }

  // 17. Quét danh sách cửa sổ / Game đang mở trên máy tính
  if (pathname === '/api/game/windows' && req.method === 'GET') {
    const list = [
      { id: 'custom', name: 'Nhập đường dẫn file game .exe', title: 'Game tùy chỉnh' },
      { id: 'knight', name: 'Knight.exe (Hiệp Sĩ Online / HSO)', title: 'Hiệp Sĩ Online' },
      { id: 'ldplayer', name: 'dnplayer.exe (Giả lập LDPlayer)', title: 'LDPlayer' },
      { id: 'nox', name: 'Nox.exe (Giả lập NoxPlayer)', title: 'NoxPlayer' },
      { id: 'knight_pc', name: 'KnightOnline.exe (MMORPG PC)', title: 'Knight Online' },
      { id: 'game_vl', name: 'game.exe (Võ Lâm Truyền Kỳ)', title: 'Võ Lâm Truyền Kỳ' }
    ];

    // Quét thêm các tiến trình thực tế bằng PowerShell nếu có
    const scriptPath = path.join(__dirname, 'list_apps.ps1');
    if (fs.existsSync(scriptPath)) {
      exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (err, stdout) => {
        try {
          const parsed = JSON.parse(stdout || '[]');
          const combined = Array.isArray(parsed) ? [...parsed, ...list] : list;
          return jsonResponse({ games: combined });
        } catch (e) {
          return jsonResponse({ games: list });
        }
      });
      return;
    }
    return jsonResponse({ games: list });
  }

  // 18. Khởi chạy file game thật trên PC (.exe)
  if (pathname === '/api/game/launch' && req.method === 'POST') {
    parseBody((err, body) => {
      const result = launchRealGame(body.exePath, body.name);
      return jsonResponse(result);
    });
    return;
  }

  // 19. Đưa cửa sổ game lên trên màn hình (Focus)
  if (pathname === '/api/game/focus' && req.method === 'POST') {
    parseBody((err, body) => {
      focusGameWindow(body.title || body.name);
      return jsonResponse({ success: true });
    });
    return;
  }

  // 20. Bắt đầu Auto Tự Động Đánh trong game thật
  if (pathname === '/api/game/auto/start' && req.method === 'POST') {
    parseBody((err, body) => {
      const result = startRealGameAuto(body);
      return jsonResponse(result);
    });
    return;
  }

  // 21. Dừng Auto Đánh trong game
  if (pathname === '/api/game/auto/stop' && req.method === 'POST') {
    const result = stopRealGameAuto();
    return jsonResponse(result);
  }

  // 22. Kiểm tra trạng thái Auto và lịch sử đánh
  if (pathname === '/api/game/auto/status' && req.method === 'GET') {
    return jsonResponse({
      ...gameAutoState,
      uptimeMs: gameAutoState.startedAt ? (Date.now() - gameAutoState.startedAt) : 0
    });
  }

  // 23. Xem trực tiếp màn hình game (Screenshot)
  if (pathname === '/api/screen' && req.method === 'GET') {
    const titleParam = parsedUrl.searchParams.get('title') || '';
    const captureScript = path.join(__dirname, 'capture.ps1');
    const outImg = path.join(__dirname, 'screen_test.jpg');
    
    exec(`powershell -ExecutionPolicy Bypass -File "${captureScript}" -outFile "${outImg}" -windowTitle "${titleParam}"`, (err) => {
      if (!err && fs.existsSync(outImg)) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        fs.createReadStream(outImg).pipe(res);
      } else {
        jsonResponse({ error: 'Không thể chụp màn hình' }, 500);
      }
    });
    return;
  }

  jsonResponse({ error: 'Endpoint không tồn tại' }, 404);
});


// Nạp dữ liệu và mở cổng lắng nghe
loadTasks();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`⚡ VPS AGENT ĐÃ SẴN SÀNG TRÊN CỔNG: ${PORT}`);
  console.log(`🔑 API Key bí mật: ${API_KEY}`);
  console.log(`🌐 Truy cập Web quản lý tại: http://localhost:${PORT}`);
  console.log(`🖥 Hệ điều hành: ${os.platform()} (${os.arch()})`);
  console.log(`📂 Lưu trữ tác vụ tại: ${CONFIG_FILE}`);
  console.log(`======================================================\n`);
});
