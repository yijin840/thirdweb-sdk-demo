// frontend/main.ts - 前端逻辑代码
import { wrapFetchWithPayment } from "thirdweb/x402";
import { createThirdwebClient } from "thirdweb";
import { createWallet } from "thirdweb/wallets";
import { sepolia } from "thirdweb/chains";

// 声明全局 Window 接口
declare global {
    interface Window {
        startPayment: () => Promise<void>;
    }
}

// 全局暴露给 HTML 调用
window.startPayment = async () => {
    const result = document.getElementById('result') as HTMLElement;
    const startTime = new Date();
    console.log(`操作开始时间: ${startTime.toLocaleString()}`);

    result.textContent = '获取配置中...';
    let walletAddress: string | undefined; // 声明 walletAddress 以便在 catch 块中使用

    try {
        // 1. 获取 Client ID
        console.log('📡 获取配置...');
        const configResponse = await fetch('/api/config');
        if (!configResponse.ok) {
            throw new Error(`获取配置失败: ${configResponse.status}`);
        }
        const { clientId } = await configResponse.json();
        console.log('✅ 配置获取成功');

        // 2. 创建 thirdweb 客户端
        const client = createThirdwebClient({ clientId });

        result.textContent = '连接钱包中...';

        // 3. 创建钱包并连接（会唤起 MetaMask）
        console.log('💼 开始连接钱包...');
        const wallet = createWallet("io.metamask");

        // Connect returns the account object
        const account = await wallet.connect({ client });
        walletAddress = account?.address; // 存储钱包地址

        console.log('✅ 钱包连接成功');

        const displayAddress = walletAddress
            ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
            : "未知地址";

        // 在连接成功后立即显示地址
        result.textContent = `钱包已连接 (${displayAddress})\n切换网络中...`;

        // 4. 切换到 Sepolia 测试网
        await wallet.switchChain(sepolia);
        console.log('✅ 已切换到 Sepolia 网络');

        result.textContent = `钱包已连接 (${displayAddress})，发起支付请求...`;

        // 5. 创建支付请求封装器
        const fetchWithPay = wrapFetchWithPayment(
            fetch,
            client,
            wallet,
            BigInt(100_000) // 最大支付金额 0.01 USDC
        );

        // 6. 发起支付请求
        const API_URL = "http://localhost:3005/api/weather";
        console.log(`📡 请求: ${API_URL}`);

        const response = await fetchWithPay(API_URL);

        const endTime = new Date();
        const timeElapsedMs = endTime.getTime() - startTime.getTime();
        console.log(`操作结束时间: ${endTime.toLocaleString()}`);
        console.log(`操作耗时: ${timeElapsedMs} 毫秒 (${timeElapsedMs / 1000} 秒)`);

        // 7. 处理响应
        const finalAddressLine = walletAddress ? `连接地址: ${walletAddress}\n` : '';

        if (response.ok) {
            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            console.log("✅ 支付成功，获取到内容:", data);
            result.textContent = `✅ 支付成功！\n${finalAddressLine}\n耗时: ${timeElapsedMs} 毫秒 (${(timeElapsedMs / 1000).toFixed(2)} 秒)\n\n返回数据:\n${JSON.stringify(data, null, 2)}`;
        } else {
            const errorText = await response.text();
            console.error(`❌ 失败 (${response.status}):`, errorText);
            result.textContent = `❌ 请求失败 (${response.status})\n${finalAddressLine}\n耗时: ${timeElapsedMs} 毫秒\n\n错误信息:\n${errorText}`;
        }
    } catch (error: any) {
        const endTime = new Date();
        const timeElapsedMs = endTime.getTime() - startTime.getTime();
        console.error("❌ 错误:", error);

        const finalAddressLine = typeof walletAddress !== 'undefined' && walletAddress ? `\n连接地址: ${walletAddress}` : '';

        result.textContent = `❌ 错误: ${error.message}${finalAddressLine}\n\n耗时: ${timeElapsedMs} 毫秒\n\n请检查:\n1. MetaMask 是否已安装\n2. 钱包是否有足够的 USDC\n3. API 服务器是否正在运行`;
    }
};

console.log('✅ 前端脚本加载完成');
