import {
  initAuth,
  googleSignIn,
  logoutUser,
  getAccessToken
} from './googleAuth';
import {
  appendBookingToGoogleSheet,
  syncAllPendingBookings,
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

/**
 * Generate formal client email notification content
 */
export const generateFormalEmailContent = (booking: SavedBookingRecord) => {
  const formattedDate = new Date(booking.createdAt).toLocaleDateString('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Booking Confirmation: ${booking.service} [Ref: ${booking.bookingId}] — Laurentian EcoClean Co.`;

  const body = `Dear ${booking.clientName},

Thank you for choosing Laurentian EcoClean Co. We are pleased to confirm your upcoming eco-friendly cleaning reservation.

============================================================
RESERVATION CONFIRMATION SUMMARY
============================================================
Booking Reference ID:  ${booking.bookingId}
Booking Date:          ${formattedDate}
Service Package:       ${booking.service}
Property Size:         ${booking.propertySize}
Frequency:             ${booking.frequency}
Scheduled Date:        ${booking.preferredDate}
Arrival Window:        ${booking.timeSlot}
Estimated Total:       $${booking.estimatedPrice} CAD (Taxes Included)

SERVICE LOCATION:
Address:               ${booking.serviceAddress}
City / Region:         ${booking.cityArea}, British Columbia

CLIENT CONTACT:
Name:                  ${booking.clientName}
Phone:                 ${booking.clientPhone}
Email:                 ${booking.clientEmail}

SPECIAL INSTRUCTIONS & ACCESS NOTES:
${booking.notes ? booking.notes : 'None specified (Standard residential/commercial access)'}

============================================================
WHAT TO EXPECT ON SERVICE DAY
============================================================
• 100% Eco-Certified Formulations: Our bonded specialists arrive fully equipped with hospital-grade, non-toxic, plant-based cleaning solutions and HEPA-filtration vacuums.
• Arrival Window: Our Canadian cleaning crew will arrive within your selected window (${booking.timeSlot}).
• Entry & Security: If you will not be present, please ensure access or lockbox codes are communicated to dispatch.
• Satisfaction Guarantee: If any area does not meet your complete satisfaction, notify us within 24 hours for a complimentary touch-up.

Need assistance, schedule modifications, or invoices?
• Dispatch Hotline: +1 (604) 555-0189
• Email: quotes@laurentianecoclean.ca
• Office: 742 Burrard Street, Suite 500, Vancouver, BC V6Z 2S7

Warm regards,
Laurentian EcoClean Co. Dispatch & Customer Relations
https://laurentianecoclean.ca
`;

  const mailtoUrl = `mailto:${encodeURIComponent(booking.clientEmail)}?cc=${encodeURIComponent('quotes@laurentianecoclean.ca')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailtoUrl };
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
  const successSheetNotice = document.getElementById('successSheetNotice');
  const successSheetNoticeText = document.getElementById('successSheetNoticeText');
  const successGoogleSignInBtn = document.getElementById('successGoogleSignInBtn') as HTMLButtonElement | null;

  // Email Notification UI elements
  const successEmailBox = document.getElementById('successEmailBox');
  const emailRecipientSubtitle = document.getElementById('emailRecipientSubtitle');
  const openMailtoBtn = document.getElementById('openMailtoBtn') as HTMLAnchorElement | null;
  const copyEmailSummaryBtn = document.getElementById('copyEmailSummaryBtn') as HTMLButtonElement | null;
  const copyBtnText = document.getElementById('copyBtnText');
  const shareEmailBtn = document.getElementById('shareEmailBtn') as HTMLButtonElement | null;
  const printBookingReceiptBtn = document.getElementById('printBookingReceiptBtn') as HTMLButtonElement | null;
  const toggleEmailPreviewBtn = document.getElementById('toggleEmailPreviewBtn') as HTMLButtonElement | null;
  const emailPreviewContent = document.getElementById('emailPreviewContent');
  const previewEmailTo = document.getElementById('previewEmailTo');
  const previewEmailSubject = document.getElementById('previewEmailSubject');
  const previewEmailText = document.getElementById('previewEmailText');

  // Floating Toast Helper
  let toastTimer: any = null;
  const showToast = (message: string) => {
    const toast = document.getElementById('appToast');
    const toastText = document.getElementById('appToastText');
    if (!toast) return;
    if (toastText) toastText.textContent = message;
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3200);
  };

  // Formal Email State
  let currentFormalEmail: { subject: string; body: string; mailtoUrl: string; booking: SavedBookingRecord } | null = null;

  const setupFormalEmailNotification = (record: SavedBookingRecord) => {
    const emailData = generateFormalEmailContent(record);
    currentFormalEmail = { ...emailData, booking: record };

    if (emailRecipientSubtitle) {
      emailRecipientSubtitle.textContent = `Client: ${record.clientEmail} • Ref: ${record.bookingId}`;
    }
    if (openMailtoBtn) {
      openMailtoBtn.href = emailData.mailtoUrl;
    }
    if (previewEmailTo) {
      previewEmailTo.textContent = `${record.clientName} <${record.clientEmail}>`;
    }
    if (previewEmailSubject) {
      previewEmailSubject.textContent = emailData.subject;
    }
    if (previewEmailText) {
      previewEmailText.textContent = emailData.body;
    }

    // Check Web Share API (widely supported on mobile iOS/Android)
    if (shareEmailBtn) {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        shareEmailBtn.style.display = 'inline-flex';
      } else {
        shareEmailBtn.style.display = 'none';
      }
    }

    // Reset preview toggle
    if (toggleEmailPreviewBtn && emailPreviewContent) {
      toggleEmailPreviewBtn.setAttribute('aria-expanded', 'false');
      emailPreviewContent.style.display = 'none';
      const icon = toggleEmailPreviewBtn.querySelector('svg');
      if (icon) icon.style.transform = 'rotate(0deg)';
    }

    if (successEmailBox) {
      successEmailBox.style.display = 'block';
    }
  };

  // Admin Modal elements
  const adminModal = document.getElementById('adminSheetsModal');
  const footerAdminSheetsBtn = document.getElementById('footerAdminSheetsBtn');
  const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
  const adminModalDot = document.getElementById('adminModalDot');
  const adminModalAccountText = document.getElementById('adminModalAccountText');
  const adminModalSignInBtn = document.getElementById('adminModalSignInBtn') as HTMLButtonElement | null;
  const adminModalSignOutBtn = document.getElementById('adminModalSignOutBtn') as HTMLButtonElement | null;
  const adminModalOpenSheetLink = document.getElementById('adminModalOpenSheetLink') as HTMLAnchorElement | null;
  const adminModalBatchSyncBtn = document.getElementById('adminModalBatchSyncBtn') as HTMLButtonElement | null;
  const adminModalBatchSyncText = document.getElementById('adminModalBatchSyncText');
  const adminModalBookingsCount = document.getElementById('adminModalBookingsCount');
  const adminModalTableBody = document.getElementById('adminModalTableBody');

  // Input elements
  const serviceSelect = document.getElementById('bookingService') as HTMLSelectElement | null;
  const sizeSelect = document.getElementById('bookingPropertySize') as HTMLSelectElement | null;
  const frequencySelect = document.getElementById('bookingFrequency') as HTMLSelectElement | null;
  const dateInput = document.getElementById('bookingDate') as HTMLInputElement | null;

  // Mobile Quote elements
  const mobileQuoteAmount = document.getElementById('mobileQuoteAmount');
  const mobileQuoteBreakdown = document.getElementById('mobileQuoteBreakdown');
  const mobileBottomBarQuote = document.getElementById('mobileBottomBarQuote');

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

  // Real-time quote updater (Desktop & Mobile synchronized)
  const updatePriceQuote = () => {
    if (!serviceSelect || !sizeSelect || !frequencySelect) return;
    const est = calculateEstimate(
      serviceSelect.value,
      sizeSelect.value,
      frequencySelect.value
    );
    if (quoteDisplay) {
      quoteDisplay.textContent = `$${est} CAD`;
    }
    if (mobileQuoteAmount) {
      mobileQuoteAmount.textContent = `$${est} CAD`;
    }
    if (mobileBottomBarQuote) {
      mobileBottomBarQuote.textContent = `$${est}`;
    }
    const freqText = frequencySelect.options[frequencySelect.selectedIndex]?.text || '';
    const sizeText = sizeSelect.options[sizeSelect.selectedIndex]?.text || '';
    const summaryText = `${sizeText} • ${freqText}`;
    if (quoteBreakdown) {
      quoteBreakdown.textContent = summaryText;
    }
    if (mobileQuoteBreakdown) {
      mobileQuoteBreakdown.textContent = summaryText;
    }
  };

  [serviceSelect, sizeSelect, frequencySelect].forEach((el) => {
    el?.addEventListener('change', updatePriceQuote);
  });
  updatePriceQuote();

  // Current admin user state
  let currentAdminUser: User | null = null;
  let currentAdminToken: string | null = getAccessToken();

  // Helper to refresh Admin Modal UI
  const updateAdminModalUI = () => {
    const sheetId = getSavedSpreadsheetId();
    const isConnected = !!(currentAdminUser && currentAdminToken);

    if (adminModalDot) {
      if (isConnected) {
        adminModalDot.classList.add('connected');
      } else {
        adminModalDot.classList.remove('connected');
      }
    }

    if (adminModalAccountText) {
      if (isConnected) {
        adminModalAccountText.textContent = `Connected as ${currentAdminUser?.displayName || currentAdminUser?.email || 'Admin'}`;
      } else {
        adminModalAccountText.textContent = sheetId ? 'Configured (Sign in to sync)' : 'Not Connected';
      }
    }

    if (adminModalSignInBtn) {
      adminModalSignInBtn.style.display = isConnected ? 'none' : 'inline-flex';
    }
    if (adminModalSignOutBtn) {
      adminModalSignOutBtn.style.display = isConnected ? 'inline-flex' : 'none';
    }

    if (adminModalOpenSheetLink) {
      if (sheetId) {
        adminModalOpenSheetLink.style.display = 'inline-flex';
        adminModalOpenSheetLink.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      } else {
        adminModalOpenSheetLink.style.display = 'none';
      }
    }

    // Refresh Bookings List in Admin Modal
    try {
      const stored = localStorage.getItem('laurentian_bookings');
      const bookings: SavedBookingRecord[] = stored ? JSON.parse(stored) : [];
      const pendingCount = bookings.filter(b => !b.syncedToSheets).length;

      if (adminModalBookingsCount) {
        adminModalBookingsCount.textContent = `${bookings.length} total (${pendingCount} pending sync)`;
      }

      if (adminModalBatchSyncText) {
        adminModalBatchSyncText.textContent = pendingCount > 0
          ? `Sync ${pendingCount} Pending to Sheets`
          : 'All Bookings Synced';
      }

      if (adminModalTableBody) {
        if (bookings.length === 0) {
          adminModalTableBody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align: center; color: var(--color-neutral-500); padding: 24px;">No customer appointments registered yet.</td>
            </tr>
          `;
        } else {
          adminModalTableBody.innerHTML = bookings.slice(0, 15).map(b => {
            const syncBadge = b.syncedToSheets
              ? `<span style="color: #107c41; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🟢 Synced</span>`
              : `<span style="color: #b45309; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🟡 Pending</span>`;

            return `
              <tr>
                <td><strong>${b.bookingId}</strong></td>
                <td>${b.clientName}<br><span style="color: var(--color-neutral-500); font-size: 0.75rem;">${b.clientPhone}</span></td>
                <td>${b.service}<br><span style="color: var(--color-neutral-500); font-size: 0.75rem;">${b.preferredDate}</span></td>
                <td><strong>$${b.estimatedPrice} CAD</strong></td>
                <td>${syncBadge}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (err) {
      console.warn('Error rendering admin table:', err);
    }
  };

  // Auth Listener
  initAuth(
    (user, token) => {
      currentAdminUser = user;
      currentAdminToken = token;
      updateAdminModalUI();
      // Auto-sync any pending bookings upon connecting
      syncAllPendingBookings(token).catch(console.warn);
    },
    () => {
      currentAdminUser = null;
      currentAdminToken = null;
      updateAdminModalUI();
    }
  );

  // Admin Modal Toggles
  const openAdminModal = () => {
    updateAdminModalUI();
    if (adminModal) {
      adminModal.classList.add('is-active');
    }
  };

  const closeAdminModal = () => {
    if (adminModal) {
      adminModal.classList.remove('is-active');
    }
  };

  footerAdminSheetsBtn?.addEventListener('click', openAdminModal);
  closeAdminModalBtn?.addEventListener('click', closeAdminModal);

  // Keyboard shortcut Ctrl+Shift+A or Cmd+Shift+A to open Admin Modal
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      openAdminModal();
    }
  });

  // Admin Modal Sign In Button
  adminModalSignInBtn?.addEventListener('click', async () => {
    try {
      if (adminModalSignInBtn) {
        adminModalSignInBtn.style.opacity = '0.6';
      }
      const res = await googleSignIn();
      if (res) {
        currentAdminUser = res.user;
        currentAdminToken = res.accessToken;
        const syncRes = await syncAllPendingBookings(res.accessToken);
        updateAdminModalUI();
        if (syncRes.syncedCount > 0) {
          alert(`Google Sheets Connected! Synced ${syncRes.syncedCount} appointment(s).`);
        }
      }
    } catch (err: any) {
      console.error('Failed to sign in to Google Sheets:', err);
      alert('Could not authenticate Google account: ' + (err.message || 'Please try again.'));
    } finally {
      if (adminModalSignInBtn) {
        adminModalSignInBtn.style.opacity = '1';
      }
    }
  });

  // Admin Modal Sign Out Button
  adminModalSignOutBtn?.addEventListener('click', async () => {
    await logoutUser();
    currentAdminUser = null;
    currentAdminToken = null;
    updateAdminModalUI();
  });

  // Admin Modal Batch Sync Button
  adminModalBatchSyncBtn?.addEventListener('click', async () => {
    let token = currentAdminToken || getAccessToken();
    if (!token) {
      try {
        const res = await googleSignIn();
        if (res) {
          token = res.accessToken;
          currentAdminUser = res.user;
          currentAdminToken = res.accessToken;
        }
      } catch (err) {
        console.warn('Sign-in cancelled:', err);
        return;
      }
    }

    if (token) {
      if (adminModalBatchSyncBtn) {
        adminModalBatchSyncBtn.disabled = true;
      }
      const syncRes = await syncAllPendingBookings(token);
      updateAdminModalUI();
      if (adminModalBatchSyncBtn) {
        adminModalBatchSyncBtn.disabled = false;
      }
      alert(syncRes.message);
    }
  });

  // Pending booking form state
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
        const isConnected = !!(getAccessToken() || currentAdminToken);
        const sheetsStatusBadge = isConnected
          ? `<div style="display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 10px 14px; background: rgba(16, 124, 65, 0.08); border: 1px solid rgba(16, 124, 65, 0.25); border-radius: 8px; font-size: 0.84rem; color: #107c41;">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
               <span><strong>Google Sheets Auto-Sync:</strong> Appointment will automatically record to admin spreadsheet upon confirmation.</span>
             </div>`
          : `<div style="display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.84rem; color: #475569;">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
               <span><strong>Backend Google Sheets Sync:</strong> Ready to record. Connect your Google account during confirmation to auto-sync.</span>
             </div>`;

        modalSummary.innerHTML = `
          <div class="confirm-summary-row"><span>Service Package:</span> <strong>${pendingBooking.service}</strong></div>
          <div class="confirm-summary-row"><span>Property Size:</span> <strong>${pendingBooking.propertySize}</strong></div>
          <div class="confirm-summary-row"><span>Frequency:</span> <strong>${pendingBooking.frequency}</strong></div>
          <div class="confirm-summary-row"><span>Preferred Date & Arrival:</span> <strong>${pendingBooking.preferredDate} (${pendingBooking.timeSlot})</strong></div>
          <div class="confirm-summary-row"><span>Client Contact:</span> <strong>${pendingBooking.clientName} (${pendingBooking.clientPhone})</strong></div>
          <div class="confirm-summary-row"><span>Service Address:</span> <strong>${pendingBooking.serviceAddress}, ${pendingBooking.cityArea}</strong></div>
          <div class="confirm-summary-row highlight"><span>Estimated Rate:</span> <strong>$${pendingBooking.estimatedPrice} CAD</strong></div>
          ${sheetsStatusBadge}
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

  // CONFIRM RESERVATION BUTTON CLICK
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

      // Check if we have an active Google access token
      let token = currentAdminToken || getAccessToken();

      // If token is missing, attempt to connect Google Sheets right from this user gesture
      if (!token) {
        try {
          if (confirmProceedBtn) {
            confirmProceedBtn.textContent = 'Connecting Google Sheets...';
          }
          const authRes = await googleSignIn();
          if (authRes?.accessToken) {
            token = authRes.accessToken;
            currentAdminToken = authRes.accessToken;
            currentAdminUser = authRes.user;
          }
        } catch (authErr: any) {
          console.warn('Google sign-in was dismissed or skipped during confirmation:', authErr);
        }
      }

      // Close confirmation modal
      if (confirmationModal) {
        confirmationModal.classList.remove('is-active');
      }

      // Show success modal
      if (successModal) {
        const idElem = document.getElementById('successBookingId');
        if (idElem) idElem.textContent = bookingId;
        if (successSheetNotice) {
          successSheetNotice.style.display = 'flex';
        }
        if (successSheetNoticeText) {
          successSheetNoticeText.textContent = token
            ? 'Saving appointment to Google Sheets...'
            : 'Appointment confirmed! Sign in below to sync to Google Sheets:';
        }
        if (successGoogleSignInBtn) {
          successGoogleSignInBtn.style.display = token ? 'none' : 'inline-flex';
        }
        // Immediately initialize the client-side formal email notification summary
        setupFormalEmailNotification(record);

        successModal.classList.add('is-active');
      }

      // Perform Google Sheets sync if token is available
      if (token) {
        try {
          const syncResult = await appendBookingToGoogleSheet(record);
          if (syncResult.success) {
            record.syncedToSheets = true;
            record.sheetsUrl = syncResult.spreadsheetUrl;

            // Update the record in localStorage
            try {
              const currentList: SavedBookingRecord[] = JSON.parse(localStorage.getItem('laurentian_bookings') || '[]');
              const idx = currentList.findIndex(b => b.bookingId === record.bookingId);
              if (idx !== -1) {
                currentList[idx] = record;
                localStorage.setItem('laurentian_bookings', JSON.stringify(currentList));
              }
            } catch (e) {
              console.warn(e);
            }

            if (successSheetNoticeText) {
              successSheetNoticeText.innerHTML = `Saved to Google Sheets &bull; <a href="${syncResult.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="color: #107c41; font-weight: 700; text-decoration: underline;">View in Sheets ↗</a>`;
            }
            if (successGoogleSignInBtn) {
              successGoogleSignInBtn.style.display = 'none';
            }

            // Also batch sync any other pending appointments to the sheet
            syncAllPendingBookings(token).catch(console.warn);
          } else {
            if (successSheetNoticeText) {
              successSheetNoticeText.textContent = 'Saved to database. (Sheets sync: ' + (syncResult.message || 'Error saving') + ')';
            }
            if (successGoogleSignInBtn) {
              successGoogleSignInBtn.style.display = 'inline-flex';
            }
          }
        } catch (syncErr: any) {
          console.warn('Google Sheets auto-append notice:', syncErr);
          if (successSheetNoticeText) {
            successSheetNoticeText.textContent = 'Saved to database. Google Sheets connection pending.';
          }
          if (successGoogleSignInBtn) {
            successGoogleSignInBtn.style.display = 'inline-flex';
          }
        }
      }

      // Reset form & update quote
      bookingForm?.reset();
      updatePriceQuote();
      updateAdminModalUI();

    } catch (err) {
      console.error('Failed to confirm booking:', err);
    } finally {
      if (confirmProceedBtn) {
        confirmProceedBtn.textContent = 'Confirm Reservation';
        confirmProceedBtn.disabled = false;
      }
    }
  });

  // Copy Email Summary to clipboard
  copyEmailSummaryBtn?.addEventListener('click', async () => {
    if (!currentFormalEmail) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentFormalEmail.body);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = currentFormalEmail.body;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (copyBtnText) copyBtnText.textContent = '✓ Copied!';
      showToast('Formal confirmation email summary copied to clipboard!');
      setTimeout(() => {
        if (copyBtnText) copyBtnText.textContent = 'Copy Email Text';
      }, 2500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      showToast('Formal confirmation summary copied to clipboard!');
    }
  });

  // Native Mobile Web Share (Mobile Friendly)
  shareEmailBtn?.addEventListener('click', async () => {
    if (!currentFormalEmail || !navigator.share) return;
    try {
      await navigator.share({
        title: currentFormalEmail.subject,
        text: currentFormalEmail.body
      });
      showToast('Confirmation shared successfully!');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Share error:', err);
      }
    }
  });

  // Print Receipt handler
  printBookingReceiptBtn?.addEventListener('click', () => {
    if (emailPreviewContent && toggleEmailPreviewBtn) {
      emailPreviewContent.style.display = 'block';
      toggleEmailPreviewBtn.setAttribute('aria-expanded', 'true');
    }
    window.print();
  });

  // Toggle Email Preview Collapsible
  toggleEmailPreviewBtn?.addEventListener('click', () => {
    if (!emailPreviewContent || !toggleEmailPreviewBtn) return;
    const isExpanded = toggleEmailPreviewBtn.getAttribute('aria-expanded') === 'true';
    toggleEmailPreviewBtn.setAttribute('aria-expanded', (!isExpanded).toString());
    emailPreviewContent.style.display = isExpanded ? 'none' : 'block';
    const icon = toggleEmailPreviewBtn.querySelector('svg');
    if (icon) {
      icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
      icon.style.transition = 'transform 0.2s ease';
    }
  });

  // Success Modal Google Sign-In button handler
  successGoogleSignInBtn?.addEventListener('click', async () => {
    try {
      successGoogleSignInBtn.disabled = true;
      successGoogleSignInBtn.style.opacity = '0.6';
      const authRes = await googleSignIn();
      if (authRes?.accessToken) {
        currentAdminToken = authRes.accessToken;
        currentAdminUser = authRes.user;
        if (successSheetNoticeText) {
          successSheetNoticeText.textContent = 'Syncing appointment to Google Sheets...';
        }
        const syncRes = await syncAllPendingBookings(authRes.accessToken);
        if (syncRes.success) {
          successGoogleSignInBtn.style.display = 'none';
          if (successSheetNoticeText) {
            successSheetNoticeText.innerHTML = `Saved to Google Sheets &bull; <a href="${syncRes.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="color: #107c41; font-weight: 700; text-decoration: underline;">Open Google Sheet ↗</a>`;
          }
        }
        updateAdminModalUI();
      }
    } catch (err: any) {
      console.warn('Google sign-in error:', err);
      alert('Google authentication failed: ' + (err.message || 'Please try again.'));
    } finally {
      if (successGoogleSignInBtn) {
        successGoogleSignInBtn.disabled = false;
        successGoogleSignInBtn.style.opacity = '1';
      }
    }
  });

  closeSuccessBtn?.addEventListener('click', () => {
    if (successModal) {
      successModal.classList.remove('is-active');
    }
  });

  // Close modals on clicking backdrop
  [confirmationModal, successModal, adminModal].forEach((modal) => {
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
      if (adminModal?.classList.contains('is-active')) {
        adminModal.classList.remove('is-active');
      }
    }
  });
});
