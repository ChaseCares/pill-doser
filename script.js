const pillsElement = document.getElementById('pills');
const hourElement = document.getElementById('hour');
const rateElement = document.getElementById('rate');

let numberOfEvents = load_value('numberOfEvents') || 0;
let rate = load_value('rate') || 0;
let events = JSON.parse(load_value('events')) || [];

initInput(pillsElement, 'pills', 1);
initInput(hourElement, 'hour', 8);

updateRate();

pillsElement.addEventListener('input', () => handleInputChange('pills'));
hourElement.addEventListener('input', () => handleInputChange('hour'));

events.forEach(addEvent);
plotDosageGraph(events, 'dosageChart');

updateStatistics();

function updateStatistics() {
	const totalGiven = events.reduce((sum, event) => sum + parseFloat(event.dosageAmount), 0);
	const totalNeeded = rate * calculateHoursBetween(startDate, new Date());
	const currentNeeded = totalNeeded - totalGiven;

	document.getElementById('needed').innerText = currentNeeded.toFixed(3);
	document.getElementById('totalGiven').innerText = totalGiven.toFixed(3);
	document.getElementById('totalNeeded').innerText = totalNeeded.toFixed(3);
}

function quickAdd(amount) {
	const now = new Date();
	const event = {
		dosageAmount: amount,
		dosageTime: now.toISOString(),
	};
	events.push(event);
	save_value('events', JSON.stringify(events));
	addEvent(event);
	plotDosageGraph(events, 'dosageChart');
}

function initInput(element, key, defaultValue) {
	const savedValue = load_value(key);
	if (savedValue) {
		element.value = savedValue;
	} else {
		element.value = defaultValue;
		save_value(key, element.value);
	}
}

function handleInputChange(key) {
	const value = document.getElementById(key).value;
	save_value(key, value);
	updateRate();
}

function updateRate() {
	const pillCount = parseFloat(pillsElement.value);
	const hourCount = parseFloat(hourElement.value);

	const rawRate = pillCount && hourCount ? pillCount / hourCount : '';
	rateElement.innerText = rawRate.toFixed(3);

	if (pillCount && hourCount) {
		rate = pillCount / hourCount;
		save_value('rate', rate);
	} else {
		rate = 0;
	}
}

function addNewEvent() {
	const dosageAmount = document.getElementById('dosage_amount').value;
	const dosageTime = document.getElementById('new_event_datetime').value;

	if (dosageAmount && dosageTime) {
		const event = { dosageAmount, dosageTime };
		events.push(event);
		save_value('events', JSON.stringify(events));
		addEvent(event);
	}

	plotDosageGraph(events, 'dosageChart');
}

function addEvent(event) {
	const eventContainer = document.getElementById('add_events');

	let table = eventContainer.querySelector('table');
	if (!table) {
		table = document.createElement('table');
		table.innerHTML = `
					<thead>
						<tr>
							<th>Dosage Amount</th>
							<th>Dosage Time</th>
						</tr>
					</thead>
					<tbody></tbody>`;
		eventContainer.appendChild(table);
	}

	const tbody = table.querySelector('tbody');
	const row = document.createElement('tr');

	const fmttedTime = new Date(event.dosageTime).toLocaleString('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
	row.innerHTML = `
				<td>${event.dosageAmount}</td>
				<td>${fmttedTime}</td>`;
	tbody.appendChild(row);
}

function save_value(key, value) {
	localStorage.setItem(key, value);
}

function load_value(key) {
	return localStorage.getItem(key);
}

function setTime(id) {
	const now = new Date();
	const offset = now.getTimezoneOffset();
	const localDate = new Date(now.getTime() - offset * 60000);
	document.getElementById(id).value = localDate.toISOString().slice(0, 16);
}

function plotDosageGraph(events, canvasContainerId) {
	const canvasContainer = document.getElementById(canvasContainerId);
	canvasContainer.innerHTML = '';
	const canvas = document.createElement('canvas');
	canvasContainer.appendChild(canvas);
	const ctx = canvas.getContext('2d');

	const data = calculatePlotData(events);

	window.dosageChart = new Chart(ctx, {
		data: {
			labels: data.labels,
			datasets: [
				{
					type: 'line',
					label: 'Ideal Dosage',
					data: data.recommendedIntake,
					borderColor: 'rgba(75, 192, 192, 1)',
					pointBackgroundColor: 'rgba(75, 192, 192, 1)',
				},
			],
		},
		options: {
			scales: {
				x: {
					type: 'time',
					title: {
						display: true,
						text: 'Time',
					},
				},
				y: {
					beginAtZero: true,
					title: {
						display: true,
						text: 'Dosage Amount',
					},
				},
			},
		},
	});
}

function calculatePlotData(events) {
	startDate = new Date(events[0].dosageTime);

	let data = {
		labels: [],
		recommendedIntake: [],
		actualRate: [],
	};

	let totalDosage = 0;
	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		const eventDate = new Date(event.dosageTime);
		const hoursDiff = calculateHoursBetween(startDate, eventDate);
		totalDosage += parseFloat(event.dosageAmount);
		const idealDosage = rate * hoursDiff - totalDosage;

		if (i != 0) {
			data.labels.push(eventDate);
			const previousEventDate = new Date(events[i - 1].dosageTime);
			const hoursBetween = calculateHoursBetween(previousEventDate, eventDate);
			data.recommendedIntake.push(rate * hoursBetween);
		}

		data.labels.push(eventDate);
		data.recommendedIntake.push(idealDosage);

		data.actualRate.push(totalDosage);
	}

	return data;
}

function calculateHoursBetween(date1, date2) {
	const d1 = new Date(date1);
	const d2 = new Date(date2);

	if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
		throw new Error('Invalid date input');
	}

	const diffMs = Math.abs(d2 - d1);

	const diffHours = diffMs / (1000 * 60 * 60);

	return diffHours;
}

function addTestData(testType) {
	if (testType === '1x12') {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - 7);
		startDate.setHours(8, 0, 0, 0);
		save_value('startTime', startDate.toISOString().slice(0, 16));
		startDate.setHours(0, 0, 0, 0);
		startDate.setDate(startDate.getDate() + 1);

		const intervalHours = 12;
		const dosesCount = 7;
		const testData = Array.from({ length: dosesCount }, (_, i) => ({
			dosageAmount: 1,
			dosageTime: new Date(startDate.getTime() + i * intervalHours * 60 * 60 * 1000).toISOString(),
		}));

		save_value('events', JSON.stringify(testData));
	}
}
