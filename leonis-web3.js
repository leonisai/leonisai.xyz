// ============================================================================
// Leonis AI — Web3 core module
// Real wallet connection (injected + WalletConnect v2), SIWE authentication,
// AI-driven Text-to-Transaction, transaction building/signing and error handling.
//
// This is a browser ES module. Import it from a page served over http(s):
//   import { Leonis } from './leonis-web3.js';
// dApps do not work from file:// — run e.g.  python3 -m http.server  in /front.
// ============================================================================

import { ethers } from 'https://esm.sh/ethers@6.13.4';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// Paste your WalletConnect Cloud projectId here (https://cloud.reown.com).
// MetaMask / injected wallets work without it; WalletConnect requires it.
export const WALLETCONNECT_PROJECT_ID = '6ffb8e589b4d91540161e2a8a07068d1';

export const CHAINGPT_ENDPOINT = 'https://api.chaingpt.org/chat/stream';
export const CHAINGPT_KEY = '09d5a032-98f9-40cb-9edb-d5c69d09006c';

const SESSION_KEY = 'leonis_session';
const HISTORY_KEY = 'leonis_tx_history';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24h

// Chains we recognise (id → metadata). Transactions run on whatever chain the
// connected wallet is on; this table is used for names, explorers, native asset
// and token resolution.
export const CHAINS = {
    1:        { name: 'Ethereum',    native: 'ETH',   explorer: 'https://etherscan.io',            ens: true  },
    8453:     { name: 'Base',        native: 'ETH',   explorer: 'https://basescan.org',            ens: false },
    42161:    { name: 'Arbitrum One',native: 'ETH',   explorer: 'https://arbiscan.io',             ens: false },
    137:      { name: 'Polygon',     native: 'MATIC', explorer: 'https://polygonscan.com',         ens: false },
    10:       { name: 'OP Mainnet',  native: 'ETH',   explorer: 'https://optimistic.etherscan.io', ens: false },
    11155111: { name: 'Sepolia',     native: 'ETH',   explorer: 'https://sepolia.etherscan.io',    ens: true  },
};

// Canonical ERC-20 addresses per chain (symbol → { address, decimals }).
export const TOKENS = {
    1: {
        USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
        DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
        WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
        WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    },
    8453: {
        USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
        DAI:  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
        WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    },
    42161: {
        USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
        USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
        DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
        WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
        WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    },
    137: {
        USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
        USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
        DAI:  { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
        WBTC: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
        WETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    },
    10: {
        USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
        USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
        DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
        WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    },
};

const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────
export class LeonisError extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = 'LeonisError'; }
}
function mapError(e) {
    if (e instanceof LeonisError) return e;
    const code = e && (e.code || (e.info && e.info.error && e.info.error.code));
    const msg = (e && (e.shortMessage || e.message)) || String(e);
    if (code === 4001 || code === 'ACTION_REJECTED' || /user rejected|user denied/i.test(msg))
        return new LeonisError('REJECTED', 'You rejected the request in your wallet.');
    if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(msg))
        return new LeonisError('INSUFFICIENT_FUNDS', 'Insufficient balance to cover the amount plus gas.');
    if (code === 'CALL_EXCEPTION' || /revert|execution reverted/i.test(msg))
        return new LeonisError('REVERTED', 'The transaction reverted on-chain.');
    if (code === 'NETWORK_ERROR' || /network|failed to fetch|rpc/i.test(msg))
        return new LeonisError('RPC_ERROR', 'Network / RPC error — please try again.');
    return new LeonisError('UNKNOWN', msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION STATE (live, per page-load)
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    method: null,        // 'injected' | 'walletconnect'
    eip1193: null,       // raw EIP-1193 provider
    provider: null,      // ethers BrowserProvider
    signer: null,
    address: null,
    chainId: null,       // number
};
const listeners = { change: [], disconnect: [] };
export function on(event, cb) { (listeners[event] || (listeners[event] = [])).push(cb); }
function emit(event, payload) { (listeners[event] || []).forEach(cb => { try { cb(payload); } catch (_) {} }); }

export function getState() {
    return { method: state.method, address: state.address, chainId: state.chainId, connected: !!state.address };
}
export function chainMeta(id) { return CHAINS[Number(id)] || { name: 'Chain ' + id, native: 'ETH', explorer: null, ens: false }; }
export function explorerTx(hash, chainId) {
    const c = chainMeta(chainId || state.chainId);
    return c.explorer ? c.explorer + '/tx/' + hash : null;
}
export function explorerAddr(addr, chainId) {
    const c = chainMeta(chainId || state.chainId);
    return c.explorer ? c.explorer + '/address/' + addr : null;
}

