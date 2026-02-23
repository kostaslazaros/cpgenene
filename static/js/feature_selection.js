const URL_BASE = '/fs'
const URL_EXISTS = `${URL_BASE}/exists`
const URL_UPLOAD = `${URL_BASE}/upload`
const URL_RESULTS = `${URL_BASE}/results`
const URL_ALGORITHMS = `${URL_BASE}/algorithms`
const URL_VALUES = `${URL_BASE}/prognosis-values`
const URL_STATUS = `${URL_BASE}/status`
const URL_RUN = `${URL_BASE}/run-algorithm`
const URL_DELETE = `${URL_BASE}/remove`
const URL_DOWNLOAD = `${URL_BASE}/download/`
const URL_IMAGES = `${URL_BASE}/images`
const URL_IMAGE = `${URL_BASE}/image`
const fileInput = document.getElementById('fileInput')
const sha1Out = document.getElementById('sha1Out')
const goBtn = document.getElementById('goBtn')
const spinner = document.getElementById('spinner')
const statusBox = document.getElementById('status')
const resetBtn = document.getElementById('resetBtn')
const testDataBtn = document.getElementById('testDataBtn')

function setStatus(type, msg) {
  statusBox.className = 'rounded-2xl border px-4 py-3 text-sm sm:text-base font-medium backdrop-blur'
  const cls =
    type === 'ok'
      ? [
          'border-emerald-400/40',
          'text-emerald-200',
          'bg-gradient-to-r',
          'from-emerald-500/10',
          'to-teal-500/10',
          'ring-1',
          'ring-emerald-400/20',
          'shadow-[0_0_25px_rgba(16,185,129,0.25)]',
        ]
      : type === 'warn'
      ? [
          'border-amber-400/40',
          'text-amber-200',
          'bg-gradient-to-r',
          'from-amber-500/10',
          'to-orange-500/10',
          'ring-1',
          'ring-amber-400/20',
          'shadow-[0_0_25px_rgba(245,158,11,0.25)]',
        ]
      : [
          'border-rose-400/40',
          'text-rose-200',
          'bg-gradient-to-r',
          'from-rose-500/10',
          'to-fuchsia-500/10',
          'ring-1',
          'ring-rose-400/20',
          'shadow-[0_0_25px_rgba(244,63,94,0.25)]',
        ]
  statusBox.classList.add(...cls)
  statusBox.textContent = msg
  statusBox.classList.remove('hidden')
}

function clearStatus() {
  statusBox.classList.add('hidden')
  statusBox.textContent = ''
  statusBox.className = 'hidden rounded-2xl border px-4 py-3 text-sm sm:text-base font-medium'
}

function disableUI(disabled) {
  goBtn.disabled = disabled
  spinner.classList.toggle('hidden', !disabled)
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return hex
}

// --- SHA-1 polyfill (Uint8Array -> hex) ---
function sha1Polyfill(bytes) {
  function rotl(n, s) {
    return (n << s) | (n >>> (32 - s))
  }
  const ml = bytes.length
  const withOne = new Uint8Array(ml + 1)
  withOne.set(bytes)
  withOne[ml] = 0x80
  let l = withOne.length
  let k = (56 - (l % 64) + 64) % 64
  const padded = new Uint8Array(l + k + 8)
  padded.set(withOne)
  const bitLenHi = Math.floor((ml >>> 29) >>> 0)
  const bitLenLo = (ml << 3) >>> 0
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, bitLenHi)
  dv.setUint32(padded.length - 4, bitLenLo)

  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)

  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      const off = i + j * 4
      w[j] = (padded[off] << 24) | (padded[off + 1] << 16) | (padded[off + 2] << 8) | padded[off + 3]
    }
    for (let j = 16; j < 80; j++) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1) >>> 0
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4
    for (let j = 0; j < 80; j++) {
      let f, kconst
      if (j < 20) {
        f = (b & c) | (~b & d)
        kconst = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        kconst = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        kconst = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        kconst = 0xca62c1d6
      }
      const temp = (rotl(a, 5) + f + e + kconst + w[j]) >>> 0
      e = d
      d = c
      c = rotl(b, 30) >>> 0
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const dvOut = new DataView(out.buffer)
  dvOut.setUint32(0, h0)
  dvOut.setUint32(4, h1)
  dvOut.setUint32(8, h2)
  dvOut.setUint32(12, h3)
  dvOut.setUint32(16, h4)
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeSHA1(bytes) {
  try {
    const subtle = (window.crypto && window.crypto.subtle) || (window.msCrypto && window.msCrypto.subtle)
    if (subtle && typeof subtle.digest === 'function') {
      const digest = await subtle.digest('SHA-1', bytes)
      return toHex(digest)
    }
  } catch (e) {
    /* fallback below */
  }
  return sha1Polyfill(new Uint8Array(bytes))
}

async function sha1File(file) {
  const buf = await file.arrayBuffer()
  return computeSHA1(buf)
}

// --- CSV validation: only .csv; prognosis values in first row ---
function isCsvFile(file) {
  const byExt = /\.csv$/i.test(file.name || '')
  const byType = (file.type || '').includes('csv')
  return byExt || byType
}

function splitCsvLine(line) {
  // Split a single CSV line into fields, honoring quotes and doubled quotes
  const out = []
  let cur = ''
  let i = 0,
    inQuotes = false

  // For very large lines, show progress
  const isLargeLine = line.length > 100000
  if (isLargeLine) {
    console.log(`Processing large CSV header line: ${line.length} characters`)
  }

  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    i++

    // Show progress for very large lines
    if (isLargeLine && i % 100000 === 0) {
      console.log(`CSV parsing progress: ${i}/${line.length} characters, ${out.length} columns found`)
    }
  }
  out.push(cur.trim())

  if (isLargeLine) {
    console.log(`CSV parsing complete: ${out.length} columns found`)
  }

  return out
}

