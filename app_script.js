/**
 * @fileoverview Script for managing data in a Google Sheet via a web app.
 * Allows adding, retrieving, and removing data entries with a date and an amount.
 * Ensures that headers "Date" and "Amount" are present in the specified sheet.
 */

// --- Global Constants ---
const SHEET_NAME = 'Sheet1';
const DATE_HEADER = 'Date';
const AMOUNT_HEADER = 'Amount';

// --- Utility Functions ---

/**
 * Retrieves the specified sheet by name.
 * @param {string} sheetName The name of the sheet to retrieve.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The sheet object.
 * @throws {Error} If the sheet is not found.
 */
function _getSheet(sheetName) {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = ss.getSheetByName(sheetName);
	if (!sheet) {
		// You could also create the sheet here if preferred:
		// return ss.insertSheet(sheetName);
		throw new Error(`Sheet "${sheetName}" not found.`);
	}
	return sheet;
}

/**
 * Creates a standard JSON response for the web app.
 * @param {object} data The data object to stringify and return.
 * @returns {GoogleAppsScript.Content.TextOutput} The JSON content service output.
 */
function _createJsonResponse(data) {
	return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
		ContentService.MimeType.JSON
	);
}

/**
 * Ensures that the standard headers ("Date", "Amount") are present in the first row of the sheet.
 * If not, it inserts a new row at the top and adds the headers.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet object to check/modify.
 * @returns {{changed: boolean, message: string}} An object indicating if headers were changed and a descriptive message.
 */
function _internalEnsureHeaders(sheet) {
	if (sheet.getLastRow() === 0) {
		// Sheet is completely empty
		sheet.getRange(1, 1, 1, 2).setValues([[DATE_HEADER, AMOUNT_HEADER]]);
		Logger.log('Headers added to empty sheet.');
		return { changed: true, message: 'Headers added to empty sheet.' };
	}

	// Check existing first row headers
	const maxCols = sheet.getMaxColumns();
	let currentHeader1 = '';
	let currentHeader2 = '';

	if (maxCols >= 1) {
		currentHeader1 = sheet.getRange(1, 1).getValue();
	}
	if (maxCols >= 2) {
		currentHeader2 = sheet.getRange(1, 2).getValue();
	}

	if (currentHeader1 !== DATE_HEADER || currentHeader2 !== AMOUNT_HEADER) {
		sheet.insertRowBefore(1);
		sheet.getRange(1, 1, 1, 2).setValues([[DATE_HEADER, AMOUNT_HEADER]]);
		Logger.log('Headers (re-)inserted at the first row.');
		return { changed: true, message: 'Headers (re-)inserted at the first row.' };
	}
	Logger.log('Headers already exist and are correct.');
	return { changed: false, message: 'Headers already exist and are correct.' };
}

// --- API Handler Functions ---

/**
 * Handles the 'ensureHeaders' action.
 * @returns {object} A result object {success, message/error}.
 */
function handleEnsureHeaders() {
	try {
		const sheet = _getSheet(SHEET_NAME);
		const result = _internalEnsureHeaders(sheet);
		return { success: true, message: result.message, headersChanged: result.changed };
	} catch (error) {
		console.error(`Error in handleEnsureHeaders: ${error.toString()}`, error.stack);
		return { success: false, error: error.message };
	}
}

/**
 * Handles adding new data to the sheet.
 * @param {object} params The parameters from the request, expecting {date, floatValue}.
 * @returns {object} A result object {success, message/error}.
 */
function handleAddData(params) {
	try {
		const { date: dateStr, floatValue: floatValueStr } = params;

		if (!dateStr || floatValueStr === undefined || floatValueStr === null) {
			return { success: false, error: "Missing 'date' or 'floatValue' parameter." };
		}

		const floatValue = parseFloat(floatValueStr);
		if (isNaN(floatValue)) {
			return { success: false, error: `Invalid floatValue: '${floatValueStr}'. Must be a number.` };
		}

		let dateObject;
		try {
			dateObject = new Date(dateStr);
			if (isNaN(dateObject.getTime())) {
				throw new Error('Invalid date string format.');
			}
		} catch (e) {
			return { success: false, error: `Invalid date string: '${dateStr}'. Could not parse.` };
		}

		const sheet = _getSheet(SHEET_NAME);
		_internalEnsureHeaders(sheet); // Ensure headers are present

		sheet.appendRow([dateObject, floatValue]);
		return { success: true, message: 'Data added successfully.' };
	} catch (error) {
		console.error(`Error in handleAddData: ${error.toString()}`, error.stack);
		return { success: false, error: error.message };
	}
}

/**
 * Handles retrieving data from the sheet.
 * @returns {object} A result object {success, data[]/error}.
 */
