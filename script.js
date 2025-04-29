const $ = (id) => document.getElementById(id);

const pillsElement = $('pills');
const hourElement = $('hour');
const rateElement = $('rate');

let numberOfEvents = load_value('numberOfEvents') ?? 0;
let rate = parseFloat(load_value('rate')) || 0;
let events = JSON.parse(load_value('events') || '[]');

initInput(pillsElement, 'pills', 1);
initInput(hourElement, 'hour', 8);

updateRate();
updateStatistics();
implementTestData();

['pills', 'hour'].forEach((id) => $(id).addEventListener('input', () => handleInputChange(id)));

events.forEach(addEvent);
plotDosageGraph(events, 'dosageChart');

// --- Functions ---

function updateStatistics() {
	const totalGiven = events.reduce((sum, e) => sum + parseFloat(e.dosageAmount), 0);
	const startDate = events.length > 0 ? new Date(events[0].dosageTime) : new Date();
	const totalNeeded = rate * calculateHoursBetween(startDate, new Date());
	const currentNeeded = totalNeeded - totalGiven;

	const formatTimeOffset = (hoursOffset) =>
		new Date(Date.now() + hoursOffset * 3600000).toLocaleString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
		});

	const setStat = (id, val) => ($(id).innerText = val);

	setStat('needed', currentNeeded.toFixed(3));
	setStat('totalGiven', totalGiven.toFixed(3));
	setStat('totalNeeded', totalNeeded.toFixed(3));

	const half = (Math.abs(currentNeeded) + 0.5) / rate;
	const one = (Math.abs(currentNeeded) + 1) / rate;

	setStat('half', half.toFixed(1));
	setStat('half_time', formatTimeOffset(half));
	setStat('one', one.toFixed(1));
	setStat('one_time', formatTimeOffset(one));
}

function quickAdd(amount) {
	const now = new Date().toISOString();
	const event = { dosageAmount: amount, dosageTime: now };

	events.push(event);
	saveEvents();
	addEvent(event);
	plotDosageGraph(events, 'dosageChart');
	updateStatistics();
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

	updateStatistics();
}

function addNewEvent() {
	const amount = $('dosage_amount').value;
	const time = $('new_event_datetime').value;

	if (amount && time) {
		const event = { dosageAmount: amount, dosageTime: time };
		events.push(event);
		events.sort((a, b) => new Date(a.dosageTime) - new Date(b.dosageTime));
		saveEvents();
		addEvent(event);
		plotDosageGraph(events, 'dosageChart');
		updateStatistics();
	}
}

function addEvent(event) {
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
	const formattedTime = new Date(event.dosageTime).toLocaleString('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});

	row.innerHTML = `
		<td>${event.dosageAmount}</td>
		<td data-rawTime="${event.dosageTime}">
		${formattedTime} <input type="button" value="X" onclick="removeDosageEntry(this)" />
		</td>`;
	table.querySelector('tbody').appendChild(row);
}

function removeDosageEntry(btn) {
	const row = btn.closest('tr');
	const dosageTime = row.querySelector('td[data-rawTime]')?.getAttribute('data-rawTime');

	if (!dosageTime) return;

	events = events.filter((e) => e.dosageTime !== dosageTime);
	saveEvents();
	row.remove();
	plotDosageGraph(events, 'dosageChart');
	updateStatistics();
}

function saveEvents() {
	save_value('events', JSON.stringify(events));
}

function save_value(key, value) {
	localStorage.setItem(key, value);
}

function load_value(key) {
	return localStorage.getItem(key);
}

function setTime(id) {
	const now = new Date();
	now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
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

	events.forEach((e, i) => {
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

	const now = new Date();
	const last = new Date(events.at(-1).dosageTime);
	labels.push(now);
	recommendedIntake.push(rate * calculateHoursBetween(last, now));

	return { labels, recommendedIntake };
}

function calculateHoursBetween(date1, date2) {
	const d1 = new Date(date1);
	const d2 = new Date(date2);
	return Math.abs(d2 - d1) / 36e5; // 36e5 = 3600000 ms = 1 hour
}

function implementTestData() {
	const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
	if (!isDev) return;

	$('testDataContainer').innerHTML = `
		<h3>Test data</h3>
		<input type="button" value="Clear all" onclick="localStorage.clear()" />
		<input type="button" value="1 pill every 12 hours for 7 days" onclick="populateTestData('1x12')" />`;
}

function populateTestData(testType) {
	if (testType !== '1x12') return;

	const start = new Date();
	start.setDate(start.getDate() - 7);
	start.setHours(8, 0, 0, 0);
	save_value('startTime', start.toISOString().slice(0, 16));
	start.setDate(start.getDate() + 1);
	start.setHours(0, 0, 0, 0);

	const testData = Array.from({ length: 13 }, (_, i) => ({
		dosageAmount: i % 2 === 0 ? '1' : '0.5',
		dosageTime: new Date(start.getTime() + i * 12 * 3600000).toISOString(),
	}));

	save_value('events', JSON.stringify(testData));
	location.reload();
}
