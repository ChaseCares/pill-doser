// --- Configuration & Constants ---
const GOOGLE_SHEET_ID_KEY = 'googleSheetID';
const RATE_KEY = 'rate';
const PILLS_KEY = 'pills';
const HOUR_KEY = 'hour';
const DEFAULT_PILLS = 1;
const DEFAULT_HOUR = 8;
const TIME_ZONE = 'America/New_York'; // Consider making this configurable if needed
const LOCALE = 'en-US'; // Consider making this configurable

// --- DOM Element Selectors ---
const $ = (id) => document.getElementById(id);

const mainContainer = $('mainContainer');
const pillsElement = $(PILLS_KEY);
const hourElement = $(HOUR_KEY);
const rateElement = $('rate');
const overlay = $('overlay');
const dosageAmountInput = $('dosage_amount');
const newEventDatetimeInput = $('new_event_datetime');
const addEventsContainer = $('add_events');
const dosageChartContainer = $('dosageChart');

// --- Utility Functions ---
const saveToLocalStorage = (key, value) => localStorage.setItem(key, value);
const loadFromLocalStorage = (key) => localStorage.getItem(key);
const getLocalNow = () => new Date(new Date().toLocaleString(LOCALE, { timeZone: TIME_ZONE }));

const formatDateTime = (dateString) => {
	return new Date(dateString).toLocaleString(LOCALE, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: TIME_ZONE,
	});
};

const formatTimeOffset = (hoursOffset) => {
	return new Date(Date.now() + hoursOffset * 3600000).toLocaleString(LOCALE, {
		timeZone: TIME_ZONE,
		hour: '2-digit',
		minute: '2-digit',
	});
};

const calculateHoursBetween = (date1, date2) => {
	const d1 = new Date(date1);
	const d2 = new Date(date2);
	if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
		console.warn('Invalid date provided to calculateHoursBetween:', date1, date2);
		return 0;
	}
	return Math.abs(d2 - d1) / 36e5; // 36e5 is 1 hour in milliseconds
};

// --- Application State ---
let currentRate = parseFloat(loadFromLocalStorage(RATE_KEY)) || 0;
let eventsData = []; // To store events data locally for reuse

// --- Google Sheet API Interaction ---
let GOOGLE_SHEET_ID = loadFromLocalStorage(GOOGLE_SHEET_ID_KEY);
if (!GOOGLE_SHEET_ID) {
	GOOGLE_SHEET_ID = prompt('Enter your Google Sheet ID:');
	if (!GOOGLE_SHEET_ID) {
		alert('Google Sheet ID is required to run the application.');
		throw new Error('Google Sheet ID is required.');
	}
	saveToLocalStorage(GOOGLE_SHEET_ID_KEY, GOOGLE_SHEET_ID);
}
mainContainer.style.display = 'block'; // Show main container after ID is set

const WEB_APP_URL = `https://script.google.com/macros/s/${GOOGLE_SHEET_ID}/exec`;

async function fetchFromSheet(action, params = {}) {
	setOverlayVisibility(true);
	const url = new URL(WEB_APP_URL);
	url.searchParams.append('action', action);
	for (const key in params) {
		url.searchParams.append(key, params[key]);
	}

	try {
		const response = await fetch(url, {
			method: action === 'get' ? 'GET' : 'POST', // Use GET for 'get' action, POST for others
			// For POST, body might be needed if not using query params, but current setup uses query params
		});
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		if (!data.success && data.error) {
			console.error(`Error from sheet API (${action}):`, data.error);
			alert(`Error interacting with Google Sheet: ${data.error}`);
		}
		return data;
	} catch (error) {
		console.error(`Failed to ${action} data:`, error);
		alert(`Failed to ${action} data. Please check your connection and Sheet ID.`);
		return { success: false, error: error.message, data: [] }; // Return empty data on failure
	} finally {
		setOverlayVisibility(false);
	}
}

const getEventsFromSheet = async () => {
	const result = await fetchFromSheet('get');
	return result.success ? result.data : [];
};

const addEventToSheet = async (date, floatValue) => {
	return fetchFromSheet('add', { date: date.toISOString(), floatValue });
};

const removeEventFromSheet = async (dateToRemove) => {
	return fetchFromSheet('remove', { date: dateToRemove.toISOString() });
};

// --- UI Update Functions ---
function setOverlayVisibility(show) {
	overlay.style.display = show ? 'block' : 'none';
}

