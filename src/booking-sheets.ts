import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

// Memory-only access token caching (Strictly follows Workspace integration security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;
let currentUser: User | null = null;
let currentSpreadsheetId: string | null = localStorage.getItem('laurentian_booking_sheets_id');

export interface BookingFormData {
  service: string;
  propertySize: string;
  frequency: string;
  preferredDate: string;
  timeSlot: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  serviceAddress: string;
  cityArea: string;
  notes: string;
  estimatedPrice: number;
}

// Auth state listeners
type AuthCallback = (user: User | null, token: string | null) => void;
const authListeners: AuthCallback[] = [];

export const onAuthStatusChange = (cb: AuthCallback) => {
  authListeners.push(cb);
  cb(currentUser, cachedAccessToken);
};

const notifyAuthChange = () => {
  authListeners.forEach(cb => cb(currentUser, cachedAccessToken));
};

// Listen to Firebase auth changes
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    cachedAccessToken = null;
  }
  notifyAuthChange();
});

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not retrieve Google OAuth access token. Please ensure Google Sheets permission is granted.');
    }
    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    notifyAuthChange();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-in failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  currentUser = null;
  notifyAuthChange();
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  return null;
};

export const getCurrentSpreadsheetLink = (): string | null => {
  if (currentSpreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}/edit`;
  }
  return null;
};

/**
 * Creates or verifies a Google Spreadsheet dedicated to Laurentian EcoClean Bookings
 */
export const ensureSpreadsheet = async (token: string): Promise<string> => {
  // If we already have a spreadsheet ID saved, check if it's accessible
  if (currentSpreadsheetId) {
    try {
      const checkRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${currentSpreadsheetId}?fields=spreadsheetId,properties.title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (checkRes.ok) {
        return currentSpreadsheetId;
      }
    } catch {
      // Continue to create new one if previous is invalid or inaccessible
    }
  }

  // Create a new Google Spreadsheet with structured headers
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'Laurentian EcoClean Co. — Customer Bookings'
      },
      sheets: [
        {
          properties: {
            title: 'Bookings',
            gridProperties: {
              rowCount: 500,
              columnCount: 15,
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Sheet: ${errText}`);
  }

  const sheetData = await createRes.json();
  const newSheetId = sheetData.spreadsheetId;
  currentSpreadsheetId = newSheetId;
  localStorage.setItem('laurentian_booking_sheets_id', newSheetId);

  // Initialize Header Row with professional formatting
  const headers = [
    'Booking ID',
    'Date Submitted (PST)',
    'Customer Name',
    'Phone',
    'Email',
    'Street Address',
    'City / Region',
    'Cleaning Service',
    'Property Size',
    'Service Frequency',
    'Scheduled Date',
    'Time Window',
    'Estimated Price ($CAD)',
    'Special Eco Preferences & Notes',
    'Booking Status'
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/Bookings!A1:O1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers]
      })
    }
  );

  return newSheetId;
};

/**
 * Appends a booking record into the user's Google Sheet
 */
export const saveBookingToGoogleSheets = async (
  booking: BookingFormData,
  token: string
): Promise<{ success: boolean; spreadsheetUrl: string; bookingId: string }> => {
  const sheetId = await ensureSpreadsheet(token);
  const now = new Date();
  const dateSubmitted = now.toLocaleString('en-CA', {
    timeZone: 'America/Vancouver',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const bookingId = `LEC-${now.getFullYear()}-${randomNum}`;

  const rowValues = [
    bookingId,
    dateSubmitted,
    booking.clientName,
    booking.clientPhone,
    booking.clientEmail,
    booking.serviceAddress,
    booking.cityArea,
    booking.service,
    booking.propertySize,
    booking.frequency,
    booking.preferredDate,
    booking.timeSlot,
    `$${booking.estimatedPrice.toFixed(2)} CAD`,
    booking.notes || 'None specified',
    'Confirmed • Pending Dispatch'
  ];

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Bookings!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowValues]
      })
    }
  );

  if (!appendRes.ok) {
    const errorText = await appendRes.text();
    throw new Error(`Google Sheets API append failed: ${errorText}`);
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
  return {
    success: true,
    spreadsheetUrl,
    bookingId
  };
};

/**
 * Price estimation logic
 */
export const calculateEstimate = (
  service: string,
  propertySize: string,
  frequency: string
): number => {
  let basePrice = 145; // Base for 1 bed / studio

  switch (propertySize) {
    case '1-bed':
      basePrice = 145;
      break;
    case '2-bed':
      basePrice = 195;
      break;
    case '3-bed':
      basePrice = 245;
      break;
    case '4-bed-plus':
      basePrice = 320;
      break;
    case 'commercial-small':
      basePrice = 280;
      break;
    case 'commercial-large':
      basePrice = 450;
      break;
    default:
      basePrice = 195;
  }

  // Service multiplier / addition
  if (service.includes('Deep') || service === 'deep-clean') {
    basePrice *= 1.4;
  } else if (service.includes('Move') || service === 'move-in-out') {
    basePrice *= 1.5;
  } else if (service.includes('Post-Renovation') || service === 'post-reno') {
    basePrice *= 1.6;
  } else if (service.includes('Commercial') || service === 'commercial') {
    basePrice *= 1.25;
  }

  // Recurring discount
  if (frequency === 'weekly') {
    basePrice *= 0.85; // 15% off
  } else if (frequency === 'bi-weekly') {
    basePrice *= 0.90; // 10% off
  } else if (frequency === 'monthly') {
    basePrice *= 0.95; // 5% off
  }

  return Math.round(basePrice);
};