async function validateCsv(file) {
  if (!isCsvFile(file)) {
    throw new Error('Only CSV files are supported.')
  }

  // Read first row to check transposed structure (samples as columns, prognosis values in first row)
  let readSize = 1024 * 1024 // Start with 1MB
  let firstLine = ''
  let attempts = 0
  const maxAttempts = 10 // Prevent infinite loop

  while (attempts < maxAttempts) {
    const headChunk = await file.slice(0, readSize).text()
    const nlIdx = headChunk.indexOf('\n')

    if (nlIdx !== -1) {
      firstLine = headChunk.substring(0, nlIdx)
      break
    } else if (readSize >= file.size) {
      // We've read the entire file and there's no newline
      firstLine = headChunk
      break
    } else {
      // Double the read size and try again
      attempts++
      readSize = Math.min(readSize * 2, file.size)
    }
  }

  if (attempts >= maxAttempts && firstLine === '') {
    throw new Error('Could not read CSV header line. File might be corrupted or too large.')
  }

  // Clean up the first line
  firstLine = firstLine.replace(/\r$/, '').replace(/^\uFEFF/, '')
  const firstRowValues = splitCsvLine(firstLine)

  if (!firstRowValues.length) {
    throw new Error('CSV file appears to be empty or invalid.')
  }

  // In transposed structure, the first row contains either:
  // 1. "Prognosis,value1,value2,value3,..." (with identifier)
  // 2. "value1,value2,value3,..." (without identifier, all prognosis values)
  // We accept both formats
  const firstValue = firstRowValues[0]
  const hasPrognosisIdentifier = firstValue === 'Prognosis'

  // Check if we have prognosis values
  const prognosisValues = hasPrognosisIdentifier ? firstRowValues.slice(1) : firstRowValues

  if (prognosisValues.length === 0) {
    throw new Error(
      'No prognosis values found in the first row. Expected format: "Prognosis,value1,value2,..." or "value1,value2,..."'
    )
  }

  return true
}

async function checkExists(id) {
  const url = `${URL_EXISTS}/${encodeURIComponent(id)}`
  const r = await fetch(url, { method: 'GET' })
  if (!r.ok) throw new Error(`Exists check failed (${r.status})`)
  let data
  try {
    data = await r.json()
    console.log(data)
  } catch {
    throw new Error('Invalid JSON from /featuren/exists')
  }
  if (!('exists' in data)) throw new Error('Missing "exists" in response')
  return data
}

async function uploadFile(file, id) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('id', id)
  const r = await fetch(URL_UPLOAD, { method: 'POST', body: form })
  console.log(r)
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`Upload failed (${r.status}) ${text}`)
  }
  try {
    return await r.json()
  } catch {
    return { ok: true }
  }
}

// Validate on selection for immediate feedback
fileInput.addEventListener('change', async () => {
  clearStatus()

  // Reset the entire interface when a new file is selected
  sha1Out.value = ''
  hideAnalysisSection()
  clearAnalysisStatus()

  const file = fileInput.files?.[0]
  if (!file) {
    // If no file selected, just return after reset
    return
  }

  // Show processing status for large files
  if (file.size > 10 * 1024 * 1024) {
    // > 10MB
    setStatus('warn', 'Processing large CSV file...')
  }

  try {
    await validateCsv(file)

    // Give more detailed feedback
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
    const message =
      file.size > 10 * 1024 * 1024
        ? `Large CSV validated successfully (${fileSizeMB}MB): prognosis values found in first row.`
        : 'CSV looks good: prognosis values found in first row.'
    setStatus('ok', message)
  } catch (e) {
    setStatus('err', e.message || 'Invalid CSV.')
    fileInput.value = ''
  }
})

