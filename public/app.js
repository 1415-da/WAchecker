// Store results globally for filtering and export
let currentResults = [];
let statusCheckInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  const verifyBtn = document.getElementById("verifyBtn");
  const exportBtn = document.getElementById("exportBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const csvFileInput = document.getElementById("csvFile");

  verifyBtn.addEventListener("click", handleVerify);
  exportBtn.addEventListener("click", handleExport);
  exportCsvBtn.addEventListener("click", handleExportCsv);
  connectBtn.addEventListener("click", handleConnect);
  disconnectBtn.addEventListener("click", handleDisconnect);
  csvFileInput.addEventListener("change", handleCsvUpload);

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => handleFilter(btn.dataset.filter));
  });

  // Check connection status on load and periodically
  checkConnectionStatus();
  statusCheckInterval = setInterval(checkConnectionStatus, 2000);
});

// Handle CSV file upload
function handleCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = document.getElementById("fileName");
  fileName.textContent = `Selected: ${file.name}`;

  const reader = new FileReader();
  reader.onload = function (e) {
    const csvContent = e.target.result;
    const phoneNumbers = parseCsv(csvContent);

    if (phoneNumbers.length > 0) {
      document.getElementById("phoneNumbers").value = phoneNumbers.join("\n");
      fileName.textContent = `✅ Loaded ${phoneNumbers.length} numbers from ${file.name}`;
    } else {
      fileName.textContent = `❌ No phone numbers found in ${file.name}`;
      showError(
        "Could not find phone numbers in the CSV file. Make sure there is a column with phone numbers."
      );
    }
  };
  reader.readAsText(file);
}

// Parse CSV content and extract phone numbers
function parseCsv(csvContent) {
  const lines = csvContent.trim().split("\n");
  if (lines.length === 0) return [];

  const phoneNumbers = [];

  // Check if first line looks like a header or a phone number
  const firstLine = lines[0].trim().replace(/"/g, "").split(",")[0].trim();
  const firstLineIsHeader =
    isNaN(firstLine.replace(/[+\-\s()]/g, "")) &&
    !/^\+?\d{7,}$/.test(firstLine.replace(/[\s\-()]/g, ""));

  // Parse header to find phone column (if header exists)
  let phoneColumnIndex = 0;
  let startRow = 0;

  if (firstLineIsHeader) {
    const header = lines[0]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim().replace(/"/g, ""));
    phoneColumnIndex = header.findIndex((h) =>
      [
        "phone",
        "phonenumber",
        "phone_number",
        "number",
        "mobile",
        "telephone",
        "tel",
        "contact",
      ].includes(h)
    );
    if (phoneColumnIndex === -1) phoneColumnIndex = 0;
    startRow = 1; // Skip header
  }

  // Parse data rows
  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const row = parseCSVLine(line);
    if (row.length > phoneColumnIndex) {
      const phone = row[phoneColumnIndex].trim().replace(/"/g, "");
      if (phone && /\d{7,}/.test(phone.replace(/[^\d]/g, ""))) {
        phoneNumbers.push(phone);
      }
    }
  }

  return phoneNumbers;
}

// Properly parse CSV line (handles quoted values with commas)
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function checkConnectionStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();

    updateConnectionUI(data);
  } catch (error) {
    console.error("Failed to check status:", error);
  }
}

function updateConnectionUI(data) {
  const statusDot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-text");
  const qrContainer = document.getElementById("qrContainer");
  const qrCodeImg = document.getElementById("qrCode");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const verifyBtn = document.getElementById("verifyBtn");

  // Update status indicator
  statusDot.className = "status-dot " + data.status;

  if (data.status === "connected") {
    statusText.textContent = "✅ Connected to WhatsApp";
    qrContainer.style.display = "none";
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    verifyBtn.disabled = false;
  } else if (data.status === "connecting") {
    statusText.textContent = "🔄 Connecting... Scan QR Code";
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "none";
    verifyBtn.disabled = true;

    if (data.qrCode) {
      qrContainer.style.display = "block";
      qrCodeImg.src = data.qrCode;
    }
  } else {
    statusText.textContent = "❌ Not Connected";
    qrContainer.style.display = "none";
    connectBtn.style.display = "inline-block";
    disconnectBtn.style.display = "none";
    verifyBtn.disabled = true;
  }
}

