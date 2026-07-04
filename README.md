# Leonis AI

**Leonis AI** is a Web3 app that connects AI directly to your wallet — chat naturally, describe what you want in plain English, and let Leonis prepare the transaction for you. You stay in control and approve every step.

---

## ✨ Features

- **💬 Chat**
  Free-form conversation with an AI assistant for questions about smart contracts, gas, security, and Web3 in general.

- **⚡ TXT2TXN — Text to Transaction**
  Type a simple sentence, like:
  > "Send 5 USDC to 0xd8dA..."

  Leonis parses your message, builds the transaction, estimates gas, and shows you a clean confirmation card. Nothing is ever sent without your explicit approval.

- **🧾 History**
  A record of every transaction you've signed, with live status (pending / confirmed / failed) and a direct link to the block explorer.

- **⚙️ Settings**
  Manage your network, view session details, and adjust display preferences — all stored locally in your browser.

- **🔐 Wallet Connection**
  Secure sign-in with your wallet, session management, and one-click disconnect.

---

## 🛠 Tech Stack

- Plain HTML / CSS / JavaScript (no heavy framework)
- Wallet interactions handled through the `leonis-web3.js` module
- Fully responsive design — a smooth experience on both desktop and mobile

---

## 🚀 Getting Started

1. Clone or download the project.
2. Open `wallet.html` and connect your wallet.
3. Head to `app.html` and use the Chat, TXT2TXN, History, and Settings tabs.

> No build step or installation required — just serve the files with any simple web server, or open them directly in your browser.

---

## ⚠️ Security Note

Transactions created through TXT2TXN are **real and on-chain**. Always double-check the recipient address and amount before approving in your wallet.

---

<p align="center">Built with ❤️ for the Web3 world</p>