goBtn.addEventListener('click', async () => {
  clearStatus()
  const file = fileInput.files?.[0]
  if (!file) {
    setStatus('err', 'Please choose a .csv file first.')
    return
  }
  disableUI(true)
  try {
    // Validate CSV header before any hashing/network
    await validateCsv(file)

    setStatus('warn', 'Computing SHA‑1 locally…')
    const id = await sha1File(file)
    sha1Out.value = id

    setStatus('warn', `Checking existence for id ${id.slice(0, 8)}…`)
    const exists_data = await checkExists(id)

    if (!!exists_data.exists) {
      const tags = exists_data.tags || ['No tags available']
      setStatus('ok', `File with this SHA‑1 already exists on server. Loading analysis interface...`)
      // Load the analysis interface for existing file
      await loadAnalysisInterface(id)
    } else {
      setStatus('warn', 'Not found. Uploading…')
      const upload_return = await uploadFile(file, id)
      setStatus('ok', `Upload complete. Monitoring analysis progress...`)
      // Monitor the analysis task and then load interface
      await monitorAnalysisTask(upload_return.task_id, id)
    }
  } catch (e) {
    console.error(e)
    setStatus('err', e.message || 'Something went wrong.')
  } finally {
    disableUI(false)
  }
})

resetBtn.addEventListener('click', () => {
  fileInput.value = ''
  sha1Out.value = ''
  clearStatus()
  hideAnalysisSection()
})

// Test button for demonstrating feature selection functionality
testDataBtn.addEventListener('click', async () => {
  // const testSha1 = '61d6bde6c060c974a32363f980b4f159c31b57d4'
  const testSha1 = '8d2f51cc4f2a4ab7e627c0b541c0d2e215f70274'
  sha1Out.value = testSha1
  setStatus('warn', 'Loading test data...')
  try {
    // Load the complete analysis interface with all data
    await loadAnalysisInterface(testSha1)
  } catch (error) {
    setStatus('error', 'Error loading test data: ' + error.message)
  }
})

// =============================================================================
// DYNAMIC ANALYSIS INTERFACE
// =============================================================================

let currentSha1Hash = null
let availableAlgorithms = []
let prognosisValues = []
let selectedPrognosisValues = []
let maxFeatures = 1000

// UI Elements for analysis section
const analysisSection = document.getElementById('analysisSection')
const availablePrognosisList = document.getElementById('availablePrognosisList')
const selectedPrognosisList = document.getElementById('selectedPrognosisList')
const algorithmSelect = document.getElementById('algorithmSelect')
const featureSlider = document.getElementById('featureSlider')
const featureCount = document.getElementById('featureCount')
const maxFeaturesSpan = document.getElementById('maxFeatures')
const runAnalysisBtn = document.getElementById('runAnalysisBtn')
const analysisSpinner = document.getElementById('analysisSpinner')
const analysisStatus = document.getElementById('analysisStatus')
const resultsSection = document.getElementById('resultsSection')
const resultsTableBody = document.getElementById('resultsTableBody')
const resultsCards = document.getElementById('resultsCards')
const noResults = document.getElementById('noResults')
const deleteSection = document.getElementById('deleteSection')
const deleteBtn = document.getElementById('deleteBtn')

// Image section elements
const imagesSection = document.getElementById('imagesSection')
const imageGallery = document.getElementById('imageGallery')
const noImages = document.getElementById('noImages')

function hideAnalysisSection() {
  analysisSection.classList.add('hidden')
  currentSha1Hash = null
  prognosisValues = []
  selectedPrognosisValues = []
  hideResultsSection()
  hideImagesSection()
  hideDeleteSection()
}

function hideResultsSection() {
  resultsSection.classList.add('hidden')
  resultsTableBody.innerHTML = ''
  resultsCards.innerHTML = ''
}

function hideImagesSection() {
  if (imagesSection) {
    imagesSection.classList.add('hidden')
  }
}

function showImagesSection() {
  if (imagesSection) {
    imagesSection.classList.remove('hidden')
  }
}

function hideDeleteSection() {
  deleteSection.classList.add('hidden')
}

function showDeleteSection() {
  deleteSection.classList.remove('hidden')
}

function showResultsSection() {
  resultsSection.classList.remove('hidden')
}

async function loadResults(sha1Hash) {
  try {
    const response = await fetch(`${URL_RESULTS}/${sha1Hash}`)
    if (!response.ok) {
      if (response.status === 404) {
        // No results yet, hide the section
        hideResultsSection()
        return
      }
      throw new Error(`Failed to load results: ${response.status}`)
    }

    const data = await response.json()

    if (data.results && data.results.length > 0) {
      renderResultsTable(data.results)
      showResultsSection()
    } else {
      hideResultsSection()
    }
  } catch (error) {
    console.error('Error loading results:', error)
    hideResultsSection()
  }
}

