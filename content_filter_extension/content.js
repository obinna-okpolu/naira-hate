console.log("Extension active. Content Filter Helper running...");

// --- CONFIGURATION ---
// TODO: Replace this with your actual API URL
const API_URL = "http://localhost:5000"; 

// Default settings
let HIDE_SETTINGS = ["HATE", "ABUSE"]; 

// 1. Load settings immediately
chrome.storage.local.get(['filterSetting'], (result) => {
    updateSettings(result.filterSetting || "BOTH");
});

// 2. Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.filterSetting) {
        updateSettings(changes.filterSetting.newValue);
        console.log("Settings updated to:", HIDE_SETTINGS);
    }
});

function updateSettings(settingValue) {
    if (settingValue === "BOTH") {
        HIDE_SETTINGS = ["HATE", "ABUSE"];
    } else if (settingValue === "HATE") {
        HIDE_SETTINGS = ["HATE"];
    } else if (settingValue === "ABUSE") {
        HIDE_SETTINGS = ["ABUSE"];
    }
}

// --- STYLES ---
const style = document.createElement('style');
style.innerHTML = `
  .cf-overlay { background-color: #f0f0f0; color: #333; padding: 20px; text-align: center; border: 1px solid #ccc; border-radius: 8px; margin: 10px 0; font-family: sans-serif; }
  .cf-btn { background-color: #000; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin: 5px; font-size: 13px; }
  .cf-btn:hover { opacity: 0.8; }
  .cf-toolbar { border-top: 1px solid #eff3f4; padding: 8px; display: flex; gap: 10px; justify-content: flex-end; }
  .cf-btn-outline { background: transparent; color: #536471; border: 1px solid #cfd9de; padding: 4px 10px; border-radius: 16px; cursor: pointer; font-size: 12px; }
  .cf-btn-outline:hover { background-color: #eff3f4; }
  .cf-feedback-box { border-top: 1px solid #eee; padding: 10px; margin-top: 5px; font-size: 13px; }
  .cf-hidden-content { display: none !important; }
`;
document.head.appendChild(style);


// --- HELPER: TEXT EXTRACTION ---
function extractTextFromPost(postElement) {
    if (postElement.tagName.toLowerCase() === 'article') {
        const tweetTextNode = postElement.querySelector('div[data-testid="tweetText"]');
        return tweetTextNode ? tweetTextNode.innerText : "";
    } else if (postElement.classList.contains('narrow')) {
        return postElement.innerText; 
    }
    return "";
}

// --- API LOGIC (Via Background Service) ---

async function classifyText(text) {
    // Wrap chrome messaging in Promise so we can 'await' it
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            action: "classify", 
            text: text 
        }, (response) => {
            // If extension is reloaded but page isn't, this might fail. Handle gracefully.
            if (chrome.runtime.lastError) {
                console.log("Extension connection lost (reload page)");
                resolve("NEUTRAL");
            } else {
                resolve(response.label);
            }
        });
    });
}

function sendFeedback(text, label) {
    console.log(`[API LOG] Sending Feedback: ${label}`);
    chrome.runtime.sendMessage({ 
        action: "feedback", 
        text: text, 
        label: label 
    });
}


// --- UI HANDLERS ---

function handleHatePost(postElement, label, text) {
    const overlay = document.createElement('div');
    overlay.className = "cf-overlay";
    overlay.innerHTML = `
        <p><strong>Content Hidden</strong></p>
        <p>Flagged as <strong>${label}</strong>.</p>
        <button class="cf-btn" id="btn-show">View Anyway</button>
    `;

    const originalChildren = Array.from(postElement.children);
    originalChildren.forEach(child => child.classList.add('cf-hidden-content'));
    postElement.appendChild(overlay);

    overlay.querySelector('#btn-show').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        overlay.remove();
        originalChildren.forEach(child => child.classList.remove('cf-hidden-content'));
        
        // Ask if it should be marked Safe
        askForCorrection(postElement, "NEUTRAL", text);
    };
}

function handleNeutralPost(postElement, text) {
    const toolbar = document.createElement('div');
    toolbar.className = "cf-toolbar";
    toolbar.innerHTML = `
        <button class="cf-btn-outline" id="btn-hide-manually">Hide</button>
        <button class="cf-btn-outline" id="btn-feedback">Report</button>
    `;
    postElement.appendChild(toolbar);

    // User Manually Hides
    toolbar.querySelector('#btn-hide-manually').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toolbar.remove();
        sendFeedback(text, "MANUAL_HIDE"); 
        handleHatePost(postElement, "HIDDEN BY USER", text);
    };

    // User Reports as Hate/Abuse
    toolbar.querySelector('#btn-feedback').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toolbar.innerHTML = ""; 
        askForCorrection(postElement, "BAD_CHOICE", text);
    };
}

function askForCorrection(container, context, text) {
    const feedbackRow = document.createElement('div');
    feedbackRow.className = "cf-feedback-box";
    
    if (context === "NEUTRAL") {
        // Case: AI said Hate/Abuse. User unhid it. 
        feedbackRow.innerHTML = `
            <span>Should this be safe?</span>
            <button class="cf-btn" id="btn-safe">Mark Safe</button>
            <button class="cf-btn" id="btn-cancel">Cancel</button>
        `;
        container.appendChild(feedbackRow);

        feedbackRow.querySelector('#btn-safe').onclick = (e) => {
            e.stopPropagation();
            sendFeedback(text, "NEUTRAL"); 
            feedbackRow.innerHTML = "<span style='color:green'>Thanks! Marked Safe.</span>";
            setTimeout(() => feedbackRow.remove(), 2000);
        };
        
    } else {
        // Case: AI said Neutral. User wants to report.
        feedbackRow.innerHTML = `
            <span>Report as:</span>
            <button class="cf-btn" id="btn-hate">Hate</button>
            <button class="cf-btn" id="btn-abuse">Abuse</button>
        `;
        container.appendChild(feedbackRow);

        feedbackRow.querySelector('#btn-hate').onclick = (e) => {
            e.stopPropagation();
            sendFeedback(text, "HATE"); 
            feedbackRow.innerHTML = "<span style='color:green'>Reported as Hate.</span>";
            setTimeout(() => feedbackRow.remove(), 2000);
        };

        feedbackRow.querySelector('#btn-abuse').onclick = (e) => {
            e.stopPropagation();
            sendFeedback(text, "ABUSE"); 
            feedbackRow.innerHTML = "<span style='color:green'>Reported as Abuse.</span>";
            setTimeout(() => feedbackRow.remove(), 2000);
        };
    }

    const cancelBtn = feedbackRow.querySelector('#btn-cancel');
    if(cancelBtn) {
        cancelBtn.onclick = (e) => { e.stopPropagation(); feedbackRow.remove(); };
    }
}


// --- MAIN PROCESSOR ---
function processPosts() {
    const posts = document.querySelectorAll('article, div.narrow');

    posts.forEach(async (post) => {
        if (post.dataset.processed === "true") return;
        post.dataset.processed = "true";
        
        const postText = extractTextFromPost(post);
        if (!postText) return;

        const label = await classifyText(postText);

        if (HIDE_SETTINGS.includes(label)) {
            handleHatePost(post, label, postText);
        } else {
            handleNeutralPost(post, postText);
        }
    });
}

processPosts();

const observer = new MutationObserver((mutations) => {
    processPosts();
});
observer.observe(document.body, { childList: true, subtree: true });