function updateRateDisplay() {
	const pills = parseFloat(pillsElement.value);
	const hours = parseFloat(hourElement.value);

	if (!isNaN(pills) && !isNaN(hours) && hours !== 0) {
		currentRate = pills / hours;
		saveToLocalStorage(RATE_KEY, currentRate.toString());
		rateElement.innerText = currentRate.toFixed(3);
	} else {
		currentRate = 0;
		saveToLocalStorage(RATE_KEY, '0'); // Save '0' if invalid
		rateElement.innerText = 'N/A'; // Indicate invalid input
	}
	// After rate changes, statistics and graph should ideally update
	if (eventsData.length > 0) {
		updateStatisticsDisplay(eventsData);
		plotDosageGraph(eventsData);
	}
}

function updateStatisticsDisplay(events) {
	if (!events || events.length === 0) {
		['needed', 'totalGiven', 'totalNeeded', 'half', 'half_time', 'one', 'one_time'].forEach(
			(id) => ($(id).innerText = 'N/A')
		);
		return;
	}

	const totalGiven = events.reduce((sum, e) => sum + parseFloat(e.dosageAmount || 0), 0);
	const startDate = new Date(events[0].dosageTime);
	const now = getLocalNow();
	const hoursElapsed = calculateHoursBetween(startDate, now);
	const totalNeeded = currentRate * hoursElapsed;
	const currentNeeded = Math.max(0, totalNeeded - totalGiven); // Needed cannot be negative

	const setStat = (id, val) => {
		const element = $(id);
		if (element) {
			element.innerText = val;
		} else {
			console.warn(`Statistic element with ID '${id}' not found.`);
		}
	};

	setStat('needed', currentNeeded.toFixed(3));
	setStat('totalGiven', totalGiven.toFixed(3));
	setStat('totalNeeded', totalNeeded.toFixed(3));

	if (currentRate > 0) {
		const halfDosageTimeOffset = (0.5 - currentNeeded) / currentRate;
		const oneDosageTimeOffset = (1 - currentNeeded) / currentRate;

		setStat('half', halfDosageTimeOffset.toFixed(1));
		setStat('half_time', formatTimeOffset(halfDosageTimeOffset));
		setStat('one', oneDosageTimeOffset.toFixed(1));
		setStat('one_time', formatTimeOffset(oneDosageTimeOffset));
	} else {
		setStat('half', 'N/A');
		setStat('half_time', 'N/A');
		setStat('one', 'N/A');
		setStat('one_time', 'N/A');
	}
}

function populateEventRow(dosageAmount, dosageTime) {
	let table = addEventsContainer.querySelector('table');
	if (!table) {
		table = document.createElement('table');
		table.innerHTML = `
            <thead><tr><th>Dosage Amount</th><th>Dosage Time</th><th>Action</th></tr></thead>
            <tbody></tbody>`;
		addEventsContainer.appendChild(table);
	}

	const row = table.querySelector('tbody').insertRow();
	row.insertCell().textContent = dosageAmount;

	const timeCell = row.insertCell();
	timeCell.textContent = formatDateTime(dosageTime);
	timeCell.dataset.rawTime = new Date(dosageTime).toISOString();

	const actionCell = row.insertCell();
	const removeButton = document.createElement('input');
	removeButton.type = 'button';
	removeButton.value = 'X';
	removeButton.onclick = () => removeDosageEntryHandler(removeButton);
	actionCell.appendChild(removeButton);
}

function plotDosageGraph(events) {
	dosageChartContainer.innerHTML = ''; // Clear previous chart
	if (!events || events.length === 0 || typeof Chart === 'undefined') {
		dosageChartContainer.textContent = 'No data to display or Chart.js not loaded.';
		return;
	}

	const canvas = document.createElement('canvas');
	dosageChartContainer.appendChild(canvas);

	const { labels, recommendedIntake } = calculatePlotData(events);

	new Chart(canvas.getContext('2d'), {
		data: {
			labels: labels,
			datasets: [
				{
					type: 'line',
					label: 'Needed Dosage Over Time',
					data: recommendedIntake,
					borderColor: 'rgba(75, 192, 192, 1)',
					backgroundColor: 'rgba(75, 192, 192, 0.2)', // Added fill color
					// tension: 0.1, // Smoother line
					fill: true,
				},
			],
		},
		options: {
			responsive: true,
			scales: {
				x: {
					type: 'time',
					time: {
						tooltipFormat: 'MMM dd, yyyy HH:mm', // Improved tooltip format
						unit: 'hour', // Adjust unit based on data span
					},
					title: { display: true, text: 'Time' },
				},
				y: {
					beginAtZero: true,
					title: { display: true, text: 'Dosage Amount' },
				},
			},
			plugins: {
				// Added for Chart.js v3+
				tooltip: {
					mode: 'index',
					intersect: false,
				},
				legend: {
					position: 'top',
				},
			},
		},
	});
}

