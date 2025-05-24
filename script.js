// --- Configuration & Constants ---
const GOOGLE_SHEET_ID_KEY = 'googleSheetID';
const RATE_KEY = 'rate';
const PILLS_KEY = 'pills';
const HOUR_KEY = 'hour';
const TIME_ZONE_KEY = 'timeZone';
const DEFAULT_PILLS = 1;
const DEFAULT_HOUR = 8;
const LOCALE = 'en-US';

// --- DOM Element Selectors ---
const $ = (id) => document.getElementById(id);

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

/**
 * Validates if a string is a valid IANA time zone using Luxon.
 * @param {string} timeZoneString - The time zone string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidIANATimeZone(timeZoneString) {
	if (!timeZoneString || typeof timeZoneString !== 'string') {
		return false;
	}
	return luxon.DateTime.local().setZone(timeZoneString).isValid;
}

let timeZone = loadFromLocalStorage(TIME_ZONE_KEY);
if (!timeZone) {
	timeZone = prompt(
		`Enter your time zone (e.g., America/New_York, Europe/London, Asia/Tokyo): Current detected system zone is approx ${
			luxon.DateTime.local().zoneName
		}`
	);
	if (!timeZone) {
		alert('Time zone is required to run the application.');
		throw new Error('Time zone is required.');
	}
	if (!isValidIANATimeZone(timeZone)) {
		alert(`Invalid time zone format: "${timeZone}". Please enter a valid IANA time zone.`);
		throw new Error('Invalid time zone format. Provided: ' + timeZone);
	}
	saveToLocalStorage(TIME_ZONE_KEY, timeZone);
}

/**
 * Gets the current date and time as a Luxon DateTime object in the configured time zone.
 * @returns {luxon.DateTime}
 */
const getLocalNow = () => luxon.DateTime.now().setZone(timeZone);

/**
 * Formats a date input (Luxon DateTime, ISO string, or JS Date) into a localized string.
 * @param {luxon.DateTime | string | Date} dateInput - The date input.
 * @returns {string} Formatted date-time string.
 */
const formatDateTime = (dateInput) => {
	let dt;
	if (dateInput instanceof luxon.DateTime) {
		dt = dateInput;
	} else if (typeof dateInput === 'string') {
		dt = luxon.DateTime.fromISO(dateInput);
	} else if (dateInput instanceof Date) {
		dt = luxon.DateTime.fromJSDate(dateInput);
	}

	if (!dt || !dt.isValid) {
		console.warn(
			'Invalid dateInput for formatDateTime:',
			dateInput,
			dt ? dt.invalidReason : 'Unknown input type'
		);
		return 'Invalid Date';
	}
	return dt.setZone(timeZone).toFormat('MM/dd/yyyy, hh:mm a', { locale: LOCALE });
};

/**
 * Formats a time based on an offset from now.
 * @param {number} hoursOffset - The offset in hours from the current time.
 * @returns {string} Formatted time string (e.g., "03:45 PM").
 */
const formatTimeOffset = (hoursOffset) => {
	const dtWithOffset = getLocalNow().plus({ hours: hoursOffset });
	return dtWithOffset.toFormat('hh:mm a', { locale: LOCALE });
};

/**
 * Calculates the absolute difference in hours between two dates.
 * @param {luxon.DateTime | string | Date} dateTime1Input
 * @param {luxon.DateTime | string | Date} dateTime2Input
 * @returns {number} Absolute hours between dates, or 0 if dates are invalid.
 */
const calculateHoursBetween = (dateTime1Input, dateTime2Input) => {
	const toLuxonDT = (input) => {
		if (input instanceof luxon.DateTime) return input.isValid ? input : null;
		if (typeof input === 'string') {
			const parsed = luxon.DateTime.fromISO(input);
			return parsed.isValid ? parsed : null;
		}
		if (input instanceof Date) {
			const parsed = luxon.DateTime.fromJSDate(input);
			return parsed.isValid ? parsed : null;
		}
		return null;
	};

	const dt1 = toLuxonDT(dateTime1Input);
	const dt2 = toLuxonDT(dateTime2Input);

	if (!dt1 || !dt1.isValid || !dt2 || !dt2.isValid) {
		console.warn('Invalid date provided to calculateHoursBetween:', {
			input1: dateTime1Input,
			input2: dateTime2Input,
			parsed1Valid: dt1 ? dt1.isValid : false,
			parsed2Valid: dt2 ? dt2.isValid : false,
			reason1: dt1 ? dt1.invalidReason : 'N/A',
			reason2: dt2 ? dt2.invalidReason : 'N/A',
		});
		return 0;
	}
	return Math.abs(dt2.diff(dt1, 'hours').hours);
};

