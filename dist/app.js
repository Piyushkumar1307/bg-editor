const canvas = document.querySelector('#previewCanvas');
const ctx = canvas.getContext('2d');
const input = document.querySelector('#photoInput');
const uploadCard = document.querySelector('#uploadCard');
const status = document.querySelector('#status');
const statusOrb = status.querySelector('.status-orb');
const adjustments = document.querySelector('#adjustments');
const emptyState = document.querySelector('#emptyState');
const downloadButton = document.querySelector('#downloadButton');
const pdfButton = document.querySelector('#pdfButton');
const printButton = document.querySelector('#printButton');
const printSettings = document.querySelector('#printSettings');
const printWidth = document.querySelector('#printWidth');
const printHeight = document.querySelector('#printHeight');
const printDetails = document.querySelector('#printDetails');
const pdfDimensions = document.querySelector('#pdfDimensions');
const dragNote = document.querySelector('#dragNote');
const canvasWrap = document.querySelector('#canvasWrap');
const dimensionBadge = document.querySelector('#dimensionBadge');
const downloadDimensions = document.querySelector('#downloadDimensions');
const uploadTitle = document.querySelector('#uploadTitle');
const uploadHelp = document.querySelector('#uploadHelp');
const bg = new Image();

const controls = {
  scale: document.querySelector('#scale'), horizontal: document.querySelector('#horizontal'),
  vertical: document.querySelector('#vertical'), rotate: document.querySelector('#rotate')
};
const state = { subject: null, scale: 75, x: 50, y: 62, rotate: 0, dragging: false, dragStart: null };

