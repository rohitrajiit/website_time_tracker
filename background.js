
// background.js
// Tracks time spent on websites and saves data to chrome.storage.local

console.log("Website Time Tracker background script loaded.");

// In-memory store for the currently tracked tab's details
let activeTabInfo = {
    tabId: null,
    domain: null,
    startTime: null
};

// --- Utility Functions ---

/**
 * Extracts the domain name from a URL.
 * @param {string} url - The URL to parse.
 * @returns {string|null} The domain name or null if invalid/untrackable.
 */
function getDomain(url) {
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) {
        return null; // Ignore non-HTTP/HTTPS URLs
    }
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname; // e.g., "[www.google.com](https://www.google.com)"
    } catch (error) {
        console.error(`Error parsing URL: ${url}`, error);
        return null;
    }
}

/**
 * Updates the total time spent for a given domain in chrome.storage.local.
 * @param {string} domain - The domain name.
 * @param {number} timeSpentMs - The time spent in milliseconds to add.
 */
async function updateStoredTime(domain, timeSpentMs) {
    if (!domain || timeSpentMs <= 0) {
        return;
    }
    try {
        // Get current stored data for this domain
        const data = await chrome.storage.local.get(domain);
        const currentTotalTime = data[domain] || 0; // Default to 0 if not found
        const newTotalTime = currentTotalTime + timeSpentMs;

        // Store the updated total time
        await chrome.storage.local.set({ [domain]: newTotalTime });
        console.log(`Updated time for ${domain}: ${Math.round(newTotalTime / 1000)}s`);

    } catch (error) {
        console.error(`Error updating storage for domain ${domain}:`, error);
    }
}

/**
 * Stops tracking time for the currently active domain (if any)
 * and updates the stored total time.
 */
async function stopTrackingCurrentDomain() {
    if (activeTabInfo.domain && activeTabInfo.startTime) {
        const endTime = Date.now();
        const timeSpentMs = endTime - activeTabInfo.startTime;

        console.log(`Stopping track for ${activeTabInfo.domain}. Time spent: ${Math.round(timeSpentMs/1000)}s`);
        await updateStoredTime(activeTabInfo.domain, timeSpentMs);

        // Clear the active info
        activeTabInfo = { tabId: null, domain: null, startTime: null };
    }
}

/**
 * Starts tracking time for a new domain.
 * @param {number} tabId - The ID of the tab.
 * @param {string} domain - The domain name to track.
 */
function startTrackingNewDomain(tabId, domain) {
    if (!domain) return; // Don't track null domains

    console.log(`Starting track for ${domain} (Tab ID: ${tabId})`);
    activeTabInfo = {
        tabId: tabId,
        domain: domain,
        startTime: Date.now()
    };
}

/**
 * Main handler to process tab changes (activation or update).
 * Stops tracking previous domain (if different) and starts tracking new one.
 * @param {number} tabId - The ID of the relevant tab.
 */
async function handleTabChange(tabId) {
     try {
        const tab = await chrome.tabs.get(tabId);
        // Ensure the tab is active in its window and has a valid URL
        if (!tab || !tab.active || !tab.url || tab.status !== 'complete') {
             // If the tab isn't ready or active, potentially stop tracking
             // This handles cases where user switches to a tab that is still loading
             // or isn't a web page. Check if the *inactive* tab was the one we were tracking.
             if(activeTabInfo.tabId === tabId) {
                console.log(`Tab ${tabId} is no longer active or ready, stopping tracking.`);
                await stopTrackingCurrentDomain();
             }
             return;
        }

        const newDomain = getDomain(tab.url);

        // If the domain is the same as the currently tracked one, do nothing.
        if (newDomain === activeTabInfo.domain) {
            // console.log(`Domain ${newDomain} is already being tracked.`);
            return;
        }

        // Domain is different, or we weren't tracking anything.
        // Stop tracking the old domain (if any).
        await stopTrackingCurrentDomain();

        // Start tracking the new domain (if it's valid).
        if (newDomain) {
            startTrackingNewDomain(tabId, newDomain);
        }

    } catch (error) {
         // Handle errors (e.g., tab closed before get() completes)
        if (error.message.includes("No tab with id")) {
            console.log(`Tab ${tabId} was likely closed.`);
            // If the closed tab was the one being tracked, stop tracking it.
            if (activeTabInfo.tabId === tabId) {
               await stopTrackingCurrentDomain();
            }
        } else {
            console.error(`Error handling tab change for tabId ${tabId}:`, error);
            // Potentially stop tracking if an unexpected error occurs
            await stopTrackingCurrentDomain();
        }
    }
}


// --- Event Listeners ---

// Fires when the active tab in a window changes.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log(`Tab activated: ${activeInfo.tabId}`);
    await handleTabChange(activeInfo.tabId);
});

// Fires when a tab is updated (URL change, page load complete).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // We only care about updates to the *currently active* tab
    // and only when the page has finished loading ('complete') or URL changed significantly.
    if (tab.active && changeInfo.status === 'complete') {
         console.log(`Tab updated: ${tabId}, Status: ${changeInfo.status}`);
         await handleTabChange(tabId);
    }
     // If the URL changes before status is complete, we might miss tracking start.
     // Let's also trigger on URL change for active tabs, handleTabChange will manage duplicates.
     else if (tab.active && changeInfo.url) {
         console.log(`Tab updated: ${tabId}, URL changed`);
         await handleTabChange(tabId); // Handle potential domain change
     }
});

// Fires when a tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log(`Tab removed: ${tabId}`);
    // If the closed tab was the one being actively tracked, stop the timer.
    if (activeTabInfo.tabId === tabId) {
        console.log(`Tracked tab ${tabId} was closed.`);
        await stopTrackingCurrentDomain();
    }
});

// Fires when a window is closed. Stop tracking if the active tab was in this window.
// Note: onRemoved for the tabs usually handles this, but this is a fallback.
chrome.windows.onRemoved.addListener(async (windowId) => {
    console.log(`Window removed: ${windowId}`);
    // We don't know the tabId directly, but if activeTabInfo still holds info,
    // it implies the tab didn't trigger onRemoved properly or the timing was off.
    // It's safer to just stop tracking if *any* window closes.
    // A more robust solution might query tabs before stopping.
    if(activeTabInfo.tabId) {
        console.log("Window closed, ensuring tracking is stopped.");
        await stopTrackingCurrentDomain();
    }
});

 // Optional: Add listener for when the browser window focus changes
 chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus, stop tracking time
        console.log("Browser lost focus, stopping tracking.");
        await stopTrackingCurrentDomain();
    } else {
        // Browser gained focus, find the active tab in this window and potentially restart tracking
        console.log(`Browser gained focus (Window ID: ${windowId}). Checking active tab.`);
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });
            if (activeTab) {
                await handleTabChange(activeTab.id); // Treat it like a tab activation
            }
        } catch (error) {
            console.error("Error querying active tab on focus gain:", error);
        }
    }
});

console.log("Event listeners added.");

// --- Initial Load ---
// When the extension first loads, check the currently active tab
// This might be slightly delayed, so there could be a small gap in tracking on startup.
chrome.runtime.onStartup.addListener(async () => {
    console.log("Extension startup: Checking active tab.");
     const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
     if (activeTab) {
         await handleTabChange(activeTab.id);
     }
});
 // Also check on install/update
 chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension installed/updated (${details.reason}): Checking active tab.`);
     const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
     if (activeTab) {
         await handleTabChange(activeTab.id);
     }
});
