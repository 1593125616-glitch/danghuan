// 共享配置
const CONFIG = {
  feishuAppId:     process.env.FEISHU_APP_ID     || 'cli_aab0fffa93f91bc0',
  feishuAppSecret: process.env.FEISHU_APP_SECRET || 'Z9oQ9oP17Lcn5gP9yLqOQDZtLSGuNCak',
  appToken:        process.env.FEISHU_APP_TOKEN  || 'T7x8btUNJaZ7XwsBTLicdECGnjp',
  cloudFnUrl:      process.env.CLOUD_FN_URL      || 'https://zhijian-d7gqnvecce55e0e0e-1445087380.ap-shanghai.app.tcloudbase.com/zhijian',
  botChatId:       process.env.BOT_CHAT_ID       || 'oc_f31564d320ed9c803e1a5d203574bdfc',
  botName:         '质检智能助手',
};

module.exports = CONFIG;
