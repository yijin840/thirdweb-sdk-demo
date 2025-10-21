// // index.ts (主启动文件 - 只负责导入和启动 Hono 应用)
//
// import { serve } from "@hono/node-server";
// // 导入 third_web.ts 中定义的 Hono 应用
// import app from "./third_web.js";
//
// // --- 常量 ---
// const PORT = 3002;
//
// // =======================================================
// // 服务器启动逻辑
// // =======================================================
//
// if (app && app.fetch) {
//     console.log("=".repeat(50));
//     console.log("🚀 x402 Payment Server Starting...");
//
//     serve({ fetch: app.fetch, port: PORT }, (info) => {
//         console.log("=".repeat(50));
//         console.log(`🎉 Server is running! Listening on http://localhost:${info.port}`);
//         console.log(`Protected API: http://localhost:${info.port}/api/weather`);
//         console.log(`Front-end: http://localhost:${info.port}/`);
//         console.log("=".repeat(50));
//         console.log("\n✅ Ready to accept payments!\n");
//     });
// } else {
//     console.error("Error: Could not import Hono application from third_web.ts. Check if it exports 'app'.");
// }