// persistence.js
// Handles saving and loading hitters/pitchers to/from localStorage

const STORAGE_KEY = "swingSyncData";

// Save hitters + pitchers into localStorage
export function saveData(hitters, pitchers) {
  try {
    const data = JSON.stringify({ hitters, pitchers });
    localStorage.setItem(STORAGE_KEY, data);
  } catch (err) {
    console.error("Error saving Swing Sync data:", err);
  }
}

// Load hitters + pitchers from localStorage
export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hitters: [], pitchers: [] };

    const data = JSON.parse(raw);

    // Basic validation
    if (!Array.isArray(data.hitters) || !Array.isArray(data.pitchers)) {
      return { hitters: [], pitchers: [] };
    }

    return data;
  } catch (err) {
    console.error("Error loading Swing Sync data:", err);
    return { hitters: [], pitchers: [] };
  }
}

// Clear all saved data (optional utility)
export function clearData() {
  localStorage.removeItem(STORAGE_KEY);
}
