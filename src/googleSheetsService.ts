import { getAccessToken } from './googleAuth';
import type { SavedBookingRecord } from './booking';

const SHEET_NAME = 'Appointments';
const SPREADSHEET_ID_STORAGE_KEY = 'laurentian_sheets_id';

export interface SheetAppendResult {
  success: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNewSheet: boolean;
  message?: string;
}

/**
 * Get saved spreadsheet ID from localStorage or null
 */
export const getSavedSpreadsheetId = (): string | null => {
  try {
    return localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Save custom spreadsheet ID
 */
export const saveSpreadsheetId = (id: string) => {
  try {
    localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, id.trim());
  } catch (e) {
    console.warn('Could not save spreadsheet id to localStorage', e);
  }
};

/**
 * Create a new Laurentian EcoClean Appointments Spreadsheet
 */
export const createEcoCleanSpreadsheet = async (token: string): Promise<{ id: string; url: string }> => {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'Laurentian EcoClean — Client Appointments & Bookings'
      },
      sheets: [
        {
          properties: {
            title: SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Failed to create spreadsheet (HTTP ${createRes.status})`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = createdData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write header row with stylish descriptive columns
  const headerValues = [
    [
      'Booking ID',
      'Date Booked',
      'Customer Name',
      'Phone',
      'Email',
      'Service Package',
      'Property Size',
      'Frequency',
      'Scheduled Date',
      'Arrival Window',
      'Service Address',
      'City / Region',
      'Est. Total (CAD)',
      'Special Eco Notes & Instructions',
      'Status'
    ]
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(SHEET_NAME)}!A1:O1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: `${SHEET_NAME}!A1:O1`,
      majorDimension: 'ROWS',
      values: headerValues
    })
  });

  // Save for future appointment appends
  saveSpreadsheetId(spreadsheetId);

  return {
    id: spreadsheetId,
    url: spreadsheetUrl
  };
};

/**
 * Ensure sheet tab exists and has headers, or create if needed
 */
export const ensureHeadersInSpreadsheet = async (spreadsheetId: string, token: string): Promise<string> => {
  // Check sheet tabs
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!metaRes.ok) {
    throw new Error(`Cannot access spreadsheet ID ${spreadsheetId}. Please check permissions or ID.`);
  }

  const metaData = await metaRes.json();
  const sheetsList = metaData.sheets || [];
  const targetSheet = sheetsList.find((s: any) => s.properties?.title === SHEET_NAME) || sheetsList[0];
  const activeSheetTitle = targetSheet?.properties?.title || 'Sheet1';

  // Check if first row has headers
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(activeSheetTitle)}!A1:O1`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (checkRes.ok) {
    const valData = await checkRes.json();
    if (!valData.values || valData.values.length === 0 || valData.values[0].length === 0) {
      // Write header row
      const headerValues = [
        [
          'Booking ID',
          'Date Booked',
          'Customer Name',
          'Phone',
          'Email',
          'Service Package',
          'Property Size',
          'Frequency',
          'Scheduled Date',
          'Arrival Window',
          'Service Address',
          'City / Region',
          'Est. Total (CAD)',
          'Special Eco Notes & Instructions',
          'Status'
        ]
      ];

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(activeSheetTitle)}!A1:O1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `${activeSheetTitle}!A1:O1`,
          majorDimension: 'ROWS',
          values: headerValues
        })
      });
    }
  }

  return activeSheetTitle;
};

/**
 * Append booking row to Google Sheet
 */
export const appendBookingToGoogleSheet = async (
  booking: SavedBookingRecord
): Promise<SheetAppendResult> => {
  const token = getAccessToken();
  if (!token) {
    return {
      success: false,
      spreadsheetId: '',
      spreadsheetUrl: '',
      isNewSheet: false,
      message: 'Google Account not signed in with Sheets access.'
    };
  }

  try {
    let targetId = getSavedSpreadsheetId();
    let isNewSheet = false;
    let spreadsheetUrl = '';

    // If no existing spreadsheet, create one automatically
    if (!targetId) {
      const created = await createEcoCleanSpreadsheet(token);
      targetId = created.id;
      spreadsheetUrl = created.url;
      isNewSheet = true;
    } else {
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
    }

    // Determine target sheet title
    let targetSheetTitle = SHEET_NAME;
    try {
      targetSheetTitle = await ensureHeadersInSpreadsheet(targetId, token);
    } catch {
      // If previous sheet failed or was removed, create a fresh one
      const created = await createEcoCleanSpreadsheet(token);
      targetId = created.id;
      spreadsheetUrl = created.url;
      targetSheetTitle = SHEET_NAME;
      isNewSheet = true;
    }

    // Format formatted date
    const dateBookedFormatted = new Date(booking.createdAt).toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const rowData = [
      booking.bookingId,
      dateBookedFormatted,
      booking.clientName,
      booking.clientPhone,
      booking.clientEmail,
      booking.service,
      booking.propertySize,
      booking.frequency,
      booking.preferredDate,
      booking.timeSlot,
      booking.serviceAddress,
      booking.cityArea,
      `$${booking.estimatedPrice} CAD`,
      booking.notes || 'None provided',
      booking.status || 'Confirmed'
    ];

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(targetSheetTitle)}!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    
    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [rowData]
      })
    });

    if (!appendRes.ok) {
      const errJson = await appendRes.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Failed to append row (HTTP ${appendRes.status})`);
    }

    return {
      success: true,
      spreadsheetId: targetId,
      spreadsheetUrl,
      isNewSheet,
      message: 'Appointment successfully saved to Google Sheets.'
    };
  } catch (error: any) {
    console.error('Error saving appointment to Google Sheets:', error);
    return {
      success: false,
      spreadsheetId: getSavedSpreadsheetId() || '',
      spreadsheetUrl: '',
      isNewSheet: false,
      message: error?.message || 'Could not sync with Google Sheets.'
    };
  }
};
