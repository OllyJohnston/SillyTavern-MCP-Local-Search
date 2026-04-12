# Security Policy

## Supported Versions

Only the latest production versions are actively supported with security updates. We strongly recommend all users upgrade to **v1.4.0** or newer to benefit from the major SSRF and XSS hardening introduced in the modular overhaul.

| Version | Supported          |
| ------- | ------------------ |
| 1.4.x   | ✅ Yes            |
| < 1.4.0 | ❌ No (Deprecated) |

---

## Reporting a Vulnerability

We take the security of **MCP Local Search** seriously. If you believe you have found a security vulnerability, please report it via the **[GitHub Security Advisory](https://github.com/OllyJohnston/SillyTavern-MCP-Local-Search/security/advisories/new)** feature.

### Disclosure Process
1.  **Draft a Report**: Provide a detailed description of the vulnerability and steps to reproduce it.
2.  **Private Triage**: We will review the report privately within 48-72 hours.
3.  **Fix & Release**: A fix will be developed and a security-patched version will be released.
4.  **Public Disclosure**: Once the fix is released and users have had time to update, a public advisory will be published.

### What to Report
-   **SSRF**: Any mechanism that allows the server to reach internal or unintended network segments.
-   **XSS**: Insecure rendering of search or extracted data in the SillyTavern UI.
-   **RCE**: Remote code execution via malformed search queries or scraped content.

### What NOT to Report
-   Bugs that do not have a security impact (Please open a standard GitHub Issue).
-   Captcha-related behavior (This is a known anti-bot challenge, not a vulnerability).

---

## Security Features (v1.4.0+)
As of v1.4.0, this project includes several native hardening layers:
-   **DNS-Level SSRF Protection**: Validates target IPs before network requests are made.
-   **Reserved IP Blocking**: Automatically blocks all private and local network ranges.
-   **Domain Filtering**: Supports configurable `allowedDomains` and `blockedDomains`.
-   **Content Sanitization**: Uses **DOMPurify** to clean all extracted HTML content before injection.

Thank you for helping keep the SillyTavern community safe!
