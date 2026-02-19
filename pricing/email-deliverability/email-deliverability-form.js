document.addEventListener('DOMContentLoaded', () => {
  // Tab switching logic
  const modeButtons = document.querySelectorAll('.mode-btn');
  const forms = document.querySelectorAll('.resolver-form');

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const mode = btn.getAttribute('data-mode');
      forms.forEach(f => f.style.display = 'none');
      const formToShow = document.getElementById(`form-${mode}`);
      if(formToShow) {
        formToShow.style.display = 'block';
      }
    });
  });

  // Other Tools form functionality
  const otherSubmitBtn = document.getElementById('otherSubmit');
  const copyOtherOutputBtn = document.getElementById('copyOtherOutput');

  otherSubmitBtn.addEventListener('click', () => {
    const domain = document.getElementById('otherDomain').value.trim();
    let inputTemplate = document.getElementById('otherInput').value;

    if (!domain) {
      alert('Please enter a domain name.');
      return;
    }

    if (!inputTemplate) {
      alert('Please paste the DNS template.');
      return;
    }

    // Example: Replace placeholders [Tracking-sub-domain] and [Image-sub-domain]
    // with constructed subdomains using the domain.
    // (You can customize this logic as needed.)
    const trackingSubDomain = `tracking.${domain}`;
    const imageSubDomain = `image.${domain}`;

    inputTemplate = inputTemplate
      .replace(/\[Tracking-sub-domain\]/gi, trackingSubDomain)
      .replace(/\[Image-sub-domain\]/gi, imageSubDomain);

    document.getElementById('otherOutput').value = inputTemplate;
  });

  copyOtherOutputBtn.addEventListener('click', () => {
    const output = document.getElementById('otherOutput');
    if (!output.value) {
      alert('Nothing to copy!');
      return;
    }

    output.select();
    output.setSelectionRange(0, 99999); // For mobile devices

    try {
      document.execCommand('copy');
      alert('Ongage Text Result copied to clipboard!');
    } catch (err) {
      alert('Failed to copy. Please copy manually.');
    }
  });
});
