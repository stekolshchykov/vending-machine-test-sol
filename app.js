// ===== VERSION =====
const CUPCAKE_DAPP_VERSION = "2025-12-03-metaMaskGas-v3-ethersWait";
console.log("Cupcake DApp JS version:", CUPCAKE_DAPP_VERSION);

// ===== CONSTANTS =====
const CONTRACT_ADDRESS = "0xEFEDC7325119dBE632FD89A086e3DA1Aa2Ba2b90";

const CONTRACT_ABI = [
    {
        name: "giveCupcakeTo",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "userAddress", type: "address" }],
        outputs: [{ type: "bool" }]
    },
    {
        name: "getCupcakeBalanceFor",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "userAddress", type: "address" }],
        outputs: [{ type: "uint256" }]
    }
];

const ARBITRUM_SEPOLIA_CHAIN_ID_HEX = "0x66eee"; // 421614

// ===== STATE =====
let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;
let isSendingTx = false;   // блок повторов

const iface = new ethers.Interface(CONTRACT_ABI);

// ===== DOM ELEMENTS =====
const connectButton = document.getElementById("connectButton");
const giveButton = document.getElementById("giveButton");
const refreshButton = document.getElementById("refreshButton");
const accountEl = document.getElementById("account");
const balanceEl = document.getElementById("balance");
const ethBalanceEl = document.getElementById("ethBalance");
const networkEl = document.getElementById("network");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const debugLogEl = document.getElementById("debugLog");

// ===== LOGGING =====
function appendDebug(message, data) {
    const time = new Date().toISOString().split("T")[1].split(".")[0]; // HH:MM:SS
    let line = `[${time}] ${message}`;
    if (data !== undefined) {
        try {
            line += " " + JSON.stringify(data, null, 2);
        } catch (_) {
            line += " " + String(data);
        }
    }
    console.log("DEBUG:", message, data ?? "");
    debugLogEl.textContent = (line + "\n" + debugLogEl.textContent).slice(0, 8000);
}

function setStatus(message) {
    statusEl.textContent = message || "";
    if (message) appendDebug("STATUS", message);
}

function setError(message) {
    errorEl.textContent = message || "";
    if (message) appendDebug("ERROR", message);
}

function setButtonsEnabled(connected) {
    // connectButton всегда активна
    giveButton.disabled = !connected || isSendingTx;
    refreshButton.disabled = !connected || isSendingTx;
}

// ===== NETWORK / BALANCES =====
async function ensureArbitrumSepolia() {
    const ethereum = window.ethereum;
    if (!ethereum) {
        throw new Error("MetaMask not found. Please install it.");
    }

    const currentChainId = await ethereum.request({ method: "eth_chainId" });
    appendDebug("Current chainId", currentChainId);

    if (currentChainId === ARBITRUM_SEPOLIA_CHAIN_ID_HEX) {
        return;
    }

    try {
        appendDebug("Trying wallet_switchEthereumChain to Arbitrum Sepolia");
        await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ARBITRUM_SEPOLIA_CHAIN_ID_HEX }]
        });
    } catch (switchError) {
        appendDebug("wallet_switchEthereumChain error", {
            code: switchError.code,
            message: switchError.message
        });
        if (switchError.code === 4902) {
            appendDebug("Trying wallet_addEthereumChain Arbitrum Sepolia");
            await ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId: ARBITRUM_SEPOLIA_CHAIN_ID_HEX,
                        chainName: "Arbitrum Sepolia",
                        nativeCurrency: {
                            name: "Ether",
                            symbol: "ETH",
                            decimals: 18
                        },
                        rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
                        blockExplorerUrls: ["https://sepolia.arbiscan.io/"]
                    }
                ]
            });
        } else {
            throw switchError;
        }
    }
}

async function loadEthBalance() {
    if (!provider || !currentAccount) return;
    try {
        appendDebug("loadEthBalance: start", { account: currentAccount });
        const balanceWei = await provider.getBalance(currentAccount);
        const balanceEth = ethers.formatEther(balanceWei);
        ethBalanceEl.textContent = balanceEth + " ETH";
        appendDebug("ETH balance", {
            account: currentAccount,
            balanceWei: balanceWei.toString(),
            balanceEth
        });
    } catch (err) {
        console.error("loadEthBalance error:", err);
        setError("ETH balance error: " + normalizeError(err));
    }
}

async function loadCupcakeBalance() {
    if (!contract || !currentAccount) return;
    try {
        appendDebug("loadCupcakeBalance: start", { account: currentAccount });
        const balance = await contract.getCupcakeBalanceFor(currentAccount);
        balanceEl.textContent = balance.toString();
        appendDebug("Cupcake balance", {
            account: currentAccount,
            balance: balance.toString()
        });
    } catch (err) {
        console.error("loadCupcakeBalance error:", err);
        setError("Cupcake balance error: " + normalizeError(err));
    }
}

async function loadAllBalances() {
    await Promise.all([loadEthBalance(), loadCupcakeBalance()]);
}

