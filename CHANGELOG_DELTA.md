# 📋 Changelog Delta: v1.1.1 ➔ v1.2.6

This delta summarizes the major improvements, fixes, and architectural changes since version 1.1.1.

## [1.2.6] - 2026-03-30
### Added
- **User-Preferred Engine**: You can now select your primary search engine (Bing, Startpage, or DuckDuckGo) via the **Manage Tools** popup.
- **Dynamic Waterfall Prioritization**: The search sequence now automatically reorders itself based on your preference.
- **Ultra-High Quality Early Exit**: Search terminates immediately if perfect results (score ≥ 0.95) are found, even if Multi-Engine search is enabled.
- **Automated ZIP Releases**: New `npm run release` command for developers to package the extension in a SillyTavern-ready structure.
- **Enhanced Logging**: Server-side diagnostic logs for tracing search quality and waterfall execution.

### Changed
- **Startpage Integration**: Added Startpage (Axios-based) as a high-quality, lightweight fallback engine.
- **Engine Reordering**: The default priority is now **Bing (Direct) > DuckDuckGo (Fallback) > Startpage (High Quality)**.
- **Improved Settings UI**: Replaced the "Brave" option with "Startpage" and set Bing as the default selection.

### Removed
- **Brave Search**: Removed Brave search logic entirely due to persistent Proof-of-Work (PoW) captchas blocking automation.

---

## [1.2.5] - 2026-03-29 (Internal Release)
### Added
- **Axios-based Fallbacks**: Initial integration of DuckDuckGo Lite to handle scenarios where Playwright is throttled.
- **Session Warmup**: Improved Bing reliability by simulating a homepage visit before direct URL navigation.

### Fixed
- **Settings Persistence**: Resolved an issue where default settings weren't correctly initialized on the first load of the extension.

---

## [1.2.0] - 2026-03-27
### Added
- **Shared Browser Pool**: Implemented a global browser management system to reduce memory usage and startup latency.
- **Advanced Browser Fingerprinting**: Randomized **User-Agents**, **Viewports**, and **Canvas/Hardware signatures** to evade bot detection and captchas.
- **Smart Content Extraction**: Improved the `extract_content` tool with a hybrid Playwright/Cheerio parser for better readability.
- **Memory Optimization**: Added recommended V8 flags to the README for stable long-term operation.
