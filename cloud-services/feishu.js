const axios = require('axios');
const CONFIG = require('./config');

let tokenCache = null, tokenExpiry = 0;

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache;
  const { data } = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: CONFIG.feishuAppId, app_secret: CONFIG.feishuAppSecret },
    { headers: { 'Content-Type': 'application/json' } }
  );
  tokenCache = data.tenant_access_token;
  tokenExpiry = Date.now() + (data.expire - 60) * 1000;
  return tokenCache;
}

const headers = () => ({ 'Authorization': 'Bearer ' + tokenCache, 'Content-Type': 'application/json' });

async function feishuGet(url) {
  const { data } = await axios.get(url, { headers: headers() });
  return data;
}

async function feishuPost(url, body) {
  const { data } = await axios.post(url, body, { headers: headers() });
  return data;
}

async function feishuPatch(url, body) {
  const { data } = await axios.patch(url, body, { headers: headers() });
  return data;
}

async function feishuPut(url, body) {
  const { data } = await axios.put(url, body, { headers: headers() });
  return data;
}

async function feishuDelete(url, body) {
  const { data } = await axios.delete(url, { headers: headers(), data: body });
  return data;
}

async function cloudGet(path) {
  const { data } = await axios.get(CONFIG.cloudFnUrl + path);
  return data;
}

async function cloudPost(path, body) {
  const { data } = await axios.post(CONFIG.cloudFnUrl + path, body, { headers: { 'Content-Type': 'application/json' } });
  return data;
}

// 消息发送
async function sendMsg(text) {
  return feishuPost(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    { receive_id: CONFIG.botChatId, msg_type: 'text', content: JSON.stringify({ text }) }
  );
}

module.exports = { getToken, feishuGet, feishuPost, feishuPut, feishuPatch, feishuDelete, cloudGet, cloudPost, sendMsg };
