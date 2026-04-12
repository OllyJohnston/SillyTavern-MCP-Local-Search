# Contributing to MCP Local Search

Thank you for your interest in contributing to **MCP Local Search**! This project is a community-driven extension for SillyTavern, and your help is appreciated.

## 🏗️ Development Setup

To get started with development, you'll need **Node.js 18+** and a running **SillyTavern** installation.

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/OllyJohnston/SillyTavern-MCP-Local-Search
    cd SillyTavern-MCP-Local-Search
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Install Playwright Browsers**:
    ```bash
    npx playwright install chromium
    ```
4.  **Build the Project**:
    ```bash
    npm run build
    ```

---

## 🧭 Architectural Overview (v1.4.0+)

We use a **Modular Strategy Architecture** to keep the core logic clean and extensible.

### Adding a New Search Engine
Search engines are implemented as **Strategies**. To add a new one:
1.  Create a new file in `src/server/search/strategies/`.
2.  Implement the `SearchStrategy` interface (found in `src/server/search/strategy-interface.ts`).
3.  Register your strategy in `src/server/search/orchestrator.ts`.

### Adding a New Extractor
Extractors are part of a multi-phase waterfall:
1.  Implement your logic in `src/server/extraction/`.
2.  Integrate it into the `ExtractionOrchestrator` to define where it fits in the priority list (e.g., Axios vs. Playwright).

---

## 🛠️ Coding Standards

We maintain a high standard of code quality and observability.

-   **Logging**: Use the injected `Logger` service. **Do not use `console.log`**.
-   **Formatting**: We use **Prettier**. Run `npm run format` before committing.
-   **Linting**: We use **ESLint**. Ensure `npm run lint` passes.
-   **Type Safety**: All new code should be written in **TypeScript** and strictly typed.

### Automated Hooks
We use **Husky** and **lint-staged** to automatically format and lint your code on every commit. If your commit fails, please verify that it meets the quality standards mentioned above.

---

## 🚀 Submitting Changes

1.  **Fork the Repo** and create a feature branch.
2.  **Verify the Build**: Ensure `npm run build` and `npm test` pass.
3.  **Document**: Add JSDoc to new classes and public methods.
4.  **Open a PR**: Provide a clear description of the problem solved or feature added.

---

## 🙏 Code of Conduct
Please be respectful and constructive in all interactions. We aim to keep this a welcoming environment for all SillyTavern users and developers.
