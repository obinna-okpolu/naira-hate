// background.js
const API_BASE = "http://localhost:5000"; // Back to HTTP (Simpler!)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "classify") {
        // 1. Perform the Fetch here (Background context is unrestricted)
        fetch(`${API_BASE}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: request.text })
        })
        .then(response => response.json())
        .then(data => {
            // 2. Send answer back to content.js
            sendResponse({ label: data.label });
        })
        .catch(error => {
            console.error("Background Fetch Error:", error);
            sendResponse({ label: "NEUTRAL" }); // Fail safe
        });

        return true; // Keep the message channel open for async response
    }

    if (request.action === "feedback") {
        fetch(`${API_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: request.text, label: request.label })
        });
        // No need to wait for response
    }
});