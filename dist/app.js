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
const bg = new Image();
bg.src = 'assets/hyderabad-scene.svg';

const controls = {
  scale: document.querySelector('#scale'), horizontal: document.querySelector('#horizontal'),
  vertical: document.querySelector('#vertical'), rotate: document.querySelector('#rotate')
};
const state = { subject: null, scale: 75, x: 50, y: 62, rotate: 0, dragging: false, dragStart: null };

function setStatus(message, mode = 'idle') {
  status.lastElementChild.textContent = message;
  statusOrb.className = `status-orb ${mode === 'working' ? 'working' : mode === 'done' ? 'done' : ''}`;
}
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function render() {
  if (!bg.complete) return;
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
  uploadCard.querySelector('strong').textContent = file.name.length > 26 ? `${file.name.slice(0, 23)}…` : file.name;
  uploadCard.querySelector('small').textContent = 'New photo? Click to replace it';
  setStatus('Preparing your photo…', 'working');
  try {
    // Dynamic import keeps the page light until a portrait is actually selected.
    const { default: removeBackground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    setStatus('Removing background — first use may take a minute…', 'working');
    const result = await removeBackground(file, { model: 'small', progress: (_key, current, total) => {
      if (total) setStatus(`Downloading portrait tools… ${Math.round(current / total * 100)}%`, 'working');
    }});
    const objectUrl = URL.createObjectURL(result);
    state.subject = await loadImage(objectUrl);
    reset();
    adjustments.classList.add('active'); adjustments.setAttribute('aria-disabled', 'false');
    downloadButton.disabled = false;
    setStatus('Background removed — drag your portrait to position it.', 'done');
    showDragNote();
  } catch (error) {
    console.error(error);
    setStatus('Could not remove the background. Check your connection and try again.');
    emptyState.classList.remove('hidden');
  }
}
input.addEventListener('change', event => processPhoto(event.target.files[0]));
function canvasPoint(event) { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100 }; }
function showDragNote() { dragNote.classList.add('show'); setTimeout(() => dragNote.classList.remove('show'), 2600); }
canvas.addEventListener('pointerdown', event => { if (!state.subject) return; state.dragging = true; state.dragStart = canvasPoint(event); canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!state.dragging) return; const point = canvasPoint(event); state.x = Math.max(0, Math.min(100, state.x + point.x - state.dragStart.x)); state.y = Math.max(0, Math.min(100, state.y + point.y - state.dragStart.y)); state.dragStart = point; syncControls(); render(); });
canvas.addEventListener('pointerup', () => { state.dragging = false; });
downloadButton.addEventListener('click', () => {
  if (!state.subject) return;
  const output = document.createElement('canvas'); output.width = 1800; output.height = 2400;
  const previous = { width: canvas.width, height: canvas.height }; canvas.width = output.width; canvas.height = output.height; render();
  output.getContext('2d').drawImage(canvas, 0, 0); canvas.width = previous.width; canvas.height = previous.height; render();
  const link = document.createElement('a'); link.download = 'framecraft-portrait-6x8.png'; link.href = output.toDataURL('image/png'); link.click();
  setStatus('Your print-ready PNG has been downloaded.', 'done');
});
bg.onload = render;