async function loadImages(sha1Hash) {
  console.log('loadImages called with sha1Hash:', sha1Hash)
  try {
    const response = await fetch(`${URL_IMAGES}/${sha1Hash}`)
    console.log('Images response status:', response.status)
    if (!response.ok) {
      if (response.status === 404) {
        // No images yet, hide the section
        console.log('No images found (404), hiding images section')
        hideImagesSection()
        return
      }
      throw new Error(`Failed to load images: ${response.status}`)
    }

    const data = await response.json()
    console.log('Images data received:', data)

    if (data.images && data.images.length > 0) {
      console.log('Rendering', data.images.length, 'images')
      renderImageGallery(data.images)
      showImagesSection()
    } else {
      console.log('No images in response, hiding images section')
      hideImagesSection()
    }
  } catch (error) {
    console.error('Error loading images:', error)
    hideImagesSection()
  }
}

function renderImageGallery(images) {
  console.log('renderImageGallery called with:', images)
  console.log('currentSha1Hash:', currentSha1Hash)
  console.log('URL_IMAGE:', URL_IMAGE)

  imageGallery.innerHTML = ''
  noImages.style.display = 'none'

  // Sort images by filename for consistent ordering
  const sortedImages = [...images].sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' })
  )

  sortedImages.forEach((image) => {
    const imageUrl = `${URL_IMAGE}/${currentSha1Hash}/${image.filename}`
    console.log('Creating image card with URL:', imageUrl)

    const imageCard = document.createElement('div')
    imageCard.className = 'relative group'

    imageCard.innerHTML = `
      <div class="bg-slate-900/60 border border-magenta-700/40 rounded-xl p-4 shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:border-magenta-500/60 hover:shadow-[0_0_25px_rgba(236,72,153,0.4)] transition-all duration-300">
        <div class="aspect-[4/3] relative overflow-hidden rounded-lg mb-3 bg-slate-50">
          <img
            src="${imageUrl}"
            alt="${image.filename}"
            class="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform duration-300"
            onclick="openImageModal('${imageUrl}', '${image.filename}')"
            loading="lazy"
            onerror="console.error('Failed to load image:', this.src)"
          />
        </div>
        <div class="space-y-2">
          <h4 class="text-sm font-medium text-magenta-300 truncate" title="${image.filename}">
            ${image.filename}
          </h4>
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>${(image.file_size / (1024 * 1024)).toFixed(2)} MB</span>
            <a
              href="${imageUrl}"
              download="${image.filename}"
              class="inline-flex items-center gap-1 px-2 py-1 text-xs bg-magenta-700/40 hover:bg-magenta-600/60 rounded-md transition-colors duration-200"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              Download
            </a>
          </div>
        </div>
      </div>
    `

    imageGallery.appendChild(imageCard)
  })

  if (images.length === 0) {
    noImages.style.display = 'block'
  }
}