function calculatePlotData(events) {
	// Handles empty events or invalid rate
	if (!events || events.length === 0 || currentRate <= 0) {
		return { labels: [], recommendedIntake: [] };
	}

	const labels = [];
	const recommendedIntakeValues = []; // Using a different variable name internally for clarity
	let cumulativeDosage = 0;

	// Ensure events are sorted by time for correct processing
	const sortedEvents = [...events].sort((a, b) => new Date(a.dosageTime) - new Date(b.dosageTime));

	const firstEventTime = new Date(sortedEvents[0].dosageTime);

	sortedEvents.forEach((event) => {
		const eventTime = new Date(event.dosageTime);
		const dosageAmount = parseFloat(event.dosageAmount);

		// Calculate hours from the very first event to the current event
		const hoursFromStart = calculateHoursBetween(firstEventTime, eventTime);
		// Ideal total dosage that should have been taken by this event's time
		const idealTotalIntakeByEventTime = currentRate * hoursFromStart;

		// Point 1: Value just BEFORE taking the current dose
		// Represents (Ideal total intake by now) - (Actual total taken *before* this dose)
		labels.push(eventTime);
		recommendedIntakeValues.push(idealTotalIntakeByEventTime - cumulativeDosage);

		// Add current dose to cumulative dosage
		cumulativeDosage += dosageAmount;

		// Point 2: Value just AFTER taking the current dose
		// Represents (Ideal total intake by now) - (Actual total taken *after* this dose)
		labels.push(eventTime); // Same time as Point 1
		recommendedIntakeValues.push(idealTotalIntakeByEventTime - cumulativeDosage);
	});

	// Project to current time (or slightly beyond if last dose was very recent)
	const now = getLocalNow();
	const lastRecordedEventTime =
		sortedEvents.length > 0
			? new Date(sortedEvents[sortedEvents.length - 1].dosageTime)
			: firstEventTime;

	// Determine a point for the end of the graph line
	// If 'now' is significantly after the last event, use 'now'.
	// If 'now' is very close to or before the last event time (e.g., due to clock sync issues or future-dated entries),
	// project a bit into the future from the last event to ensure the line extends.
	let projectionTime = now;
	if (now.getTime() < lastRecordedEventTime.getTime() + 3600000) {
		// If 'now' is less than 1 hour past last event
		projectionTime = new Date(lastRecordedEventTime.getTime() + 2 * 3600000); // Project 2 hours past last dose
	}
	// However, if user strictly wants it to end at 'now', this can be simplified to: const projectionTime = now;

	const hoursFromStartToProjection = calculateHoursBetween(firstEventTime, projectionTime);
	const idealTotalIntakeByProjection = currentRate * hoursFromStartToProjection;

	labels.push(projectionTime);
	recommendedIntakeValues.push(idealTotalIntakeByProjection - cumulativeDosage);

	return { labels: labels, recommendedIntake: recommendedIntakeValues };
}

// --- Event Handlers ---
function handleInputChange(key) {
	const value = $(key).value;
	saveToLocalStorage(key, value);
	if (key === PILLS_KEY || key === HOUR_KEY) {
		updateRateDisplay();
	}
}

async function addNewEventHandler(quickAmount) {
	setOverlayVisibility(true); // Show overlay at the start
	let amount, time;

	if (quickAmount && !isNaN(parseFloat(quickAmount))) {
		amount = parseFloat(quickAmount);
		time = getLocalNow();
	} else {
		amount = parseFloat(dosageAmountInput.value);
		const timeValue = newEventDatetimeInput.value;
		if (!timeValue) {
			alert('Please select a valid date and time.');
			setOverlayVisibility(false);
			return;
		}
		time = new Date(timeValue); // Uses local time from input
	}

	if (isNaN(amount) || amount <= 0) {
		alert('Please enter a valid positive dosage amount.');
		setOverlayVisibility(false);
		return;
	}
	if (isNaN(time.getTime())) {
		alert('Invalid date/time selected.');
		setOverlayVisibility(false);
		return;
	}

	const result = await addEventToSheet(time, amount);
	if (result.success) {
		const newEvent = { dosageAmount: amount, dosageTime: time.toISOString() };
		eventsData.push(newEvent);
		eventsData.sort((a, b) => new Date(a.dosageTime) - new Date(b.dosageTime)); // Keep sorted

		populateEventRow(amount, time);
		updateStatisticsDisplay(eventsData);
		plotDosageGraph(eventsData);
		// Clear input fields after successful submission only if not a quick add
		if (!quickAmount) {
			dosageAmountInput.value = '';
			// newEventDatetimeInput.value = ''; // Optionally clear time
		}
	} else {
		alert('Failed to add event to the sheet. Please try again.');
	}
	// Overlay is hidden by fetchFromSheet finally block
}