async function handleConnect() {
  const connectBtn = document.getElementById("connectBtn");
  connectBtn.disabled = true;
  connectBtn.textContent = "⏳ Connecting...";

  try {
    const response = await fetch("/api/connect", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "🔗 Connect WhatsApp";
  }
}

async function handleDisconnect() {
  if (
    !confirm(
      "Are you sure you want to disconnect? You will need to scan the QR code again."
    )
  ) {
    return;
  }

  try {
    const response = await fetch("/api/disconnect", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }
  } catch (error) {
    showError(error.message);
  }
}

async function handleVerify() {
  const phoneNumbersText = document.getElementById("phoneNumbers").value.trim();
  const verifyBtn = document.getElementById("verifyBtn");
  const btnText = verifyBtn.querySelector(".btn-text");
  const btnLoading = verifyBtn.querySelector(".btn-loading");
  const errorMessage = document.getElementById("errorMessage");
  const resultsSection = document.getElementById("resultsSection");

  // Reset error state
  errorMessage.style.display = "none";

  if (!phoneNumbersText) {
    showError("Please enter at least one phone number");
    return;
  }

  // Parse phone numbers
  const phoneNumbers = phoneNumbersText
    .split("\n")
    .map((num) => num.trim())
    .filter((num) => num.length > 0);

  if (phoneNumbers.length === 0) {
    showError("No valid phone numbers found");
    return;
  }

  // Show loading state
  verifyBtn.disabled = true;
  btnText.style.display = "none";
  btnLoading.style.display = "inline";

  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumbers }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Verification failed");
    }

    // Store results and display
    currentResults = data.results;
    displayResults(data);
    resultsSection.style.display = "block";
  } catch (error) {
    showError(error.message);
  } finally {
    // Reset button state
    verifyBtn.disabled = false;
    btnText.style.display = "inline";
    btnLoading.style.display = "none";
  }
}

function displayResults(data) {
  // Update stats
  const statsHtml = `
    <div class="stat-card total">
      <div class="stat-number">${data.total}</div>
      <div class="stat-label">Total Numbers</div>
    </div>
    <div class="stat-card valid">
      <div class="stat-number">${data.valid}</div>
      <div class="stat-label">Valid WhatsApp</div>
    </div>
    <div class="stat-card invalid">
      <div class="stat-number">${data.invalid}</div>
      <div class="stat-label">Not on WhatsApp</div>
    </div>
  `;
  document.getElementById("stats").innerHTML = statsHtml;

  // Display all results
  renderResultsList(data.results, "all");
}

function renderResultsList(results, filter) {
  const resultsList = document.getElementById("resultsList");

  let filteredResults = results;
  if (filter === "valid") {
    filteredResults = results.filter((r) => r.exists);
  } else if (filter === "invalid") {
    filteredResults = results.filter((r) => !r.exists);
  }

  if (filteredResults.length === 0) {
    resultsList.innerHTML =
      '<p style="text-align: center; color: #666; padding: 20px;">No results to display</p>';
    return;
  }

  const resultsHtml = filteredResults
    .map((result) => {
      const statusClass = result.exists ? "valid" : "invalid";
      const statusText = result.exists ? "✓ Valid" : "✗ Invalid";

      let detailsHtml = "";
      if (result.exists) {
        const details = [];
        if (result.country) {
          details.push(`${result.country.flag} ${result.country.name}`);
        }
        if (result.wid) {
          details.push(`WID: ${result.wid}`);
        }
        if (details.length > 0) {
          detailsHtml = `<div class="result-details">${details.join(
            " • "
          )}</div>`;
        }
      } else if (result.error) {
        detailsHtml = `<div class="result-details" style="color: #c62828;">Error: ${result.error}</div>`;
      }

      const businessBadge = result.isBusiness
        ? `<span class="business-badge">🏢 Business</span>`
        : "";

      return `
      <div class="result-item ${statusClass}">
        <div>
          <div class="result-phone">${result.phone}</div>
          ${detailsHtml}
        </div>
        <div class="result-status">
          ${businessBadge}
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
    })
    .join("");

  resultsList.innerHTML = resultsHtml;
}

function handleFilter(filter) {
  // Update active button
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });

  // Re-render list with filter
  renderResultsList(currentResults, filter);
}

function handleExport() {
  if (currentResults.length === 0) {
    showError("No results to export");
    return;
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    total: currentResults.length,
    valid: currentResults.filter((r) => r.exists).length,
    invalid: currentResults.filter((r) => !r.exists).length,
    results: currentResults,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `whatsapp-verification-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExportCsv() {
  if (currentResults.length === 0) {
    showError("No results to export");
    return;
  }

  // Create CSV header
  let csvContent = "Phone,Status,WhatsApp ID,Error\n";

  // Add data rows
  currentResults.forEach((result) => {
    const phone = result.phone || "";
    const status = result.exists ? "Valid" : "Invalid";
    const jid = result.jid || "";
    const error = result.error || "";

    // Escape values that contain commas
    csvContent += `"${phone}","${status}","${jid}","${error}"\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `whatsapp-verification-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showError(message) {
  const errorMessage = document.getElementById("errorMessage");
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}
