const BASE = 'https://maayanlab.cloud/Enrichr'

console.log('=== Enrich.js Loading ===')
console.log('Document ready state:', document.readyState)

const els = {
  csv: document.getElementById('csvFile'),
  geneCol: document.getElementById('geneCol'),
  lib: document.getElementById('library'),
  desc: document.getElementById('desc'),
  run: document.getElementById('runBtn'),
  loadLibs: document.getElementById('loadLibsBtn'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  bars: document.getElementById('bars'),
  tableBody: document.getElementById('tableBody'),
  sortSelect: document.getElementById('sortSelect'),
  downloadCsv: document.getElementById('downloadCsv'),
  geneCountContainer: document.getElementById('geneCountContainer'),
  geneCountInput: document.getElementById('geneCountInput'),
  totalGenesDisplay: document.getElementById('totalGenesDisplay'),
  downloadList: document.getElementById('downloadList'),
  downloadListItems: document.getElementById('downloadListItems'),
}

console.log('DOM Elements loaded:')
console.log('- csvFile:', !!els.csv)
console.log('- geneCountContainer:', !!els.geneCountContainer)
console.log('- geneCountInput:', !!els.geneCountInput)
console.log('- totalGenesDisplay:', !!els.totalGenesDisplay)

// Debug: check if geneCountInput exists
if (!els.geneCountInput) {
  console.error('ERROR: geneCountInput element not found in DOM')
  console.error(
    'Available elements with id containing "gene":',
    Array.from(document.querySelectorAll('[id*="gene"]')).map((el) => el.id)
  )
}

function showStatus(msg, type = 'info') {
  els.status.classList.remove(
    'hidden',
    'border-slate-700',
    'border-cyan-500/50',
    'border-emerald-500/50',
    'border-rose-500/50',
    'text-slate-300',
    'text-cyan-300',
    'text-emerald-300',
    'text-rose-300',
    'bg-slate-800/40',
    'bg-cyan-950/30',
    'bg-emerald-950/30',
    'bg-rose-950/30'
  )
  els.status.classList.add(
    type === 'info'
      ? 'border-slate-700'
      : type === 'success'
      ? 'border-emerald-500/50'
      : type === 'warn'
      ? 'border-cyan-500/50'
      : 'border-rose-500/50',
    type === 'info'
      ? 'text-slate-300'
      : type === 'success'
      ? 'text-emerald-300'
      : type === 'warn'
      ? 'text-cyan-300'
      : 'text-rose-300',
    type === 'info'
      ? 'bg-slate-800/40'
      : type === 'success'
      ? 'bg-emerald-950/30'
      : type === 'warn'
      ? 'bg-cyan-950/30'
      : 'bg-rose-950/30'
  )
  els.status.textContent = msg
}

function hideStatus() {
  els.status.classList.add('hidden')
}

async function fetchLibraries() {
  try {
    showStatus('Fetching available libraries…')
    const res = await fetch(`${BASE}/datasetStatistics`)
    if (!res.ok) throw new Error('Failed to fetch datasetStatistics')
    const data = await res.json()
    const libs = data.statistics.map((s) => s.libraryName)
    // keep common pathway libs near the top
    const preferred = ['Reactome', 'KEGG', 'WikiPathways', 'BioPlanet', 'Pathway']
    const filtered = libs.filter((name) =>
      preferred.some((p) => name.toLowerCase().includes(p.toLowerCase()))
    )
    els.lib.innerHTML = ''
    filtered.sort().forEach((name) => {
      const opt = document.createElement('option')
      opt.value = name
      opt.textContent = name
      els.lib.appendChild(opt)
    })
    if (els.lib.options.length > 0) {
      els.lib.options[0].selected = true
    }
    hideStatus()
    showStatus(`Loaded ${filtered.length} pathway libraries.`, 'success')
  } catch (err) {
    console.error(err)
    showStatus(`Could not load libraries: ${err.message}`, 'error')
  }
}

function readCsvGetGenes(file, geneCol) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data
        if (!rows.length) return reject(new Error('CSV is empty.'))
        if (!(geneCol in rows[0])) return reject(new Error(`Column \"${geneCol}\" not found.`))
        const genes = Array.from(
          new Set(rows.map((r) => (r[geneCol] ?? '').toString().trim()).filter((v) => v))
        )
        if (!genes.length) return reject(new Error('No genes found in the specified column.'))
        resolve(genes)
      },
      error: (err) => reject(err),
    })
  })
}

