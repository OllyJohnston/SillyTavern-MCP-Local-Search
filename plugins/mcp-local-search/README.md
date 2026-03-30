# 🌐 MCP Local Search for SillyTavern

**MCP Local Search** is a powerful, native-style SillyTavern extension that brings high-quality local web search and page scraping directly into your AI characters' hands. 

Built with **Playwright**, it achieves full feature parity with the original `bmen25124/SillyTavern-MCP-Client` while offering a more optimized, integrated experience for non-technical users.

---

## ✨ Key Features

- **🛡️ Anti-bot Challenge Refinement**: Automated detection, multi-frame polling (15s), and redirect sensing (`rdr=1`) for handling complex Bing/Cloudflare challenges reliably.
- **🚀 Autonomous AI Tool Calling**: Characters can automatically search the web and extract content to answer your questions in real-time.
- **🛡️ Clash-Free Architecture**: Fully rebranded to `mcp-local-search` with unique template and CSS names to prevent conflicts with other extensions.
- **🧭 Multi-Engine Support**: Seamlessly orchestrates **Bing**, **DuckDuckGo**, and **Startpage** for the most reliable, high-relevance results.
- **⚡ Ultra-High Quality Exit**: Automatically stops searching as soon as 100% relevance is achieved, saving time and API resources.
- **🎯 Dynamic Waterfall**: You can now choose your preferred engine in the UI, and the search waterfall will dynamically prioritize it.
- **📑 Enhanced Scraper**: Uses Playwright and Cheerio to extract clean, readable text from even the most complex JavaScript-heavy websites.
- **📊 Shared Browser Pool**: High-performance instance management that minimizes memory spikes and maximizes speed.
- **⚙️ Integrated UI**: Professional settings drawer in the Extensions menu with a "Manage Tools" popup for real-time configuration.
- **📦 Pre-built Installation**: Support for a one-click ZIP release that matches the SillyTavern plugin structure.

---

## 🛠️ Installation & Deployment

This project consists of two parts: a **Server Plugin** (Backend) and a **UI Extension** (Frontend).

### 1. Pre-built Release (Recommended)
The easiest way to install or update is to use the **SillyTavern-MCP-Local-Search-v1.2.8.zip** release:
1. Download the latest `.zip` release.
2. Extract the contents directly into your **SillyTavern root** directory.
3. The folders will automatically merge into the correct `plugins/` and `public/` directories.

### 2. Manual Deployment (Step-by-Step)

#### **Prerequisites**
- **Node.js**: Version 18 or higher.
- **SillyTavern**: Installed and running locally.
- **Server Plugins**: Ensure `enableServerPlugins: true` is set in your SillyTavern `config.yaml`.
- **Function Calling**: Ensure you have **'Enable Function Calling'** ticked from the AI Response Configuration menu in SillyTavern.

---

### 2. Manual Deployment (Step-by-Step)

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

### 3. Final Directory Layout
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
node --max-old-space-size=4096 --max-semi-space-size=128 --optimize-for-size --expose-gc server.js %*
```

### Technical Breakdown of Flags
The following flags shift Node.js from an "expand-on-demand" model to a more disciplined, Java-style memory management approach:

- **`--max-old-space-size=4096`**: Sets a hard limit (4GB) on the V8 heap's Old Generation. This prevents the process from ballooning unnecessarily on workstations with 32GB+ of RAM.
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

You can fine-tune the search behavior via the **Manage Tools** popup. Each option helps balance speed, quality, and context window usage:

- **🔢 Result Limit**: Controls how many search results are returned to the AI. 
  - *Range*: 1 to 20 results.
  - *Tip*: Higher values provide more perspective but take more room in the character's memory.
- **📏 Max Content Length**: The maximum number of characters to extract from any single webpage.
  - *Range*: 1,000 to 50,000 characters.
  - *Tip*: Increase this if you find that articles are being cut off too early.
- **🔍 Preferred Engine**: Select your primary search provider.
  - **Bing (Direct)**: Fast and comprehensive (uses browser automation).
  - **Startpage (High Quality)**: Excellent results with direct HTML parsing (no browser needed).
  - **DuckDuckGo (Fallback)**: Reliable backup if other engines are blocked.
- **⚡ Force Multi-Engine Search**: When enabled, the extension will search across **all** supported engines simultaneously.
  - *Note*: If an engine returns **100% relevance** (1.0 quality score), the search will terminate immediately regardless of this toggle for maximum efficiency.

---

## 🙏 Acknowledgements

This project is a standalone integration that builds upon the incredible work of the following developers:

- **[bmen25124](https://github.com/bmen25124)**: For the professional UI architecture and template patterns used in the original `SillyTavern-MCP-Client`.
- **[mrkrsl](https://github.com/mrkrsl)**: For the original core logic of `web-search-mcp` which pioneered local search capabilities. This project's search engine was built upon the refined [OllyJohnston fork](https://github.com/OllyJohnston/web-search-mcp).

Special thanks to the SillyTavern community for their ongoing support and inspiration.

---

## ⚖️ License
MIT License - Developed by Olly Johnston.