// --- Application State ---
let currentRate = parseFloat(loadFromLocalStorage(RATE_KEY)) || 0;
let eventsData = [];

// --- Google Sheet API Interaction ---
let googleSheetID = loadFromLocalStorage(GOOGLE_SHEET_ID_KEY);
if (!googleSheetID) {
	googleSheetID = prompt('Enter your Google Sheet ID:');
	if (!googleSheetID) {
		alert('Google Sheet ID is required to run the application.');
		throw new Error('Google Sheet ID is required.');
	}
	saveToLocalStorage(GOOGLE_SHEET_ID_KEY, googleSheetID);
}

const WEB_APP_URL = `https://script.google.com/macros/s/${googleSheetID}/exec`;

async function fetchFromSheet(action, params = {}) {
	setOverlayVisibility(true);
	const url = new URL(WEB_APP_URL);
	url.searchParams.append('action', action);
	for (const key in params) {
		if (Object.hasOwnProperty.call(params, key)) {
			url.searchParams.append(key, params[key]);
		}
	}

	try {
		const response = await fetch(url, {
			method: action === 'get' ? 'GET' : 'POST',
		});
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}, message: ${await response.text()}`);
		}
		const data = await response.json();
		if (!data.success && data.error) {
			console.error(`Error from sheet API (${action}):`, data.error);
			alert(`Error interacting with Google Sheet: ${data.error}`);
		}
		return data;
	} catch (error) {
		console.error(`Failed to ${action} data:`, error);
		alert(
			`Failed to ${action} data. Please check your connection, Sheet ID, and script deployment. Details: ${error.message}`
		);
		return { success: false, error: error.message, data: [] };
	} finally {
		setOverlayVisibility(false);
	}
}

const getEventsFromSheet = async () => {
	const result = await fetchFromSheet('get');
	return result.success ? result.data : [];
};

const addEventToSheet = async (luxonDateTime, floatValue) => {
	return fetchFromSheet('add', { date: luxonDateTime.toISO(), floatValue: floatValue.toString() });
};

const removeEventFromSheet = async (luxonDateTimeToRemove) => {
	return fetchFromSheet('remove', { date: luxonDateTimeToRemove.toISO() });
};

// --- UI Update Functions ---
function updateTimeDisplay() {
	const timeCheckNowDiv = $('timeCheckNow');
	const timeZoneDiv = $('timeZoneDisplay');
	const localCodeDiv = $('localCode');

	if (timeZoneDiv) timeZoneDiv.innerText = `Time Zone: ${timeZone}`;
	if (localCodeDiv) localCodeDiv.innerText = `Locale: ${LOCALE}`;

	const now = getLocalNow();
	if (timeCheckNowDiv) timeCheckNowDiv.innerText = `Current DateTime: ${formatDateTime(now)}`;
}

function setOverlayVisibility(show) {
	if (overlay) overlay.style.display = show ? 'block' : 'none';
}

function updateRateDisplay() {
	const pills = parseFloat(pillsElement.value);
	const hours = parseFloat(hourElement.value);

	if (!isNaN(pills) && !isNaN(hours) && hours !== 0) {
		currentRate = pills / hours;
		saveToLocalStorage(RATE_KEY, currentRate.toString());
		if (rateElement) rateElement.innerText = currentRate.toFixed(1);
	} else {
		currentRate = 0;
		saveToLocalStorage(RATE_KEY, '0');
		if (rateElement) rateElement.innerText = 'N/A';
	}

	if (eventsData.length > 0 || currentRate > 0) {
		updateStatisticsDisplay(eventsData);
		plotDosageGraph(eventsData);
	}
}

function updateStatisticsDisplay(events) {
	const statsElementsIds = [
		'needed',
		'totalGiven',
		'totalNeeded',
		'half',
		'half_time',
		'one',
		'one_time',
	];
	if (!events || (events.length === 0 && currentRate === 0)) {
		statsElementsIds.forEach((id) => {
			const elem = $(id);
			if (elem) elem.innerText = 'N/A';
		});
		return;
	}

	const totalGiven = events.reduce((sum, e) => sum + (parseFloat(e.dosageAmount) || 0), 0);

	const firstEventDT = events.length > 0 ? luxon.DateTime.fromISO(events[0].dosageTime) : null;
	const nowDT = getLocalNow();

	let hoursElapsed = 0;
	if (firstEventDT && firstEventDT.isValid) {
		hoursElapsed = calculateHoursBetween(firstEventDT, nowDT);
	} else if (events.length > 0) {
		//Edge case: first event time was invalid
		console.warn('First event time was invalid for stats calculation.');
	}

	const totalNeededIdeal = currentRate * hoursElapsed;
	const currentNeeded = Math.max(0, totalNeededIdeal - totalGiven);

	const setStat = (id, value) => {
		const element = $(id);
		if (element) element.innerText = value;
		else console.warn(`Statistic element with ID '${id}' not found.`);
	};

	setStat('needed', currentNeeded.toFixed(1));
	setStat('totalGiven', totalGiven.toFixed(1));
	setStat('totalNeeded', totalNeededIdeal.toFixed(1));

	if (currentRate > 0) {
		const halfDosageTimeOffsetHours = (0.5 - currentNeeded) / currentRate;
		const oneDosageTimeOffsetHours = (1.0 - currentNeeded) / currentRate;

		setStat('half', `${halfDosageTimeOffsetHours.toFixed(1)} hrs`);
		setStat('half_time', formatTimeOffset(halfDosageTimeOffsetHours));
		setStat('one', `${oneDosageTimeOffsetHours.toFixed(1)} hrs`);
		setStat('one_time', formatTimeOffset(oneDosageTimeOffsetHours));
	} else {
		['half', 'half_time', 'one', 'one_time'].forEach((id) => setStat(id, 'N/A'));
	}
}

function populateEventRow(dosageAmount, dosageTimeISO) {
	if (!addEventsContainer) return;
	let table = addEventsContainer.querySelector('table');
	if (!table) {
		table = document.createElement('table');
		table.innerHTML = `
            <thead>
                <tr>
                    <th>Dosage Amount</th>
                    <th>Dosage Time</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody></tbody>`;
		addEventsContainer.appendChild(table);
	}
	const tbody = table.querySelector('tbody');
	if (!tbody) return;

	const row = tbody.insertRow();
	row.insertCell().textContent = dosageAmount.toFixed(1);

	const timeCell = row.insertCell();
	timeCell.textContent = formatDateTime(dosageTimeISO);
	timeCell.dataset.rawTime = dosageTimeISO;

	const actionCell = row.insertCell();
	const removeButton = document.createElement('input');
	removeButton.type = 'button';
	removeButton.value = 'X';
	removeButton.className = 'remove-button';
	removeButton.onclick = () => removeDosageEntryHandler(removeButton);
	actionCell.appendChild(removeButton);
}

let dosageChartInstance = null;

function plotDosageGraph(events) {
	if (!dosageChartContainer) return;
	dosageChartContainer.innerHTML = '';

	if (typeof Chart === 'undefined') {
		dosageChartContainer.textContent = 'Chart.js library not loaded.';
		return;
	}
	if (typeof luxon === 'undefined') {
		dosageChartContainer.textContent = 'Luxon library not loaded.';
		return;
	}

	if (!events || events.length === 0 || currentRate <= 0) {
		dosageChartContainer.textContent =
			'No data to display or rate is zero. Enter data and set a rate.';
		if (dosageChartInstance) {
			dosageChartInstance.destroy();
			dosageChartInstance = null;
		}
		return;
	}

	const canvas = document.createElement('canvas');
	dosageChartContainer.appendChild(canvas);

	const { labels: luxonDateTimeLabels, neededDataPoints } = calculatePlotData(events);

	if (luxonDateTimeLabels.length === 0 && neededDataPoints.length === 0) {
		dosageChartContainer.textContent = 'Not enough data to plot the graph after processing.';
		if (dosageChartInstance) {
			dosageChartInstance.destroy();
			dosageChartInstance = null;
		}
		return;
	}

	if (dosageChartInstance) {
		dosageChartInstance.destroy();
	}

	dosageChartInstance = new Chart(canvas.getContext('2d'), {
		type: 'line',
		data: {
			labels: luxonDateTimeLabels,
			datasets: [
				{
					label: 'Needed Dosage (Deficit)',
					data: neededDataPoints,
					borderColor: 'rgb(99, 211, 255)',
					backgroundColor: 'rgba(84, 83, 83, 0.2)',
					fill: true,
				},
			],
		},
		options: {
			responsive: true,
			scales: {
				x: {
					type: 'time',
					adapters: {
						date: {
							zone: timeZone,
							locale: LOCALE,
						},
					},
					time: {
						tooltipFormat: 'MMM d, yyyy, hh:mm a ZZZZ',
						displayFormats: {
							millisecond: 'HH:mm:ss.SSS',
							second: 'HH:mm:ss',
							minute: 'HH:mm',
							hour: 'h a',
							day: 'MMM d',
							week: 'MMM d, yyyy',
							month: 'MMM yyyy',
							quarter: 'QQQ yyyy',
							year: 'yyyy',
						},
					},
					title: { display: true, text: `Time (${timeZone})` },
				},
				y: {
					beginAtZero: false,
					title: { display: true, text: 'Dosage Units Needed' },
				},
			},
			plugins: {
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
	if (!events || events.length === 0 || currentRate <= 0) {
		return { labels: [], neededDataPoints: [] };
	}

	const sortedEvents = [...events].sort(
		(a, b) =>
			luxon.DateTime.fromISO(a.dosageTime).toMillis() -
			luxon.DateTime.fromISO(b.dosageTime).toMillis()
	);

	const labels = [];
	const neededDataPoints = [];
	let cumulativeDosageTaken = 0;
	const firstEventTimeDT = luxon.DateTime.fromISO(sortedEvents[0].dosageTime).setZone(timeZone);

	if (!firstEventTimeDT.isValid) {
		console.error('First event time is invalid in calculatePlotData:', sortedEvents[0].dosageTime);
		return { labels: [], neededDataPoints: [] };
	}

	labels.push(firstEventTimeDT);
	neededDataPoints.push(0);

	sortedEvents.forEach((event, _) => {
		const eventTimeDT = luxon.DateTime.fromISO(event.dosageTime).setZone(timeZone);
		if (!eventTimeDT.isValid) {
			console.warn('Skipping invalid event time in calculatePlotData:', event.dosageTime);
			return;
		}
		const dosageAmount = parseFloat(event.dosageAmount);

		const hoursFromStart = calculateHoursBetween(firstEventTimeDT, eventTimeDT);
		const idealTotalIntakeByEventTime = currentRate * hoursFromStart;

		// Point before dose
		const timeBeforeDoseDT = eventTimeDT.minus({ milliseconds: 1 });
		// Ensure labels are chronological and distinct if needed for stepped appearance
		if (labels.length > 0 && timeBeforeDoseDT > labels[labels.length - 1]) {
			labels.push(timeBeforeDoseDT);
			neededDataPoints.push(idealTotalIntakeByEventTime - cumulativeDosageTaken);
		}

		// Point at dose time, reflecting state before this dose
		if (labels.length === 0 || eventTimeDT > labels[labels.length - 1]) {
			labels.push(eventTimeDT);
			neededDataPoints.push(idealTotalIntakeByEventTime - cumulativeDosageTaken);
		} else if (labels.length > 0 && eventTimeDT.equals(labels[labels.length - 1])) {
			// If same time, update last point (state before dose)
			neededDataPoints[neededDataPoints.length - 1] =
				idealTotalIntakeByEventTime - cumulativeDosageTaken;
		}

		cumulativeDosageTaken += dosageAmount;

		// Point at dose time, reflecting state after this dose
		labels.push(eventTimeDT); // Same time for vertical step
		neededDataPoints.push(idealTotalIntakeByEventTime - cumulativeDosageTaken);
	});

	const nowDT = getLocalNow();

	const hoursFromStartToProjection = calculateHoursBetween(firstEventTimeDT, nowDT);
	const idealTotalIntakeByProjection = currentRate * hoursFromStartToProjection;

	labels.push(nowDT);
	neededDataPoints.push(idealTotalIntakeByProjection - cumulativeDosageTaken);

	// Deduplicate adjacent time points if values are the same, simplify graph data
	const finalLabels = [];
	const finalNeededData = [];
	if (labels.length > 0) {
		finalLabels.push(labels[0]);
		finalNeededData.push(neededDataPoints[0]);
		for (let i = 1; i < labels.length; i++) {
			// Keep point if time is different OR if value is different at same time (for steps)
			if (!labels[i].equals(labels[i - 1]) || neededDataPoints[i] !== neededDataPoints[i - 1]) {
				// Also, if time is same as previous, but also same as one before previous, and values form a spike (up then down)
				// then the middle point might be redundant if it's a "return to previous". This logic can get complex.
				// For now, simple deduplication:
				if (labels[i].equals(labels[i - 1]) && neededDataPoints[i] === neededDataPoints[i - 1]) {
					continue;
				}
				finalLabels.push(labels[i]);
				finalNeededData.push(neededDataPoints[i]);
			}
		}
	}

	return { labels: finalLabels, neededDataPoints: finalNeededData };
}

// --- Event Handlers ---
function handleInputChange(storageKey) {
	const element = $(storageKey);
	if (element) {
		saveToLocalStorage(storageKey, element.value);
		if (storageKey === PILLS_KEY || storageKey === HOUR_KEY) {
			updateRateDisplay();
		}
	}
}

async function addNewEventHandler(quickAmount) {
	let amount;
	let eventTimeDT;

	if (quickAmount && !isNaN(parseFloat(quickAmount))) {
		amount = parseFloat(quickAmount);
		eventTimeDT = getLocalNow();
	} else {
		if (!dosageAmountInput || !newEventDatetimeInput) {
			alert('Input fields not found.');
			return;
		}
		amount = parseFloat(dosageAmountInput.value);
		const timeValue = newEventDatetimeInput.value; // "YYYY-MM-DDTHH:MM"

		if (!timeValue) {
			alert('Please select a valid date and time for the new event.');
			return;
		}
		// Interpret the datetime-local string as being in the application's configured timeZone
		eventTimeDT = luxon.DateTime.fromISO(timeValue, { zone: timeZone });
	}

	if (isNaN(amount) || amount <= 0) {
		alert('Please enter a valid positive dosage amount.');
		return;
	}
	if (!eventTimeDT || !eventTimeDT.isValid) {
		alert(
			`Invalid date/time selected: ${
				eventTimeDT ? eventTimeDT.invalidReason : 'Could not parse'
			}. Please use YYYY-MM-DDTHH:MM format.`
		);
		return;
	}

	setOverlayVisibility(true);
	try {
		const result = await addEventToSheet(eventTimeDT, amount);
		if (result.success) {
			const newEvent = { dosageAmount: amount, dosageTime: eventTimeDT.toISO() };
			eventsData.push(newEvent);
			eventsData.sort(
				(a, b) =>
					luxon.DateTime.fromISO(a.dosageTime).toMillis() -
					luxon.DateTime.fromISO(b.dosageTime).toMillis()
			);

			populateEventRow(amount, eventTimeDT.toISO());
			updateStatisticsDisplay(eventsData);
			plotDosageGraph(eventsData);

			if (!quickAmount && dosageAmountInput) {
				dosageAmountInput.value = '';
			}
		} else {
			alert(`Failed to add event: ${result.error || 'Unknown error from sheet API'}`);
		}
	} catch (error) {
		console.error('Error in addNewEventHandler:', error);
		alert('An unexpected error occurred while adding the event.');
	} finally {
		setOverlayVisibility(false);
	}
}

async function removeDosageEntryHandler(buttonElement) {
	if (!confirm('Are you sure you want to remove this entry?')) return;

	const row = buttonElement.closest('tr');
	if (!row) {
		alert('Could not find table row.');
		return;
	}
	const timeCell = row.cells[1];
	const rawTimeISO = timeCell?.dataset.rawTime;

	if (!rawTimeISO) {
		alert('Error: Could not identify the entry to remove (missing time data).');
		return;
	}

	const dosageTimeToRemoveDT = luxon.DateTime.fromISO(rawTimeISO);
	if (!dosageTimeToRemoveDT.isValid) {
		alert('Error: Stored time for removal is invalid.');
		return;
	}

	setOverlayVisibility(true);
	try {
		const result = await removeEventFromSheet(dosageTimeToRemoveDT);
		if (result.success && result.removed) {
			console.log('Event removed successfully:', result);
			row.remove();
			eventsData = eventsData.filter(
				(event) =>
					luxon.DateTime.fromISO(event.dosageTime).toMillis() !== dosageTimeToRemoveDT.toMillis()
			);
			updateStatisticsDisplay(eventsData);
			plotDosageGraph(eventsData);

			if (addEventsContainer?.querySelector('tbody')?.children.length === 0) {
				const table = addEventsContainer.querySelector('table');
				if (table) table.remove();
			}
		} else {
			console.error(
				'Failed to remove event:',
				result,
				'dosageTimeToRemoveDT',
				dosageTimeToRemoveDT
			);
			alert(`Failed to remove event: ${result.error || 'Unknown error from sheet API'}`);
		}
	} catch (error) {
		console.error('Error in removeDosageEntryHandler:', error);
		alert('An unexpected error occurred while removing the event.');
	} finally {
		setOverlayVisibility(false);
	}
}

function initInputField(element, storageKey, defaultValue) {
	if (!element) return;
	const savedValue = loadFromLocalStorage(storageKey);
	element.value = savedValue ?? defaultValue.toString();
	if (savedValue === null) {
		saveToLocalStorage(storageKey, defaultValue.toString());
	}
}

// --- Initialization ---
async function initializeApp() {
	setOverlayVisibility(true);

	initInputField(pillsElement, PILLS_KEY, DEFAULT_PILLS);
	initInputField(hourElement, HOUR_KEY, DEFAULT_HOUR);
	updateRateDisplay();

	updateTimeDisplay();
	setInterval(updateTimeDisplay, 60000);

	[PILLS_KEY, HOUR_KEY].forEach((id) => {
		const element = $(id);
		if (element) element.addEventListener('input', () => handleInputChange(id));
	});

	window.addNewEvent = addNewEventHandler;
	window.setTimeOnField = (elementId) => {
		const element = $(elementId);
		if (element && element instanceof HTMLInputElement) {
			const nowDT = getLocalNow(); // Luxon DateTime in target zone
			element.value = nowDT.toFormat("yyyy-MM-dd'T'HH:mm");
		} else {
			console.warn(`Element with ID '${elementId}' not found or not an input.`);
		}
	};
	window.triggerRefresh = () => location.reload(true);

	try {
		const sheetEvents = await getEventsFromSheet();
		if (sheetEvents.length > 0) {
			eventsData = sheetEvents
				.filter(
					(e) =>
						e &&
						typeof e.date !== 'undefined' &&
						typeof e.value !== 'undefined' &&
						luxon.DateTime.fromISO(e.date).isValid
				)
				.map((e) => ({
					dosageAmount: parseFloat(e.value),
					dosageTime: luxon.DateTime.fromISO(e.date).toISO(),
				}))
				.sort(
					(a, b) =>
						luxon.DateTime.fromISO(a.dosageTime).toMillis() -
						luxon.DateTime.fromISO(b.dosageTime).toMillis()
				);

			if (addEventsContainer) addEventsContainer.innerHTML = '';
			eventsData.forEach((event) => {
				populateEventRow(event.dosageAmount, event.dosageTime);
			});
		}
	} catch (error) {
		console.error('Error fetching initial data:', error);
		alert('Could not load initial data. Check console for details.');
	}

	updateStatisticsDisplay(eventsData);
	plotDosageGraph(eventsData);
	setOverlayVisibility(false);
}

// --- App Start ---
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApp);
} else {
	initializeApp();
}
