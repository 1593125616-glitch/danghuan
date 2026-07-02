// 质检云托管服务 - 入口
const http = require('http');
const { spawn } = require('child_process');
const { getToken } = require('./feishu');
const CONFIG = require('./config');

console.log('========================================');
console.log('  质检云托管服务 v1.1');
console.log('========================================');

function ocrImage(data, callback) {
  var python = spawn('python3', [__dirname + '/ocr.py']);
  var output = '', errOut = '';
  python.stdout.on('data', function(d) { output += d.toString(); });
  python.stderr.on('data', function(d) { errOut += d.toString(); });
  python.on('close', function() {
    try { callback(JSON.parse(output)); } catch(e) { callback({ error: 'OCR parse error: ' + output.substring(0,200) }); }
  });
  python.on('error', function(e) { callback({ error: 'OCR spawn error: ' + e.message }); });
  python.stdin.write(data + '\n');
  python.stdin.end();
}

// 健康检查+OCR端口
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else if (req.url === '/ocr' && req.method === 'POST') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      try {
        var params = JSON.parse(body);
        ocrImage(params.image || params.base64 || body, function(result) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(80, () => {
  console.log('[启动] 端口 80 已监听(健康检查+OCR)');
});

// 预热token后启动业务
getToken().then(() => {
  console.log('[启动] Feishu Token 就绪');
  require('./zhijian-sync');
  require('./feishu-bot');
}).catch(e => {
  console.error('[启动] Token 获取失败:', e.message);
  process.exit(1);
});
