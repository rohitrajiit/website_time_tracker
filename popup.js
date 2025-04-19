    

    // popup.js
    // Logic for the extension's popup window.

    /**
     * Formats milliseconds into a human-readable string (e.g., 1h 15m 30s).
     * @param {number} ms - Time in milliseconds.
     * @returns {string} Formatted time string.
     */
    function formatTime(ms) {
        if (ms < 1000) {
            return "< 1s"; // Less than a second
        }
        let seconds = Math.floor(ms / 1000);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);

        seconds = seconds % 60;
        minutes = minutes % 60;

        let timeString = "";
        if (hours > 0) {
            timeString += `${hours}h `;
        }
        if (minutes > 0) {
            timeString += `${minutes}m `;
        }
        if (seconds > 0 || timeString === "") { // Show seconds if it's the only unit or non-zero
            timeString += `${seconds}s`;
        }

        return timeString.trim();
    }

    /**
     * Fetches data from storage and displays it in the popup.
     */
    async function displayData() {
        const displayDiv = document.getElementById('dataDisplay');
        const statusDiv = document.getElementById('status');
        displayDiv.textContent = 'Loading data...'; // Show loading message
        statusDiv.textContent = ''; // Clear status

        try {
            const items = await chrome.storage.local.get(null); // Get all items

            // Filter out any non-domain keys if necessary (though unlikely here)
            const domains = Object.keys(items).filter(key => typeof items[key] === 'number');

            if (domains.length === 0) {
                displayDiv.textContent = 'No tracking data yet.';
                return;
            }

            // Sort domains by time spent (descending)
            domains.sort((a, b) => items[b] - items[a]);

            const ul = document.createElement('ul');
            domains.forEach(domain => {
                const li = document.createElement('li');

                const domainSpan = document.createElement('span');
                domainSpan.className = 'domain';
                domainSpan.textContent = domain;
                domainSpan.title = domain; // Show full domain on hover

                const timeSpan = document.createElement('span');
                timeSpan.className = 'time';
                timeSpan.textContent = formatTime(items[domain]);

                li.appendChild(domainSpan);
                li.appendChild(timeSpan);
                ul.appendChild(li);
            });

            displayDiv.innerHTML = ''; // Clear loading message
            displayDiv.appendChild(ul);

        } catch (error) {
            console.error("Error loading data for popup:", error);
            displayDiv.textContent = 'Error loading data.';
             statusDiv.textContent = `Error: ${error.message}`;
        }
    }

    /**
     * Clears all tracking data from storage.
     */
    async function clearData() {
        const displayDiv = document.getElementById('dataDisplay');
        const statusDiv = document.getElementById('status');
        const clearButton = document.getElementById('clearButton');

        clearButton.disabled = true; // Prevent multiple clicks
        statusDiv.textContent = 'Clearing data...';

        try {
            await chrome.storage.local.clear();
            console.log("All tracking data cleared.");
            displayDiv.textContent = 'Data cleared.';
             statusDiv.textContent = 'All data successfully cleared.';
             // Optionally, refresh display after a short delay
             setTimeout(displayData, 1500);
        } catch (error) {
            console.error("Error clearing storage:", error);
            displayDiv.textContent = 'Error clearing data.';
            statusDiv.textContent = `Error: ${error.message}`;
        } finally {
             // Re-enable button even if there was an error
             setTimeout(() => {
                 clearButton.disabled = false;
                 if (!statusDiv.textContent.includes('Error')) {
                    statusDiv.textContent = ''; // Clear status if successful
                 }
             }, 1500);
        }
    }

    // --- Event Listeners ---
    document.addEventListener('DOMContentLoaded', displayData); // Load data when popup opens
    document.getElementById('clearButton').addEventListener('click', clearData);

    
