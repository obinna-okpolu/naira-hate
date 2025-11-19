// background.js
const API_BASE = "http://localhost:5000"; 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "classify") {
        // 1. Perform the Fetch here (Background context is unrestricted)
        fetch(`${API_BASE}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: request.text })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            sendResponse({ label: data.label });
        })
        .catch(error => {
            console.error("Background Fetch Error:", error);
            // If server fails, default to NEUTRAL so the buttons still appear
            sendResponse({ label: "NEUTRAL" }); 
        });

        return true; 
    }
    if (request.action === "feedback") {
        fetch(`${API_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: request.text, label: request.label })
        }).catch(err => console.error("Feedback Error", err));
    }
});