// UI DOM Controller when loaded
document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('bookingForm') as HTMLFormElement | null;
  const quoteDisplay = document.getElementById('liveQuoteAmount');
  const quoteBreakdown = document.getElementById('liveQuoteBreakdown');
  const googleStatusBadge = document.getElementById('googleSheetsAuthStatus');
  const googleSignInBtn = document.getElementById('sheetsSignInBtn');
  const googleSignOutBtn = document.getElementById('sheetsSignOutBtn');
  const viewSheetBtn = document.getElementById('viewGoogleSheetLink') as HTMLAnchorElement | null;
  const submitBtn = document.getElementById('bookingSubmitBtn') as HTMLButtonElement | null;
  const confirmationModal = document.getElementById('bookingConfirmModal');
  const confirmProceedBtn = document.getElementById('confirmBookingProceedBtn');
  const confirmCancelBtn = document.getElementById('confirmBookingCancelBtn');
  const successModal = document.getElementById('bookingSuccessModal');
  const closeSuccessBtn = document.getElementById('closeSuccessModalBtn');

  // Input elements
  const serviceSelect = document.getElementById('bookingService') as HTMLSelectElement | null;
  const sizeSelect = document.getElementById('bookingPropertySize') as HTMLSelectElement | null;
  const frequencySelect = document.getElementById('bookingFrequency') as HTMLSelectElement | null;
  const dateInput = document.getElementById('bookingDate') as HTMLInputElement | null;

  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const minDateStr = `${yyyy}-${mm}-${dd}`;
    dateInput.min = minDateStr;
    dateInput.value = minDateStr;
  }

  const updatePriceQuote = () => {
    if (!serviceSelect || !sizeSelect || !frequencySelect || !quoteDisplay) return;
    const est = calculateEstimate(
      serviceSelect.value,
      sizeSelect.value,
      frequencySelect.value
    );
    quoteDisplay.textContent = `$${est} CAD`;
    if (quoteBreakdown) {
      const freqText = frequencySelect.options[frequencySelect.selectedIndex]?.text || '';
      const sizeText = sizeSelect.options[sizeSelect.selectedIndex]?.text || '';
      quoteBreakdown.textContent = `${sizeText} • ${freqText}`;
    }
  };

  [serviceSelect, sizeSelect, frequencySelect].forEach((el) => {
    el?.addEventListener('change', updatePriceQuote);
  });
  updatePriceQuote();

  // Handle Auth UI updates
  onAuthStatusChange((user, token) => {
    const isConnected = !!(user && token);

    if (googleStatusBadge) {
      if (isConnected) {
        googleStatusBadge.innerHTML = `
          <div class="google-sync-indicator connected">
            <span class="status-pulse-dot"></span>
            <div>
              <strong>Connected with Google:</strong> ${user?.displayName || user?.email || 'Active'}
              <div class="sheet-sync-subtext">Bookings automatically sync to your Google Sheet</div>
            </div>
          </div>
        `;
      } else {
        googleStatusBadge.innerHTML = `
          <div class="google-sync-indicator disconnected">
            <span class="status-neutral-dot"></span>
            <div>
              <strong>Google Sheets Sync:</strong> Not connected
              <div class="sheet-sync-subtext">Connect your Google account to automatically store bookings into Google Sheets</div>
            </div>
          </div>
        `;
      }
    }

    if (googleSignInBtn) {
      googleSignInBtn.style.display = isConnected ? 'none' : 'inline-flex';
    }
    if (googleSignOutBtn) {
      googleSignOutBtn.style.display = isConnected ? 'inline-flex' : 'none';
    }

    if (viewSheetBtn) {
      const sheetLink = getCurrentSpreadsheetLink();
      if (sheetLink && isConnected) {
        viewSheetBtn.href = sheetLink;
        viewSheetBtn.style.display = 'inline-flex';
      } else {
        viewSheetBtn.style.display = 'none';
      }
    }
  });

  googleSignInBtn?.addEventListener('click', async () => {
    try {
      googleSignInBtn.classList.add('loading');
      await googleSignIn();
    } catch (err: any) {
      alert(err.message || 'Failed to sign in with Google');
    } finally {
      googleSignInBtn.classList.remove('loading');
    }
  });

  googleSignOutBtn?.addEventListener('click', async () => {
    try {
      await logoutGoogle();
    } catch (err) {
      console.error(err);
    }
  });

  // Stored pending booking state for confirmation
  let pendingBooking: BookingFormData | null = null;

  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const service = serviceSelect?.value || 'residential';
      const size = sizeSelect?.value || '2-bed';
      const frequency = frequencySelect?.value || 'one-time';
      const preferredDate = (document.getElementById('bookingDate') as HTMLInputElement)?.value || '';
      const timeSlot = (document.getElementById('bookingTime') as HTMLSelectElement)?.value || 'Morning (8:00 AM - 12:00 PM)';
      const clientName = (document.getElementById('bookingName') as HTMLInputElement)?.value || '';
      const clientPhone = (document.getElementById('bookingPhone') as HTMLInputElement)?.value || '';
      const clientEmail = (document.getElementById('bookingEmail') as HTMLInputElement)?.value || '';
      const serviceAddress = (document.getElementById('bookingAddress') as HTMLInputElement)?.value || '';
      const cityArea = (document.getElementById('bookingCity') as HTMLSelectElement)?.value || 'Vancouver';
      const notes = (document.getElementById('bookingNotes') as HTMLTextAreaElement)?.value || '';
      const estimatedPrice = calculateEstimate(service, size, frequency);

      pendingBooking = {
        service: serviceSelect?.options[serviceSelect.selectedIndex]?.text || service,
        propertySize: sizeSelect?.options[sizeSelect.selectedIndex]?.text || size,
        frequency: frequencySelect?.options[frequencySelect.selectedIndex]?.text || frequency,
        preferredDate,
        timeSlot,
        clientName,
        clientPhone,
        clientEmail,
        serviceAddress,
        cityArea,
        notes,
        estimatedPrice
      };

      // Fill in Confirmation Modal Details
      const modalSummary = document.getElementById('confirmModalSummary');
      if (modalSummary) {
        modalSummary.innerHTML = `
          <div class="confirm-summary-row"><span>Service:</span> <strong>${pendingBooking.service}</strong></div>
          <div class="confirm-summary-row"><span>Property Size:</span> <strong>${pendingBooking.propertySize}</strong></div>
          <div class="confirm-summary-row"><span>Frequency:</span> <strong>${pendingBooking.frequency}</strong></div>
          <div class="confirm-summary-row"><span>Date & Window:</span> <strong>${pendingBooking.preferredDate} (${pendingBooking.timeSlot})</strong></div>
          <div class="confirm-summary-row"><span>Customer:</span> <strong>${pendingBooking.clientName} (${pendingBooking.clientPhone})</strong></div>
          <div class="confirm-summary-row"><span>Address:</span> <strong>${pendingBooking.serviceAddress}, ${pendingBooking.cityArea}</strong></div>
          <div class="confirm-summary-row highlight"><span>Estimated Quote:</span> <strong>$${pendingBooking.estimatedPrice} CAD</strong></div>
        `;
      }

      // Show confirmation dialog (MANDATORY User Confirmation as per Workspace Integration guidelines)
      if (confirmationModal) {
        confirmationModal.classList.add('is-active');
      }
    });
  }

  confirmCancelBtn?.addEventListener('click', () => {
    if (confirmationModal) {
      confirmationModal.classList.remove('is-active');
    }
  });

  confirmProceedBtn?.addEventListener('click', async () => {
    if (!pendingBooking) return;

    if (confirmProceedBtn) {
      confirmProceedBtn.textContent = 'Saving to Google Sheets...';
      (confirmProceedBtn as HTMLButtonElement).disabled = true;
    }

    try {
      let token = await getAccessToken();

      // If user is not yet logged in with Google, trigger Google popup auth seamlessly
      if (!token) {
        const signResult = await googleSignIn();
        token = signResult.accessToken;
      }

      if (!token) {
        throw new Error('Google Sheets OAuth authorization is required to save booking data.');
      }

      const saveResult = await saveBookingToGoogleSheets(pendingBooking, token);

      // Hide Confirmation Modal
      if (confirmationModal) {
        confirmationModal.classList.remove('is-active');
      }

      // Show Success Modal
      if (successModal) {
        const idElem = document.getElementById('successBookingId');
        const linkElem = document.getElementById('successSheetLink') as HTMLAnchorElement | null;
        if (idElem) idElem.textContent = saveResult.bookingId;
        if (linkElem) {
          linkElem.href = saveResult.spreadsheetUrl;
        }
        successModal.classList.add('is-active');
      }

      // Reset form
      bookingForm?.reset();
      updatePriceQuote();

    } catch (err: any) {
      console.error('Failed to save to Google Sheets:', err);
      alert(`Could not save booking to Google Sheets: ${err.message || err}`);
    } finally {
      if (confirmProceedBtn) {
        confirmProceedBtn.textContent = 'Confirm & Save to Google Sheets';
        (confirmProceedBtn as HTMLButtonElement).disabled = false;
      }
    }
  });

  closeSuccessBtn?.addEventListener('click', () => {
    if (successModal) {
      successModal.classList.remove('is-active');
    }
  });
});
