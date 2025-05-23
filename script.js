const $ = (id) => document.getElementById(id);

const mainContainer = $('mainContainer');

const ID = load_value('googleSheetID') || prompt('Enter your Google Sheet ID:');
if (!ID) {
	alert('Google Sheet ID is required.');
	throw new Error('Google Sheet ID is required.');
} else {
	save_value('googleSheetID', ID);
	mainContainer.style.display = 'block';
}

const webAppUrl = `https://script.google.com/macros/s/${ID}/exec`;

const pillsElement = $('pills');
const hourElement = $('hour');
const rateElement = $('rate');

const timeZone = 'America/New_York';
const local = 'en-US';

let rate = parseFloat(load_value('rate')) || 0;

getDatesAndFloatsFromSheet().then((data) => {
	const events = data.map((e) => ({
		dosageAmount: e.value,
		dosageTime: e.date,
	}));
	events.forEach((e) => {
		populateEvent(e.dosageAmount, e.dosageTime);
	});
	plotDosageGraph(events, 'dosageChart');
	updateStatistics(events);
	setOverlayVisibility();
});

initInput(pillsElement, 'pills', 1);
initInput(hourElement, 'hour', 8);

updateRate();

['pills', 'hour'].forEach((id) => $(id).addEventListener('input', () => handleInputChange(id)));

function setOverlayVisibility(state = 'hide') {
	const overlay = $('overlay');
	if (state === 'show') {
		overlay.style.display = 'block';
	} else if (state === 'hide') {
		overlay.style.display = 'none';
	}
}

function localNow() {
	return new Date(new Date().toLocaleString(local, { timeZone: timeZone }));
}

function updateStatistics(events) {
	const totalGiven = events.reduce((sum, e) => sum + parseFloat(e.dosageAmount), 0);
	const startDate = events.length > 0 ? new Date(events[0].dosageTime) : localNow();
	const totalNeeded = rate * calculateHoursBetween(startDate, localNow());
	const currentNeeded = totalNeeded - totalGiven;

	const formatTimeOffset = (hoursOffset) =>
		new Date(Date.now() + hoursOffset * 3600000).toLocaleString(local, {
			timeZone: timeZone,
			hour: '2-digit',
			minute: '2-digit',
		});

	const setStat = (id, val) => ($(id).innerText = val);

	setStat('needed', currentNeeded.toFixed(3));
	setStat('totalGiven', totalGiven.toFixed(3));
	setStat('totalNeeded', totalNeeded.toFixed(3));

	const half = (0.5 - currentNeeded) / rate;
	const one = (1 - currentNeeded) / rate;

	setStat('half', half.toFixed(1));
	setStat('half_time', formatTimeOffset(half));
	setStat('one', one.toFixed(1));
	setStat('one_time', formatTimeOffset(one));
}

