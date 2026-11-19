// Tools — hasil merger menu "Free Tools" + "Tools Konten AI" jadi satu layar ber-tab.
// Tab "Tools Konten AI" = halaman tools-konten (iframe). Tab "Free Tools" = modul free-tools.js
// yang mengisi #view-freetools (elemen yang sama seperti sebelum merger, jadi free-tools tidak berubah).
(() => {
  const S = window.siarin;
  const $ = (sel, root = document) => root.querySelector(sel);

  const showTab = (key) => {
    $('#toolpanel-konten').hidden = key !== 'konten';
    $('#toolpanel-gratis').hidden = key !== 'gratis';
    document.querySelectorAll('#view-tools [data-tooltab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tooltab === key);
    });
    if (key === 'gratis') S.viewHooks.freetools?.();
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tooltab]');
    if (t && t.closest('#view-tools')) showTab(t.dataset.tooltab);
  });

  S.viewHooks.tools = () => showTab('konten');
})();
