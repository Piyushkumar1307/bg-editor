const canvas = document.querySelector('#previewCanvas');
const ctx = canvas.getContext('2d');
const input = document.querySelector('#photoInput');
const uploadCard = document.querySelector('#uploadCard');
const status = document.querySelector('#status');
const statusOrb = status.querySelector('.status-orb');
const adjustments = document.querySelector('#adjustments');
const emptyState = document.querySelector('#emptyState');
const downloadButton = document.querySelector('#downloadButton');
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
    downloadButton.disabled = false;
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
    const link = document.createElement('a');
    const fileUrl = URL.createObjectURL(blob);
    link.download = 'framecraft-portrait.png';
    link.href = fileUrl;
    link.click();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    setStatus('Step 3 of 3 · Your original-size PNG is ready.', 'done');
  }, 'image/png');
});
bg.onload = () => { setCanvasToBackgroundSize(); render(); };
bg.src = 'assets/hyderabad-background-original.png';