function formatTime(dosageTime) {
	return new Date(dosageTime).toLocaleString('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function initInput(element, key, defaultValue) {
	const saved = load_value(key);
	element.value = saved ?? defaultValue;
	if (!saved) save_value(key, defaultValue);
}

function handleInputChange(key) {
	const value = $(key).value;
	save_value(key, value);
	updateRate();
}

function updateRate() {
	const pills = parseFloat(pillsElement.value);
	const hours = parseFloat(hourElement.value);

	if (pills && hours) {
		rate = pills / hours;
		save_value('rate', rate);
		rateElement.innerText = rate.toFixed(3);
	} else {
		rate = 0;
		rateElement.innerText = '';
	}
}

function addNewEvent(quickAmount) {
	setOverlayVisibility('show');
	if (quickAmount) {
		const now = localNow();
		try {
			addDateAndFloatToSheet(now, quickAmount);
		} catch (error) {
			console.error('Error adding quick amount:', error);
		}
	} else {
		const amount = $('dosage_amount').value;
		const time = new Date($('new_event_datetime').value);

		if (amount && time) {
			try {
				addDateAndFloatToSheet(time, amount);
			} catch (error) {
				console.error('Error adding amount:', error);
			}
		}
	}
	setOverlayVisibility('hide');
}

function populateEvent(dosageAmount, dosageTime) {
	const container = $('add_events');
	let table = container.querySelector('table');

	if (!table) {
		table = document.createElement('table');
		table.innerHTML = `
			<thead><tr><th>Dosage Amount</th><th>Dosage Time</th></tr></thead>
			<tbody></tbody>`;
		container.appendChild(table);
	}

	const row = document.createElement('tr');
	const formattedTime = formatTime(dosageTime);

	row.innerHTML = `
		<td>${dosageAmount}</td>
		<td data-rawTime="${dosageTime}">
		${formattedTime} <input type="button" value="X" onclick="removeDosageEntry(this)" />
		</td>`;
	table.querySelector('tbody').appendChild(row);
}

function removeDosageEntry(btn) {
	setOverlayVisibility('show');
	const row = btn.closest('tr');
	const dosageTime = new Date(row.querySelector('td[data-rawTime]')?.getAttribute('data-rawTime'));
	console.log('dosageTime', dosageTime);

	if (!dosageTime) return;
	removeDateFromSheet(dosageTime);
	row.remove();
	setOverlayVisibility('hide');
}

function save_value(key, value) {
	localStorage.setItem(key, value);
}

function load_value(key) {
	return localStorage.getItem(key);
}

function setTime(id) {
	const now = localNow();

	$(id).value = now.toISOString().slice(0, 16);
}

function plotDosageGraph(events, containerId) {
	const container = $(containerId);
	container.innerHTML = '';
	const canvas = document.createElement('canvas');
	container.appendChild(canvas);

	const data = calculatePlotData(events);
	new Chart(canvas.getContext('2d'), {
		data: {
			labels: data.labels,
			datasets: [
				{
					type: 'line',
					label: 'Needed Dosage',
					data: data.recommendedIntake,
					borderColor: 'rgba(75, 192, 192, 1)',
					pointBackgroundColor: 'black',
					fill: true,
				},
			],
		},
		options: {
			scales: {
				x: { type: 'time', title: { display: true, text: 'Time' } },
				y: { beginAtZero: true, title: { display: true, text: 'Dosage Amount' } },
			},
		},
	});
}

function calculatePlotData(events) {
	if (!events.length) return { labels: [], recommendedIntake: [] };

	const labels = [];
	const recommendedIntake = [];
	let totalDosage = 0;
	const startDate = new Date(events[0].dosageTime);

	events.forEach((e, _) => {
		const time = new Date(e.dosageTime);
		const hours = calculateHoursBetween(startDate, time);
		const needed = rate * hours;
		const dose = parseFloat(e.dosageAmount);

		labels.push(time);
		recommendedIntake.push(needed - totalDosage);

		totalDosage += dose;
		labels.push(time);
		recommendedIntake.push(rate * hours - totalDosage);
	});

	const now = localNow();
	const lastDosageTime = new Date(events.at(-1).dosageTime);
	const hoursSinceLast = calculateHoursBetween(lastDosageTime, now);
	const lastNeeded = rate * (hoursSinceLast + calculateHoursBetween(startDate, lastDosageTime));
	labels.push(now);
	recommendedIntake.push(lastNeeded - totalDosage);

	return { labels, recommendedIntake };
}

function calculateHoursBetween(date1, date2) {
	const d1 = new Date(date1);
	const d2 = new Date(date2);
	return Math.abs(d2 - d1) / 36e5;
}

function triggerRefresh() {
	location.reload();
}

async function addDateAndFloatToSheet(date, floatValue) {
	try {
		const response = await fetch(
			`${webAppUrl}?action=add&date=${encodeURIComponent(date)}&floatValue=${encodeURIComponent(
				floatValue
			)}`,
			{
				method: 'POST',
			}
		);
		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Error adding data:', error);
		return { success: false, error: error.message };
	}
}

async function getDatesAndFloatsFromSheet() {
	// return [];
	try {
		const response = await fetch(`${webAppUrl}?action=get`);
		const data = await response.json();
		if (data.success) {
			return data.data;
		} else {
			console.error('Error getting data:', data.error);
			return [];
		}
	} catch (error) {
		console.error('Error getting data:', error);
		return [];
	}
}

async function removeDateFromSheet(dateToRemove) {
	try {
		const response = await fetch(
			`${webAppUrl}?action=remove&date=${encodeURIComponent(dateToRemove)}`,
			{ method: 'POST' }
		);
		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Error removing date:', error);
		return { success: false, error: error.message };
	}
}
