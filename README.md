# 🌐 MCP Local Search for SillyTavern

**MCP Local Search** is a powerful, native-style SillyTavern extension that brings high-quality local web search and page scraping directly into your AI characters' hands. 

Built with **Playwright**, it achieves full feature parity with the original `bmen25124/SillyTavern-MCP-Client` while offering a more optimized, integrated experience for non-technical users.

---

## ✨ Key Features

- **🎲 Parallel Stealth Search**: Major v1.3.0 architectural shift that randomizes engine order ('Auto' mode) and launches multiple engines in parallel for maximum speed and anti-bot resistance.
- **❄️ Cold-Start Resilience**: Automated "Retry-on-Zero" strategy that warms up browser sessions and retries failed searches immediately.
- **🛡️ Anti-bot Challenge Refinement**: Automated detection, multi-frame polling (8s limit), and redirect sensing (`rdr=1`) for handling complex Bing/Cloudflare challenges reliably.
- **🚀 Autonomous AI Tool Calling**: Characters can automatically search the web and extract content to answer your questions in real-time.
- **🛡️ Clash-Free Architecture**: Fully rebranded to `mcp-local-search` with unique template and CSS names to prevent conflicts with other extensions.
- **🧭 Multi-Engine Support**: Seamlessly orchestrates **Bing**, **DuckDuckGo**, and **Startpage** for the most reliable, high-relevance results.
- **⚡ Ultra-High Quality Exit**: Automatically stops searching as soon as 100% relevance is achieved, saving time and API resources.
- **🎯 Dynamic Waterfall**: You can now choose your preferred engine in the UI, and the search waterfall will dynamically prioritize it.
- **📑 Enhanced Scraper**: Uses a multi-phase waterfall (Axios -> Playwright) to extract clean, readable text from even the most complex websites.
- **📊 Shared Browser Pool**: High-performance instance management that minimizes memory spikes and maximizes speed.
- **⚙️ Integrated UI**: Professional settings drawer in the Extensions menu with a "Manage Tools" popup for real-time configuration.
- **📦 v1.4.0 "Modular & Observable" Release**: Major architectural overhaul introducing **Dependency Injection**, **Strategy-based engine decoupling**, and **Structured Pino Logging**.
- **🛡️ Hardened Security (v1.4.0)**: Professional-grade protection featuring **DNS-level SSRF validation** (blocks private/reserved IPs) and configurable **Domain Allowlists**.

---

## 🛠️ Installation & Deployment

This project consists of two parts: a **Server Plugin** (Backend) and a **UI Extension** (Frontend).

### 1. Pre-built Release (Recommended)
The easiest way to install or update is to use the **SillyTavern-MCP-Local-Search-v1.4.0.zip** release:
1. Download the latest `.zip` release.
2. Extract the contents directly into your **SillyTavern root** directory.
3. The folders will automatically merge into the correct `plugins/` and `public/` directories.

### 2. Manual Configuration (Prerequisites)

#### **Prerequisites**
- **Node.js**: Version 18 or higher.
- **SillyTavern**: Installed and running locally.
- **Server Plugins**: Ensure `enableServerPlugins: true` is set in your SillyTavern `config.yaml`.
- **Function Calling**: Ensure you have **'Enable Function Calling'** ticked from the AI Response Configuration menu in SillyTavern.

---

### 3. Manual Deployment (Step-by-Step)

#### **Step A: Server Plugin (Backend)**
Copy the folder `plugins/mcp-local-search` from this repository into your SillyTavern root's `plugins/` directory.

> [!IMPORTANT]  
> You **MUST** install the backend dependencies for the plugin to boot:
> 1. Open a terminal in `SillyTavern/plugins/mcp-local-search/`
> 2. Run `npm install`
> 3. Run `npx playwright install chromium`

#### **Step B: UI Extension (Frontend)**
Copy the folder `public/scripts/extensions/third-party/mcp-local-search` from this repository into your SillyTavern root's `public/scripts/extensions/third-party/` directory.

---

### 4. Final Directory Layout
Your SillyTavern installation should look like this:

```text
SillyTavern/
├── plugins/
│   └── mcp-local-search/            <-- Backend folder
└── public/
    └── scripts/
        └── extensions/
            └── third-party/
                └── mcp-local-search/ <-- Frontend folder
```

---

## 🚀 SillyTavern Memory Optimization & Performance Tuning

When running intensive SillyTavern workloads involving local vectorization (RAG) and real-world web scraping, the Node.js runtime can exhibit significant heap expansion. On systems with high available RAM, the V8 engine is often "lazy" with garbage collection, allowing the process to claim 4GB or more of Resident Set Size (RSS) without releasing it.

To ensure the environment remains stable and performant during long-term intelligence analysis or heavy data retrieval, it is recommended to launch the server with specific V8 optimization flags.

### Recommended Startup Configuration
Modify your `start.bat` or launch script to include the following flags. Amend the lines that call the update check, and init the node server:

```batch
:: Checks for updates without bloat
call npm install --no-save --no-audit --no-fund --loglevel=error --no-progress --omit=dev

:: Optimized Node execution with memory management flags
node --max-old-space-size=5192 --max-semi-space-size=128 --optimize-for-size --expose-gc server.js %*
```

### Technical Breakdown of Flags
The following flags shift Node.js from an "expand-on-demand" model to a more disciplined, Java-style memory management approach:

- **`--max-old-space-size=5192`**: Sets a hard limit (~5GB) on the V8 heap's Old Generation. This prevents "Allocation Failed" crashes during heavy scraping while still keeping the process bounded on workstations with high RAM.
- **`--max-semi-space-size=128`**: Increases the size of the "New Space" (Young Generation). This is critical for web search tools that generate a high volume of short-lived strings during HTML parsing, as it allows for faster, more frequent minor garbage collection cycles.
- **`--optimize-for-size`**: Instructs the compiler and garbage collector to prioritize a smaller memory footprint over raw execution speed. This forces more aggressive memory reclamation after heavy data-processing turns.
- **`--expose-gc`**: Allows for manual triggering of garbage collection via internal scripts or extensions, providing a failsafe to flush the heap after particularly large context injections.

---

## 🚀 Getting Started

1. **Restart SillyTavern**: Run your usual start script (`Start.bat` or `npm start`).
2. **Check Logs**: You should see `[MCPLocalSearch] Initializing...` in your terminal.
3. **Enable**: Open SillyTavern, go to the **Extensions (puzzle)** menu → **MCP Local Search Settings** → **Enable MCP Local Search**.
4. **Configure**: Click **Manage Tools** to toggle specific search capabilities or adjust the result limits and preferred search engine.
5. **Test**: Type `/mcp-local-search hello` in chat to see it in action!
   - *Note: This manual test will show the search being triggered in the command window running SillyTavern, but will not show any output in the chat window itself.*
6. **AI Search**: When asked to 'search for xyz', a character should now be able to call the tool automatically.

---

## 📜 Commands & Tools

| Command / Tool | Action | Description |
| :--- | :--- | :--- |
| **`/mcp-local-search <query>`** | Manual Search | Performs a quick web search directly from the chat box. |
| **`local_search_web_search`** | AI Tool | Allows the AI to autonomously search the web for information. |
| **`local_search_extract_content`** | AI Tool | Allows the AI to scrape and read the full text of a specific URL. |

---

## ⚙️ Configuration

You can fine-tune the search behavior via the **Integrated Search Settings**.

### 🧭 How to access:
1. Open the SillyTavern **Extensions (puzzle)** menu.
2. Select **MCP Local Search Settings**.
3. Click **Manage Tools**.
4. Click the **⚙️ Settings** button in the top right of the popup.

### 🛠️ Available Settings:

- **🔢 Result Limit**: Controls how many search results are returned to the AI. 
  - *Range*: 1 to 20 results.
  - *Tip*: Higher values provide more perspective but consume more context tokens.
- **📏 Max Content Length (chars)**: The maximum number of characters to extract from any single webpage during scraping.
  - *Range*: 1,000 to 50,000 characters.
  - *Tip*: Increase this if long articles are being cut off prematurely.
- **🔍 Preferred Engine**: Select your primary search engine or use the new smart modes:
  - **Auto (Randomized & Stealth)** [Default]: Shuffles the order of Bing, Startpage, and DuckDuckGo for every request. This provides maximum stealth against IP blocking and avoids pattern detection.
  - **Startpage (Axios)**: High-quality results using direct HTML parsing (very fast).
  - **DuckDuckGo (Axios)**: Fast, lightweight fallback using DDG Lite.
  - **Bing (Browser)**: Comprehensive results using full Playwright browser automation (most powerful).
- **⚡ Force Multi-Engine Search**: When enabled, the extension launches the first two engines in its waterfall **simultaneously** (Parallel Search).
  - *Note*: If the first engine returns results that meet your **Quality Threshold**, the search will instantly return to save time.
  - *Intelligent Exit*: v1.3.2 introduces a "Shared State" where slow engines (like Bing) will **hard-abort** their internal timers the moment a faster partner (like Startpage) finds results.

---

## 🚀 Performance & Housekeeping (v1.3.2)

The extension is designed to be a "good citizen" on your system:
- **💨 2-Minute Idle Timeout**: Browsers automatically shut down after 120 seconds of inactivity to free up RAM. They will automatically relaunch on your next search.
- **🛡️ Shutdown Guards**: Standard process signals (SIGINT/SIGTERM) are handled to ensure no orphaned Chromium processes are left running if SillyTavern is closed.
- **🏊 Shared Browser Pool**: Multiple engines share the same browser instance to minimize startup latency and memory overhead.
- **📊 Structured Logging**: Integrated `pino` for production-grade telemetry. Automatic `pino-pretty` formatting ensures logs are ultra-readable in the SillyTavern console.
- **🛡️ DNS-Level Protection**: v1.4.0 validates the underlying IP of every URL before network interaction, blocking attempts to reach private network segments or reserved IP ranges.

---

## 🙏 Acknowledgements

This project is a standalone integration that builds upon the incredible work of the following developers:

- **[bmen25124](https://github.com/bmen25124)**: For the professional UI architecture and template patterns used in the original `SillyTavern-MCP-Client`.
- **[mrkrsl](https://github.com/mrkrsl)**: For the original core logic of `web-search-mcp` which pioneered local search capabilities. This project's search engine was built upon the refined [OllyJohnston fork](https://github.com/OllyJohnston/web-search-mcp).

Special thanks to the SillyTavern community for their ongoing support and inspiration.

---

## ⚖️ License
MIT License - Developed by Olly Johnston.
