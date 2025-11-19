console.log("Content Filter Helper running...");

const API_URL = "http://localhost:5000"; 
let HIDE_SETTINGS = ["HATE", "ABUSE"]; 

// --- SETTINGS ---
chrome.storage.local.get(['filterSetting'], (result) => {
    updateSettings(result.filterSetting || "BOTH");
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.filterSetting) updateSettings(changes.filterSetting.newValue);
});
function updateSettings(val) {
    if (val === "BOTH") HIDE_SETTINGS = ["HATE", "ABUSE"];
    else if (val === "HATE") HIDE_SETTINGS = ["HATE"];
    else if (val === "ABUSE") HIDE_SETTINGS = ["ABUSE"];
}

// --- STYLES ---
const style = document.createElement('style');
style.innerHTML = `
  .cf-overlay { background-color: #f0f0f0; color: #333; padding: 20px; text-align: center; border: 1px solid #ccc; border-radius: 8px; margin: 10px 0; font-family: sans-serif; }
  .cf-btn { background-color: #000; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin: 5px; font-size: 13px; }
  .cf-toolbar { border-top: 1px solid #eff3f4; padding: 8px; display: flex; gap: 10px; justify-content: flex-end; }
  .cf-btn-outline { background: transparent; color: #536471; border: 1px solid #cfd9de; padding: 4px 10px; border-radius: 16px; cursor: pointer; font-size: 12px; }
  .cf-hidden-content { display: none !important; }
`;
document.head.appendChild(style);

function extractTextFromPost(postElement) {
    if (postElement.tagName.toLowerCase() === 'article') {
        const n = postElement.querySelector('div[data-testid="tweetText"]');
        return n ? n.innerText : "";
    } else if (postElement.classList.contains('narrow')) {
        return postElement.innerText; 
    }
    return "";
}

// --- API VIA BACKGROUND ---
async function classifyText(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "classify", text: text }, (response) => {
            if (chrome.runtime.lastError || !response) resolve("NEUTRAL");
            else resolve(response.label);
        });
    });
}

function sendFeedback(text, label) {
    chrome.runtime.sendMessage({ action: "feedback", text: text, label: label });
}

// --- UI ---
function handleHatePost(post, label, text) {
    const overlay = document.createElement('div');
    overlay.className = "cf-overlay";
    overlay.innerHTML = `<p>Hidden: <strong>${label}</strong></p><button class="cf-btn" id="btn-show">View Anyway</button>`;
    
    Array.from(post.children).forEach(c => c.classList.add('cf-hidden-content'));
    post.appendChild(overlay);

    overlay.querySelector('#btn-show').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        overlay.remove();
        Array.from(post.children).forEach(c => c.classList.remove('cf-hidden-content'));
        askForCorrection(post, "NEUTRAL", text);
    };
}

function handleNeutralPost(post, text) {
    const toolbar = document.createElement('div');
    toolbar.className = "cf-toolbar";
    toolbar.innerHTML = `<button class="cf-btn-outline" id="btn-hide">Hide</button><button class="cf-btn-outline" id="btn-rep">Report</button>`;
    post.appendChild(toolbar);

    toolbar.querySelector('#btn-hide').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toolbar.remove();
        sendFeedback(text, "MANUAL_HIDE");
        handleHatePost(post, "HIDDEN BY USER", text);
    };
    toolbar.querySelector('#btn-rep').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toolbar.innerHTML = "";
        askForCorrection(post, "BAD_CHOICE", text);
    };
}

function askForCorrection(container, context, text) {
    const div = document.createElement('div');
    div.className = "cf-toolbar";
    
    if (context === "NEUTRAL") {
        div.innerHTML = `<span>Safe?</span><button class="cf-btn" id="btn-safe">Yes</button>`;
        div.querySelector('#btn-safe').onclick = (e) => {
            e.stopPropagation(); sendFeedback(text, "NEUTRAL"); div.innerHTML="Saved."; setTimeout(()=>div.remove(),1000);
        };
    } else {
        div.innerHTML = `<span>Report:</span><button class="cf-btn" id="h">Hate</button><button class="cf-btn" id="a">Abuse</button>`;
        div.querySelector('#h').onclick = (e) => { e.stopPropagation(); sendFeedback(text, "HATE"); div.innerHTML="Saved."; setTimeout(()=>div.remove(),1000); };
        div.querySelector('#a').onclick = (e) => { e.stopPropagation(); sendFeedback(text, "ABUSE"); div.innerHTML="Saved."; setTimeout(()=>div.remove(),1000); };
    }
    container.appendChild(div);
}

// --- LOOP ---
function processPosts() {
    document.querySelectorAll('article, div.narrow').forEach(async (post) => {
        if (post.dataset.processed === "true") return;
        post.dataset.processed = "true";
        
        const text = extractTextFromPost(post);
        if (!text) return;

        const label = await classifyText(text);
        
        if (HIDE_SETTINGS.includes(label)) handleHatePost(post, label, text);
        else handleNeutralPost(post, text);
    });
}

processPosts();
new MutationObserver(processPosts).observe(document.body, { childList: true, subtree: true });