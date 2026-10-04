import html2pdf from 'html2pdf.js'

const CDN_SRC = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js'

// Shared COA PDF downloader with local-bundle-first + CDN fallback.
// `msgs` holds the localized alert strings (keys: coa_missing, pdf_library,
// pdf_save_error, pdf_execution_error, pdf_load_failed, pdf_local_unresolved).
export function downloadCoaPdf(batchNumber, msgs) {
  const element = document.getElementById('coa-report-view')
  if (!element) {
    alert(msgs.coa_missing)
    return
  }

  const opt = {
    margin: 0.3,
    filename: `COA_Batch_${batchNumber || 'Unnamed'}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  }

  const runCdnHtml2Pdf = () => {
    const html2pdfLib = window.html2pdf
    if (!html2pdfLib) {
      alert(msgs.pdf_library)
      return
    }
    try {
      html2pdfLib().set(opt).from(element).save()
        .catch(err => alert(`${msgs.pdf_save_error} ${err.message}`))
    } catch (err) {
      alert(`${msgs.pdf_execution_error} ${err.message}`)
    }
  }

  const loadCdnFallback = () => {
    if (window.html2pdf) {
      runCdnHtml2Pdf()
      return
    }
    const script = document.createElement('script')
    script.src = CDN_SRC
    script.onload = runCdnHtml2Pdf
    script.onerror = () => alert(msgs.pdf_load_failed)
    document.body.appendChild(script)
  }

  // Try local bundle first
  try {
    const html2pdfFn = html2pdf.default || html2pdf
    if (typeof html2pdfFn === 'function') {
      html2pdfFn().set(opt).from(element).save()
        .catch(err => {
          console.warn('Local html2pdf save failed, trying CDN fallback...', err)
          loadCdnFallback()
        })
    } else {
      throw new Error(msgs.pdf_local_unresolved)
    }
  } catch (err) {
    console.warn('Local html2pdf execution failed, attempting CDN fallback. Error:', err.message)
    loadCdnFallback()
  }
}