// Local Search Extension for SillyTavern
// Modeled on bmen25124/SillyTavern-MCP-Client architecture

const extensionName = 'mcp-local-search';
const globalContext = SillyTavern.getContext();
const EXTENSION_SETTINGS_KEY = 'mcp_local_search';
const PLUGIN_URL = '/api/plugins/mcp-local-search';

// Default settings
const DEFAULT_SETTINGS = {
    enabled: false,
    numResults: 10,
    maxContentLength: 15000,
    preferredEngine: 'bing',
    forceMultiEngine: false,
    disabledTools: [],
};

// The built-in tools this extension provides
const BUILT_IN_TOOLS = [
    {
        name: 'web_search',
        displayName: 'Local Search: Web Search',
        description: 'Search the web for real-time information to answer user questions. Uses Playwright browser automation for high-quality results.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to perform.',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'extract_content',
        displayName: 'Local Search: Extract Page',
        description: 'Extract and clean the main text content from a specific URL. Useful for reading articles, documentation, or any web page.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The URL of the web page to extract content from.',
                },
            },
            required: ['url'],
        },
    },
];

// ============================================================
// Settings Management
// ============================================================

function getSettings() {
    return globalContext.extensionSettings[EXTENSION_SETTINGS_KEY];
}

function initializeDefaultSettings() {
    globalContext.extensionSettings[EXTENSION_SETTINGS_KEY] =
        globalContext.extensionSettings?.[EXTENSION_SETTINGS_KEY] || {};

    const settings = globalContext.extensionSettings[EXTENSION_SETTINGS_KEY];

    // Fill in any missing defaults
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = DEFAULT_SETTINGS[key];
        }
    }

    globalContext.saveSettingsDebounced();
}

// ============================================================
// Tool Registration
// ============================================================

const registeredToolIds = new Set();