function openImageModal(imageUrl, filename) {
  // Create modal overlay
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'
  modal.onclick = () => modal.remove()

  // Create modal content
  const modalContent = document.createElement('div')
  modalContent.className =
    'bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl max-w-7xl max-h-[90vh] overflow-hidden'
  modalContent.onclick = (e) => e.stopPropagation()

  modalContent.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-slate-200">${filename}</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-200 transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div class="max-h-[70vh] overflow-auto">
        <img src="${imageUrl}" alt="${filename}" class="w-full h-auto rounded-lg" />
      </div>
      <div class="mt-4 flex justify-end">
        <a href="${imageUrl}" download="${filename}" class="inline-flex items-center gap-2 px-4 py-2 bg-magenta-600 hover:bg-magenta-700 rounded-lg text-white font-medium transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          Download
        </a>
      </div>
    </div>
  `

  modal.appendChild(modalContent)
  document.body.appendChild(modal)
}

function renderResultsTable(results) {
  resultsTableBody.innerHTML = ''
  resultsCards.innerHTML = ''
  noResults.style.display = 'none'

  // Sort results by filename in ascending order
  const sortedResults = [...results].sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' })
  )

  sortedResults.forEach((result) => {
    const sizeInMB = (result.file_size / (1024 * 1024)).toFixed(2)

    // Get current feature slider value for the lines parameter
    const linesParam = featureSlider.value
    const baseDownloadUrl = result.download_url
    const downloadUrl = `${baseDownloadUrl}?lines=${linesParam}`

    // Desktop table row
    const row = document.createElement('tr')
    row.className = 'border-b border-magenta-700/20 hover:bg-magenta-900/20 transition-colors'

    row.innerHTML = `
      <td class="py-4 px-4 text-slate-200">${result.filename}</td>
      <td class="py-4 px-4 text-right text-slate-300">${sizeInMB}</td>
      <td class="py-4 px-4 text-center">
        <a href="${downloadUrl}"
           data-download-base="${baseDownloadUrl}"
           data-label="download"
           download="${result.filename}"
           class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-magenta-200 bg-gradient-to-r from-magenta-900/40 to-fuchsia-900/40 hover:from-magenta-800/60 hover:to-fuchsia-800/60 border border-magenta-500/50 hover:border-magenta-400 rounded-lg transition-all duration-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_25px_rgba(236,72,153,0.5)]"
           title="Download first ${linesParam} lines">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <span class="download-lines">Download (${linesParam} lines)</span>
        </a>
      </td>
    `
    resultsTableBody.appendChild(row)

    // Mobile card
    const card = document.createElement('div')
    card.className =
      'border border-magenta-600/30 rounded-lg bg-gradient-to-r from-magenta-950/30 to-fuchsia-950/30 p-4 shadow-[0_0_15px_rgba(236,72,153,0.2)]'

    card.innerHTML = `
      <div class="flex flex-col space-y-3">
        <div class="flex justify-between items-start">
          <h4 class="text-magenta-200 font-medium text-sm leading-tight break-all">${result.filename}</h4>
          <span class="text-slate-400 text-sm ml-2 flex-shrink-0">${sizeInMB} MB</span>
        </div>
        <a href="${downloadUrl}"
           data-download-base="${baseDownloadUrl}"
           data-label="download-csv"
           download="${result.filename}"
           class="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-magenta-200 bg-gradient-to-r from-magenta-900/50 to-fuchsia-900/50 hover:from-magenta-800/70 hover:to-fuchsia-800/70 border border-magenta-500/50 hover:border-magenta-400 rounded-lg transition-all duration-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_25px_rgba(236,72,153,0.5)] active:scale-95"
           title="Download first ${linesParam} lines">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <span class="download-lines">Download CSV (${linesParam} lines)</span>
        </a>
      </div>
    `
    resultsCards.appendChild(card)
  })

  if (results.length === 0) {
    noResults.style.display = 'block'
  }
}

function showAnalysisSection() {
  analysisSection.classList.remove('hidden')
}

function setAnalysisStatus(type, msg) {
  analysisStatus.className = 'rounded-xl border px-4 py-3 text-sm font-medium'
  const cls =
    type === 'ok'
      ? ['border-emerald-400/40', 'text-emerald-200', 'bg-emerald-950/30']
      : type === 'warn'
      ? ['border-amber-400/40', 'text-amber-200', 'bg-amber-950/30']
      : ['border-rose-400/40', 'text-rose-200', 'bg-rose-950/30']
  analysisStatus.classList.add(...cls)
  analysisStatus.textContent = msg
  analysisStatus.classList.remove('hidden')
}

function clearAnalysisStatus() {
  analysisStatus.classList.add('hidden')
  analysisStatus.textContent = ''
}

async function loadAlgorithms() {
  try {
    const response = await fetch(URL_ALGORITHMS)
    const data = await response.json()
    availableAlgorithms = data.algorithms

    algorithmSelect.innerHTML = '<option value="">Select an algorithm...</option>'
    availableAlgorithms.forEach((alg) => {
      const option = document.createElement('option')
      option.value = alg.id
      option.textContent = alg.name
      algorithmSelect.appendChild(option)
    })
  } catch (error) {
    console.error('Error loading algorithms:', error)
    algorithmSelect.innerHTML = '<option value="">Error loading algorithms</option>'
  }
}

async function loadPrognosisValues(sha1Hash) {
  try {
    const response = await fetch(`${URL_VALUES}/${sha1Hash}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // Validate response data
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data format')
    }

    // Ensure prognosisValues is an array
    prognosisValues = Array.isArray(data.unique_values) ? data.unique_values : []

    if (prognosisValues.length === 0) {
      console.warn('No prognosis values found in response')
    }

    // Update max features based on actual total rows (CpG sites in transposed structure)
    // Backend pandas reports 501 rows but actual CpG features should be 500
    // Adjust calculation: if backend reports 501, we want 500 features
    const totalRows = data.total_rows || 0
    const totalColumns = data.total_columns || 0
    const totalFeatures = Math.max(0, totalRows - 1) // -1 to get correct count (501-1=500)
    maxFeatures = Math.max(100, totalFeatures) // Ensure minimum of 100

    // DEBUG: Log all the calculations
    console.log('=== SLIDER CALCULATION DEBUG ===')
    console.log('Backend data.total_rows:', totalRows)
    console.log('Backend data.total_columns:', totalColumns)
    console.log('Calculated totalFeatures (totalRows - 1):', totalFeatures)
    console.log('Final maxFeatures:', maxFeatures)
    console.log('Setting slider.max to:', maxFeatures)
    featureSlider.max = maxFeatures
    featureSlider.min = 100

    // DEBUG: Verify slider properties were actually set
    console.log('After setting slider properties:')
    console.log('- slider.min:', featureSlider.min)
    console.log('- slider.max:', featureSlider.max)
    console.log('- slider DOM max attribute:', featureSlider.getAttribute('max'))

    // Ensure current slider value is within the new range
    const currentValue = parseInt(featureSlider.value) || 500
    let newValue

    if (currentValue > maxFeatures) {
      // If current value exceeds new max, set to new max
      newValue = maxFeatures
    } else if (currentValue < 100) {
      // If current value is below minimum, set to minimum
      newValue = 100
    } else {
      // Current value is within range, keep it
      newValue = currentValue
    }

    // If no current value or setting for first time, use smart default
    if (currentValue === 500 && maxFeatures < 500) {
      newValue = Math.min(250, Math.floor(maxFeatures / 2))
    }

    featureSlider.value = Math.max(100, newValue)

    maxFeaturesSpan.textContent = maxFeatures
    updateFeatureCount()

    console.log(
      `Loaded CSV with ${totalRows} total rows (${totalFeatures} CpG features) and ${totalColumns} columns (samples), setting max features to ${maxFeatures}`
    )
    console.log('Available prognosis values:', prognosisValues)

    renderPrognosisValues()
    return data
  } catch (error) {
    console.error('Error loading prognosis values:', error)
    // Set fallback values to prevent undefined errors
    prognosisValues = []
    maxFeatures = 1000
    featureSlider.max = maxFeatures
    featureSlider.min = 100
    featureSlider.value = 500
    maxFeaturesSpan.textContent = maxFeatures
    updateFeatureCount()
    renderPrognosisValues()
    throw error
  }
}