function handleGetData() {
	try {
		const sheet = _getSheet(SHEET_NAME);

		if (sheet.getLastRow() <= 1) {
			// Only header row or empty
			// Ensure headers exist if sheet is not completely empty but only has 1 row.
			if (sheet.getLastRow() === 1) _internalEnsureHeaders(sheet);
			return { success: true, data: [] };
		}

		_internalEnsureHeaders(sheet); // Ensure headers are what we expect before processing data.

		const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2); // Get data below header
		const rawValues = dataRange.getValues();

		const values = rawValues.map((row) => {
			let dateVal = row[0];
			// Dates from getValues() are usually Date objects if formatted as dates in sheet.
			// JSON.stringify will convert Date objects to ISO 8601 strings.
			return {
				date: dateVal,
				value: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
			};
		});

		return { success: true, data: values };
	} catch (error) {
		console.error(`Error in handleGetData: ${error.toString()}`, error.stack);
		return { success: false, error: error.message };
	}
}

/**
 * Handles removing data from the sheet based on a date.
 * Removes the first occurrence from the bottom that matches the date.
 * @param {object} params The parameters from the request, expecting {date}.
 * @returns {object} A result object {success, removed, message/error}.
 */
function handleRemoveData(params) {
	try {
		const { date: dateToRemoveParam } = params;
		if (!dateToRemoveParam) {
			return { success: false, error: "Missing 'date' parameter for remove action." };
		}

		let targetDateObject;
		try {
			targetDateObject = new Date(dateToRemoveParam);
			if (isNaN(targetDateObject.getTime())) {
				throw new Error('Invalid date string format for removal.');
			}
		} catch (e) {
			return { success: false, error: `Invalid date string for removal: '${dateToRemoveParam}'.` };
		}
		const targetDateString = Utilities.formatDate(
			targetDateObject,
			Session.getScriptTimeZone(),
			'yyyy-MM-dd'
		);

		const sheet = _getSheet(SHEET_NAME);
		if (sheet.getLastRow() <= 1) {
			// No data rows to remove
			return { success: true, removed: false, message: 'No data to remove.' };
		}

		_internalEnsureHeaders(sheet); // Ensure headers are in place

		const data = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues(); // Get only the date column with headers
		let removed = false;

		// Iterate backwards from the last data row (excluding header if present)
		for (let i = data.length - 1; i >= 1; i--) {
			// i = 0 is header row
			const cellValue = data[i][0];
			let cellDateString = '';

			if (cellValue instanceof Date) {
				cellDateString = Utilities.formatDate(cellValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
			} else if (typeof cellValue === 'string' && cellValue.trim() !== '') {
				try {
					const d = new Date(cellValue);
					if (!isNaN(d.getTime())) {
						cellDateString = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
					} else {
						// If it's a string but not a valid date, it won't match our targetDateString format
						cellDateString = cellValue.trim(); // Or simply continue
					}
				} catch (e) {
					cellDateString = cellValue.trim();
				}
			} else {
				continue; // Skip empty or non-date/non-string cells
			}

			if (cellDateString === targetDateString) {
				sheet.deleteRow(i + 1); // i is 0-indexed, sheet rows are 1-indexed
				removed = true;
				break; // Remove only the first match from the bottom
			}
		}

		if (removed) {
			return {
				success: true,
				removed: true,
				message: `Data for date '${targetDateString}' removed.`,
			};
		} else {
			return {
				success: true,
				removed: false,
				message: `No data found for date '${targetDateString}'.`,
			};
		}
	} catch (error) {
		console.error(`Error in handleRemoveData: ${error.toString()}`, error.stack);
		return { success: false, error: error.message };
	}
}

// --- Web App Entry Points ---

/**
 * Handles GET requests to the web app.
 * Supported actions: 'get', 'ensureHeaders'.
 * @param {GoogleAppsScript.Events.DoGet} e The event parameter.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response.
 */
function doGet(e) {
	let result;
	try {
		const action = e.parameter.action;
		switch (action) {
			case 'get':
				result = handleGetData();
				break;
			case 'ensureHeaders':
				result = handleEnsureHeaders();
				break;
			default:
				result = { success: false, error: `Invalid action '${action}' for GET request.` };
				break;
		}
	} catch (error) {
		console.error(`Critical error in doGet: ${error.toString()}`, error.stack);
		result = { success: false, error: 'A server error occurred in doGet: ' + error.message };
	}
	return _createJsonResponse(result);
}

/**
 * Handles POST requests to the web app.
 * Supported actions: 'add', 'remove'.
 * @param {GoogleAppsScript.Events.DoPost} e The event parameter.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response.
 */
function doPost(e) {
	let result;
	try {
		// POST parameters are typically in e.postData.contents if it's a JSON payload
		// or e.parameter for form data. The original script uses e.parameter.
		// If using JSON payload, you'd do: const params = JSON.parse(e.postData.contents);
		// Sticking to e.parameter as per original script for action parameter.
		const action = e.parameter.action;
		const params = e.parameter; // Pass all parameters to handlers

		switch (action) {
			case 'add':
				result = handleAddData(params);
				break;
			case 'remove':
				result = handleRemoveData(params);
				break;
			default:
				result = { success: false, error: `Invalid action '${action}' for POST request.` };
				break;
		}
	} catch (error) {
		console.error(`Critical error in doPost: ${error.toString()}`, error.stack);
		result = { success: false, error: 'A server error occurred in doPost: ' + error.message };
	}
	return _createJsonResponse(result);
}