async function executeWebSearch(args) {
    const settings = getSettings();
    const query = args.query;

    console.log(`[LocalSearch] Tool call: web_search("${query}")`);

    const response = await fetch(`${PLUGIN_URL}/search`, {
        method: 'POST',
        headers: globalContext.getRequestHeaders(),
        body: JSON.stringify({
            query,
            limit: settings.numResults,
            options: {
                maxContentLength: settings.maxContentLength,
                preferredEngine: settings.preferredEngine,
                forceMultiEngine: settings.forceMultiEngine,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
        return 'No search results found.';
    }

    let output = `Search results for: "${query}"\n\n`;
    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        output += `[${i + 1}] ${res.title}\n`;
        output += `URL: ${res.url}\n`;
        if (i < 3 && res.fullContent) {
            output += `Content: ${res.fullContent.substring(0, settings.maxContentLength)}\n\n`;
        } else {
            output += `Summary: ${res.description}\n\n`;
        }
    }

    return output;
}

async function executeExtractContent(args) {
    const settings = getSettings();
    const url = args.url;

    console.log(`[LocalSearch] Tool call: extract_content("${url}")`);

    const response = await fetch(`${PLUGIN_URL}/extract`, {
        method: 'POST',
        headers: globalContext.getRequestHeaders(),
        body: JSON.stringify({
            url,
            options: {
                maxContentLength: settings.maxContentLength,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Extraction failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content || 'No content extracted.';
}

function registerTools() {
    const settings = getSettings();
    const context = SillyTavern.getContext();

    for (const tool of BUILT_IN_TOOLS) {
        const toolId = `local_search_${tool.name}`;

        // Skip if disabled
        if (settings.disabledTools && settings.disabledTools.includes(tool.name)) {
            continue;
        }

        // Skip if already registered
        if (registeredToolIds.has(toolId)) {
            continue;
        }

        const actionFn = tool.name === 'web_search' ? executeWebSearch : executeExtractContent;

        context.registerFunctionTool({
            name: toolId,
            displayName: tool.displayName,
            description: tool.description,
            parameters: tool.inputSchema,
            action: async (parameters) => {
                return await actionFn(parameters);
            },
            formatMessage: (parameters) => {
                if (tool.name === 'web_search') {
                    return `Searching web for: "${parameters.query}"...`;
                }
                return `Extracting content from: ${parameters.url}...`;
            },
        });

        registeredToolIds.add(toolId);
    }

    console.log(`[MCP Local Search] Registered ${registeredToolIds.size} tools`);
}

function unregisterTools() {
    const context = SillyTavern.getContext();

    for (const toolId of registeredToolIds) {
        try {
            context.unregisterFunctionTool(toolId);
        } catch (e) {
            console.warn(`[MCP Local Search] Failed to unregister tool ${toolId}:`, e);
        }
    }

    registeredToolIds.clear();
    console.log('[MCP Local Search] All tools unregistered');
}

async function handleToolsState(enabled) {
    if (enabled) {
        // Check backend status first
        try {
            const res = await fetch(`${PLUGIN_URL}/status`, {
                headers: globalContext.getRequestHeaders(),
            });
            if (!res.ok) {
                throw new Error('Backend plugin not running');
            }
        } catch (e) {
            throw new Error('MCP Local Search backend plugin is not available. Make sure the server plugin is installed in plugins/mcp-local-search/ and enableServerPlugins is true in config.yaml.');
        }

        registerTools();
    } else {
        unregisterTools();
    }
}

// ============================================================
// UI Handling
// ============================================================

async function handleUIChanges() {
    const settingsHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/mcp-ls-settings',
    );
    $('#extensions_settings').append(settingsHtml);

    const settings = getSettings();

    // Enable checkbox
    $('#local_search_enabled')
        .prop('checked', settings.enabled)
        .on('change', async function () {
            const toggle = $(this);
            const label = toggle.parent('.checkbox_label');
            const labelSpan = label.find('span');
            const originalSpanText = labelSpan.text();

            // Show loading state
            toggle.prop('disabled', true);
            labelSpan.html('<i class="fa-solid fa-spinner fa-spin"></i> Updating...');

            const enabled = toggle.prop('checked');
            settings.enabled = enabled;
            globalContext.saveSettingsDebounced();

            try {
                await handleToolsState(enabled);
                labelSpan.html('<i class="fa-solid fa-check"></i> Updated');
            } catch (error) {
                console.error('[MCP Local Search] Error handling tools:', error);
                labelSpan.html('<i class="fa-solid fa-exclamation-triangle"></i> Failed');
                if (typeof toastr !== 'undefined') {
                    toastr.error(error.message, 'MCP Local Search Error');
                }
            }

            setTimeout(() => {
                labelSpan.text(originalSpanText);
                toggle.prop('disabled', false);
            }, 1500);
        });

    // Manage Tools button
    $('#local_search_manage_tools').on('click', async function () {
        await showManageToolsPopup();
    });

    // Initial tool registration if enabled
    if (settings.enabled) {
        try {
            await handleToolsState(true);
        } catch (error) {
            console.error('[MCP Local Search] Initial tool registration failed:', error);
            if (typeof toastr !== 'undefined') {
                toastr.warning(error.message, 'MCP Local Search');
            }
        }
    }
}

async function showManageToolsPopup() {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    const content = await context.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/mcp-ls-tools',
    );

    // Create popup content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const popupContent = tempDiv.firstElementChild;

    // Show popup
    context.callGenericPopup($(popupContent), 1); // POPUP_TYPE.DISPLAY = 1

    // Populate the tools list
    await populateToolsList(popupContent, settings);

    // Settings button — toggles config form
    const settingsBtn = popupContent.querySelector('#open-search-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const form = popupContent.querySelector('#search-config-form');
            if (form.style.display === 'none') {
                form.style.display = '';
                // Populate with current settings
                popupContent.querySelector('#config-num-results').value = settings.numResults;
                popupContent.querySelector('#config-num-results-counter').textContent = settings.numResults;
                popupContent.querySelector('#config-max-content').value = settings.maxContentLength;
                popupContent.querySelector('#config-max-content-counter').textContent = settings.maxContentLength;
                popupContent.querySelector('#config-engine').value = settings.preferredEngine;
                popupContent.querySelector('#config-multi-engine').checked = settings.forceMultiEngine;
            } else {
                form.style.display = 'none';
            }
        });
    }

    // Config form range sliders
    const numResultsSlider = popupContent.querySelector('#config-num-results');
    if (numResultsSlider) {
        numResultsSlider.addEventListener('input', (e) => {
            popupContent.querySelector('#config-num-results-counter').textContent = e.target.value;
        });
    }
    const maxContentSlider = popupContent.querySelector('#config-max-content');
    if (maxContentSlider) {
        maxContentSlider.addEventListener('input', (e) => {
            popupContent.querySelector('#config-max-content-counter').textContent = e.target.value;
        });
    }

    // Save config
    const saveBtn = popupContent.querySelector('#save-config');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            settings.numResults = parseInt(popupContent.querySelector('#config-num-results').value);
            settings.maxContentLength = parseInt(popupContent.querySelector('#config-max-content').value);
            settings.preferredEngine = popupContent.querySelector('#config-engine').value;
            settings.forceMultiEngine = popupContent.querySelector('#config-multi-engine').checked;
            globalContext.saveSettingsDebounced();

            if (typeof toastr !== 'undefined') {
                toastr.success('Configuration saved.');
            }

            popupContent.querySelector('#search-config-form').style.display = 'none';
        });
    }

    // Cancel config
    const cancelBtn = popupContent.querySelector('#cancel-config');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            popupContent.querySelector('#search-config-form').style.display = 'none';
        });
    }

    // Refresh button
    const refreshBtn = popupContent.querySelector('#reload-all-tools');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
            refreshBtn.disabled = true;

            try {
                // Re-register tools
                unregisterTools();
                if (settings.enabled) {
                    registerTools();
                }
                await populateToolsList(popupContent, settings);

                refreshBtn.innerHTML = '<i class="fa-solid fa-check"></i> Done';
                refreshBtn.style.background = 'var(--active)';
            } catch (error) {
                refreshBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error';
                refreshBtn.style.background = 'var(--warning)';
            }

            setTimeout(() => {
                refreshBtn.innerHTML = originalText;
                refreshBtn.style.background = '';
                refreshBtn.disabled = false;
            }, 1500);
        });
    }

    // Tool toggle handler (delegated)
    popupContent.addEventListener('change', (e) => {
        const target = e.target;
        if (!target.classList.contains('tool-toggle')) return;

        const toolName = target.dataset.tool;
        const enabled = target.checked;

        if (enabled) {
            // Remove from disabled list
            settings.disabledTools = (settings.disabledTools || []).filter(t => t !== toolName);
        } else {
            // Add to disabled list
            if (!settings.disabledTools) settings.disabledTools = [];
            if (!settings.disabledTools.includes(toolName)) {
                settings.disabledTools.push(toolName);
            }
        }

        globalContext.saveSettingsDebounced();

        // Re-register tools to reflect changes
        unregisterTools();
        if (settings.enabled) {
            registerTools();
        }
    });
}

