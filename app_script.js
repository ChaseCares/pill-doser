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
 * Handles adding new data to the sheet. Accepts date as a Luxon ISO string.
 * @param {object} params The parameters from the request, expecting {date: string, floatValue: string|number}.
 * @returns {object} A result object {success, message/error}.
 */
function handleAddData(params) {
	try {
		const { date: dateStr, floatValue: floatValueStr } = params;

		if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
			return {
				success: false,
				error: "Missing or invalid 'date' parameter. Expected a Luxon ISO string.",
			};
		}
		if (
			floatValueStr === undefined ||
			floatValueStr === null ||
			String(floatValueStr).trim() === ''
		) {
			return { success: false, error: "Missing or empty 'floatValue' parameter." };
		}

		// Validate if dateStr is a valid ISO 8601 string (date or datetime)
		// Regex for YYYY-MM-DDTHH:mm:ss (optional fractional seconds and timezone)
		const isoDateTimeRegex =
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|([+-]\d{2}(:\d{2})?))?$/;
		// Regex for YYYY-MM-DD
		const isoDateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

		if (!isoDateTimeRegex.test(dateStr) && !isoDateOnlyRegex.test(dateStr)) {
			return {
				success: false,
				error: `Invalid 'date' format: '${dateStr}'. Expected a valid ISO 8601 string (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ).`,
			};
		}

		const floatValue = parseFloat(String(floatValueStr));
		if (isNaN(floatValue)) {
			return { success: false, error: `Invalid floatValue: '${floatValueStr}'. Must be a number.` };
		}

		const sheet = _getSheet(SHEET_NAME);
		_internalEnsureHeaders(sheet); // Ensure headers are present

		// Store the dateStr directly as a string
		sheet.appendRow([dateStr.trim(), floatValue]);
		return { success: true, message: 'Data added successfully with ISO date string.' };
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
			if (sheet.getLastRow() === 1) _internalEnsureHeaders(sheet);
			return { success: true, data: [] };
		}

		_internalEnsureHeaders(sheet);

		const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2);
		const rawValues = dataRange.getValues();

		const values = rawValues.map((row) => {
			// Date is expected to be an ISO string as stored by handleAddData
			return {
				date: row[0], // This will be the ISO string
				value: row[1] !== null && String(row[1]).trim() !== '' ? parseFloat(String(row[1])) : null,
			};
		});

		return { success: true, data: values };
	} catch (error) {
		console.error(`Error in handleGetData: ${error.toString()}`, error.stack);
		return { success: false, error: error.message };
	}
}

/**
 * Handles removing data from the sheet based on an exact ISO date string.
 * Removes the first occurrence from the bottom that matches the ISO string.
 * @param {object} params The parameters from the request, expecting {date: string}.
 * @returns {object} A result object {success, removed, message/error}.
 */
function handleRemoveData(params) {
	try {
		const { date: dateToRemoveParam } = params;
		if (
			!dateToRemoveParam ||
			typeof dateToRemoveParam !== 'string' ||
			dateToRemoveParam.trim() === ''
		) {
			return {
				success: false,
				error: "Missing or invalid 'date' parameter for remove action. Expected an ISO string.",
			};
		}

		const targetIsoString = dateToRemoveParam.trim();

		// Optional: Validate targetIsoString format as well
		const isoDateTimeRegex =
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|([+-]\d{2}(:\d{2})?))?$/;
		const isoDateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!isoDateTimeRegex.test(targetIsoString) && !isoDateOnlyRegex.test(targetIsoString)) {
			return {
				success: false,
				error: `Invalid 'date' format for removal: '${targetIsoString}'. Expected a valid ISO 8601 string.`,
			};
		}

		const sheet = _getSheet(SHEET_NAME);
		if (sheet.getLastRow() <= 1) {
			return { success: true, removed: false, message: 'No data to remove.' };
		}

		_internalEnsureHeaders(sheet);

		const dateColumnValues = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
		let removed = false;

		for (let i = dateColumnValues.length - 1; i >= 1; i--) {
			// i = 0 is header row
			const cellValue = dateColumnValues[i][0];

			if (typeof cellValue === 'string') {
				const sheetIsoString = cellValue.trim();
				if (sheetIsoString === targetIsoString) {
					sheet.deleteRow(i + 1); // i is 0-indexed, sheet rows are 1-indexed
					removed = true;
					break;
				}
			}
		}

		if (removed) {
			return {
				success: true,
				removed: true,
				message: `Data for ISO date '${targetIsoString}' removed.`,
			};
		} else {
			return {
				success: true,
				removed: false,
				message: `No data found for ISO date '${targetIsoString}'.`,
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
		const action = e.parameter.action;
		const params = e.parameter;

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
