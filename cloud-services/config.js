// 共享配置 - 敏感信息通过环境变量注入,不留仓库明文
const CONFIG = {
  feishuAppId:     process.env.FEISHU_APP_ID     || '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET || '',
  appToken:        process.env.FEISHU_APP_TOKEN  || '',
  cloudFnUrl:      process.env.CLOUD_FN_URL      || 'https://zhijian-d7gqnvecce55e0e0e-1445087380.ap-shanghai.app.tcloudbase.com/zhijian',
  botChatId:       process.env.BOT_CHAT_ID       || '',
  botName:         '质检智能助手',
};

// 启动时校验
if (!CONFIG.feishuAppId || !CONFIG.feishuAppSecret) {
  console.error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET 环境变量');
  process.exit(1);
}

module.exports = CONFIG;
