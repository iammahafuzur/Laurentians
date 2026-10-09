import {
  initAuth,
  googleSignIn,
  logoutUser,
  getAccessToken
} from './googleAuth';
import {
  appendBookingToGoogleSheet,
  getSavedSpreadsheetId,
  saveSpreadsheetId
} from './googleSheetsService';
import type { User } from 'firebase/auth';

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

export interface SavedBookingRecord extends BookingFormData {
  bookingId: string;
  createdAt: string;
  status: 'Confirmed' | 'Pending Review';
  syncedToSheets?: boolean;
  sheetsUrl?: string;
}

/**
 * Real-time transparent price calculation
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

  // Service multiplier
  if (service.includes('Deep') || service === 'deep-clean') {
    basePrice *= 1.4;
  } else if (service.includes('Move') || service === 'move-in-out') {
    basePrice *= 1.5;
  } else if (service.includes('Post-Renovation') || service === 'post-reno') {
    basePrice *= 1.6;
  } else if (service.includes('Commercial') || service === 'commercial') {
    basePrice *= 1.25;
  }

  // Frequency discounts
  if (frequency === 'weekly') {
    basePrice *= 0.85; // 15% discount
  } else if (frequency === 'bi-weekly') {
    basePrice *= 0.90; // 10% discount
  } else if (frequency === 'monthly') {
    basePrice *= 0.95; // 5% discount
  }

  return Math.round(basePrice);
};

// UI DOM Controller
document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('bookingForm') as HTMLFormElement | null;
  const quoteDisplay = document.getElementById('liveQuoteAmount');
  const quoteBreakdown = document.getElementById('liveQuoteBreakdown');
  const confirmationModal = document.getElementById('bookingConfirmModal');
  const confirmProceedBtn = document.getElementById('confirmBookingProceedBtn') as HTMLButtonElement | null;
  const confirmCancelBtn = document.getElementById('confirmBookingCancelBtn');
  const successModal = document.getElementById('bookingSuccessModal');
  const closeSuccessBtn = document.getElementById('closeSuccessModalBtn');

  // Sheets UI elements
  const sheetsSyncDot = document.getElementById('sheetsSyncDot');
  const sheetsStatusText = document.getElementById('sheetsStatusText');
  const sheetsConnectBtn = document.getElementById('sheetsConnectBtn') as HTMLButtonElement | null;
  const sheetsOpenLink = document.getElementById('sheetsOpenLink') as HTMLAnchorElement | null;
  const sheetsDisconnectBtn = document.getElementById('sheetsDisconnectBtn') as HTMLButtonElement | null;
  const successSheetNoticeText = document.getElementById('successSheetNoticeText');

  // Input elements
  const serviceSelect = document.getElementById('bookingService') as HTMLSelectElement | null;
  const sizeSelect = document.getElementById('bookingPropertySize') as HTMLSelectElement | null;
  const frequencySelect = document.getElementById('bookingFrequency') as HTMLSelectElement | null;
  const dateInput = document.getElementById('bookingDate') as HTMLInputElement | null;

  // Set default & minimum booking date to tomorrow
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

  // Real-time quote updater
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

  // Support ?admin=true or ?admin=1 or hash #admin or Ctrl+Shift+A for Admin view
  const urlParams = new URLSearchParams(window.location.search);
  const isAdminParam =
    urlParams.get('admin') === 'true' ||
    urlParams.get('admin') === '1' ||
    window.location.hash === '#admin';

  const adminPanel = document.getElementById('adminSheetsPanel');

  const setAdminVisibility = (show: boolean) => {
    if (!adminPanel) return;
    if (show) {
      document.body.classList.add('show-admin-sheets');
      adminPanel.removeAttribute('hidden');
      adminPanel.removeAttribute('aria-hidden');
      adminPanel.style.setProperty('display', 'inline-flex', 'important');
    } else {
      document.body.classList.remove('show-admin-sheets');
      adminPanel.setAttribute('hidden', 'true');
      adminPanel.setAttribute('aria-hidden', 'true');
      adminPanel.style.setProperty('display', 'none', 'important');
    }
  };

  // Initially hidden from frontend visitors
  setAdminVisibility(isAdminParam);

  // Keyboard shortcut Ctrl+Shift+A or Cmd+Shift+A to toggle admin view when needed
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      const isVisible = document.body.classList.contains('show-admin-sheets');
      setAdminVisibility(!isVisible);
    }
  });

  // Helper to update Sheets Admin state
  const updateSheetsUI = (user: User | null, token: string | null) => {
    const currentSheetId = getSavedSpreadsheetId();
    if (user && token) {
      if (sheetsSyncDot) {
        sheetsSyncDot.classList.add('connected');
      }
      if (sheetsStatusText) {
        sheetsStatusText.textContent = `Connected as ${user.displayName || user.email || 'Admin'}`;
      }
      if (sheetsConnectBtn) {
        sheetsConnectBtn.style.display = 'none';
      }
      if (sheetsOpenLink) {
        sheetsOpenLink.style.display = 'inline-flex';
        sheetsOpenLink.href = currentSheetId
          ? `https://docs.google.com/spreadsheets/d/${currentSheetId}/edit`
          : 'https://docs.google.com/spreadsheets/u/0/';
      }
      if (sheetsDisconnectBtn) {
        sheetsDisconnectBtn.style.display = 'inline-flex';
      }
    } else {
      if (sheetsSyncDot) {
        sheetsSyncDot.classList.remove('connected');
      }
      if (sheetsStatusText) {
        sheetsStatusText.textContent = currentSheetId
          ? 'Sheet Configured (Sign in to auto-sync)'
          : 'Admin Sheets Standby';
      }
      if (sheetsConnectBtn) {
        sheetsConnectBtn.style.display = 'inline-flex';
      }
      if (sheetsOpenLink) {
        if (currentSheetId) {
          sheetsOpenLink.style.display = 'inline-flex';
          sheetsOpenLink.href = `https://docs.google.com/spreadsheets/d/${currentSheetId}/edit`;
        } else {
          sheetsOpenLink.style.display = 'none';
        }
      }
      if (sheetsDisconnectBtn) {
        sheetsDisconnectBtn.style.display = 'none';
      }
    }
  };

  // Auth Listener
  initAuth(
    (user, token) => {
      updateSheetsUI(user, token);
    },
    () => {
      updateSheetsUI(null, null);
    }
  );

  // Connect Google Sheets Button click handler
  sheetsConnectBtn?.addEventListener('click', async () => {
    try {
      if (sheetsConnectBtn) {
        sheetsConnectBtn.textContent = 'Connecting...';
      }
      const res = await googleSignIn();
      if (res) {
        updateSheetsUI(res.user, res.accessToken);
      }
    } catch (err: any) {
      console.error('Failed to sign in for Google Sheets sync:', err);
      alert('Could not authenticate Google Sheets account: ' + (err.message || 'Unknown error'));
    } finally {
      if (sheetsConnectBtn) {
        sheetsConnectBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span>Connect Admin Account</span>
        `;
      }
    }
  });

  // Disconnect button handler
  sheetsDisconnectBtn?.addEventListener('click', async () => {
    await logoutUser();
    updateSheetsUI(null, null);
  });

  // Pending booking state
  let pendingBooking: BookingFormData | null = null;

  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!bookingForm.checkValidity()) {
        bookingForm.reportValidity();
        return;
      }

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
          <div class="confirm-summary-row"><span>Service Package:</span> <strong>${pendingBooking.service}</strong></div>
          <div class="confirm-summary-row"><span>Property Size:</span> <strong>${pendingBooking.propertySize}</strong></div>
          <div class="confirm-summary-row"><span>Frequency:</span> <strong>${pendingBooking.frequency}</strong></div>
          <div class="confirm-summary-row"><span>Preferred Date & Arrival:</span> <strong>${pendingBooking.preferredDate} (${pendingBooking.timeSlot})</strong></div>
          <div class="confirm-summary-row"><span>Client Contact:</span> <strong>${pendingBooking.clientName} (${pendingBooking.clientPhone})</strong></div>
          <div class="confirm-summary-row"><span>Service Address:</span> <strong>${pendingBooking.serviceAddress}, ${pendingBooking.cityArea}</strong></div>
          <div class="confirm-summary-row highlight"><span>Estimated Rate:</span> <strong>$${pendingBooking.estimatedPrice} CAD</strong></div>
        `;
      }

      // Show confirmation dialog
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
      confirmProceedBtn.textContent = 'Confirming Reservation...';
      confirmProceedBtn.disabled = true;
    }

    try {
      // Generate clean unique booking ID
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const bookingId = `LEC-2026-${randomSuffix}`;

      // Construct booking record
      const record: SavedBookingRecord = {
        ...pendingBooking,
        bookingId,
        createdAt: new Date().toISOString(),
        status: 'Confirmed'
      };

      // Save locally to persist booking record
      try {
        const stored = localStorage.getItem('laurentian_bookings');
        const bookingsList: SavedBookingRecord[] = stored ? JSON.parse(stored) : [];
        bookingsList.unshift(record);
        localStorage.setItem('laurentian_bookings', JSON.stringify(bookingsList));
      } catch (err) {
        console.warn('Could not cache booking locally:', err);
      }

      // Close confirmation modal
      if (confirmationModal) {
        confirmationModal.classList.remove('is-active');
      }

      // Show success modal
      if (successModal) {
        const idElem = document.getElementById('successBookingId');
        if (idElem) idElem.textContent = bookingId;
        if (successSheetNoticeText) {
          successSheetNoticeText.textContent = 'Syncing appointment to Google Sheets...';
        }
        successModal.classList.add('is-active');
      }

      // Perform Google Sheets sync if authenticated
      const token = getAccessToken();
      if (token) {
        try {
          const syncResult = await appendBookingToGoogleSheet(record);
          if (syncResult.success) {
            record.syncedToSheets = true;
            record.sheetsUrl = syncResult.spreadsheetUrl;
            if (successSheetNoticeText) {
              successSheetNoticeText.innerHTML = `Saved to Google Sheets &bull; <a href="${syncResult.spreadsheetUrl}" target="_blank" style="color: #107c41; font-weight: 700; text-decoration: underline;">View in Sheets</a>`;
            }
            if (sheetsOpenLink) {
              sheetsOpenLink.style.display = 'inline-flex';
              sheetsOpenLink.href = syncResult.spreadsheetUrl;
            }
          } else {
            if (successSheetNoticeText) {
              successSheetNoticeText.textContent = 'Saved to database (Google Sheets sync: ' + (syncResult.message || 'Pending sign-in') + ')';
            }
          }
        } catch (syncErr: any) {
          console.warn('Google Sheets auto-append notice:', syncErr);
          if (successSheetNoticeText) {
            successSheetNoticeText.textContent = 'Saved locally. Admin can sync via Google Sheets toolbar.';
          }
        }
      } else {
        if (successSheetNoticeText) {
          successSheetNoticeText.textContent = 'Saved! Connect Admin Google account in the reservation toolbar to view in Sheets.';
        }
      }

      // Reset form
      bookingForm?.reset();
      updatePriceQuote();

    } catch (err) {
      console.error('Failed to confirm booking:', err);
    } finally {
      if (confirmProceedBtn) {
        confirmProceedBtn.textContent = 'Confirm Reservation';
        confirmProceedBtn.disabled = false;
      }
    }
  });

  closeSuccessBtn?.addEventListener('click', () => {
    if (successModal) {
      successModal.classList.remove('is-active');
    }
  });

  // Close modals on clicking backdrop
  [confirmationModal, successModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-active');
      }
    });
  });

  // Keyboard escape handler for modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (confirmationModal?.classList.contains('is-active')) {
        confirmationModal.classList.remove('is-active');
      }
      if (successModal?.classList.contains('is-active')) {
        successModal.classList.remove('is-active');
      }
    }
  });
});