// ===== CONNECT =====
async function connectWallet() {
    setError("");
    setStatus("Connecting to MetaMask...");

    if (!window.ethereum) {
        setStatus("");
        setError("MetaMask is not installed.");
        return;
    }

    try {
        appendDebug("connectWallet: start");
        await ensureArbitrumSepolia();

        const ethereum = window.ethereum;
        const accounts = await ethereum.request({ method: "eth_requestAccounts" });
        appendDebug("eth_requestAccounts result", accounts);

        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts returned by MetaMask.");
        }

        currentAccount = accounts[0];
        accountEl.textContent = currentAccount;

        provider = new ethers.BrowserProvider(ethereum);
        signer = await provider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        const network = await provider.getNetwork();
        const netInfo = {
            chainId: network.chainId.toString(),
            name: network.name
        };
        networkEl.textContent = `${netInfo.name} (chainId: ${netInfo.chainId})`;
        appendDebug("Network info", netInfo);

        isSendingTx = false;
        setButtonsEnabled(true);

        setStatus("Connected. Loading balances...");
        await loadAllBalances();
        setStatus("Ready.");
    } catch (err) {
        console.error("connectWallet error:", err);
        setStatus("");
        setError(normalizeError(err));
        isSendingTx = false;
        setButtonsEnabled(false);
    }
}

// ===== TRANSACTION (через contract.giveCupcakeTo) =====
async function giveMeCupcake() {
    if (!contract || !currentAccount) {
        setError("Connect wallet first.");
        return;
    }

    if (!window.ethereum) {
        setError("window.ethereum not found.");
        return;
    }

    if (isSendingTx) {
        setError("Previous transaction is still pending. Please wait.");
        return;
    }

    setError("");
    setStatus("Preparing transaction...");
    isSendingTx = true;
    setButtonsEnabled(true);

    try {
        appendDebug("giveMeCupcake: start", { account: currentAccount });

        // 1) Симуляция (staticCall)
        setStatus("Simulating transaction (staticCall)...");
        try {
            await contract.giveCupcakeTo.staticCall(currentAccount);
            appendDebug("giveCupcakeTo.staticCall OK", { account: currentAccount });
        } catch (simErr) {
            console.error("staticCall error:", simErr);
            const simMsg = "Simulation failed: " + normalizeError(simErr);
            setStatus("Transaction simulation failed");
            setError(simMsg);
            appendDebug("Simulation failed", simMsg);
            return;
        }

        // 2) Отправка через ethers + MetaMask
        setStatus("Sending transaction via ethers + MetaMask...");
        let tx;
        try {
            tx = await contract.giveCupcakeTo(currentAccount);
        } catch (sendErr) {
            // сюда попадём, если MetaMask вернул ошибку (в т.ч. -32603) на этапе send
            appendDebug("contract.giveCupcakeTo send error", sendErr);
            setStatus("Transaction send failed (MetaMask / RPC error)");
            setError(normalizeError(sendErr));
            return;
        }

        appendDebug("Tx sent", {
            hash: tx.hash,
            from: tx.from,
            to: tx.to
        });
        setStatus("Tx sent: " + tx.hash + "\nWaiting for 1 confirmation...");

        // 3) Ждём 1 подтверждение (стандартно)
        let receipt;
        try {
            // ethers v6: tx.wait(confirmations?)
            receipt = await tx.wait(1);
        } catch (waitErr) {
            appendDebug("tx.wait error/timeout", waitErr);
            setStatus("Confirmation error/timeout. Check in block explorer.");
            setError("tx.wait error: " + normalizeError(waitErr));
            return;
        }

        if (!receipt) {
            appendDebug("tx.wait returned null", null);
            setStatus("Unknown transaction status. Check explorer.");
            setError("Transaction status is unknown (no receipt).");
            return;
        }

        appendDebug("Tx confirmed", {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber,
            status: receipt.status
        });

        if (receipt.status !== 1n && receipt.status !== 1) {
            setStatus("Transaction reverted on-chain.");
            setError("Transaction status is not successful (status != 1).");
            return;
        }

        setStatus("Confirmed in block " + receipt.blockNumber + ". Updating balances...");
        await loadAllBalances();
        setStatus("Cupcake received 🎉");
    } catch (err) {
        console.error("giveMeCupcake outer error:", err);
        const msg = normalizeError(err);
        setStatus("Transaction failed (unexpected error)");
        setError(msg);
        appendDebug("giveMeCupcake error normalized", msg);
    } finally {
        isSendingTx = false;
        setButtonsEnabled(true);
    }
}

// ===== ERROR NORMALIZATION =====
function normalizeError(err) {
    try {
        if (!err) return "Unknown error.";
        if (typeof err === "string") return err;

        const code =
            err.code ||
            (err.error && err.error.code) ||
            (err.info && err.info.error && err.info.error.code) ||
            "UNKNOWN";

        const msgCandidates = [
            err.reason,
            err.shortMessage,
            err.info && err.info.error && err.info.error.message,
            err.error && err.error.message,
            err.data && err.data.message,
            err.message
        ].filter(Boolean);

        const msg = msgCandidates[0] || "Unknown RPC error";

        return `[${code}] ${msg}`;
    } catch (e) {
        return "Failed to parse error: " + String(e);
    }
}

// ===== EVENT LISTENERS =====
connectButton.addEventListener("click", connectWallet);
giveButton.addEventListener("click", giveMeCupcake);
refreshButton.addEventListener("click", loadAllBalances);

if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
        appendDebug("accountsChanged", accounts);
        if (!accounts || accounts.length === 0) {
            currentAccount = null;
            accountEl.textContent = "Not connected";
            balanceEl.textContent = "—";
            ethBalanceEl.textContent = "—";
            networkEl.textContent = "—";
            isSendingTx = false;
            setButtonsEnabled(false);
            setStatus("");
            setError("");
            return;
        }
        currentAccount = accounts[0];
        accountEl.textContent = currentAccount;
        loadAllBalances();
    });

    window.ethereum.on("chainChanged", (chainId) => {
        appendDebug("chainChanged", chainId);
        window.location.reload();
    });
}

appendDebug("Page loaded, DApp script initialised");