function renderPrognosisValues() {
  // Ensure prognosisValues is an array
  if (!Array.isArray(prognosisValues)) {
    console.warn('prognosisValues is not an array, initializing as empty array')
    prognosisValues = []
  }

  // Ensure selectedPrognosisValues is an array
  if (!Array.isArray(selectedPrognosisValues)) {
    console.warn('selectedPrognosisValues is not an array, initializing as empty array')
    selectedPrognosisValues = []
  }

  // Render available values
  availablePrognosisList.innerHTML = ''

  if (prognosisValues.length === 0) {
    availablePrognosisList.innerHTML =
      '<div class="text-slate-500 text-center py-8">No prognosis values available</div>'
  } else {
    prognosisValues.forEach((value) => {
      if (!selectedPrognosisValues.includes(value)) {
        const item = createPrognosisItem(value, 'available')
        availablePrognosisList.appendChild(item)
      }
    })
  }

  // Render selected values
  selectedPrognosisList.innerHTML = ''
  if (selectedPrognosisValues.length === 0) {
    selectedPrognosisList.innerHTML =
      '<div class="text-slate-500 text-center py-8">Drop prognosis values here</div>'
  } else {
    selectedPrognosisValues.forEach((value) => {
      const item = createPrognosisItem(value, 'selected')
      selectedPrognosisList.appendChild(item)
    })
  }

  updateRunButton()
}

function createPrognosisItem(value, type) {
  const div = document.createElement('div')
  div.className = 'prognosis-item'
  div.textContent = value
  div.draggable = true

  if (type === 'selected') {
    div.classList.add('selected')
  }

  // Drag events
  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', value)
    div.classList.add('dragging')
  })

  div.addEventListener('dragend', () => {
    div.classList.remove('dragging')
  })

  // Click events
  div.addEventListener('click', () => {
    if (type === 'available') {
      addPrognosisValue(value)
    } else {
      removePrognosisValue(value)
    }
  })

  return div
}

function addPrognosisValue(value) {
  if (!selectedPrognosisValues.includes(value)) {
    selectedPrognosisValues.push(value)
    renderPrognosisValues()
  }
}

function removePrognosisValue(value) {
  selectedPrognosisValues = selectedPrognosisValues.filter((v) => v !== value)
  renderPrognosisValues()
}

function updateRunButton() {
  const hasMinimumSelection = selectedPrognosisValues.length >= 2 // Require at least 2 values
  const hasAlgorithm = algorithmSelect.value !== ''
  const isEnabled = hasMinimumSelection && hasAlgorithm

  runAnalysisBtn.disabled = !isEnabled

  // Update button text based on selection
  const buttonText = runAnalysisBtn.querySelector('span')
  if (!hasMinimumSelection && selectedPrognosisValues.length === 1) {
    buttonText.textContent = 'Select at least 2 prognosis values'
  } else if (!hasMinimumSelection) {
    buttonText.textContent = 'Select prognosis values'
  } else if (!hasAlgorithm) {
    buttonText.textContent = 'Select an algorithm'
  } else {
    buttonText.textContent = 'Run Feature Selection'
  }
}

function updateFeatureCount() {
  const slider = document.getElementById('featureSlider')
  const count = document.getElementById('featureCount')

  if (!slider || !count) {
    console.error('Slider or count element not found in updateFeatureCount')
    return
  }

  // Clamp value to valid integer within min/max
  const min = parseInt(slider.min) || 100
  const max = parseInt(slider.max) || 1000
  let val = parseInt(slider.value)
  if (isNaN(val)) val = min
  val = Math.max(min, Math.min(max, val))
  slider.value = val

  count.textContent = val

  // Update download links when value changes
  updateDownloadLinks()
}