async function populateToolsList(popupContent, settings) {
    const toolsList = popupContent.querySelector('#mcp-tools-list');
    const serverTemplate = popupContent.querySelector('#server-section-template');

    toolsList.innerHTML = '';

    // Check backend status
    let isConnected = false;
    try {
        const res = await fetch(`${PLUGIN_URL}/status`, {
            headers: globalContext.getRequestHeaders(),
        });
        isConnected = res.ok;
    } catch (e) {
        isConnected = false;
    }

    // Create server section from template
    const serverNode = serverTemplate.content.cloneNode(true);
    const serverSection = serverNode.querySelector('.server-tools-section');

    if (!isConnected) {
        serverSection.classList.add('disabled');
    }

    // Set server name
    serverSection.querySelector('h4').textContent = 'MCP Local Search Engine';

    // Server toggle (reflects connection status)
    const serverToggle = serverSection.querySelector('.server-toggle');
    serverToggle.checked = isConnected;
    serverToggle.disabled = true; // Can't disconnect the built-in server

    // Add accordion click handler
    const serverHeader = serverSection.querySelector('.server-header');
    serverHeader.addEventListener('click', (e) => {
        if (e.target.closest('.checkbox_label')) return;
        const toolsListEl = serverSection.querySelector('.tools-list');
        const chevron = serverHeader.querySelector('i');
        toolsListEl.classList.toggle('collapsed');
        chevron.style.transform = toolsListEl.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(90deg)';
    });

    // Add tools to the server section
    const serverToolsList = serverSection.querySelector('.tools-list');

    for (const tool of BUILT_IN_TOOLS) {
        const isEnabled = !(settings.disabledTools || []).includes(tool.name);

        const toolItem = document.createElement('div');
        toolItem.className = 'tool-item';
        toolItem.innerHTML = `
            <div class="tool-header">
                <span class="tool-name">${tool.displayName}</span>
                <label class="checkbox_label">
                    <input type="checkbox" class="tool-toggle" data-tool="${tool.name}" ${isEnabled ? 'checked' : ''} />
                    <span>Enable MCP Local Search</span>
                </label>
            </div>
            <div class="tool-description">${tool.description}</div>
        `;

        serverToolsList.appendChild(toolItem);
    }

    toolsList.appendChild(serverSection);
}

// ============================================================
// Initialization
// ============================================================

initializeDefaultSettings();
handleUIChanges();

// Register slash command (renamed per user request)
const { registerSlashCommand } = await import("../../../slash-commands.js");
registerSlashCommand(
    "mcp-local-search",
    async (args, value) => {
        const settings = getSettings();
        if (!value) return "Please provide a search query.";
        return await executeWebSearch({ query: value });
    },
    [],
    "Perform a high-quality local search using Playwright.",
    true,
    true
);

console.log('[MCPLocalSearch] Extension loaded.');
