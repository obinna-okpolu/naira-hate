// 1. When the popup opens, load the current setting
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['filterSetting'], (result) => {
        // Default to "BOTH" if nothing is saved
        const currentSetting = result.filterSetting || "BOTH";
        
        // Select the radio button that matches the saved setting
        document.querySelector(`input[value="${currentSetting}"]`).checked = true;
    });
});

// 2. When user clicks "Save"
document.getElementById('save-btn').addEventListener('click', () => {
    // Get selected value
    const selectedOption = document.querySelector('input[name="filter"]:checked').value;
    
    // Save to browser memory
    chrome.storage.local.set({ filterSetting: selectedOption }, () => {
        // Show "Saved!" message
        const status = document.getElementById('status');
        status.textContent = "Settings saved! Reload page.";
        setTimeout(() => { status.textContent = ""; }, 2000);
    });
});