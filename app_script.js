const SHEET_NAME = 'Sheet1';
const DATE_HEADER = 'Date';
const AMOUNT_HEADER = 'Amount';

function ensureHeaders() {
	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(SHEET_NAME);
		const firstRow = sheet.getRange(1, 1, 1, 2).getValues()[0]; // Get the first row (headers)

		if (firstRow[0] !== DATE_HEADER || firstRow[1] !== AMOUNT_HEADER) {
			sheet.insertRowBefore(1); // Insert a new first row
			sheet.getRange(1, 1, 1, 2).setValues([[DATE_HEADER, AMOUNT_HEADER]]);
			return JSON.stringify({ success: true, message: 'Headers added.' });
		} else {
			return JSON.stringify({ success: true, message: 'Headers already exist.' });
		}
	} catch (error) {
		return JSON.stringify({ success: false, error: error.toString() });
	}
}

function addData(date, floatValue) {
	try {
		ensureHeaders();
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(SHEET_NAME);
		sheet.appendRow([date, floatValue]);
		return JSON.stringify({ success: true });
	} catch (error) {
		return JSON.stringify({ success: false, error: error.toString() });
	}
}

function getData() {
	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(SHEET_NAME);
		const data = sheet.getDataRange().getValues();
		// Remove header row
		const values = data.slice(1).map((row) => ({ date: row[0], value: parseFloat(row[1]) }));
		return JSON.stringify({ success: true, data: values });
	} catch (error) {
		return JSON.stringify({ success: false, error: error.toString() });
	}
}

function removeData(dateToRemove) {
	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(SHEET_NAME);
		const data = sheet.getDataRange().getValues();
		let removed = false;
		for (let i = data.length - 1; i >= 0; i--) {
			if (data[i][0] === dateToRemove) {
				sheet.deleteRow(i + 1);
				removed = true;
				break;
			}
		}
		return JSON.stringify({ success: true, removed: removed });
	} catch (error) {
		return JSON.stringify({ success: false, error: error.toString() });
	}
}

function doGet(e) {
	const action = e.parameter.action;
	let output;

	if (action === 'get') {
		output = ContentService.createTextOutput(getData()).setMimeType(ContentService.MimeType.JSON);
	} else if (action === 'ensureHeaders') {
		output = ContentService.createTextOutput(ensureHeaders()).setMimeType(
			ContentService.MimeType.JSON
		);
	} else {
		output = ContentService.createTextOutput(
			JSON.stringify({ success: false, error: 'Invalid action' })
		).setMimeType(ContentService.MimeType.JSON);
	}

	return output;
}

function doPost(e) {
	const action = e.parameter.action;
	if (action === 'add') {
		const date = e.parameter.date;
		const floatValue = parseFloat(e.parameter.floatValue);
		if (!isNaN(floatValue)) {
			return ContentService.createTextOutput(addData(date, floatValue)).setMimeType(
				ContentService.MimeType.JSON
			);
		} else {
			return ContentService.createTextOutput(
				JSON.stringify({ success: false, error: 'Invalid float value' })
			).setMimeType(ContentService.MimeType.JSON);
		}
	} else if (action === 'remove') {
		return ContentService.createTextOutput(removeData(e.parameter.date)).setMimeType(
			ContentService.MimeType.JSON
		);
	} else {
		return ContentService.createTextOutput(
			JSON.stringify({ success: false, error: 'Invalid action' })
		).setMimeType(ContentService.MimeType.JSON);
	}
}
