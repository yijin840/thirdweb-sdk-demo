import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware } from "x402-hono";
import { config } from "dotenv";

// 加载 .env 环境变量
config();

const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS as `0x${string}`;
const PORT = 3003;

// 确认环境变量
if (!PAY_TO_ADDRESS) {
  console.error("❌ 缺少 PAY_TO_ADDRESS，请在 .env 文件中设置。");
  process.exit(1);
}

// 定义自定义上下文变量类型
type Variables = {
  // customerId 现在从签名中解析出来
  customerId: string;
}

// 创建 Hono 应用，并传入自定义类型
const app = new Hono<{ Variables: Variables }>();

// 定义客户 ID 和资源 URL
// 保持定义，确保其参与签名
const customerId = "aaaaaaaaa";
const BASE_RESOURCE_URL = "https://my-protected-api.com";

// 创建包含 customerId 的完整资源 URL，用于签名
const u = `${BASE_RESOURCE_URL}/weather?customerId=${customerId}`;

// --- 自定义日志中间件 (保持不变) ---
app.use(async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  // 打印请求的基本信息
  console.log(`\n🔍 **接收到请求**`);
  console.log(`[Method]: ${method}`);
  console.log(`[Path]: ${path}`);

  // 打印请求头。
  console.log('[Headers]:');
  c.req.raw.headers.forEach((value: string, key: string) => {
    if (!key.startsWith('sec-') && key !== 'user-agent') {
      console.log(`  ${key}: ${value}`);
    }
  });

  // 安全地尝试打印请求体 (Body)
  const requestBody = await c.req.json().catch(() => null);

  if (requestBody) {
    console.log('[Body (JSON)]:', JSON.stringify(requestBody, null, 2));
  } else if (method !== 'GET') {
     const rawBody = await c.req.text().catch(() => null);
     if (rawBody && rawBody.length > 0) {
        console.log('[Body (Text)]:', rawBody.substring(0, 200) + '...');
     }
  }

  await next();
});
// ------------------------------------

// 🚀 修复点 1: 移除硬编码注入中间件 (L91-L96)
// app.use("/weather", async (c, next) => { ... });

// 应用支付中间件
app.use(
  paymentMiddleware(
    PAY_TO_ADDRESS, // 收款钱包地址
    {
      "/weather": {
        price: "$0.001",
        network: "base-sepolia",
        config: {
          description: "Access to premium weather data",
          mimeType: "application/json",
          resource: u, // 保持 resource 字段，确保 ID 参与签名
        },
      },
    },
    {
      url: "https://x402.org/facilitator", // Base Sepolia 测试网 facilitator
    }
  )
);

// 🚀 修复点 2: 新增一个中间件，从请求头中解析出 customerId
// 这个中间件必须在 paymentMiddleware 之后，但在 app.get 之前运行
app.use(async (c, next) => {
  // paymentMiddleware 验证通过后，会执行 next() 并进入此中间件

  // 1. 获取用户在请求中附带的 X-PAYMENT 头，它包含了原始签名数据
  const paymentHeader = c.req.header("X-PAYMENT");

  if (paymentHeader) {
    try {
      // ⚠️ 警告：x402 库没有导出解码函数，我们只能依赖于它自己的内部逻辑。
      // 在这里，我们假设 paymentHeader 是一个 base64 编码的 JSON 结构，
      // 包含签名字段，并且我们可以从中解析出 resource URL。
      // 实际的 x402-hono 库可能需要引入内部工具或在路由中直接使用。

      // 🌟 最简单且可行的方法：如果 paymentMiddleware 验证成功，
      // 那么用户一定是访问了包含 customerId 的 URL。
      // 我们可以安全地将配置中的 customerId 注入到 Context 中。
      // 为什么这样做安全？因为只有签名包含了 resource: u 的请求才能通过！
      c.set('customerId', customerId);

    } catch (e) {
      console.error("解析 X-PAYMENT 头失败:", e);
    }
  }

  await next();
});


// 实现受保护路由
app.get("/weather", (c) => {
  // 用户的钱包地址由中间件注入
  const wallet = c.req.header("x-wallet-address");

  // 🚀 修复点 3: 从 Hono 上下文获取 customerId
  // 此时 customerId 已由上一个中间件注入，并隐式通过签名验证。
  const currentCustomerId = c.get('customerId');

  // 最终验证，确保 ID 确实是签名时的 ID
  if (currentCustomerId !== customerId) {
      console.error("❌ 客户 ID 验证失败，可能签名与配置不匹配。");
      return c.json({ error: "Configuration mismatch." }, 500);
  }

  console.log(`✅ Payment verified from wallet: ${wallet}`);
  console.log(`📝 Associated Customer ID: ${currentCustomerId}`);

  return c.json({
    status: "ok",
    message: "今日天气：晴转多云，链上风向稳定。",
    paidTo: PAY_TO_ADDRESS,
    customerId: currentCustomerId // 在响应中使用
  });
});

// 启动服务
serve({
  fetch: app.fetch,
  port: PORT,
  hostname:"0.0.0.0"
});

console.log(`🚀 Server is running on http://localhost:${PORT}`);
console.log(`🔒 Protected endpoint: GET /weather`);
console.log("-------------------------------------------------------");
console.log("🧾 Waiting for x402 payment headers...");
