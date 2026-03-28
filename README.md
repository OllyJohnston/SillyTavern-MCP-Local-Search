# 🌐 MCP Local Search for SillyTavern

**MCP Local Search** is a powerful, native-style SillyTavern extension that brings high-quality local web search and page scraping directly into your AI characters' hands. 

Built with **Playwright**, it achieves full feature parity with the original `bmen25124/SillyTavern-MCP-Client` while offering a more optimized, integrated experience for non-technical users.

---

## ✨ Key Features

- **🚀 Autonomous AI Tool Calling**: Characters can automatically search the web and extract content to answer your questions in real-time.
- **🛡️ Clash-Free Architecture**: Fully rebranded to `mcp-local-search` with unique template and CSS names to prevent conflicts with other extensions.
- **🧭 Multi-Engine Support**: Seamlessly orchestrates Bing, Brave, and DuckDuckGo for the most reliable results.
- **📑 Enhanced Scraper**: Uses Playwright and Cheerio to extract clean, readable text from even the most complex JavaScript-heavy websites.
- **📊 Shared Browser Pool**: High-performance instance management that minimizes memory spikes and maximizes speed.
- **⚙️ Integrated UI**: Professional settings drawer in the Extensions menu with a "Manage Tools" popup for real-time configuration.

---

## 🛠️ Installation & Deployment

This project consists of two parts: a **Server Plugin** (Backend) and a **UI Extension** (Frontend).

### 1. Prerequisites
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
  - **Bing (Direct)**: Fast and comprehensive.
  - **Brave (Privacy Focus)**: Excellent for privacy-conscious searching.
  - **DuckDuckGo (Fallback)**: Reliable backup if other engines are blocked.
- **⚡ Force Multi-Engine Search**: When enabled, the extension will search across **all** supported engines simultaneously.
  - *Benefit*: Dramagingly increases the chance of finding niche information and provides a richer set of results.
  - *Note*: This uses more system resources as multiple browser tabs are opened at once.

---

## 🙏 Acknowledgements

This project is a standalone integration that builds upon the incredible work of the following developers:

- **[bmen25124](https://github.com/bmen25124)**: For the professional UI architecture and template patterns used in the original `SillyTavern-MCP-Client`.
- **[mrkrsl](https://github.com/mrkrsl)**: For the original core logic of `web-search-mcp` which pioneered local search capabilities.
- **[OllyJohnston](https://github.com/OllyJohnston)**: For the enhanced `web-search-mcp` fork which provided the foundation for the multi-engine and Playwright orchestration used here.

Special thanks to the SillyTavern community for their ongoing support and inspiration.

---

## ⚖️ License
MIT License - Developed by Olly Johnston.
