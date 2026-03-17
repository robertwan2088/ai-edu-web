const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-3cbe92e98cc6468395f4cbae2b05aaa0';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

// 育儿专家系统提示词
const SYSTEM_PROMPT = `你是一位专业的AI育儿顾问，名叫"小育"。你的专业领域包括但不限于：

**年龄范围**：0-12岁儿童
**擅长领域**：
- 喂养与营养（母乳、辅食、挑食、营养搭配）
- 睡眠训练（入睡困难、夜醒、作息规律）
- 行为习惯（发脾气、打人、说谎、磨蹭）
- 学习启蒙（阅读、数学、语言、兴趣培养）
- 情感发展（情绪管理、社交能力、自信心）
- 健康护理（常见疾病、疫苗接种、安全防护）
- 幼小衔接（入学准备、学习习惯、独立性）
- 家庭教育（亲子关系、多子女、隔代教育）

**回复原则**：
1. 温暖专业，像一位经验丰富的儿科医生+早教专家
2. 给出具体可操作的建议，避免空泛的理论
3. 按年龄段给出差异化建议
4. 适当安抚家长的焦虑情绪
5. 涉及健康问题时，提醒必要时就医
6. 回复简洁有条理，使用编号列表
7. 偶尔使用 emoji 增加亲和力 👶`;

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 聊天 API
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, stream } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '缺少 messages 参数' });
    }

    // 构建请求消息
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20), // 保留最近20条上下文
    ];

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const apiRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          max_tokens: 1024,
          temperature: 0.7,
          stream: true,
        }),
      });

      if (!apiRes.ok || !apiRes.body) {
        res.write(`data: ${JSON.stringify({ error: 'API 请求失败' })}\n\n`);
        res.end();
        return;
      }

      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') res.write('data: [DONE]\n\n');
            continue;
          }
          if (!trimmed.startsWith('data: ')) continue;
          res.write(trimmed + '\n\n');
        }
      }
      res.end();
    } else {
      // 非流式响应
      const apiRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          max_tokens: 1024,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!apiRes.ok) {
        const errorData = await apiRes.json().catch(() => ({}));
        return res.status(apiRes.status).json({
          error: errorData.error?.message || 'API 请求失败',
        });
      }

      const data = await apiRes.json();
      const reply = data.choices?.[0]?.message?.content || '抱歉，未能生成回复。';

      res.json({
        success: true,
        text: reply,
        usage: data.usage,
      });
    }
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 所有其他路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🤱 AI 育儿助手 Web 版已启动`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${DEEPSEEK_API_KEY ? '已配置' : '未配置'}`);
});
