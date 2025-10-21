import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';

// 环境变量
const clientId = process.env.THIRDWEB_CLIENT_ID;
const payToAddress = process.env.PAY_TO_ADDRESS;
// 示例收款地址和金额。前端的 wrapFetchWithPayment 会读取这些信息。
const PAY_TO_ADDRESS = payToAddress!; // 示例收款地址 (USDC Sepolia 合约地址)
const PAY_AMOUNT = "100000"; // 示例金额 (100,000 wei = 0.1 USDC)

if (!clientId) {
    throw new Error("Missing THIRDWEB_CLIENT_ID environment variable.");
}

// 初始化 Hono 应用
const app = new Hono();

// CORS 配置
app.use('/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    // 确保允许 X-Payment 和 PayTo-Required 响应头
    allowHeaders: ['Content-Type', 'X-Payment', 'Authorization', 'PayTo-Required'],
    credentials: true,
}));

// 提供静态文件
app.use('/*', serveStatic({ root: './public' }));

// 获取 Client ID 的 API
app.get('/api/config', (c) => {
    return c.json({ clientId });
});

/**
 * 模拟 X402 支付网关保护的 API 端点。
 */
app.get('/api/weather', (c) => {
    // 1. 检查 X-Payment 头部是否存在
    const paymentHeader = c.req.header('X-Payment');

    if (paymentHeader) {
        // 2. 如果 X-Payment 存在，认为支付成功，返回数据
        console.log("✅ X-Payment Header 存在。授权通过，返回天气数据。");
        return c.json({
            status: "success",
            data: {
                city: "Shanghai",
                temperature: "25°C",
                condition: "Mostly Sunny",
                payment_note: "Content delivered after successful X402 payment."
            }
        });
    } else {
        // 3. 如果 X-Payment 不存在，返回 402 Payment Required
        console.log("⚠️ X-Payment Header 缺失。返回 402 Payment Required。");

        // PayTo-Required 头告知客户端必须支付给哪个地址多少钱
        // 格式: <address>:<amount>:<chain_id>:<optional message>
        // thirdweb 的 wrapFetchWithPayment 默认会查找 Sepolia 上的 USDC 合约，所以我们提供收款地址和金额
        c.header('PayTo-Required', `${PAY_TO_ADDRESS}:${PAY_AMOUNT}:0.1 USDC Fee for access`);

        return c.text("402 Payment Required. Please complete the X402 payment.", 402);
    }
});


// 启动服务器在 3005 端口
const PORT = 3005;

console.log(`\n🚀 X402 客户端服务器启动于端口 ${PORT}`);
console.log(`📝 访问 http://localhost:${PORT} 查看前端界面`);
console.log(`🌟 支付网关：/api/weather (需要 X402 支付)`);

serve({ fetch: app.fetch, port: PORT });