function updateDownloadLinks() {
  // Update all download links with the new lines parameter
  const linesParam = featureSlider.value

  // Select all links we've annotated with data-download-base
  const links = document.querySelectorAll('a[data-download-base]')
  links.forEach((link) => {
    try {
      const base = link.getAttribute('data-download-base') || link.href.split('?')[0]
      link.href = `${base}?lines=${encodeURIComponent(linesParam)}`
      link.title = `Download first ${linesParam} lines`

      // Update visible label inside the button if present
      const labelSpan = link.querySelector('.download-lines')
      if (labelSpan) {
        // Preserve any surrounding text but replace the numeric part
        if (link.getAttribute('data-label') === 'download-csv') {
          labelSpan.textContent = `Download CSV (${linesParam} lines)`
        } else {
          labelSpan.textContent = `Download (${linesParam} lines)`
        }
      } else {
        // Fallback: replace innerText occurrences
        link.textContent = link.textContent.replace(/Download( CSV)?( \(\d+ lines\))?/, (m, p1) => {
          return p1 ? `Download CSV (${linesParam} lines)` : `Download (${linesParam} lines)`
        })
      }
    } catch (e) {
      console.error('Failed to update download link', e, link)
    }
  })
}

// Drag and drop setup
function setupDragAndDrop() {
  const containers = [
    document.getElementById('selectedPrognosisContainer'),
    document.getElementById('availablePrognosisContainer'),
  ]

  containers.forEach((container) => {
    container.addEventListener('dragover', (e) => {
      e.preventDefault()
      container.classList.add('drag-over')
    })

    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over')
    })

    container.addEventListener('drop', (e) => {
      e.preventDefault()
      container.classList.remove('drag-over')

      const value = e.dataTransfer.getData('text/plain')
      if (container.id === 'selectedPrognosisContainer') {
        addPrognosisValue(value)
      } else {
        removePrognosisValue(value)
      }
    })
  })
}

async function monitorAnalysisTask(taskId, sha1Hash) {
  const maxAttempts = 60 // 5 minutes with 5-second intervals
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${URL_STATUS}/${taskId}`)
      const data = await response.json()

      if (data.status === 'SUCCESS') {
        setStatus('ok', 'Analysis complete! Loading interface...')
        await loadAnalysisInterface(sha1Hash)
        return
      } else if (data.status === 'FAILURE') {
        throw new Error(data.error || 'Analysis failed')
      } else {
        // Still processing
        setStatus('warn', `Analyzing CSV file... (${Math.round((attempts / maxAttempts) * 100)}%)`)
      }
      setStatus('warn', data.result.status || 'Processing...')
    } catch (error) {
      console.error('Error checking task status:', error)
    }

    attempts++
    await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait 5 seconds
  }

  throw new Error('Analysis task timed out')
}

async function loadAnalysisInterface(sha1Hash) {
  try {
    currentSha1Hash = sha1Hash

    // Load algorithms, prognosis values, existing results, and images in parallel
    await Promise.all([
      loadAlgorithms(),
      loadPrognosisValues(sha1Hash),
      loadResults(sha1Hash),
      loadImages(sha1Hash),
    ])

    showAnalysisSection()
    showDeleteSection()
    setStatus('ok', 'Analysis interface loaded. Configure your feature selection below.')
  } catch (error) {
    console.error('Error loading analysis interface:', error)
    setStatus('err', 'Error loading analysis interface: ' + error.message)
  }
}

async function runFeatureSelection() {
  if (!currentSha1Hash || selectedPrognosisValues.length === 0 || !algorithmSelect.value) {
    setAnalysisStatus('err', 'Please select prognosis values and an algorithm')
    return
  }

  try {
    runAnalysisBtn.disabled = true
    analysisSpinner.classList.remove('hidden')
    clearAnalysisStatus()

    const requestBody = {
      sha1_hash: currentSha1Hash,
      selected_prognosis_values: selectedPrognosisValues,
      algorithm: algorithmSelect.value,
      keep_features: parseInt(featureSlider.value, 10),
    }

    setAnalysisStatus('warn', 'Starting feature selection analysis...')

    const response = await fetch(URL_RUN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Analysis failed: ${error}`)
    }

    const data = await response.json()

    // Monitor the analysis task
    await monitorFeatureSelectionTask(data.task_id)
  } catch (error) {
    console.error('Error running feature selection:', error)
    setAnalysisStatus('err', error.message || 'Feature selection failed')
  } finally {
    runAnalysisBtn.disabled = false
    analysisSpinner.classList.add('hidden')
  }
}