async function addListToEnrichr(genes, description) {
  const fd = new FormData()
  fd.append('list', genes.join('\n'))
  if (description) fd.append('description', description)
  const res = await fetch(`${BASE}/addList`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('addList failed')
  const js = await res.json()
  return js.userListId
}

async function fetchEnrichmentForLibrary(userListId, library) {
  const params = new URLSearchParams({ userListId, filename: 'enrichr_results', backgroundType: library })
  const res = await fetch(`${BASE}/export?${params.toString()}`)
  if (!res.ok) throw new Error(`Enrichr export returned ${res.status} for ${library}`)
  const tsvText = await res.text()
  const lines = tsvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split('\t')
  const idx = {
    term: header.indexOf('Term') !== -1 ? header.indexOf('Term') : header.indexOf('Term Name'),
    overlap: header.indexOf('Overlap'),
    p: header.indexOf('P-value'),
    cs: header.indexOf('Combined Score'),
  }
  return lines
    .slice(1)
    .map((line, i) => {
      const parts = line.split('\t')
      const overlap = parts[idx.overlap] ?? ''
      let overlapCnt = null, pathwayGenes = null
      if (overlap.includes('/')) {
        const [k, m] = overlap.split('/')
        overlapCnt = parseInt(k, 10)
        pathwayGenes = parseInt(m, 10)
      }
      return {
        rank: i + 1,
        Pathway: parts[idx.term] ?? '',
        Pathway_Genes: pathwayGenes,
        Overlap: overlapCnt,
        P_value: parseFloat(parts[idx.p]),
        Combined_Score: parseFloat(parts[idx.cs]),
      }
    })
    .filter((r) => Number.isFinite(r.P_value) && Number.isFinite(r.Combined_Score))
}

function renderTable(rows) {
  els.tableBody.innerHTML = ''
  const top10 = rows.slice(0, 10)
  top10.forEach((r, i) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
          <td class=\"px-3 py-2 text-slate-500\">${i + 1}</td>
          <td class=\"px-3 py-2\">${r.Pathway}</td>
          <td class=\"px-3 py-2\">${r.Pathway_Genes ?? '—'}</td>
          <td class=\"px-3 py-2\">${r.Overlap ?? '—'}</td>
          <td class=\"px-3 py-2\">${r.P_value.toExponential(2)}</td>
          <td class=\"px-3 py-2\">${r.Combined_Score.toFixed(2)}</td>`
    els.tableBody.appendChild(tr)
  })
}

function renderBars(rows, topN = 20) {
  els.bars.innerHTML = ''
  const top = rows.slice(0, topN)
  const maxCS = Math.max(...top.map((r) => r.Combined_Score))
  top.forEach((r, i) => {
    const widthPct = maxCS > 0 ? (r.Combined_Score / maxCS) * 100 : 0
    const bar = document.createElement('div')
    bar.className = 'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3'
    bar.innerHTML = `
          <div class=\"flex-shrink-0 w-8 sm:w-12 text-right text-xs text-slate-500\">${i + 1}.</div>
          <div class=\"flex-1 min-w-0\">
            <div class=\"flex flex-col sm:flex-row sm:justify-between text-xs mb-1 gap-1\">
              <div class=\"font-medium truncate pr-2\">${r.Pathway}</div>
              <div class=\"text-slate-500 flex-shrink-0\">p=${r.P_value.toExponential(
                2
              )} · CS=${r.Combined_Score.toFixed(2)}</div>
            </div>
            <div class=\"w-full bg-slate-900 rounded-full overflow-hidden\">
              <div class=\"h-3 rounded-full transition-all duration-300\" style=\"width: ${widthPct}%; background: linear-gradient(90deg, #10b981, #06d6a0); box-shadow: 0 0 10px #10b981, 0 0 20px #10b981, 0 0 30px #10b981; border: 1px solid #10b981;\"></div>
            </div>
          </div>`
    els.bars.appendChild(bar)
  })
}