async function removeDosageEntryHandler(buttonElement) {
	if (!confirm('Are you sure you want to remove this entry?')) return;

	setOverlayVisibility(true);
	const row = buttonElement.closest('tr');
	const timeCell = row.cells[1]; // Assuming time is in the second cell
	const rawTime = timeCell?.dataset.rawTime;

	if (!rawTime) {
		console.error('Could not find raw time data for removal.');
		alert('Error: Could not identify the entry to remove.');
		setOverlayVisibility(false);
		return;
	}

	const dosageTimeToRemove = new Date(rawTime);
	const result = await removeEventFromSheet(dosageTimeToRemove);

	if (result.success) {
		row.remove();
		// Update local eventsData
		eventsData = eventsData.filter(
			(event) => new Date(event.dosageTime).getTime() !== dosageTimeToRemove.getTime()
		);
		updateStatisticsDisplay(eventsData);
		plotDosageGraph(eventsData);
		if (addEventsContainer.querySelector('tbody')?.children.length === 0) {
			const table = addEventsContainer.querySelector('table');
			if (table) table.remove(); // Remove table if no rows left
		}
	} else {
		alert('Failed to remove event from the sheet. Please try again.');
	}
	// Overlay is hidden by fetchFromSheet finally block
}

function initInputField(element, storageKey, defaultValue) {
	const savedValue = loadFromLocalStorage(storageKey);
	element.value = savedValue ?? defaultValue.toString();
	if (savedValue === null) {
		// Only save if it wasn't already there
		saveToLocalStorage(storageKey, defaultValue.toString());
	}
}

// --- Initialization ---
async function initializeApp() {
	setOverlayVisibility(true); // Show overlay during initial load

	initInputField(pillsElement, PILLS_KEY, DEFAULT_PILLS);
	initInputField(hourElement, HOUR_KEY, DEFAULT_HOUR);
	updateRateDisplay(); // Initialize rate display

	// Set up event listeners
	[PILLS_KEY, HOUR_KEY].forEach((id) => {
		const element = $(id);
		if (element) {
			element.addEventListener('input', () => handleInputChange(id));
		}
	});

	// Expose functions to global scope if they are called from HTML (e.g., onclick)
	window.addNewEvent = addNewEventHandler; // If called like <button onclick="addNewEvent()">
	window.removeDosageEntry = removeDosageEntryHandler; // If called directly from old onclick
	window.setTime = (id) => {
		// Keep as is if simple
		const now = getLocalNow();
		const element = $(id);
		if (element) element.value = now.toISOString().slice(0, 16);
	};
	window.triggerRefresh = () => location.reload();

	const sheetData = await getEventsFromSheet();
	if (sheetData.length > 0) {
		eventsData = sheetData
			.map((e) => ({
				dosageAmount: parseFloat(e.value), // Ensure it's a number
				dosageTime: new Date(e.date).toISOString(), // Standardize date format
			}))
			.sort((a, b) => new Date(a.dosageTime) - new Date(b.dosageTime)); // Sort by date

		eventsData.forEach((event) => {
			populateEventRow(event.dosageAmount, event.dosageTime);
		});
	}

	updateStatisticsDisplay(eventsData);
	plotDosageGraph(eventsData);
	// Overlay is hidden by fetchFromSheet finally block if getEventsFromSheet is the last async call
	// or explicitly hide if there are synchronous operations after the last await.
	setOverlayVisibility(false); // Ensure it's hidden after all setup
}

// --- Global Event Listeners (if any, besides direct HTML ones) ---
// e.g., document.addEventListener('DOMContentLoaded', initializeApp);
// For simplicity, assuming initializeApp is called when the script runs and DOM is ready.
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApp);
} else {
	initializeApp(); // DOM is already loaded
}