async function monitorFeatureSelectionTask(taskId) {
  const maxAttempts = 120 // 10 minutes with 5-second intervals
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${URL_STATUS}/${taskId}`)
      const data = await response.json()
      setAnalysisStatus('ok', data.status || 'Processing...')

      if (data.status === 'SUCCESS') {
        setAnalysisStatus('ok', 'Feature selection completed! Results are ready for download.')
        // Reload results to show the new file
        await loadResults(currentSha1Hash)
        await loadImages(currentSha1Hash)
        return
      } else if (data.status === 'FAILURE') {
        throw new Error(data.error || 'Feature selection failed')
      } else {
        // Still processing
        const progress = Math.round((attempts / maxAttempts) * 100)
        setAnalysisStatus('warn', `Running feature selection... (${progress}%)`)
      }
      // console.log(data.result.status)
      setAnalysisStatus('ok', data.result.status || 'Processing...')
    } catch (error) {
      console.error('Error checking task status:', error)
    }

    attempts++
    await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait 5 seconds
  }

  throw new Error('Feature selection task timed out')
}

async function deleteAnalysis() {
  if (!currentSha1Hash) {
    setAnalysisStatus('err', 'No analysis loaded to delete')
    return
  }

  // First confirmation
  const confirmed = confirm(
    `Are you sure you want to permanently delete this analysis?\n\n` +
      `This will remove:\n` +
      `• The original CSV file\n` +
      `• All analysis results\n` +
      `• All generated feature selection files\n\n` +
      `This action cannot be undone!`
  )

  if (!confirmed) {
    return
  }

  // Second confirmation with typing verification
  const verification = prompt(
    `FINAL CONFIRMATION\n\n` + `Type "DELETE" (in capital letters) to permanently remove this analysis:`
  )

  if (verification !== 'DELETE') {
    setAnalysisStatus('warn', 'Deletion cancelled - verification failed')
    return
  }

  try {
    deleteBtn.disabled = true
    setAnalysisStatus('warn', 'Deleting analysis and all files...')

    const response = await fetch(`${URL_DELETE}/${currentSha1Hash}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Delete failed: ${error}`)
    }

    const data = await response.json()
    setAnalysisStatus('ok', 'Analysis deleted successfully!')

    // Reset the interface after successful deletion
    setTimeout(() => {
      hideAnalysisSection()
      fileInput.value = ''
      sha1Out.value = ''
      clearStatus()
      clearAnalysisStatus()
    }, 2000)
  } catch (error) {
    console.error('Error deleting analysis:', error)
    setAnalysisStatus('err', error.message || 'Failed to delete analysis')
  } finally {
    deleteBtn.disabled = false
  }
}

// Event listeners for dynamic elements
function setupSliderEventListeners() {
  console.log('Setting up slider event listeners')
  const slider = document.getElementById('featureSlider')
  const count = document.getElementById('featureCount')

  console.log('Slider element:', slider)
  console.log('Slider parent:', slider?.parentElement)
  console.log('Slider display:', slider ? getComputedStyle(slider).display : 'N/A')
  console.log('Slider visibility:', slider ? getComputedStyle(slider).visibility : 'N/A')

  if (!slider) {
    console.error('featureSlider element not found')
    return false
  }

  if (!count) {
    console.error('featureCount element not found')
    return false
  }

  // Remove any existing listeners to prevent duplicates
  slider.removeEventListener('input', updateFeatureCount)
  slider.removeEventListener('change', updateFeatureCount)

  // Add event listeners
  slider.addEventListener('input', function (e) {
    updateFeatureCount()
  })

  slider.addEventListener('change', function (e) {
    updateFeatureCount()
  })

  // Test initial functionality and verify slider properties
  console.log('Slider properties:')
  console.log('- min:', slider.min)
  console.log('- max:', slider.max)
  console.log('- value:', slider.value)
  console.log('- step:', slider.step)
  console.log('- disabled:', slider.disabled)

  // Set default properties only if not already set by CSV data
  if (!slider.min || slider.min === '0') {
    slider.min = '100'
  }
  if (!slider.max || slider.max === '0') {
    slider.max = '1000' // This will be updated by loadPrognosisValues
  }
  if (!slider.step || slider.step === '0') {
    slider.step = '1'
  }

  // Set initial value if not already set
  if (!slider.value || slider.value === '') {
    slider.value = '500'
  }

  // Verify slider properties are set correctly
  console.log('Slider initialized with range:', slider.min, 'to', slider.max, 'current value:', slider.value)

  updateFeatureCount()

  // Global test function
  window.testSlider = function (value) {
    console.log('Setting slider value to:', value)
    slider.value = value
    slider.dispatchEvent(new Event('input'))
  }

  console.log('Feature input event listeners attached successfully')
  return true
}

// Try to setup slider immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSliderEventListeners)
} else {
  setupSliderEventListeners()
}

// Also try when the analysis section becomes visible
const originalShowAnalysisSection = showAnalysisSection
showAnalysisSection = function () {
  originalShowAnalysisSection()
  // Wait a bit for elements to be rendered
  setTimeout(setupSliderEventListeners, 100)
}

algorithmSelect.addEventListener('change', updateRunButton)
runAnalysisBtn.addEventListener('click', runFeatureSelection)
deleteBtn.addEventListener('click', deleteAnalysis)

// Initialize drag and drop
setupDragAndDrop()