function setStatus(message, mode = 'idle') {
  status.lastElementChild.textContent = message;
  statusOrb.className = `status-orb ${mode === 'working' ? 'working' : mode === 'done' ? 'done' : ''}`;
}
function setCanvasToBackgroundSize() {
  if (!bg.naturalWidth || !bg.naturalHeight) return;
  // The drawing buffer and exported PNG match the supplied background exactly.
  // CSS only scales the on-screen preview, never the artwork itself.
  canvas.width = bg.naturalWidth;
  canvas.height = bg.naturalHeight;
  canvasWrap.style.aspectRatio = `${bg.naturalWidth} / ${bg.naturalHeight}`;
  const dimensions = `${bg.naturalWidth.toLocaleString()} × ${bg.naturalHeight.toLocaleString()} px`;
  dimensionBadge.innerHTML = `Original image <i></i> ${dimensions}`;
  downloadDimensions.textContent = dimensions;
  updatePrintDetails();
}
function getPrintSize() {
  const width = Number(printWidth.value);
  const height = Number(printHeight.value);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 3 || width > 24 || height < 3 || height > 24) return null;
  return { width, height };
}
function formatInches(value) { return Number(value.toFixed(2)).toString(); }
function updatePrintDetails() {
  const size = getPrintSize();
  if (!size) {
    printDetails.textContent = 'Enter a size from 3 to 24 inches.';
    pdfDimensions.textContent = 'Set print size';
    return false;
  }
  const artworkPrintWidth = Math.min(size.width, size.height * canvas.width / canvas.height);
  const ppi = Math.round(canvas.width / artworkPrintWidth);
  const dimensions = `${formatInches(size.width)} × ${formatInches(size.height)} in`;
  printDetails.textContent = `${dimensions} · ${ppi} PPI · full artwork, no crop`;
  pdfDimensions.textContent = dimensions;
  return true;
}
function makePrintCanvas(size) {
  const targetPpi = 300;
  const maxPixels = 18_000_000;
  const requestedWidth = Math.round(size.width * targetPpi);
  const requestedHeight = Math.round(size.height * targetPpi);
  const scale = Math.min(1, Math.sqrt(maxPixels / (requestedWidth * requestedHeight)));
  const printCanvas = document.createElement('canvas');
  printCanvas.width = Math.max(1, Math.round(requestedWidth * scale));
  printCanvas.height = Math.max(1, Math.round(requestedHeight * scale));
  const printCtx = printCanvas.getContext('2d');
  printCtx.fillStyle = '#ffffff';
  printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);
  const artworkScale = Math.min(printCanvas.width / canvas.width, printCanvas.height / canvas.height);
  const drawWidth = Math.round(canvas.width * artworkScale);
  const drawHeight = Math.round(canvas.height * artworkScale);
  printCtx.drawImage(canvas, Math.round((printCanvas.width - drawWidth) / 2), Math.round((printCanvas.height - drawHeight) / 2), drawWidth, drawHeight);
  return printCanvas;
}
function canvasToBlob(sourceCanvas, type = 'image/png', quality) {
  return new Promise(resolve => sourceCanvas.toBlob(resolve, type, quality));
}
function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const fileUrl = URL.createObjectURL(blob);
  link.download = filename;
  link.href = fileUrl;
  link.click();
  setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
}
function createPdfBlob(printCanvas, size) {
  return canvasToBlob(printCanvas, 'image/jpeg', 0.95).then(async imageBlob => {
    if (!imageBlob) throw new Error('Could not create the print image.');
    const jpeg = new Uint8Array(await imageBlob.arrayBuffer());
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const addText = text => { const bytes = encoder.encode(text); chunks.push(bytes); length += bytes.length; };
    const addBytes = bytes => { chunks.push(bytes); length += bytes.length; };
    const addObject = (number, body) => { offsets[number] = length; addText(`${number} 0 obj\n${body}\nendobj\n`); };
    const widthPoints = (size.width * 72).toFixed(2);
    const heightPoints = (size.height * 72).toFixed(2);
    const content = `q\n${widthPoints} 0 0 ${heightPoints} 0 0 cm\n/Im0 Do\nQ\n`;
    addText('%PDF-1.3\n%\xFF\xFF\xFF\xFF\n');
    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    addObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPoints} ${heightPoints}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = length;
    addText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${printCanvas.width} /Height ${printCanvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    addBytes(jpeg);
    addText('\nendstream\nendobj\n');
    addObject(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    const xref = length;
    addText('xref\n0 6\n0000000000 65535 f \n');
    for (let number = 1; number <= 5; number += 1) addText(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
    addText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  });
}
function setExportBusy(isBusy, message) {
  pdfButton.disabled = isBusy || !state.subject;
  printButton.disabled = isBusy || !state.subject;
  if (message) setStatus(message, 'working');
}
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function removeOnlyWhite(image) {
  const work = document.createElement('canvas');
  work.width = image.naturalWidth; work.height = image.naturalHeight;
  const workCtx = work.getContext('2d', { willReadFrequently: true });
  workCtx.drawImage(image, 0, 0);
  const pixels = workCtx.getImageData(0, 0, work.width, work.height);
  const data = pixels.data;

  // Fade only low-saturation near-white pixels. This preserves coloured ink,
  // clothing and skin tones instead of applying a full portrait cutout.
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    const lightness = Math.min(red, green, blue);
    const colourSpread = Math.max(red, green, blue) - lightness;
    const whiteAmount = Math.max(0, Math.min(1, (lightness - 214) / 34));
    const neutrality = Math.max(0, Math.min(1, 1 - colourSpread / 42));
    const removeAmount = whiteAmount * neutrality;
    data[i + 3] = Math.round(data[i + 3] * (1 - removeAmount));
  }
  workCtx.putImageData(pixels, 0, 0);
  return loadImage(work.toDataURL('image/png'));
}
function render() {
  // `complete` is also true for a failed image, so check its real dimensions.
  if (!bg.complete || !bg.naturalWidth) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  if (!state.subject) return;
  const baseH = canvas.height * .72 * (state.scale / 75);
  const drawH = baseH;
  const drawW = drawH * (state.subject.naturalWidth / state.subject.naturalHeight);
  const x = canvas.width * state.x / 100;
  const y = canvas.height * state.y / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotate * Math.PI / 180);
  ctx.shadowColor = 'rgba(5, 33, 40, .32)'; ctx.shadowBlur = 21; ctx.shadowOffsetY = 10;
  ctx.drawImage(state.subject, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}
function syncControls() { Object.entries({scale:state.scale,horizontal:state.x,vertical:state.y,rotate:state.rotate}).forEach(([key,val]) => controls[key].value = val); }
function reset() { Object.assign(state, { scale:75, x:50, y:62, rotate:0 }); syncControls(); render(); }
Object.entries(controls).forEach(([name, control]) => control.addEventListener('input', () => { state[name === 'horizontal' ? 'x' : name === 'vertical' ? 'y' : name] = Number(control.value); render(); }));
document.querySelector('#resetButton').addEventListener('click', reset);

async function processPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { setStatus('Please choose a JPG, PNG or WebP photo'); return; }
  emptyState.classList.add('hidden'); uploadCard.classList.add('is-uploaded');
  uploadTitle.textContent = file.name.length > 26 ? `${file.name.slice(0, 23)}…` : file.name;
  uploadHelp.textContent = 'Click here to choose a different photo';
  setStatus('Step 1 of 3 · Preparing your portrait…', 'working');
  let localUrl;
  try {
    localUrl = URL.createObjectURL(file);
    const original = await loadImage(localUrl);
    setStatus('Step 1 of 3 · Removing the white background…', 'working');
    state.subject = await removeOnlyWhite(original);
    reset();
    adjustments.classList.add('active'); adjustments.setAttribute('aria-disabled', 'false');
    printSettings.classList.add('active'); printSettings.setAttribute('aria-disabled', 'false');
    downloadButton.disabled = false;
    pdfButton.disabled = false;
    printButton.disabled = false;
    canvasWrap.classList.add('has-subject');
    setStatus('Step 2 of 3 · Drag your portrait or use the sliders to place it.', 'done');
    showDragNote();
  } catch (error) {
    console.error(error);
    setStatus('Could not process this image. Please try a JPG, PNG or WebP file.');
    emptyState.classList.remove('hidden');
  } finally {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }
}
input.addEventListener('change', event => processPhoto(event.target.files[0]));
printWidth.addEventListener('input', updatePrintDetails);
printHeight.addEventListener('input', updatePrintDetails);
function canvasPoint(event) { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100 }; }
function showDragNote() { dragNote.classList.add('show'); setTimeout(() => dragNote.classList.remove('show'), 2600); }
canvas.addEventListener('pointerdown', event => { if (!state.subject) return; state.dragging = true; canvasWrap.classList.add('is-dragging'); state.dragStart = canvasPoint(event); canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!state.dragging) return; const point = canvasPoint(event); state.x = Math.max(0, Math.min(100, state.x + point.x - state.dragStart.x)); state.y = Math.max(0, Math.min(100, state.y + point.y - state.dragStart.y)); state.dragStart = point; syncControls(); render(); });
canvas.addEventListener('pointerup', () => { state.dragging = false; canvasWrap.classList.remove('is-dragging'); });
canvas.addEventListener('pointercancel', () => { state.dragging = false; canvasWrap.classList.remove('is-dragging'); });
downloadButton.addEventListener('click', () => {
  if (!state.subject) return;
  canvas.toBlob(blob => {
    if (!blob) return;
    downloadBlob(blob, 'framecraft-portrait.png');
    setStatus('Step 3 of 3 · Your original-size PNG is ready.', 'done');
  }, 'image/png');
});
pdfButton.addEventListener('click', async () => {
  if (!state.subject || !updatePrintDetails()) return;
  const size = getPrintSize();
  setExportBusy(true, 'Step 3 of 3 · Building your print-size PDF…');
  try {
    const printCanvas = makePrintCanvas(size);
    const pdf = await createPdfBlob(printCanvas, size);
    downloadBlob(pdf, `framecraft-${formatInches(size.width)}x${formatInches(size.height)}in.pdf`);
    setStatus(`Step 3 of 3 · Your ${formatInches(size.width)} × ${formatInches(size.height)} in PDF is ready.`, 'done');
  } catch (error) {
    console.error(error);
    setStatus('Could not create the PDF. Please try again.');
  } finally {
    setExportBusy(false);
  }
});
printButton.addEventListener('click', async () => {
  if (!state.subject || !updatePrintDetails()) return;
  const size = getPrintSize();
  const printWindow = window.open('', '_blank');
  if (!printWindow) { setStatus('Your browser blocked the print window. Please allow pop-ups and try again.'); return; }
  setExportBusy(true, 'Step 3 of 3 · Preparing the print dialog…');
  try {
    const printCanvas = makePrintCanvas(size);
    const imageUrl = printCanvas.toDataURL('image/jpeg', 0.95);
    const width = formatInches(size.width);
    const height = formatInches(size.height);
    printWindow.document.write(`<!doctype html><html><head><title>FrameCraft print</title><style>@page { size: ${width}in ${height}in; margin: 0; } html, body { width: ${width}in; height: ${height}in; margin: 0; background: #fff; } img { display: block; width: 100%; height: 100%; }</style></head><body><img src="${imageUrl}" alt="FrameCraft composition" /></body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
    setStatus(`Step 3 of 3 · Print dialog ready for ${width} × ${height} in paper.`, 'done');
  } catch (error) {
    console.error(error);
    printWindow.close();
    setStatus('Could not prepare the print dialog. Please try again.');
  } finally {
    setExportBusy(false);
  }
});
bg.onload = () => { setCanvasToBackgroundSize(); render(); };
bg.src = 'assets/hyderabad-background-original.png';
