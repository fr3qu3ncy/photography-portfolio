(function () {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileCount = document.getElementById('fileCount');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const dt = e.dataTransfer;
    fileInput.files = dt.files;
    showFiles(dt.files.length);
  });

  fileInput.addEventListener('change', () => {
    showFiles(fileInput.files.length);
  });

  function showFiles(count) {
    if (count > 0) {
      uploadBtn.style.display = 'inline-block';
      fileCount.textContent = `(${count} file${count > 1 ? 's' : ''})`;
    } else {
      uploadBtn.style.display = 'none';
      fileCount.textContent = '';
    }
  }
})();
