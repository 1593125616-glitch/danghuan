// 质检云托管服务 - 入口
const http = require('http');
const { getToken } = require('./feishu');

console.log('========================================');
console.log('  质检云托管服务 v1.1');
console.log('========================================');

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(80, () => {
  console.log('[启动] 端口 80 已监听');
});

getToken().then(() => {
  console.log('[启动] Feishu Token 就绪');
  require('./zhijian-sync');
  require('./feishu-bot');
}).catch(e => {
  console.error('[启动] Token 获取失败:', e.message);
  process.exit(1);
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
