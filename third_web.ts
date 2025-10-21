// third_web.ts - 最终稳定版本，修正了 Chain ID 和 Asset 识别错误 (将网络修正为 eip155:11155111|ETH)

import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import 'dotenv/config';
import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";

// 保持不变的类型定义
interface AppVariables { userAddress: string | undefined; }
interface AppEnv { Bindings: {}; Variables: AppVariables; }
type AppContext = Context<AppEnv>;

const app = new Hono<AppEnv>();
const PORT = 3002;

if (!process.env.THIRDWEB_CLIENT_ID || !process.env.THIRDWEB_SECRET_KEY || !process.env.FACILITATOR_WALLET_ADDRESS) {
  console.error("FATAL ERROR: Missing required environment variables (CLIENT_ID, SECRET_KEY, FACILITATOR_WALLET_ADDRESS)");
  process.exit(1);
}

// --- Thirdweb Client & Facilitator Setup ---

const client = createThirdwebClient({
    secretKey: process.env.THIRDWEB_SECRET_KEY!
});

const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: process.env.FACILITATOR_WALLET_ADDRESS!,
});

// --- 资源配置 (定义支付要求) ---
const API_RECEIVER_ADDRESS = process.env.FACILITATOR_WALLET_ADDRESS!;
const RESOURCE_URL = "http://localhost:3002/api/weather";
// 🌟 最终关键修正：将网络 ID 明确指定为 ETH 资产
const RESOURCE_NETWORK = "eip155:11155111|ETH"; // Sepolia Chain ID (11155111) + ETH Asset
const RESOURCE_PRICE = "0.0001 ETH"; // 保持最低价格

// 支付页面的 URL，用于重定向 (请确保文件存在于 /public/ 目录)
const FRONTEND_PAYMENT_URL = "http://localhost:3002/wallet.html";

// --- 静态文件和 CORS 配置 ---
app.use('/*', serveStatic({ root: './public/' }));
app.use('/thirdweb/*', serveStatic({
  root: './node_modules/',
  rewriteRequestPath: (path: string) => path.replace('/thirdweb', '')
}));

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Payment', 'Authorization', 'X-Payment-Message'],
  exposeHeaders: ['x-payment-receipt', 'x-payment-message'],
  credentials: true,
}));

// 明确处理 OPTIONS 请求 (CORS Preflight)
app.options("/api/weather", (c) => {
    return c.text('', 200);
});


// -----------------------------------------------------
// 核心逻辑：使用 settlePayment 处理 x402 协议
// -----------------------------------------------------

app.all("/api/weather", async (c: AppContext) => {
  const method = c.req.method;
  const acceptHeader = c.req.header("Accept") || "";

  const paymentSignature = c.req.header("x-payment");
  const paymentMessage = c.req.header("x-payment-message");

  // 调试日志：打印提交的签名信息
  if (paymentSignature) {
      console.log(`\n--- RECEIVED POST REQUEST ---`);
      console.log(`Signature (X-Payment): ${paymentSignature.slice(0, 10)}...${paymentSignature.slice(-10)}`);
      console.log(`Signed Message (X-Payment-Message): ${paymentMessage}`);
      console.log(`-------------------------------\n`);
  }

  try {
    // 1. 调用 settlePayment 处理所有情况
    const result = await settlePayment({
      paymentData: paymentSignature,

      resourceUrl: RESOURCE_URL,
      method: method as "GET" | "POST" | "OPTIONS",
      payTo: API_RECEIVER_ADDRESS,
      network: RESOURCE_NETWORK, // 使用修正后的网络定义
      price: RESOURCE_PRICE,
      facilitator: thirdwebFacilitator,
    });

    // 2. 处理 settlePayment 的结果
    if (result.status === 200) {
      console.log(`✅ Access granted. Status 200 returned.`);

      return c.json({
          message: `访问授权成功。`,
          data: { location: "Shanghai", temp: "22°C", condition: "Partly Cloudy", accessMethod: "Valid JWT or Payment Settled" }
      }, 200, result.responseHeaders);

    } else {
      // 402 或其他错误

      // 关键调试：如果状态不是 200，打印整个结果对象
      console.log(`\n==============================================`);
      console.log(`🔴 SETTLEMENT FAILURE DETAILS (Status: ${result.status}):`);
      // 只有在 POST 提交签名时才打印详细错误，否则可能是 GET 请求的正常 402 响应
      if (method === 'POST') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`GET request denied (normal 402 flow).`);
      }
      console.log(`==============================================\n`);

      // 最终修正的重定向条件：
      if (method === "GET" && !c.req.header("x-payment") && !c.req.header("Authorization") && acceptHeader.includes("text/html")) {
          console.log(`⚠️ Navigation request denied. Redirecting user to ${FRONTEND_PAYMENT_URL}`);
          return c.redirect(FRONTEND_PAYMENT_URL, 302);
      }

      // 如果是 POST 请求，或 JavaScript 的 Fetch 请求，则返回 402
      console.log(`❌ Access denied. Status: ${result.status}`);

      // 手动构造签名消息：resourceUrl|network|payTo|price
      const paymentMessageForClient = `${RESOURCE_URL}|${RESOURCE_NETWORK}|${API_RECEIVER_ADDRESS}|${RESOURCE_PRICE}`;

      const responseHeaders = result.responseHeaders as Record<string, string>;

      // 强制设置 X-Payment-Message 头部
      responseHeaders['x-payment-message'] = paymentMessageForClient;
      console.log(`✅ X-Payment-Message set for API call: ${paymentMessageForClient}`);

      const responseBody = {
          message: "Payment Required. Please sign the X-Payment-Message and submit via POST.",
          paymentMessage: paymentMessageForClient
      };

      // Hono 返回 402 响应
      return c.json(
          responseBody,
          result.status,
          responseHeaders
      );
    }
  } catch (error) {
      // 备用错误捕获：如果 settlePayment 确实抛出异常
      console.error(`\n==============================================`);
      console.error(`🔴 CRITICAL SETTLEMENT EXCEPTION:`);
      console.error(error);
      console.error(`==============================================\n`);

      // 仍然返回 402 给前端
      return c.json({
          message: "Payment Required. Settlement failed internally due to exception. See server logs for details.",
          paymentMessage: `${RESOURCE_URL}|${RESOURCE_NETWORK}|${API_RECEIVER_ADDRESS}|${RESOURCE_PRICE}`
      }, 402, {
          'x-payment-message': `${RESOURCE_URL}|${RESOURCE_NETWORK}|${API_RECEIVER_ADDRESS}|${RESOURCE_PRICE}`
      });
  }
});


// 启动服务
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
});

export default app;
