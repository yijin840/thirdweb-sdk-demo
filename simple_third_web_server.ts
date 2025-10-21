// 服务器代码 (simple_third_web_server.ts)
import {createThirdwebClient} from "thirdweb";
import {facilitator, settlePayment, verifyPayment} from "thirdweb/x402";
import {sepolia} from "thirdweb/chains";
import {Hono} from "hono";
import {cors} from "hono/cors";
import {serve} from "@hono/node-server";
import 'dotenv/config';
import type {Address} from "thirdweb/utils"; // 引入 Address 类型

const app = new Hono();
const PORT = 3004;

const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const THIRDWEB_WALLET_ADDRESS = process.env.THIRDWEB_WALLET_ADDRESS;
const PAY_TO_ADDRESS = process.env.THIRDWEB_WALLET_ADDRESS;
const API_RESOURCE_URL = `http://localhost:${PORT}/api/weather`;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS! as Address;

if (!THIRDWEB_SECRET_KEY || !THIRDWEB_WALLET_ADDRESS) {
    console.error("❌ 缺少必要的环境变量: THIRDWEB_SECRET_KEY 和 FACILITATOR_WALLET_ADDRESS 必须设置!");
    process.exit(1);
}

const client = createThirdwebClient({secretKey: THIRDWEB_SECRET_KEY!});

const thirdwebX402Facilitator = facilitator({
    client,
    serverWalletAddress: THIRDWEB_WALLET_ADDRESS as Address, // 确保类型正确
});


app.use('/api/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Payment', 'Authorization', 'PayTo-Required'],
    credentials: true,
}));

console.log(PAY_TO_ADDRESS)
app.get("/api/weather", async (c) => {
    const paymentData = c.req.header("x-payment");

    console.log(`[${new Date().toISOString()}] 收到请求，X-Payment 头部: ${paymentData ? '存在' : '缺失'}`);

    const paramsArgs = {
        resourceUrl: API_RESOURCE_URL,
        method: "GET",
        paymentData,
        payTo: PAY_TO_ADDRESS as Address, // 确保类型正确
        network: sepolia,
        price: {
            amount: "10000", // 0.01 USDC
            asset: {
                address: USDC_CONTRACT_ADDRESS,
                decimals: 6
            },
        },
        facilitator: thirdwebX402Facilitator,
        routeConfig: {
            description: "Access to premium API content",
            mimeType: "application/json",
            maxTimeoutSeconds: 300,
        },
    };

    try {
        // First verify the payment is valid
        const verifyResult = await verifyPayment(paramsArgs);

        if (verifyResult.status !== 200) {
            return Response.json(verifyResult.responseBody, {
                status: verifyResult.status,
                headers: verifyResult.responseHeaders,
            });
        }

        const result = await settlePayment(paramsArgs);

        if (result.status === 200) {
            console.log("✅ 支付验证成功，返回内容。");
            return c.json(
                {data: "This is the premium content you paid for!"},
                200,
                result.responseHeaders
            );
        } else {
            console.log(`⚠️ 支付要求/失败，返回状态码: ${result.status}`);
            return c.json(
                result.responseBody,
                result.status,
                result.responseHeaders
            );
        }
    } catch (error) {
        console.error("❌ 服务器处理支付时出错:", error);
        return c.json({
            error: "服务器内部错误",
            message: (error as Error).message
        }, 500);
    }
});


console.log(`\n🚀 X402 Facilitator 服务器启动于端口 ${PORT}`);

serve({fetch: app.fetch, port: PORT});