function getInjected() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (Array.isArray(eth.providers) && eth.providers.length) {
        return eth.providers.find(p => p.isMetaMask) || eth.providers[0];
    }
    return eth;
}
export function hasInjected() { return !!getInjected(); }

async function adopt(eip1193, method) {
    state.eip1193 = eip1193;
    state.method = method;
    state.provider = new ethers.BrowserProvider(eip1193, 'any');
    state.signer = await state.provider.getSigner();
    state.address = ethers.getAddress(await state.signer.getAddress());
    state.chainId = Number((await state.provider.getNetwork()).chainId);
    wireProviderEvents(eip1193);
    return getState();
}

let wired = null;
function wireProviderEvents(eip1193) {
    if (wired === eip1193 || !eip1193.on) return;
    wired = eip1193;
    eip1193.on('accountsChanged', async (accounts) => {
        if (!accounts || accounts.length === 0) { await disconnect(); return; }
        state.address = ethers.getAddress(accounts[0]);
        try { state.signer = await state.provider.getSigner(); } catch (_) {}
        emit('change', getState());
    });
    eip1193.on('chainChanged', async () => {
        try {
            state.provider = new ethers.BrowserProvider(eip1193, 'any');
            state.signer = await state.provider.getSigner();
            state.chainId = Number((await state.provider.getNetwork()).chainId);
        } catch (_) {}
        emit('change', getState());
    });
    eip1193.on('disconnect', async () => { await disconnect(); });
}

// ─── Connect: injected ───
export async function connectInjected() {
    const eth = getInjected();
    if (!eth) throw new LeonisError('NO_WALLET', 'No browser wallet detected. Install MetaMask or use WalletConnect.');
    try {
        await eth.request({ method: 'eth_requestAccounts' });
    } catch (e) { throw mapError(e); }
    return adopt(eth, 'injected');
}

// ─── Connect: WalletConnect v2 (loaded on demand) ───
let wcProviderPromise = null;
async function initWalletConnect() {
    if (WALLETCONNECT_PROJECT_ID === '6ffb8e589b4d91540161e2a8a07068d1' || !WALLETCONNECT_PROJECT_ID) {
        throw new LeonisError('WC_NOT_CONFIGURED',
            'WalletConnect is not configured. Add your projectId to leonis-web3.js (WALLETCONNECT_PROJECT_ID).');
    }
    if (!wcProviderPromise) {
        wcProviderPromise = (async () => {
            const { EthereumProvider } = await import('https://esm.sh/@walletconnect/ethereum-provider@2.17.2');
            return EthereumProvider.init({
                projectId: WALLETCONNECT_PROJECT_ID,
                chains: [1],
                optionalChains: [8453, 42161, 137, 10, 11155111],
                showQrModal: true,
                metadata: {
                    name: 'Leonis AI',
                    description: 'AI crypto transaction assistant',
                    url: window.location.origin,
                    icons: [window.location.origin + '/IMG_6805.PNG'],
                },
            });
        })();
    }
    return wcProviderPromise;
}

export async function connectWalletConnect() {
    let wc;
    try { wc = await initWalletConnect(); }
    catch (e) { throw mapError(e); }
    try {
        if (!wc.session) await wc.connect();
    } catch (e) { throw mapError(e); }
    wc.on('disconnect', () => { disconnect(); });
    return adopt(wc, 'walletconnect');
}

// ─── Eager reconnect (no prompts) ───
export async function eagerReconnect() {
    const sess = getSession();
    if (!sess) return null;
    try {
        if (sess.method === 'injected') {
            const eth = getInjected();
            if (!eth) return null;
            const accounts = await eth.request({ method: 'eth_accounts' });
            if (!accounts || !accounts.length) return null;
            const st = await adopt(eth, 'injected');
            return st.address.toLowerCase() === sess.address.toLowerCase() ? st : null;
        }
        if (sess.method === 'walletconnect') {
            if (WALLETCONNECT_PROJECT_ID === '6ffb8e589b4d91540161e2a8a07068d1') return null;
            const wc = await initWalletConnect();
            if (!wc.session) return null;
            wc.on('disconnect', () => { disconnect(); });
            const st = await adopt(wc, 'walletconnect');
            return st.address.toLowerCase() === sess.address.toLowerCase() ? st : null;
        }
    } catch (_) { return null; }
    return null;
}

