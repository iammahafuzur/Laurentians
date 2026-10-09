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

  confirmProceedBtn?.addEventListener('click', () => {
    if (!pendingBooking) return;

    if (confirmProceedBtn) {
      confirmProceedBtn.textContent = 'Confirming Reservation...';
      confirmProceedBtn.disabled = true;
    }

    try {
      // Generate clean unique booking ID
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const bookingId = `LEC-2026-${randomSuffix}`;

      // Save locally to persist booking record
      const record: SavedBookingRecord = {
        ...pendingBooking,
        bookingId,
        createdAt: new Date().toISOString(),
        status: 'Confirmed'
      };

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
        successModal.classList.add('is-active');
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