function downloadCSV(rows, libName = 'enrichr_results') {
  const header = ['Pathway', 'Pathway_Genes', 'Overlap', 'P_value', 'Combined_Score']
  const lines = [header.join(',')].concat(
    rows.map((r) =>
      [
        '"' + r.Pathway.replaceAll('"', '""') + '"',
        r.Pathway_Genes ?? '',
        r.Overlap ?? '',
        r.P_value,
        r.Combined_Score,
      ].join(',')
    )
  )
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${libName.replace(/[^a-z0-9_]/gi, '_')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

let allGenes = []

// Handle CSV file selection - extract genes and show input field
els.csv.addEventListener('change', async () => {
  if (!els.csv.files[0]) {
    els.geneCountContainer.classList.add('hidden')
    allGenes = []
    return
  }

  try {
    showStatus('Reading CSV and extracting genes…')
    const file = els.csv.files[0]
    allGenes = await readCsvGetGenes(file, els.geneCol.value.trim())

    // Update input field with total gene count and show it
    els.totalGenesDisplay.textContent = allGenes.length
    if (els.geneCountInput) {
      els.geneCountInput.setAttribute('max', allGenes.length)
      els.geneCountInput.value = Math.min(allGenes.length, Math.max(5, Math.min(100, allGenes.length)))
    }
    // els.geneCountContainer.classList.remove('hidden')

    showStatus(`Found ${allGenes.length} genes!! `, 'success')
  } catch (err) {
    console.error(err)
    showStatus(`Error reading CSV: ${err.message}`, 'error')
    els.geneCountContainer.classList.add('hidden')
    allGenes = []
  }
})

let libraryResults = {} // { libraryName: rows[] }
let activeLibrary = null

function sortRows(rows) {
  return els.sortSelect.checked
    ? [...rows].sort((a, b) => a.P_value - b.P_value)
    : [...rows].sort((a, b) => b.Combined_Score - a.Combined_Score)
}

// libStates: { [lib]: 'loading' | 'done' | 'error' }
function renderDownloadList(allLibs, libStates = {}) {
  els.downloadListItems.innerHTML = ''
  allLibs.forEach((lib) => {
    const state = libStates[lib] ?? 'done'
    const hasResults = !!libraryResults[lib]
    const wrapper = document.createElement('div')
    wrapper.className = 'flex items-center gap-1'

    const viewBtn = document.createElement('button')
    viewBtn.type = 'button'
    const isActive = lib === activeLibrary
    if (state === 'loading') {
      viewBtn.className =
        'px-4 py-2 text-sm rounded-xl font-medium border border-slate-600 bg-slate-800/30 text-slate-400 cursor-not-allowed'
      viewBtn.disabled = true
      viewBtn.innerHTML = `<svg class="inline animate-spin h-3 w-3 mr-1 -mt-0.5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>${lib}`
    } else if (state === 'error') {
      viewBtn.className =
        'px-4 py-2 text-sm rounded-xl font-medium border border-rose-700 bg-rose-950/30 text-rose-400 cursor-not-allowed'
      viewBtn.disabled = true
      viewBtn.textContent = `✗ ${lib}`
    } else {
      viewBtn.className = isActive
        ? 'px-4 py-2 text-sm rounded-xl font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white shadow-lg'
        : 'px-4 py-2 text-sm rounded-xl font-medium border border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60 text-slate-300 transition-all duration-200'
      viewBtn.textContent = lib
      viewBtn.addEventListener('click', () => {
        activeLibrary = lib
        const rows = sortRows(libraryResults[lib])
        renderBars(rows)
        renderTable(rows)
        renderDownloadList(allLibs, libStates)
      })
    }

    wrapper.appendChild(viewBtn)

    if (hasResults) {
      const dlBtn = document.createElement('button')
      dlBtn.type = 'button'
      dlBtn.title = `Download ${lib} CSV`
      dlBtn.className =
        'px-2 py-2 text-sm rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all duration-200'
      dlBtn.innerHTML =
        '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      dlBtn.addEventListener('click', () => downloadCSV(libraryResults[lib], lib))
      wrapper.appendChild(dlBtn)
    }

    els.downloadListItems.appendChild(wrapper)
  })
  els.downloadList.classList.remove('hidden')
}

async function handleRun() {
  try {
    els.run.disabled = true
    els.results.classList.add('hidden')
    libraryResults = {}
    activeLibrary = null

    if (!els.csv.files[0]) throw new Error('Please choose a CSV file.')
    if (!allGenes.length) throw new Error('No genes found. Please select a valid CSV file.')

    const selectedLibraries = Array.from(els.lib.selectedOptions).map((o) => o.value)
    if (!selectedLibraries.length) throw new Error('Please select at least one library.')

    const selectedGeneCount = els.geneCountInput ? parseInt(els.geneCountInput.value) : allGenes.length
    const genes = allGenes.slice(0, selectedGeneCount)

    if (genes.length < 5) throw new Error('Please provide at least 5 genes for enrichment.')
    showStatus(`Uploading ${genes.length} of ${allGenes.length} genes to Enrichr…`)
    const userListId = await addListToEnrichr(genes, els.desc.value.trim())

    // Show the results panel immediately and update it live as each library completes
    const libStates = Object.fromEntries(selectedLibraries.map((l) => [l, 'loading']))
    els.results.classList.remove('hidden')
    renderDownloadList(selectedLibraries, libStates)

    for (let i = 0; i < selectedLibraries.length; i++) {
      const lib = selectedLibraries[i]
      showStatus(`Running enrichment ${i + 1}/${selectedLibraries.length}: ${lib}…`)
      try {
        const rows = await fetchEnrichmentForLibrary(userListId, lib)
        if (rows.length) {
          libraryResults[lib] = rows
          libStates[lib] = 'done'
          // Auto-display the first completed library
          if (!activeLibrary) {
            activeLibrary = lib
            renderBars(sortRows(rows))
            renderTable(sortRows(rows))
          }
        } else {
          libStates[lib] = 'error'
          console.warn(`No results for library: ${lib}`)
        }
      } catch (libErr) {
        libStates[lib] = 'error'
        console.error(`Failed for library ${lib}:`, libErr)
      }
      renderDownloadList(selectedLibraries, libStates)
    }

    const completedLibs = Object.keys(libraryResults)
    if (!completedLibs.length) throw new Error('No enrichment results returned for any selected library.')

    const failCount = selectedLibraries.length - completedLibs.length
    showStatus(
      `Done: ${completedLibs.length} librar${completedLibs.length > 1 ? 'ies' : 'y'} completed` +
        (failCount ? `, ${failCount} failed — see console for details.` : '.'),
      failCount ? 'warn' : 'success'
    )
  } catch (err) {
    console.error(err)
    showStatus(err.message || String(err), 'error')
  } finally {
    els.run.disabled = false
  }
}

// Event listeners
els.run.addEventListener('click', handleRun)
els.loadLibs.addEventListener('click', fetchLibraries)
els.sortSelect.addEventListener('change', () => {
  if (!activeLibrary || !libraryResults[activeLibrary]) return
  const rows = sortRows(libraryResults[activeLibrary])
  renderBars(rows)
  renderTable(rows)
  // Re-render list to keep active highlight (states not tracked here, just re-pass done for all known)
  const libs = Object.keys(libraryResults)
  if (libs.length) renderDownloadList(libs, Object.fromEntries(libs.map((l) => [l, 'done'])))
})
els.downloadCsv.addEventListener('click', () => {
  if (activeLibrary && libraryResults[activeLibrary]) {
    downloadCSV(libraryResults[activeLibrary], activeLibrary)
  }
})

// Add input validation for the numeric input
if (els.geneCountInput) {
  els.geneCountInput.addEventListener('change', () => {
    const value = parseInt(els.geneCountInput.value)
    const max = parseInt(els.geneCountInput.max)
    const min = parseInt(els.geneCountInput.min)

    // Clamp value between min and max
    if (value < min) {
      els.geneCountInput.value = min
    } else if (value > max) {
      els.geneCountInput.value = max
    }
  })
}