export async function disconnect() {
    try {
        if (state.method === 'walletconnect' && state.eip1193 && state.eip1193.disconnect) {
            await state.eip1193.disconnect();
        }
    } catch (_) {}
    state.method = state.eip1193 = state.provider = state.signer = state.address = state.chainId = null;
    clearSession();
    emit('disconnect', null);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIWE AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────
function randomNonce() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

function buildSiweMessage({ address, chainId, nonce, issuedAt }) {
    const domain = window.location.host || 'leonis.ai';
    const uri = window.location.origin || 'https://leonis.ai';
    return [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        '',
        'Sign in to Leonis AI. This request will not trigger a blockchain transaction or cost any gas.',
        '',
        `URI: ${uri}`,
        'Version: 1',
        `Chain ID: ${chainId}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
    ].join('\n');
}

// Requires an active connection. Prompts a real personal_sign and verifies it.
export async function signIn() {
    if (!state.signer || !state.address) throw new LeonisError('NOT_CONNECTED', 'Connect a wallet first.');
    const nonce = randomNonce();
    const issuedAt = new Date().toISOString();
    const message = buildSiweMessage({ address: state.address, chainId: state.chainId, nonce, issuedAt });

    let signature;
    try { signature = await state.signer.signMessage(message); }
    catch (e) { throw mapError(e); }

    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== state.address.toLowerCase())
        throw new LeonisError('BAD_SIGNATURE', 'Signature verification failed.');

    const session = {
        address: state.address,
        chainId: state.chainId,
        method: state.method,
        provider: state.method === 'walletconnect' ? 'WalletConnect' : 'MetaMask',
        signature, message, nonce, issuedAt,
        expiresAt: Date.now() + SESSION_TTL_MS,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
}

export function getSession() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!s || !s.address || !s.signature) return null;
        if (s.expiresAt && Date.now() > s.expiresAt) { clearSession(); return null; }
        // integrity: signature must still recover to the stored address
        const recovered = ethers.verifyMessage(s.message, s.signature);
        if (recovered.toLowerCase() !== s.address.toLowerCase()) { clearSession(); return null; }
        return s;
    } catch (_) { return null; }
}
export function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} }
export function isAuthenticated() { return !!getSession(); }

// ─────────────────────────────────────────────────────────────────────────────
// WALLET INFO (real chain reads)
// ─────────────────────────────────────────────────────────────────────────────
export async function getNativeBalance() {
    if (!state.provider || !state.address) return null;
    const wei = await state.provider.getBalance(state.address);
    return { wei, formatted: ethers.formatEther(wei), symbol: chainMeta(state.chainId).native };
}
export async function resolveEnsName() {
    if (!state.provider || !state.address || !chainMeta(state.chainId).ens) return null;
    try { return await state.provider.lookupAddress(state.address); } catch (_) { return null; }
}
export function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

// ─────────────────────────────────────────────────────────────────────────────
// AI — structured Text-to-Transaction intent
// ─────────────────────────────────────────────────────────────────────────────
const TX_SYSTEM_PROMPT =
`You are Leonis AI, a crypto transaction assistant.
Rules:
- Your name is Leonis AI. Never say you are ChatGPT or OpenAI.
Classify the user's message:
- If it requests an on-chain action (send/transfer, swap, bridge, stake), reply with ONLY a compact single-line JSON object and NOTHING else, using only the relevant keys:
{"action":"transfer|swap|bridge|stake","amount":"<number or all>","token":"<SYMBOL>","tokenIn":"<SYMBOL>","tokenOut":"<SYMBOL>","to":"<address or ENS>","chain":"<chain name>"}
- If it is an informational or general question, answer normally in plain text with NO JSON.`;

export async function askAi(userMessage) {
    const res = await fetch(CHAINGPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + CHAINGPT_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'general_assistant',
            question: TX_SYSTEM_PROMPT + '\n\nUser message:\n' + userMessage,
            chatHistory: 'off',
        }),
    });
    if (!res.ok) throw new LeonisError('AI_ERROR', 'AI request failed (' + res.status + ').');
    let text = (await res.text()) || '';
    text = text.replace(/ChatGPT/gi, 'Leonis AI').replace(/OpenAI Assistant/gi, 'Leonis AI').replace(/OpenAI/gi, 'Leonis AI');
    return text;
}

function extractJson(text) {
    // find the first balanced {...} block and try to parse it
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) {
            const slice = text.slice(start, i + 1);
            try { return JSON.parse(slice); } catch (_) { return null; }
        } }
    }
    return null;
}

// Deterministic fallback so the workflow is resilient if the model returns prose.
const KNOWN_SYMBOLS = ['ETH','WETH','USDC','USDT','DAI','WBTC','MATIC','POL','ARB','OP','LINK','UNI','AAVE'];
function localParse(text) {
    const lower = text.toLowerCase();
    const words = text.trim().split(/\s+/);
    const amountMatch = text.match(/\b\d+(?:[.,]\d+)?\b/);
    const amount = /\ball\b/.test(lower) ? 'all' : (amountMatch ? amountMatch[0].replace(',', '.') : null);
    const symUp = (w) => w.toUpperCase().replace(/[^A-Z]/g, '');
    const findSym = (exclude) => { for (const w of words) { const u = symUp(w); if (KNOWN_SYMBOLS.includes(u) && u !== exclude) return u; } return null; };

    if (/\bswap\b|\bconvert\b|\btrade\b/.test(lower)) {
        const m = lower.match(/(?:swap|convert|trade)\s+(?:all|[\d.,]+)?\s*([a-z]+)?\s+(?:to|for|into)\s+([a-z]+)/);
        const tokenIn = (m && m[1] && KNOWN_SYMBOLS.includes(m[1].toUpperCase())) ? m[1].toUpperCase() : (findSym() || null);
        const tokenOut = (m && m[2] && KNOWN_SYMBOLS.includes(m[2].toUpperCase())) ? m[2].toUpperCase() : null;
        return { action: 'swap', amount, tokenIn, tokenOut };
    }
    if (/\bbridge\b/.test(lower)) {
        const chain = Object.values(CHAINS).map(c => c.name).find(n => lower.includes(n.toLowerCase()));
        return { action: 'bridge', amount, token: findSym(), chain };
    }
    if (/\bstake\b|\bdeposit\b/.test(lower)) return { action: 'stake', amount, token: findSym() };
    if (/\bsend\b|\btransfer\b|\bpay\b/.test(lower)) {
        let to = null; const ti = words.findIndex(w => w.toLowerCase() === 'to');
        if (ti >= 0 && words[ti + 1]) { to = words[ti + 1].replace(/[.,!?]$/, ''); if (KNOWN_SYMBOLS.includes(symUp(to))) to = words[ti + 2] || null; }
        return { action: 'transfer', amount, token: findSym() || 'ETH', to };
    }
    return null;
}

// Returns { kind: 'info', text } OR { kind: 'intent', intent, aiText }
export async function interpret(userMessage) {
    const aiText = await askAi(userMessage);
    let intent = extractJson(aiText);
    if (!intent || !intent.action) intent = localParse(userMessage);
    if (!intent || !intent.action) return { kind: 'info', text: aiText };
    // normalise
    if (intent.action === 'send') intent.action = 'transfer';
    intent.action = String(intent.action).toLowerCase();
    return { kind: 'intent', intent, aiText };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION + TRANSACTION BUILD/SEND (transfers real; others honestly gated)
// ─────────────────────────────────────────────────────────────────────────────
function tokenOnChain(symbol, chainId) {
    if (!symbol) return null;
    const s = symbol.toUpperCase();
    const native = chainMeta(chainId).native;
    if (s === native || (s === 'ETH' && native === 'ETH')) return { native: true, symbol: native, decimals: 18 };
    const reg = TOKENS[Number(chainId)];
    if (reg && reg[s]) return { native: false, symbol: s, address: reg[s].address, decimals: reg[s].decimals };
    return null;
}

// Validates an intent against the connected chain. Throws LeonisError on problems.
// Returns a normalised, ready-to-build plan.
export async function validate(intent) {
    if (!state.address) throw new LeonisError('NOT_CONNECTED', 'Wallet is not connected.');
    const chainId = state.chainId;
    const cmeta = chainMeta(chainId);

    if (['swap', 'bridge', 'stake'].includes(intent.action)) {
        throw new LeonisError('UNSUPPORTED_ACTION',
            `${intent.action[0].toUpperCase() + intent.action.slice(1)} isn't available yet — no router is configured for ${cmeta.name}. Sending ETH and ERC-20 tokens is fully supported.`);
    }
    if (intent.action !== 'transfer')
        throw new LeonisError('BAD_INTENT', "I couldn't recognise that as a supported transaction.");

    // amount
    if (!intent.amount || intent.amount === 'all')
        throw new LeonisError('BAD_AMOUNT', "Please specify an exact amount to send (e.g. \"Send 0.05 ETH to …\").");
    const amountNum = Number(intent.amount);
    if (!isFinite(amountNum) || amountNum <= 0)
        throw new LeonisError('BAD_AMOUNT', 'The amount must be a positive number.');

    // token on this chain
    const tok = tokenOnChain(intent.token || 'ETH', chainId);
    if (!tok)
        throw new LeonisError('UNSUPPORTED_TOKEN', `${(intent.token || '').toUpperCase() || 'That token'} isn't supported on ${cmeta.name}.`);

    // recipient (address or ENS)
    let to = intent.to;
    if (!to) throw new LeonisError('NO_RECIPIENT', 'No recipient address was provided.');
    to = String(to).trim();
    if (!ethers.isAddress(to)) {
        if (/\.eth$/i.test(to) && cmeta.ens) {
            const resolved = await state.provider.resolveName(to).catch(() => null);
            if (!resolved) throw new LeonisError('INVALID_ADDRESS', `Could not resolve ENS name "${to}".`);
            to = resolved;
        } else {
            throw new LeonisError('INVALID_ADDRESS', `"${to}" is not a valid address${cmeta.ens ? ' or ENS name' : ''}.`);
        }
    }
    to = ethers.getAddress(to);

    return { action: 'transfer', chainId, chainName: cmeta.name, token: tok, amount: intent.amount, amountNum, to, from: state.address };
}

// Pre-flight: check balance and estimate gas. Throws on insufficient funds / RPC.
export async function preflight(plan) {
    const value = plan.token.native ? ethers.parseEther(plan.amount) : 0n;
    let txReq;
    if (plan.token.native) {
        txReq = { to: plan.to, value };
    } else {
        const iface = new ethers.Interface(ERC20_ABI);
        const amt = ethers.parseUnits(plan.amount, plan.token.decimals);
        txReq = { to: plan.token.address, data: iface.encodeFunctionData('transfer', [plan.to, amt]) };
    }

    // balance checks
    if (plan.token.native) {
        const bal = await state.provider.getBalance(state.address);
        if (bal < value) throw new LeonisError('INSUFFICIENT_FUNDS', `Insufficient ${plan.token.symbol}. You have ${ethers.formatEther(bal)}.`);
    } else {
        const c = new ethers.Contract(plan.token.address, ERC20_ABI, state.provider);
        const bal = await c.balanceOf(state.address);
        const amt = ethers.parseUnits(plan.amount, plan.token.decimals);
        if (bal < amt) throw new LeonisError('INSUFFICIENT_FUNDS', `Insufficient ${plan.token.symbol}. You have ${ethers.formatUnits(bal, plan.token.decimals)}.`);
    }

    // gas estimate
    let gas, feeData;
    try {
        gas = await state.provider.estimateGas({ ...txReq, from: state.address });
        feeData = await state.provider.getFeeData();
    } catch (e) { throw mapError(e); }
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
    const gasCostWei = gas * gasPrice;

    return { txReq, gas, gasPrice, gasCostFormatted: ethers.formatEther(gasCostWei), gasCostWei };
}

// Sends the transaction — triggers the wallet signature prompt. Returns tx response.
export async function send(plan) {
    if (!state.signer) throw new LeonisError('NOT_CONNECTED', 'Wallet is not connected.');
    const value = plan.token.native ? ethers.parseEther(plan.amount) : 0n;
    let txReq;
    if (plan.token.native) {
        txReq = { to: plan.to, value };
    } else {
        const iface = new ethers.Interface(ERC20_ABI);
        const amt = ethers.parseUnits(plan.amount, plan.token.decimals);
        txReq = { to: plan.token.address, data: iface.encodeFunctionData('transfer', [plan.to, amt]) };
    }
    try {
        return await state.signer.sendTransaction(txReq);
    } catch (e) { throw mapError(e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TX HISTORY (real, persisted by hash)
// ─────────────────────────────────────────────────────────────────────────────
export function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
}
export function saveHistoryEntry(entry) {
    const list = loadHistory();
    list.unshift(entry);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch (_) {}
    return list;
}
export function updateHistoryStatus(hash, patch) {
    const list = loadHistory();
    const i = list.findIndex(e => e.hash === hash);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (_) {} }
    return list;
}

export const Leonis = {
    // config
    WALLETCONNECT_PROJECT_ID, CHAINS, TOKENS,
    // connection
    connectInjected, connectWalletConnect, eagerReconnect, disconnect,
    hasInjected, getState, on, chainMeta, explorerTx, explorerAddr,
    // auth
    signIn, getSession, clearSession, isAuthenticated,
    // info
    getNativeBalance, resolveEnsName, shortAddr,
    // tx
    interpret, askAi, validate, preflight, send,
    // history
    loadHistory, saveHistoryEntry, updateHistoryStatus,
    // errors
    LeonisError,
};
export default Leonis;
